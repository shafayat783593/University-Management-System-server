




import { z } from "zod";
import { InstructorApplicationStatus } from "../../../generated/prisma/enums.js";

const applyAsInstructorZodSchema = z.object({
	name: z.string().min(2),
	email: z.string().email(),
	departmentId: z.string().min(1),
	qualification: z.string().optional(),
});

const verifyInstructorEmailZodSchema = z.object({
	email: z.string().email(),
	otp: z.string().min(4),
});

const reviewInstructorZodSchema = z
	.object({
		verificationStatus: z.enum([
			InstructorApplicationStatus.APPROVED,
			InstructorApplicationStatus.REJECTED,
		]),
		rejectionReason: z.string().optional(),
	})
	.refine(
		(data) =>
			data.verificationStatus !== InstructorApplicationStatus.REJECTED ||
			!!data.rejectionReason,
		{ message: "rejectionReason is required when rejecting", path: ["rejectionReason"] },
	);

export const InstructorValidation = {
	applyAsInstructorZodSchema,
	verifyInstructorEmailZodSchema,
	reviewInstructorZodSchema,
};