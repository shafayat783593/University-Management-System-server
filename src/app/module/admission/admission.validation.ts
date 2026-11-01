import { z } from "zod";

const submitAdmissionApplicationZodSchema = z.object({
	previousInstitution: z.string().trim().min(2),
	sscBoard: z.string().trim().min(1),
	sscYear: z.number().min(1990).max(2100),
	sscGpa: z.number().min(0).max(5),
	hscBoard: z.string().trim().min(1),
	hscYear: z.number().min(1990).max(2100),
	hscGpa: z.number().min(0).max(5),
	guardianOccupation: z.string().trim().min(1),
	presentAddress: z.string().trim().min(1),
	permanentAddress: z.string().trim().min(1),
});

const reviewApplicationZodSchema = z
	.object({
		status: z.enum(["APPROVED", "REJECTED"]),
		rejectionReason: z.string().min(5).optional(),
	})
	.refine((v) => v.status !== "REJECTED" || !!v.rejectionReason, {
		message: "A rejection reason is required",
		path: ["rejectionReason"],
	});

export const AdmissionValidation = {
	submitAdmissionApplicationZodSchema,
	reviewApplicationZodSchema,
};