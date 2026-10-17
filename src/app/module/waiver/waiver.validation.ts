import { z } from "zod";

const createWaiverZodSchema = z
	.object({
		studentId: z.string().min(1),
		semesterId: z.string().min(1).optional(),
		type: z.enum(["WAIVER", "SCHOLARSHIP", "DISCOUNT"]),
		name: z.string().min(2),
		percent: z.number().gt(0).lte(100).optional(),
		fixedAmount: z.number().positive().multipleOf(0.01).optional(),
		validFrom: z.string().optional(),
		validTo: z.string().optional(),
		reason: z.string().optional(),
	})
	.refine((v) => v.percent !== undefined || v.fixedAmount !== undefined, "Provide percent and/or fixedAmount");

const updateWaiverZodSchema = z.object({
	isActive: z.boolean().optional(),
	validTo: z.string().nullable().optional(),
});

export const WaiverValidation = { createWaiverZodSchema, updateWaiverZodSchema };