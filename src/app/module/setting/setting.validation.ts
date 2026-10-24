import { z } from "zod";

const updateSystemSettingZodSchema = z
	.object({
		applicationFeeRequired: z.boolean().optional(),
		admissionPaymentRequiredToEnroll: z.boolean().optional(),
		universityName: z.string().trim().min(2).max(120).optional(),
		idCardValidityYears: z.number().int().min(1).max(10).optional(),
	})
	.refine((v) => Object.values(v).some((x) => x !== undefined), "Provide at least one setting");

export const SettingValidation = {
	updateSystemSettingZodSchema,
};