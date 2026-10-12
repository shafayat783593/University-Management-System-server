import { z } from "zod";

const initBkashPaymentZodSchema = z.object({
	installmentId: z.string().min(1, "installmentId is required"),
});

export const PaymentValidation = {
	initBkashPaymentZodSchema,
};