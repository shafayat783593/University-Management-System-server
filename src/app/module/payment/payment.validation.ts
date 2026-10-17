import { z } from "zod";

const initPaymentZodSchema = z.object({
	invoiceId: z.string().min(1, "invoiceId is required"),
	amount: z.number().positive().multipleOf(0.01).optional(),
});

const refundZodSchema = z.object({
	amount: z.number().positive().multipleOf(0.01).optional(),
	reason: z.string().min(5, "A reason is required"),
	reverseCharge: z.boolean().optional(),
});

export const PaymentValidation = {
	initPaymentZodSchema,
	refundZodSchema,
};