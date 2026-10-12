

import { z } from "zod";

const updateSystemSettingZodSchema = z.object({
	admissionFeeAmount: z.number().positive(),
});

export const SettingValidation = {
	updateSystemSettingZodSchema,
};