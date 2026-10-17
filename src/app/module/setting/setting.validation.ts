import { z } from "zod";

const updateSystemSettingZodSchema = z
	.object({
		applicationFeeRequired: z.boolean().optional(),
		admissionPaymentRequiredToEnroll: z.boolean().optional(),
	})
	.refine((v) => Object.values(v).some((x) => x !== undefined), "Provide at least one setting");

export const SettingValidation = {
	updateSystemSettingZodSchema,
};