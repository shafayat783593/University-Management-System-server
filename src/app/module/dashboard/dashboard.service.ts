import {
	ApplicationStatus,
	EnrollmentStatus,
	InstructorApplicationStatus,
	InvoiceStatus,
	SemesterStatus,
	TransactionStatus,
} from "../../../generated/prisma/enums.js";
import { toMinor } from "../../lib/billing.js";
import { prisma } from "../../lib/prisma.js";
import type { IDashboardSummary } from "./dashboard.interface.js";

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

export const DashboardService = {
	getDashboardSummary,
};
