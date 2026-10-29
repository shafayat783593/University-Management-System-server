import httpStatus from "http-status";
import { EnrollmentStatus } from "../../../generated/prisma/enums.js";
import { ICreateRoutineEntryPayload } from "./routine.interface.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { canTeachSection, getSectionInstructorIds } from "../../lib/sectionaccess.js";


const DAY_ORDER = [
	"SUNDAY",
	"MONDAY",
	"TUESDAY",
	"WEDNESDAY",
	"THURSDAY",
	"FRIDAY",
	"SATURDAY",
];
export const teachesSectionWhere = (instructorId: string) => ({
	OR: [{ instructorId }, { coInstructors: { some: { instructorId } } }],
});

const timeToMinutes = (time: string): number => {
	const [h, m] = time.split(":").map(Number);
	return h * 60 + m;
};

const sortByDayThenTime = <T extends { dayOfWeek: string; startTime: string }>(
	entries: T[],
): T[] =>
	[...entries].sort((a, b) => {
		const dayDiff = DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek);
		if (dayDiff !== 0) return dayDiff;
		return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
	});

/**
 * An instructor can't be in two classes at once, even across different
 * sections/courses they teach — checked against every section that
 * belongs to them, not just the one in this payload.
 */
const createRoutineEntry = async (
	userId: string,
	payload: ICreateRoutineEntryPayload,
) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}
 
	const section = await prisma.section.findUnique({
		where: { id: payload.sectionId },
	});
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}
	if (!(await canTeachSection(section.id, instructor.id))) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only set the routine for your own sections",
		);
	}
 
	const newStart = timeToMinutes(payload.startTime);
	const newEnd = timeToMinutes(payload.endTime);
	if (newEnd <= newStart) {
		throw new AppError(httpStatus.BAD_REQUEST, "endTime must be after startTime");
	}
 
	// Nobody teaching this section (lead or co-instructor) may be double-booked.
	const sectionInstructorIds = await getSectionInstructorIds(payload.sectionId);
	const instructorSections = await prisma.section.findMany({
		where: { OR: sectionInstructorIds.map((id) => teachesSectionWhere(id)) },
		select: { id: true },
	});
	const existingRoutines = await prisma.classRoutine.findMany({
		where: {
			sectionId: { in: instructorSections.map((s) => s.id) },
			dayOfWeek: payload.dayOfWeek,
		},
	});
 
	const hasConflict = existingRoutines.some((r) => {
		const existingStart = timeToMinutes(r.startTime);
		const existingEnd = timeToMinutes(r.endTime);
		return newStart < existingEnd && existingStart < newEnd;
	});
	if (hasConflict) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An instructor of this section already has a class scheduled that overlaps this time on this day",
		);
	}
 
	return prisma.classRoutine.create({
		data: {
			sectionId: payload.sectionId,
			dayOfWeek: payload.dayOfWeek,
			startTime: payload.startTime,
			endTime: payload.endTime,
			room: payload.room,
		},
	});
};
 

const getSectionRoutine = async (sectionId: string) => {
	const entries = await prisma.classRoutine.findMany({ where: { sectionId } });
	return sortByDayThenTime(entries);
};

const getMyRoutineAsStudent = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({ where: { userId } });
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const enrollments = await prisma.enrollment.findMany({
		where: { studentId: student.id, status: EnrollmentStatus.ENROLLED },
		select: { sectionId: true },
	});

	const entries = await prisma.classRoutine.findMany({
		where: { sectionId: { in: enrollments.map((e) => e.sectionId) } },
		include: {
			section: {
				include: {
					course: true,
					instructor: { include: { user: true } },
				},
			},
		},
	});

	return sortByDayThenTime(entries);
};

const getMyRoutineAsInstructor = async (userId: string) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}

	const entries = await prisma.classRoutine.findMany({
		where: { section: { instructorId: instructor.id } },
		include: { section: { include: { course: true } } },
	});

	return sortByDayThenTime(entries);
};

const deleteRoutineEntry = async (userId: string, routineId: string) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}

	const entry = await prisma.classRoutine.findUnique({
		where: { id: routineId },
		include: { section: true },
	});
	if (!entry) {
		throw new AppError(httpStatus.NOT_FOUND, "Routine entry not found");
	}
	if (entry.section.instructorId !== instructor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only delete routine entries for your own sections",
		);
	}

	return prisma.classRoutine.delete({ where: { id: routineId } });
};

export const RoutineService = {
	createRoutineEntry,
	getSectionRoutine,
	getMyRoutineAsStudent,
	getMyRoutineAsInstructor,
	deleteRoutineEntry,
};