import { z } from "zod";
import { AttendanceStatus } from "../../../generated/prisma/enums.js";

const createAttendanceSessionZodSchema = z.object({
	sectionId: z.string().min(1),
	date: z.string().min(1),
});

const markAttendanceZodSchema = z.object({
	records: z
		.array(
			z.object({
				studentId: z.string().min(1),
				status: z.enum(AttendanceStatus),
			}),
		)
		.min(1, "At least one attendance record is required"),
});

export const AttendanceValidation = {
	createAttendanceSessionZodSchema,
	markAttendanceZodSchema,
};