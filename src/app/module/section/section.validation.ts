import { z } from "zod";

const createSectionZodSchema = z.object({
	courseId: z.string().min(1),
	semesterId: z.string().min(1),
	instructorId: z.string().min(1),
	capacity: z.number().min(1),
	schedule: z.string().optional(),
});

const updateSectionZodSchema = z.object({
	instructorId: z.string().min(1).optional(),
	capacity: z.number().min(1).optional(),
	schedule: z.string().optional(),
});

export const SectionValidation = {
	createSectionZodSchema,
	updateSectionZodSchema,
};