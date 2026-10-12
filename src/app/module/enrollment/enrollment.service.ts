import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { EnrollmentStatus, ResultStatus, SemesterStatus } from "../../../generated/prisma/enums.js";
import { AppError } from "../../utils/AppError.js";
import { tuitionFeeCreateData } from "../../lib/Installments.js";


const PASSING_PERCENTAGE = 40;

interface ICreateEnrollmentPayload {
	sectionId: string;
}


/**
 * A prerequisite course counts as "passed" if the student has an
 * enrollment in ANY section of that course where every exam in that
 * section has a PUBLISHED result for the student, and the aggregate
 * percentage across those exams meets the passing bar.
 */
const hasPassedCourse = async (studentId: string, courseId: string) => {
	const enrollments = await prisma.enrollment.findMany({
		where: { studentId, section: { courseId } },
		select: { sectionId: true },
	});
	if (enrollments.length === 0) return false;

	for (const { sectionId } of enrollments) {
		const exams = await prisma.exam.findMany({
			where: { sectionId },
			include: { results: { where: { studentId } } },
		});
		if (exams.length === 0) continue;

		const allPublished = exams.every(
			(exam) =>
				exam.results.length > 0 &&
				exam.results.every((r) => r.status === ResultStatus.PUBLISHED),
		);
		if (!allPublished) continue;

		const totalMarks = exams.reduce((sum, e) => sum + e.totalMarks, 0);
		const obtainedMarks = exams.reduce(
			(sum, e) => sum + (e.results[0]?.marksObtained ?? 0),
			0,
		);

		if (totalMarks > 0 && (obtainedMarks / totalMarks) * 100 >= PASSING_PERCENTAGE) {
			return true;
		}
	}

	return false;
};

const createEnrollment = async (
	userId: string,
	payload: ICreateEnrollmentPayload,
) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Complete your student profile before enrolling",
		);
	}

	const admissionApplication = await prisma.admissionApplication.findUnique({
		where: { studentId: student.id },
	});
	if (!admissionApplication) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Submit your admission application (POST /admission-applications) before enrolling in any section",
		);
	}
	// Pipeline: verify → approve → pay admission fee → enroll.
	if (admissionApplication.status !== "APPROVED") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Your admission application is still under review — you can enroll once it is approved",
		);
	}
	const admissionFee = await prisma.fee.findFirst({
		where: { studentId: student.id, type: "ADMISSION", status: { not: "CANCELLED" } },
		select: { status: true },
	});
	if (admissionFee && admissionFee.status !== "PAID") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Pay your admission fee in full before enrolling in any section",
		);
	}

	const section = await prisma.section.findUnique({
		where: { id: payload.sectionId },
		include: {
			course: { include: { prerequisites: true } },
			semester: true,
		},
	});
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}

	if (section.semester.status !== SemesterStatus.OPEN) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Enrollment is only allowed while the semester is open",
		);
	}

	const existing = await prisma.enrollment.findUnique({
		where: {
			studentId_sectionId: { studentId: student.id, sectionId: section.id },
		},
	});
	if (existing && existing.status === EnrollmentStatus.ENROLLED) {
		throw new AppError(httpStatus.CONFLICT, "Already enrolled in this section");
	}

	const duplicateCourseEnrollment = await prisma.enrollment.findFirst({
		where: {
			studentId: student.id,
			status: EnrollmentStatus.ENROLLED,
			section: { courseId: section.courseId, semesterId: section.semesterId },
		},
	});
	if (duplicateCourseEnrollment) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Already enrolled in another section of this course this semester",
		);
	}

	for (const prereq of section.course.prerequisites) {
		const passed = await hasPassedCourse(student.id, prereq.id);
		if (!passed) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Prerequisite not satisfied: ${prereq.code} - ${prereq.title}`,
			);
		}
	}

	// The actual transaction-safe part: an atomic conditional update, not
	// read-then-write. Two concurrent requests hitting the last seat will
	// serialize on this row — only one `updateMany` call can see
	// enrolledCount < capacity and win.
	const enrollmentResult = await prisma.$transaction(async (tx) => {
		const seatUpdate = await tx.section.updateMany({
			where: { id: section.id, enrolledCount: { lt: section.capacity } },
			data: { enrolledCount: { increment: 1 } },
		});

		if (seatUpdate.count === 0) {
			throw new AppError(httpStatus.CONFLICT, "Section is full");
		}

		if (existing && existing.status === EnrollmentStatus.DROPPED) {
			return tx.enrollment.update({
				where: { id: existing.id },
				data: {
					status: EnrollmentStatus.ENROLLED,
					droppedAt: null,
					enrolledAt: new Date(),
				},
			});
		}

		return tx.enrollment.create({
			data: { studentId: student.id, sectionId: section.id },
		});
	});

	// Auto-create this semester's Fee row on first enrollment, if the
	// semester has a fee amount set (via POST /fees/generate at least
	// once). This is what closes the gap where a student who
	// registers/enrolls after a bulk fee-generation run would otherwise
	// never get billed unless Admin remembered to re-run it. Kept
	// outside the seat-allocation transaction above — billing failing
	// shouldn't roll back a successful enrollment, and the upsert is
	// idempotent so it's safe even if this runs more than once.
	if (section.semester.feeAmount !== null) {
		const feeExists = await prisma.fee.findUnique({
			where: {
				studentId_semesterId: {
					studentId: student.id,
					semesterId: section.semesterId,
				},
			},
			select: { id: true },
		});
		if (!feeExists) {
			// Fee + installments in one nested write; a concurrent duplicate
			// hits @@unique([studentId, semesterId]) and is safely ignored.
			await prisma.fee
				.create({ data: tuitionFeeCreateData(student.id, section.semester) })
				.catch(() => null);
		}
	}

	return enrollmentResult;
};

const dropEnrollment = async (userId: string, sectionId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const enrollment = await prisma.enrollment.findUnique({
		where: { studentId_sectionId: { studentId: student.id, sectionId } },
		include: { section: { include: { semester: true } } },
	});
	if (!enrollment || enrollment.status !== EnrollmentStatus.ENROLLED) {
		throw new AppError(httpStatus.NOT_FOUND, "Active enrollment not found");
	}

	if (enrollment.section.semester.status !== SemesterStatus.OPEN) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot drop outside the open enrollment window",
		);
	}

	return prisma.$transaction(async (tx) => {
		await tx.section.update({
			where: { id: sectionId },
			data: { enrolledCount: { decrement: 1 } },
		});
		return tx.enrollment.update({
			where: { id: enrollment.id },
			data: { status: EnrollmentStatus.DROPPED, droppedAt: new Date() },
		});
	});
};

/**
 * A "W" (withdrawal) is different from a drop: drop only works inside
 * the add/drop window and frees the seat back up (someone else can
 * take it). Withdrawal is for after that window — the student keeps
 * the seat "spent" (enrolledCount is deliberately NOT decremented,
 * unlike dropEnrollment) but the course no longer counts toward GPA.
 * Blocked once any exam in the section already has a published result
 * for this student — you can't withdraw from a course you've already
 * been graded in.
 */
const withdrawEnrollment = async (userId: string, sectionId: string) => {
	const student = await prisma.studentProfile.findUnique({ where: { userId } });
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const enrollment = await prisma.enrollment.findUnique({
		where: { studentId_sectionId: { studentId: student.id, sectionId } },
		include: { section: { include: { semester: true } } },
	});
	if (!enrollment || enrollment.status !== EnrollmentStatus.ENROLLED) {
		throw new AppError(httpStatus.NOT_FOUND, "Active enrollment not found");
	}

	if (enrollment.section.semester.status === SemesterStatus.CLOSED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot withdraw from a course in a closed semester",
		);
	}

	const publishedResultCount = await prisma.result.count({
		where: {
			studentId: student.id,
			status: ResultStatus.PUBLISHED,
			exam: { sectionId },
		},
	});
	if (publishedResultCount > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot withdraw — this course already has a published result",
		);
	}

	return prisma.enrollment.update({
		where: { id: enrollment.id },
		data: { status: EnrollmentStatus.WITHDRAWN, droppedAt: new Date() },
	});
};

const getMyEnrollments = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	return prisma.enrollment.findMany({
		where: { studentId: student.id },
		include: { section: { include: { course: true, semester: true } } },
		orderBy: { enrolledAt: "desc" },
	});
};

// Roster of one section for its instructor (attendance + results entry).
const getSectionEnrollments = async (
	userId: string,
	sectionId: string,
	role: string,
) => {
	const section = await prisma.section.findUnique({ where: { id: sectionId } });
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}
	if (role === "INSTRUCTOR") {
		const instructor = await prisma.instructorProfile.findUnique({
			where: { userId },
		});
		if (!instructor || section.instructorId !== instructor.id) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You can only view enrollments for your own sections",
			);
		}
	}

	return prisma.enrollment.findMany({
		where: { sectionId, status: "ENROLLED" },
		include: {
			student: { include: { user: { select: { name: true, email: true } } } },
		},
		orderBy: { enrolledAt: "asc" },
	});
};

export const EnrollmentService = {
	createEnrollment,
	dropEnrollment,
	withdrawEnrollment,
	getMyEnrollments,
	getSectionEnrollments,
};