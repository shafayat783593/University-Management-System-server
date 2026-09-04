import { z } from "zod";

const submitResultsZodSchema = z.object({
	records: z
		.array(
			z.object({
				studentId: z.string().min(1),
				marksObtained: z.number().min(0),
			}),
		)
		.min(1, "At least one result record is required"),
});

const overrideResultZodSchema = z.object({
	marksObtained: z.number().min(0),
	reason: z.string().min(3, "A reason is required for overriding a published result"),
});

export const ResultValidation = {
	submitResultsZodSchema,
	overrideResultZodSchema,
};