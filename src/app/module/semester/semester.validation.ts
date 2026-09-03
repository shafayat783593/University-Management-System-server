
import { z } from "zod";
import { SemesterStatus } from "../../../generated/prisma/enums.js";

const createSemesterZodSchema = z.object({
	name: z.string().min(2),
	year: z.number().min(2000).max(2100),
	term: z.string().min(2),
	enrollmentStart: z.string().optional(),
	enrollmentEnd: z.string().optional(),
});

const updateSemesterStatusZodSchema = z.object({
	status: z.enum(SemesterStatus),
});

export const SemesterValidation = {
	createSemesterZodSchema,
	updateSemesterStatusZodSchema,
};