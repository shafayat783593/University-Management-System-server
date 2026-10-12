import { z } from "zod";
import { ExamType } from "../../../generated/prisma/enums.js";

const createExamZodSchema = z.object({
	sectionId: z.string().min(1),
	title: z.string().min(2),
	examType: z.enum(ExamType),
	totalMarks: z.number().positive(),
	examDate: z.string().datetime({ offset: true }).optional(),
});

const bulkCreateExamsZodSchema = z.object({
	exams: z.array(createExamZodSchema).min(1).max(20),
});

export const ExamValidation = {
	createExamZodSchema,
	bulkCreateExamsZodSchema,
};