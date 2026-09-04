import { z } from "zod";
import { ExamType } from "../../../generated/prisma/enums.js";

const createExamZodSchema = z.object({
	sectionId: z.string().min(1),
	title: z.string().min(2),
	examType: z.enum(ExamType),
	totalMarks: z.number().positive(),
});

export const ExamValidation = {
	createExamZodSchema,
};