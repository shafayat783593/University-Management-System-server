import {
	ApplicationStatus,
	EnrollmentStatus,
	InstructorApplicationStatus,
	InvoiceStatus,
	InvoiceType,
	SemesterStatus,
	TransactionStatus,
} from "../../../generated/prisma/enums.js";
import { toMinor } from "../../lib/billing.js";
import { getStudentNextStep } from "../../lib/dashboardnextstep.js";
import { DAY_ORDER, dhakaNow } from "../../lib/dhakatime.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { AdmissionService } from "../admission/admission.service.js";
import { InvoiceService } from "../invoice/invoice.service.js";
import type { IDashboardAnnouncement, IDashboardClass, IDashboardSemester, IDashboardSummary, IInstructorDashboard, IStudentDashboard } from "./dashboard.interface.js";

import httpStatus from "http-status"
const getDashboardSummary = async (): Promise<IDashboardSummary> => {
	const [
		departmentCount,
		courseCount,
		semesterCount,
		sectionCount,
		studentCount,
		approvedInstructorCount,
		pendingApplicationCount,
		approvedApplicationCount,
		rejectedApplicationCount,
		activeSemester,
		collectedAgg,
		openInvoices,
		failedOrCancelledAgg,
		pendingAdmissionApplications,
	] = await Promise.all([
		prisma.department.count(),
		prisma.course.count(),
		prisma.semester.count(),
		prisma.section.count(),
		prisma.studentProfile.count(),
		prisma.instructorProfile.count({
			where: { verificationStatus: InstructorApplicationStatus.APPROVED },
		}),
		prisma.instructorProfile.count({
			where: { verificationStatus: InstructorApplicationStatus.PENDING },
		}),
		prisma.instructorProfile.count({
			where: { verificationStatus: InstructorApplicationStatus.APPROVED },
		}),
		prisma.instructorProfile.count({
			where: { verificationStatus: InstructorApplicationStatus.REJECTED },
		}),
		prisma.semester.findFirst({
			where: { status: SemesterStatus.OPEN },
			select: { id: true, name: true, status: true },
			orderBy: { createdAt: "desc" },
		}),
		prisma.paymentTransaction.aggregate({
			where: { status: { in: [TransactionStatus.SUCCESS, TransactionStatus.REFUNDED] } },
			_sum: { amount: true, refundedAmount: true },
		}),
		prisma.feeInvoice.findMany({
			where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] } },
			select: { payableAmount: true, paidAmount: true },
		}),
		prisma.paymentTransaction.aggregate({
			where: { status: { in: [TransactionStatus.FAILED, TransactionStatus.CANCELLED] } },
			_sum: { amount: true },
		}),
		prisma.admissionApplication.count({ where: { status: ApplicationStatus.SUBMITTED } }),
	]);

	const collectedMinor = toMinor(collectedAgg._sum.amount ?? 0) - toMinor(collectedAgg._sum.refundedAmount ?? 0);
	const outstandingMinor = openInvoices.reduce(
		(a, i) => a + Math.max(toMinor(i.payableAmount) - toMinor(i.paidAmount), 0),
		0,
	);

	const totalEnrolledThisSemester = activeSemester
		? await prisma.enrollment.count({
				where: {
					status: EnrollmentStatus.ENROLLED,
					section: { semesterId: activeSemester.id },
				},
			})
		: 0;

	return {
		totals: {
			departments: departmentCount,
			courses: courseCount,
			semesters: semesterCount,
			sections: sectionCount,
			students: studentCount,
			instructors: approvedInstructorCount,
		},
		instructorApplications: {
			pending: pendingApplicationCount,
			approved: approvedApplicationCount,
			rejected: rejectedApplicationCount,
		},
		activeSemester: activeSemester ?? null,
		enrollment: { totalEnrolledThisSemester },
		finance: {
			totalCollected: collectedMinor / 100,
			totalPending: outstandingMinor / 100,
			totalFailedOrCancelled: Number(failedOrCancelledAgg._sum.amount?.toString() ?? 0),
		},
		pendingAdmissionApplications,
	};
};







const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : 0);
const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);
const LOW_ATTENDANCE = 75;
// semester .....
const getOpenSemester = async (): Promise<IDashboardSemester | null> =>
	prisma.semester.findFirst({
		where: { status: SemesterStatus.OPEN },
		select: {
			id: true,
			name: true,
			status: true,
			enrollmentStart: true,
			enrollmentEnd: true
		},
		orderBy: { createdAt: "desc" },
	});

const getLatestAnnouncements = async (): Promise<IDashboardAnnouncement[]> => {
	const rows = await prisma.announcement.findMany({
		where: { isPublished: true },
		orderBy: { createdAt: "desc" },
		take: 5,
		select: { id: true, title: true, body: true, createdAt: true },
	});
	return rows.map((a) => ({
		id: a.id,
		title: a.title,
		excerpt: a.body.length > 160 ? `${a.body.slice(0, 157)}...` : a.body,
		createdAt: a.createdAt,
	}));
};

type RoutineRow = Awaited<ReturnType<typeof loadRoutine>>[number];

const loadRoutine = (sectionIds: string[]) =>
	prisma.classRoutine.findMany({
		where: { sectionId: { in: sectionIds } },
		include: {
			section: { include: { course: true, instructor: { include: { user: { select: { name: true } } } } } },
		},
	});

const toClass = (r: RoutineRow, withInstructor: boolean): IDashboardClass => ({
	id: r.id,
	dayOfWeek: r.dayOfWeek,
	startTime: r.startTime,
	endTime: r.endTime,
	room: r.room,
	sectionId: r.sectionId,
	course: {
		id: r.section.course.id,
		code: r.section.course.code,
		title: r.section.course.title,
		creditHours: r.section.course.creditHours,
	},
	...(withInstructor ? { instructorName: r.section.instructor.user.name } : {}),
});

const sortWeek = (rows: RoutineRow[]) =>
	[...rows].sort(
		(a, b) =>
			DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime),
	);

const splitToday = (rows: RoutineRow[], withInstructor: boolean) => {
	const now = dhakaNow();
	const today = sortWeek(rows)
		.filter((r) => r.dayOfWeek === now.dayOfWeek)
		.map((r) => toClass(r, withInstructor));
	const nextClass = today.find((c) => c.endTime > now.time) ?? null;
	return { today, nextClass, now };
};

// student
const getStudentDashboard = async (userId: string): Promise<IStudentDashboard> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			name: true,
			email: true,
			imageUrl: true,
			studentProfile: {
				include: {
					department: {
						select: {
							id: true,
							name: true,
							code: true
						}
					}
				}
			},
		},
	});
	const student = user?.studentProfile;
	if (!user || !student) throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

	const [semester, admission, billingSummary, announcements] = await Promise.all([
		getOpenSemester(),
		AdmissionService.getMyApplication(userId),
		InvoiceService.getMySummary(userId),
		getLatestAnnouncements(),
	]);

	const enrollments = semester? await prisma.enrollment.findMany({
		where: {
			studentId: student.id,
			status: EnrollmentStatus.ENROLLED,
			section: {
				semesterId: semester.id
			}
		},
				include: {
					section: { include: { course: true, instructor: { include: { user: { select: { name: true } } } } } },
				},
			})
		: [];
	const sectionIds = enrollments.map((e) => e.sectionId);

	const [semesterInvoice, attendanceRows, routineRows] = await Promise.all([
		semester
			? prisma.feeInvoice.findFirst({
					where: {
						studentId: student.id,
						type: InvoiceType.SEMESTER,
						semesterId: semester.id,
						status: { not: InvoiceStatus.CANCELLED },
					},
					select: { id: true },
				})
			: null,
		sectionIds.length
			? prisma.attendanceRecord.findMany({
					where: { studentId: student.id, session: { sectionId: { in: sectionIds } } },
					select: {
						status: true,
						session: { select: { section: { select: { course: { select: { id: true, code: true, title: true } } } } } },
					},
				})
			: [],
		sectionIds.length ? loadRoutine(sectionIds) : [],
	]);

	// ---- admission
	const app = admission.application;
	const invoice = admission.admissionInvoice;
	const admissionInvoice = invoice
		? {
				id: invoice.id,
				invoiceNumber: invoice.invoiceNumber,
				status: invoice.status as string,
				payableAmount: invoice.payableAmount,
				paidAmount: invoice.paidAmount,
				outstandingBalance: Math.max(Math.round((invoice.payableAmount - invoice.paidAmount) * 100) / 100, 0),
			}
		: null;
	const applicationStatus = (app?.status ?? null) as "SUBMITTED" | "APPROVED" | "REJECTED" | null;
	const feeNeeded = admission.applicationFee.amount > 0 && (admission.applicationFee.required || admission.applicationFee.isPaid);
	const steps: IStudentDashboard["admission"]["steps"] = [
		{
			key: "application_fee",
			label: "Application fee",
			state: !feeNeeded ? "skipped" : admission.applicationFee.isPaid ? "done" : app ? "done" : "current",
		},
		{
			key: "application",
			label: "Application",
			state: app ? "done" : !feeNeeded || admission.applicationFee.isPaid ? "current" : "pending",
		},
		{
			key: "review",
			label: "Admission review",
			state: !app ? "pending" : app.status === ApplicationStatus.SUBMITTED ? "current" : "done",
		},
		{
			key: "admission_payment",
			label: "Admission payment",
			state:
				app?.status !== ApplicationStatus.APPROVED
					? "pending"
					: admissionInvoice && admissionInvoice.outstandingBalance > 0
						? "current"
						: "done",
		},
		{
			key: "student_id",
			label: "Student ID issued",
			state: admission.studentIdCode ? "done" : "pending",
		},
	];

	// ---- attendance
	const present = attendanceRows.filter((r) => r.status === "PRESENT").length;
	const byCourseMap = new Map<string, { code: string; title: string; total: number; present: number }>();
	for (const r of attendanceRows) {
		const c = r.session.section.course;
		const row = byCourseMap.get(c.id) ?? { code: c.code, title: c.title, total: 0, present: 0 };
		row.total += 1;
		if (r.status === "PRESENT") row.present += 1;
		byCourseMap.set(c.id, row);
	}
	const total = attendanceRows.length;
	const percentage = total === 0 ? null : pct(present, total);

	const { today, nextClass } = splitToday(routineRows, true);

	const nextStep = getStudentNextStep({
		applicationStatus,
		rejectionReason: app?.rejectionReason ?? null,
		applicationFee: admission.applicationFee,
		admissionOutstanding: admissionInvoice?.outstandingBalance ?? 0,
		overdueCount: billingSummary.overdueInstallments.length,
		semesterOpen: !!semester,
		enrolledCount: enrollments.length,
		hasSemesterInvoice: !!semesterInvoice,
	});

	return {
		profile: {
			name: user.name,
			email: user.email,
			imageUrl: user.imageUrl,
			department: student.department,
			studentIdCode: student.studentIdCode,
			admissionConfirmed: !!student.admissionConfirmedAt,
		},
		semester,
		nextStep,
		admission: {
			applicationStatus,
			rejectionReason: app?.rejectionReason ?? null,
			applicationFee: admission.applicationFee,
			admissionInvoice,
			steps,
		},
		billing: { ...billingSummary, hasSemesterInvoice: !!semesterInvoice },
		academics: {
			enrolledCourses: enrollments.length,
			enrolledCredits: enrollments.reduce((s, e) => s + e.section.course.creditHours, 0),
			courses: enrollments.map((e) => ({
				sectionId: e.sectionId,
				code: e.section.course.code,
				title: e.section.course.title,
				creditHours: e.section.course.creditHours,
				schedule: e.section.schedule,
				instructorName: e.section.instructor.user.name,
			})),
			attendance: {
				totalClasses: total,
				present,
				absent: total - present,
				percentage,
				lowAttendance: percentage !== null && percentage < LOW_ATTENDANCE,
				byCourse: [...byCourseMap.values()].map((c) => ({ ...c, percentage: pct(c.present, c.total) })),
			},
		},
		routine: { today, nextClass, week: sortWeek(routineRows).map((r) => toClass(r, true)) },
		announcements,
	};
};

// ================================================================== instructor

const getInstructorDashboard = async (userId: string): Promise<IInstructorDashboard> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			name: true,
			email: true,
			imageUrl: true,
			instructorProfile: { include: { department: { select: { id: true, name: true, code: true } } } },
		},
	});
	const instructor = user?.instructorProfile;
	if (!user || !instructor) throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");

	const [semester, announcements] = await Promise.all([getOpenSemester(), getLatestAnnouncements()]);

	const profile = {
		name: user.name,
		email: user.email,
		imageUrl: user.imageUrl,
		department: instructor.department,
		qualification: instructor.qualification,
		verificationStatus: instructor.verificationStatus as string,
	};

	const empty = {
		profile,
		semester,
		stats: { sections: 0, students: 0, classesToday: 0, upcomingExams: 0, pendingResultSubmissions: 0 },
		sections: [],
		routine: { today: [], nextClass: null },
		upcomingExams: [],
		pendingActions: { attendanceToTake: [], resultsToSubmit: [] },
		announcements,
	} satisfies IInstructorDashboard;
	if (!semester) return empty;

	const sections = await prisma.section.findMany({
		where: { instructorId: instructor.id, semesterId: semester.id },
		include: {
			course: true,
			_count: { select: { attendanceSessions: true, exams: true } },
			attendanceSessions: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
		},
		orderBy: { course: { code: "asc" } },
	});
	if (sections.length === 0) return empty;

	const ids = sections.map((s) => s.id);
	const now = dhakaNow();

	const [enrolledGroups, routineRows, todaySessions, exams] = await Promise.all([
		prisma.enrollment.groupBy({
			by: ["sectionId"],
			where: { sectionId: { in: ids }, status: EnrollmentStatus.ENROLLED },
			_count: { _all: true },
		}),
		loadRoutine(ids),
		prisma.attendanceSession.findMany({
			where: { sectionId: { in: ids }, date: { gte: now.dayStartUtc, lt: now.dayEndUtc } },
			select: { sectionId: true },
		}),
		prisma.exam.findMany({
			where: { sectionId: { in: ids } },
			include: { section: { include: { course: true } }, _count: { select: { results: true } } },
			orderBy: { examDate: "asc" },
		}),
	]);

	const enrolledBy = new Map(enrolledGroups.map((g) => [g.sectionId, g._count._all]));
	const takenToday = new Set(todaySessions.map((s) => s.sectionId));
	const { today, nextClass } = splitToday(routineRows, false);

	const upcomingExams = exams
		.filter((e) => e.examDate && e.examDate >= now.dayStartUtc)
		.slice(0, 5)
		.map((e) => ({
			id: e.id,
			title: e.title,
			examType: e.examType as string,
			examDate: e.examDate,
			totalMarks: e.totalMarks,
			sectionId: e.sectionId,
			course: { code: e.section.course.code, title: e.section.course.title },
		}));

	const resultsToSubmit = exams
		.filter((e) => (!e.examDate || e.examDate < now.dayStartUtc) && e._count.results < (enrolledBy.get(e.sectionId) ?? 0))
		.slice(0, 10)
		.map((e) => ({
			examId: e.id,
			title: e.title,
			sectionId: e.sectionId,
			courseCode: e.section.course.code,
			submitted: e._count.results,
			enrolled: enrolledBy.get(e.sectionId) ?? 0,
		}));

	const courseBySection = new Map(sections.map((s) => [s.id, s.course]));
	const attendanceToTake = today
		.filter((c) => !takenToday.has(c.sectionId))
		.map((c) => ({
			sectionId: c.sectionId,
			courseCode: courseBySection.get(c.sectionId)?.code ?? c.course.code,
			courseTitle: courseBySection.get(c.sectionId)?.title ?? c.course.title,
			startTime: c.startTime,
		}));

	return {
		profile,
		semester,
		stats: {
			sections: sections.length,
			students: [...enrolledBy.values()].reduce((a, b) => a + b, 0),
			classesToday: today.length,
			upcomingExams: upcomingExams.length,
			pendingResultSubmissions: resultsToSubmit.length,
		},
		sections: sections.map((s) => ({
			id: s.id,
			course: { id: s.course.id, code: s.course.code, title: s.course.title, creditHours: s.course.creditHours },
			capacity: s.capacity,
			enrolledStudents: enrolledBy.get(s.id) ?? 0,
			schedule: s.schedule,
			attendanceSessions: s._count.attendanceSessions,
			lastAttendanceDate: s.attendanceSessions[0]?.date ?? null,
			attendanceTakenToday: takenToday.has(s.id),
			exams: s._count.exams,
		})),
		routine: { today, nextClass },
		upcomingExams,
		pendingActions: { attendanceToTake, resultsToSubmit },
		announcements,
	};
};














export const DashboardService = {
	getDashboardSummary,
	getStudentDashboard,
	getInstructorDashboard
};