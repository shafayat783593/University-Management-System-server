import { z } from "zod";

const generateSemesterInvoicesZodSchema = z.object({
	semesterId: z.string().min(1),
	studentId: z.string().min(1).optional(),
});

const generateMySemesterInvoiceZodSchema = z.object({
	semesterId: z.string().min(1),
});

const adjustmentZodSchema = z
	.object({
		type: z.enum(["WAIVER", "SCHOLARSHIP", "DISCOUNT", "ADJUSTMENT"]),
		// WAIVER/SCHOLARSHIP/DISCOUNT: positive number = reduction. ADJUSTMENT: signed (negative reduces, positive charges more).
		amount: z.number().multipleOf(0.01).refine((v) => v !== 0, "Amount cannot be zero"),
		reason: z.string().min(5, "A reason is required for every adjustment"),
	})
	.refine((v) => v.type === "ADJUSTMENT" || v.amount > 0, {
		message: "For waivers/scholarships/discounts enter a positive amount (it is applied as a reduction)",
		path: ["amount"],
	});

const cancelInvoiceZodSchema = z.object({
	reason: z.string().min(5, "A reason is required"),
});

export const InvoiceValidation = {
	generateSemesterInvoicesZodSchema,
	generateMySemesterInvoiceZodSchema,
	adjustmentZodSchema,
	cancelInvoiceZodSchema,
};