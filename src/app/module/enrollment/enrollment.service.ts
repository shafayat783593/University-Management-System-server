import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import {
	EnrollmentStatus,
	ResultStatus,
	SemesterStatus,
} from "../../../generated/prisma/enums.js";
import { AppError } from "../../utils/AppError.js";

const PASSING_PERCENTAGE = 40;

interface ICreateEnrollmentPayload {
	sectionId: string;
}

const hasPassedCourse = async (studentId: string, courseId: string) => {
	const enrollments = await prisma.enrollment.findMany({
		where: {
			studentId,
			section: {
				courseId,
			},
		},
		select: {
			sectionId: true,
		},
	});
	if (enrollments.length === 0) return false;

	for (const { sectionId } of enrollments) {
		const exams = await prisma.exam.findMany({
			where: { sectionId },
			include: {
				results: {
					where: {
						studentId,
					},
				},
			},
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

		if (
			totalMarks > 0 &&
			(obtainedMarks / totalMarks) * 100 >= PASSING_PERCENTAGE
		) {
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

	const existing = await prisma.enrollment.findFirst(
        {
            where:{
             sectionId:payload.sectionId   ,
             studentId: student.id,
            }
        }
	);
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

	return prisma.$transaction(async (tx) => {
		const seatUpdate = await tx.section.updateMany({
			where: {
                 id: section.id,
                 enrolledCount: {
                     lt: section.capacity 
                    } 
                },
			data: { 
                enrolledCount: {
                     increment: 1 
                    } },
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

export const EnrollmentService = {
	createEnrollment,
	dropEnrollment,
	getMyEnrollments,
};
