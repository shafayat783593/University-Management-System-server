import { z } from "zod";

const generateFeesZodSchema = z.object({
	semesterId: z.string().min(1),
	amount: z.number().positive(),
	installmentCount: z.number().int().min(1).max(12).optional(),
	firstDueDate: z.string().optional(),
});

const money = z.number().min(0).max(100000000);

// Admin-configured billing policy for one semester. Everything optional
// except semesterId — unset charges simply stay zero.
const upsertPolicyZodSchema = z.object({
	semesterId: z.string().min(1),
	perCreditRate: money.optional(),
	registrationFee: money.optional(),
	labFee: money.optional(),
	examFee: money.optional(),
	libraryFee: money.optional(),
	otherFee: money.optional(),
	otherLabel: z.string().max(80).optional(),
	installmentCount: z.number().int().min(1).max(12).optional(),
	firstDueDate: z.string().datetime({ offset: true }).optional(),
	graceDays: z.number().int().min(0).max(90).optional(),
	lateFeeAmount: money.optional(),
});

const generateFromPolicyZodSchema = z.object({
	semesterId: z.string().min(1),
});

// One-time correction of an UNPAID invoice. Reason is required and is
// stored on the invoice — this is the audit trail.
const adjustFeeZodSchema = z.object({
	discountAmount: money.optional(),
	adjustmentAmount: z.number().min(-100000000).max(100000000).optional(),
	reason: z.string().min(5).max(300),
});

const admissionFeeSettingZodSchema = z.object({
	amount: money.nullable(),
	applicationFeeAmount: money.nullable().optional(),
	admissionInstallmentCount: z.number().int().min(1).max(12).optional(),
});

export const FeeValidation = {
	generateFeesZodSchema,
	upsertPolicyZodSchema,
	generateFromPolicyZodSchema,
	adjustFeeZodSchema,
	admissionFeeSettingZodSchema,
};