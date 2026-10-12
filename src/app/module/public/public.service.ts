import httpStatus from "http-status";
import {
	InstructorApplicationStatus,
	SemesterStatus,
	UserStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { SemesterService } from "../semester/semester.service.js";

/** Landing-page counters. Public, so counts only — no personal data. */
const getStats = async () => {
	const [students, instructors, departments, courses] = await Promise.all([
		prisma.studentProfile.count({
			where: { user: { status: UserStatus.ACTIVE, isDeleted: false } },
		}),
		prisma.instructorProfile.count({
			where: {
				verificationStatus: InstructorApplicationStatus.APPROVED,
				user: { status: UserStatus.ACTIVE, isDeleted: false },
			},
		}),
		prisma.department.count(),
		prisma.course.count(),
	]);
	return { students, instructors, departments, courses };
};

/** Departments with counts + the open semester's tuition (tuition is per semester, not per department). */
const getDepartmentCards = async () => {
	const [departments, openSemester] = await Promise.all([
		prisma.department.findMany({
			orderBy: { name: "asc" },
			include: { _count: { select: { courses: true, instructors: true } } },
		}),
		prisma.semester.findFirst({
			where: { status: SemesterStatus.OPEN },
			select: { name: true, feeAmount: true, installmentCount: true },
		}),
	]);
	return { departments, tuition: openSemester };
};

/** Approved instructors only; no email/phone/resume exposed. */
const getFaculty = async (limit = 6) => {
	return prisma.instructorProfile.findMany({
		where: {
			verificationStatus: InstructorApplicationStatus.APPROVED,
			user: { status: UserStatus.ACTIVE, isDeleted: false },
		},
		take: Math.min(Math.max(limit, 1), 12),
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			qualification: true,
			department: { select: { id: true, name: true, code: true } },
			user: { select: { name: true, imageUrl: true } },
		},
	});
};

/** Calendar of the OPEN semester, else the nearest UPCOMING one. */
const getCurrentCalendar = async () => {
	const semester =
		(await prisma.semester.findFirst({
			where: { status: SemesterStatus.OPEN },
			orderBy: { year: "desc" },
		})) ??
		(await prisma.semester.findFirst({
			where: { status: SemesterStatus.UPCOMING },
			orderBy: { year: "asc" },
		}));
	if (!semester) {
		throw new AppError(httpStatus.NOT_FOUND, "No open or upcoming semester");
	}
	return SemesterService.getSemesterCalendar(semester.id);
};

export const PublicService = {
	getStats,
	getDepartmentCards,
	getFaculty,
	getCurrentCalendar,
};