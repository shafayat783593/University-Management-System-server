import httpStatus from "http-status";
import { AppError } from "../../utils/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { EnrollmentStatus, ResultStatus } from "../../../generated/prisma/enums.js";
import { redisClient } from "../../lib/redis.js";


export interface ISubmitResultRecord {
	studentId: string;
	marksObtained: number;
}

export interface IOverrideResultPayload {
	marksObtained: number;
	reason: string;
}


const GPA_CACHE_TTL_SECONDS = 60 * 60 * 24;
const gpaCacheKey = (studentId: string, semesterId: string) =>
	`gpa:${studentId}:${semesterId}`;

const submitResults = async (
	userId: string,
	examId: string,
	records: ISubmitResultRecord[],
) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}

	const exam = await prisma.exam.findUnique({
		where: { id: examId },
		include: { section: true },
	});
	if (!exam) {
		throw new AppError(httpStatus.NOT_FOUND, "Exam not found");
	}
	if (exam.section.instructorId !== instructor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only submit results for your own sections",
		);
	}

	for (const r of records) {
		if (r.marksObtained > exam.totalMarks) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`marksObtained cannot exceed totalMarks (${exam.totalMarks}) for student ${r.studentId}`,
			);
		}
	}

	const studentIds = records.map((r) => r.studentId);
	const enrolledCount = await prisma.enrollment.count({
		where: {
			sectionId: exam.sectionId,
			studentId: { in: studentIds },
			status: EnrollmentStatus.ENROLLED,
		},
	});
	if (enrolledCount !== new Set(studentIds).size) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"One or more students are not currently enrolled in this section",
		);
	}

	// Only touches DRAFT results. A published result must go through
	// overrideResult instead, which is audit-logged — this endpoint
	// deliberately can't silently rewrite something already locked.
	const alreadyPublished = await prisma.result.findMany({
		where: {
			examId,
			studentId: { in: studentIds },
			status: ResultStatus.PUBLISHED,
		},
		select: { studentId: true },
	});
	if (alreadyPublished.length > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Some of these results are already published — use the override endpoint instead",
		);
	}

	return prisma.$transaction(
		records.map((r) =>
			prisma.result.upsert({
				where: { examId_studentId: { examId, studentId: r.studentId } },
				create: {
					examId,
					studentId: r.studentId,
					marksObtained: r.marksObtained,
					status: ResultStatus.DRAFT,
				},
				update: { marksObtained: r.marksObtained },
			}),
		),
	);
};

const publishExamResults = async (examId: string) => {
	const exam = await prisma.exam.findUnique({
		where: { id: examId },
		include: { section: true },
	});
	if (!exam) {
		throw new AppError(httpStatus.NOT_FOUND, "Exam not found");
	}

	const draftResults = await prisma.result.findMany({
		where: { examId, status: ResultStatus.DRAFT },
	});
	if (draftResults.length === 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"No draft results to publish for this exam",
		);
	}

	const updated = await prisma.$transaction(async (tx) => {
		await tx.result.updateMany({
			where: { examId, status: ResultStatus.DRAFT },
			data: { status: ResultStatus.PUBLISHED, publishedAt: new Date() },
		});
		return tx.result.findMany({ where: { examId } });
	});

	// GPA depends on every exam in a section being published, so
	// publishing this one can change the cached GPA for every affected
	// student — invalidate rather than try to patch the cache in place.
	await Promise.all(
		updated.map((r) =>
			redisClient
				.del([gpaCacheKey(r.studentId, exam.section.semesterId)])
				.catch(() => null),
		),
	);

	return updated;
};

const overrideResult = async (
	adminUserId: string,
	resultId: string,
	payload: IOverrideResultPayload,
) => {
	const result = await prisma.result.findUnique({
		where: { id: resultId },
		include: { exam: { include: { section: true } } },
	});
	if (!result) {
		throw new AppError(httpStatus.NOT_FOUND, "Result not found");
	}
	if (payload.marksObtained > result.exam.totalMarks) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`marksObtained cannot exceed totalMarks (${result.exam.totalMarks})`,
		);
	}

	const before = { marksObtained: result.marksObtained, status: result.status };

	const updated = await prisma.$transaction(async (tx) => {
		const updatedResult = await tx.result.update({
			where: { id: resultId },
			data: {
				marksObtained: payload.marksObtained,
				status: ResultStatus.PUBLISHED,
				publishedAt: result.publishedAt ?? new Date(),
			},
		});

		await tx.auditLog.create({
			data: {
				actorId: adminUserId,
				action: "RESULT_OVERRIDE",
				targetType: "Result",
				targetId: resultId,
				oldValue: before,
				newValue: {
					marksObtained: updatedResult.marksObtained,
					status: updatedResult.status,
				},
				reason: payload.reason,
			},
		});

		return updatedResult;
	});

	await redisClient
		.del([gpaCacheKey(result.studentId, result.exam.section.semesterId)])
		.catch(() => null);

	return updated;
};

// --- GPA calculation ---
// Standard Bangladesh public-university 4.00-scale letter grade bands.
// Adjust to your institution's actual scale if it differs.
const PERCENTAGE_TO_GRADE_POINT: { min: number; point: number }[] = [
	{ min: 80, point: 4.0 },
	{ min: 75, point: 3.75 },
	{ min: 70, point: 3.5 },
	{ min: 65, point: 3.25 },
	{ min: 60, point: 3.0 },
	{ min: 55, point: 2.75 },
	{ min: 50, point: 2.5 },
	{ min: 45, point: 2.25 },
	{ min: 40, point: 2.0 },
	{ min: 0, point: 0.0 },
];

const percentageToGradePoint = (percentage: number) => {
	const band = PERCENTAGE_TO_GRADE_POINT.find((b) => percentage >= b.min);
	return band ? band.point : 0.0;
};

/**
 * Returns null if any exam in the section still has an unpublished (or
 * missing) result for this student — an incomplete section can't
 * contribute to GPA yet.
 */
const getSectionGradePoint = async (studentId: string, sectionId: string) => {
	const exams = await prisma.exam.findMany({
		where: { sectionId },
		include: { results: { where: { studentId } } },
	});
	if (exams.length === 0) return null;

	const allPublished = exams.every(
		(exam) =>
			exam.results.length > 0 &&
			exam.results[0].status === ResultStatus.PUBLISHED,
	);
	if (!allPublished) return null;

	const totalMarks = exams.reduce((sum, e) => sum + e.totalMarks, 0);
	const obtainedMarks = exams.reduce(
		(sum, e) => sum + e.results[0].marksObtained,
		0,
	);
	const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

	return percentageToGradePoint(percentage);
};

const computeSemesterGpa = async (studentId: string, semesterId: string) => {
	const cacheKey = gpaCacheKey(studentId, semesterId);
	const cached = await redisClient.get(cacheKey).catch(() => null);
	if (cached) return JSON.parse(cached);

	const enrollments = await prisma.enrollment.findMany({
		where: {
			studentId,
			section: { semesterId },
			status: EnrollmentStatus.ENROLLED,
		},
		include: { section: { include: { course: true } } },
	});

	let totalCreditHours = 0;
	let totalQualityPoints = 0;
	const courses: {
		courseCode: string;
		creditHours: number;
		gradePoint: number | null;
	}[] = [];

	for (const enrollment of enrollments) {
		const gradePoint = await getSectionGradePoint(
			studentId,
			enrollment.sectionId,
		);
		courses.push({
			courseCode: enrollment.section.course.code,
			creditHours: enrollment.section.course.creditHours,
			gradePoint,
		});
		if (gradePoint !== null) {
			totalCreditHours += enrollment.section.course.creditHours;
			totalQualityPoints += gradePoint * enrollment.section.course.creditHours;
		}
	}

	const gpa =
		totalCreditHours > 0
			? Number((totalQualityPoints / totalCreditHours).toFixed(2))
			: null;

	const payload = { semesterId, gpa, courses };

	await redisClient
		.set(cacheKey, JSON.stringify(payload), {
			expiration: { type: "EX", value: GPA_CACHE_TTL_SECONDS },
		})
		.catch(() => null);

	return payload;
};

const getTranscript = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const enrollments = await prisma.enrollment.findMany({
		where: { studentId: student.id },
		select: { section: { select: { semesterId: true } } },
	});
	const semesterIds = [...new Set(enrollments.map((e) => e.section.semesterId))];

	const semesters = await Promise.all(
		semesterIds.map((semesterId) => computeSemesterGpa(student.id, semesterId)),
	);

	const completed = semesters.filter((s) => s.gpa !== null);
	const totalCreditHours = completed.reduce(
		(sum, s) =>
			sum +
			s.courses.reduce(
				(cs:any, c:any) => (c.gradePoint !== null ? cs + c.creditHours : cs),
				0,
			),
		0,
	);
	const totalQualityPoints = completed.reduce(
		(sum, s) =>
			sum +
			s.courses.reduce(
				(cs:any, c:any) => (c.gradePoint !== null ? cs + c.gradePoint * c.creditHours : cs),
				0,
			),
		0,
	);
	const cgpa =
		totalCreditHours > 0
			? Number((totalQualityPoints / totalCreditHours).toFixed(2))
			: null;

	return { semesters, cgpa };
};

export const ResultService = {
	submitResults,
	publishExamResults,
	overrideResult,
	computeSemesterGpa,
	getTranscript,
};