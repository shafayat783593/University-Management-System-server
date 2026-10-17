import { z } from "zod";

const submitAdmissionApplicationZodSchema = z.object({
	previousInstitution: z.string().min(2),
	sscBoard: z.string().optional(),
	sscYear: z.number().min(1990).max(2100).optional(),
	sscGpa: z.number().min(0).max(5).optional(),
	hscBoard: z.string().optional(),
	hscYear: z.number().min(1990).max(2100).optional(),
	hscGpa: z.number().min(0).max(5).optional(),
	guardianOccupation: z.string().optional(),
	presentAddress: z.string().optional(),
	permanentAddress: z.string().optional(),
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