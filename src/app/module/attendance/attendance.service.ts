import httpStatus from "http-status";
import { AttendanceStatus, EnrollmentStatus, Role } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";





export interface ICreateAttendanceSessionPayload {
	sectionId: string;
	date: string;
}

export interface IMarkAttendanceRecord {
	studentId: string;
	status: AttendanceStatus;
}
const createAttendanceSession = async (
	userId: string,
	payload: ICreateAttendanceSessionPayload,
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
	if (section.instructorId !== instructor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only create sessions for your own sections",
		);
	}

	const date = new Date(payload.date);

	const existing = await prisma.attendanceSession.findUnique({
		where: { 
            sectionId_date: {
                 sectionId: section.id, date }
                 },
	});
	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An attendance session already exists for this section on this date",
		);
	}

	return prisma.attendanceSession.create({
		data: { sectionId: section.id, date },
	});
};

const markAttendance = async (
	userId: string,
	sessionId: string,
	records: IMarkAttendanceRecord[],
) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { userId },
	});
	if (!instructor) {
		throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");
	}

	const session = await prisma.attendanceSession.findUnique({
		where: { id: sessionId },
		include: { section: true },
	});
	if (!session) {
		throw new AppError(httpStatus.NOT_FOUND, "Attendance session not found");
	}
	if (session.section.instructorId !== instructor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You can only mark attendance for your own sections",
		);
	}

	const studentIds = records.map((r) => r.studentId);
	const enrolledCount = await prisma.enrollment.count({
		where: {
			sectionId: session.sectionId,
			studentId: { in: studentIds },
			status: EnrollmentStatus.ENROLLED,
		},
	});
	if (enrolledCount !== new Set(studentIds).size) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"One or more students are not currently enrolled in this section",
		);
	}

	
	return prisma.$transaction(
		records.map((r) =>
			prisma.attendanceRecord.upsert({
				where: {
					sessionId_studentId: { 
                        sessionId,
                         studentId: r.studentId 
                        },
				},
				create: { 
                    sessionId,
                     studentId: r.studentId, 
                     status: r.status },
				update: {
                     status: r.status },
			}),
		),
	);
};

const getSectionAttendance = async (userId: string, sectionId: string, role: Role) => {
	if (role === Role.INSTRUCTOR) {
		const instructor = await prisma.instructorProfile.findUnique({
			where: { userId },
		});
		const section = await prisma.section.findUnique({ where: { id: sectionId } });
		if (!section) {
			throw new AppError(httpStatus.NOT_FOUND, "Section not found");
		}
		if (!instructor || section.instructorId !== instructor.id) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You can only view attendance for your own sections",
			);
		}
	}

	return prisma.attendanceSession.findMany({
		where: { sectionId },
		include: {
			records: { include: { student: { include: { user: true } } } },
		},
		orderBy: { date: "asc" },
	});
};

const getMyAttendance = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	return prisma.attendanceRecord.findMany({
		where: { studentId: student.id },
		include: {
			session: { include: { section: { include: { course: true } } } },
		},
		orderBy: { session: { date: "desc" } },
	});
};

export const AttendanceService = {
	createAttendanceSession,
	markAttendance,
	getSectionAttendance,
	getMyAttendance,
};