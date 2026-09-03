import { z } from "zod";
 
const generateFeesZodSchema = z.object({
	semesterId: z.string().min(1),
	amount: z.number().positive(),
	dueDate: z.string().optional(),
});
 
export const FeeValidation = {
	generateFeesZodSchema,
};
 