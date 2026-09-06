import {
	EnrollmentStatus,
	FeeStatus,
	InstructorApplicationStatus,
	PaymentStatus,
	SemesterStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { IDashboardSummary } from "./dashboard.interface.js";

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
		pendingFeeAgg,
		failedOrCancelledAgg,
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
		prisma.payment.aggregate({
			where: { status: PaymentStatus.PAID },
			_sum: { amount: true },
		}),
		prisma.fee.aggregate({
			where: { status: FeeStatus.PENDING },
			_sum: { amount: true },
		}),
		prisma.payment.aggregate({
			where: { status: { in: [PaymentStatus.FAILED, PaymentStatus.CANCELLED] } },
			_sum: { amount: true },
		}),
	]);

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
			totalCollected: collectedAgg._sum.amount ?? 0,
			totalPending: pendingFeeAgg._sum.amount ?? 0,
			totalFailedOrCancelled: failedOrCancelledAgg._sum.amount ?? 0,
		},
	};
};

export const DashboardService = {
	getDashboardSummary,
};