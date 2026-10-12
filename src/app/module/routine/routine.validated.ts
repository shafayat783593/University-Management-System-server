import { z } from "zod";
import { DayOfWeek } from "../../../generated/prisma/enums.js";


const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createRoutineEntryZodSchema = z.object({
	sectionId: z.string().min(1),
	dayOfWeek: z.enum(DayOfWeek),
	startTime: z.string().regex(timePattern, "startTime must be HH:mm, 24h"),
	endTime: z.string().regex(timePattern, "endTime must be HH:mm, 24h"),
	room: z.string().optional(),
});

export const RoutineValidation = {
	createRoutineEntryZodSchema,
};