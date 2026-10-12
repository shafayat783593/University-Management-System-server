import { DayOfWeek } from "../../../generated/prisma/enums.js";

export interface ICreateRoutineEntryPayload {
	sectionId: string;
	dayOfWeek: DayOfWeek;
	startTime: string; // "HH:mm", 24h
	endTime: string;
	room?: string;
}