import type { DayOfWeek } from "../../generated/prisma/enums.js";

const TZ = "Asia/Dhaka"; // UTC+6, no daylight saving
const OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const dhakaNow = (now: Date = new Date()) => {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: TZ,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		weekday: "long",
		hourCycle: "h23",
	}).formatToParts(now);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

	const dayStartUtc = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) - OFFSET_MS);
	return {
		dayOfWeek: get("weekday").toUpperCase() as DayOfWeek,
		/** "HH:mm" 24h, comparable with ClassRoutine.startTime / endTime */
		time: `${get("hour")}:${get("minute")}`,
		dayStartUtc,
		dayEndUtc: new Date(dayStartUtc.getTime() + DAY_MS),
	};
};

export const DAY_ORDER: DayOfWeek[] = [
	"SUNDAY",
	"MONDAY",
	"TUESDAY",
	"WEDNESDAY",
	"THURSDAY",
	"FRIDAY",
	"SATURDAY",
];