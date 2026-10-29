import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { ExamType } from "../../../generated/prisma/enums.js";
import { AppError } from "../../utils/AppError.js";
import { transporter } from "../../lib/nodmailer.js";
import config from "../../config/index.js";
import { canTeachAllSections, canTeachSection } from "../../lib/sectionaccess.js";



interface ICreateExamPayload {
	sectionId: string;
	title: string;
	examType: ExamType;
	totalMarks: number;
	examDate?: string;
}


// Best-effort email: exam creation must succeed even if mail fails.
async function notifyEnrolledStudents(
	sectionId: string,
	examTitle: string,
	courseCode: string,
) {
	try {
		const enrollments = await prisma.enrollment.findMany({
			where: { sectionId },
			include: { student: { include: { user: true } } },
		});
		for (const e of enrollments) {
			const email = e.student?.user?.email;
			if (!email) continue;
			await transporter.sendMail({
				from: config.email_sender,
				to: email,
				subject: `New exam: ${examTitle} (${courseCode})`,
				html: `<p>Hi ${e.student?.user?.name ?? "Student"},</p><p>A new exam <strong>${examTitle}</strong> has been scheduled for <strong>${courseCode}</strong>. Check your student portal for details.</p>`,
			});
		}
	} catch {
		// ignore — email must never break exam creation
	}
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
		include: { course: true },
	});
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}

	const  teachSection= await canTeachSection(section.id, instructor.id)
	if (!teachSection) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only create exams for your own sections",
		);
	}

	const exam = await prisma.exam.create({
		data: {
			sectionId: payload.sectionId,
			title: payload.title,
			examType: payload.examType,
			totalMarks: payload.totalMarks,
			examDate: payload.examDate ? new Date(payload.examDate) : undefined,
		},
	});

	await notifyEnrolledStudents(section.id, exam.title, section.course.code);

	return exam;
};

// Whole batch is rejected (403) if ANY section isn't the instructor's.
const createBulkExams = async (userId: string, exams: ICreateExamPayload[]) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}

	const sectionIds = [...new Set(exams.map((e) => e.sectionId))];
	const sections = await prisma.section.findMany({
		where: { id: { in: sectionIds } },
		include: { course: true },
	});
	if (sections.length !== sectionIds.length) {
		throw new AppError(httpStatus.NOT_FOUND, "One of these sections was not found");
	}
	const teachAllSections = await canTeachAllSections(sectionIds, instructor.id)
	if (!teachAllSections) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only create exams for your own sections",
		);
	}

	const created = await prisma.$transaction(
		exams.map((e) =>
			prisma.exam.create({
				data: {
					sectionId: e.sectionId,
					title: e.title,
					examType: e.examType,
					totalMarks: e.totalMarks,
					examDate: e.examDate ? new Date(e.examDate) : undefined,
				},
			}),
		),
	);

	for (const exam of created) {
		const section = sections.find((s) => s.id === exam.sectionId);
		await notifyEnrolledStudents(exam.sectionId, exam.title, section?.course.code ?? "");
	}

	return created;
};

const getSectionExams = async (sectionId: string) => {
	return prisma.exam.findMany({
		where: { sectionId },
		orderBy: { createdAt: "asc" },
	});
};

export const ExamService = {
	createExam,
	createBulkExams,
	getSectionExams,
};