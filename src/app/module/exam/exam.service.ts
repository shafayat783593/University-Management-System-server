import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { ExamType } from "../../../generated/prisma/enums.js";
import { AppError } from "../../utils/AppError.js";



interface ICreateExamPayload {
	sectionId: string;
	title: string;
	examType: ExamType;
	totalMarks: number;
}
 

const createExam = async (userId: string, payload: ICreateExamPayload) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}

	const section = await prisma.section.findUnique({
		where: { id: payload.sectionId },
	});
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}
	if (section.instructorId !== instructor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only create exams for your own sections",
		);
	}

	return prisma.exam.create({
		data: {
			sectionId: payload.sectionId,
			title: payload.title,
			examType: payload.examType,
			totalMarks: payload.totalMarks,
		},
	});
};

const getSectionExams = async (sectionId: string) => {
	return prisma.exam.findMany({
		where: { sectionId },
		orderBy: { createdAt: "asc" },
	});
};

export const ExamService = {
	createExam,
	getSectionExams,
};