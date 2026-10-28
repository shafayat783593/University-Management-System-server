export type NextStepKind =
	| "PAY_OVERDUE"
	| "PAY_APPLICATION_FEE"
	| "START_APPLICATION"
	| "APPLICATION_UNDER_REVIEW"
	| "APPLICATION_REJECTED"
	| "PAY_ADMISSION"
	| "NO_OPEN_SEMESTER"
	| "ENROLL"
	| "GENERATE_SEMESTER_INVOICE"
	| "ALL_SET";

export interface INextStep {
	kind: NextStepKind;
	title: string;
	description: string;
	href: string | null;
	tone: "danger" | "warning" | "info" | "success";
}

export interface INextStepInput {
	applicationStatus: "SUBMITTED" | "APPROVED" | "REJECTED" | null;
	rejectionReason: string | null;
	applicationFee: { required: boolean; amount: number; isPaid: boolean };
	admissionOutstanding: number; // BDT, 0 when there is no admission invoice or it is paid
	overdueCount: number;
	semesterOpen: boolean;
	enrolledCount: number;
	hasSemesterInvoice: boolean;
}

/** Decides the single most useful thing a student should do next. Pure, so it is unit-tested. */
export const getStudentNextStep = (s: INextStepInput): INextStep => {
	if (s.overdueCount > 0) {
		return {
			kind: "PAY_OVERDUE",
			title: "You have overdue fees",
			description: "Clear your overdue installments to keep access to enrollment, results and your ID card.",
			href: "/student/payments/my-fees",
			tone: "danger",
		};
	}
	if (!s.applicationStatus) {
		if (s.applicationFee.required && !s.applicationFee.isPaid) {
			return {
				kind: "PAY_APPLICATION_FEE",
				title: "Pay the application fee",
				description: `Pay ৳${s.applicationFee.amount} to unlock the admission application form.`,
				href: "/student/admission-application",
				tone: "warning",
			};
		}
		return {
			kind: "START_APPLICATION",
			title: "Start your admission application",
			description: "Fill in your academic details and submit your application.",
			href: "/student/admission-application",
			tone: "info",
		};
	}
	if (s.applicationStatus === "SUBMITTED") {
		return {
			kind: "APPLICATION_UNDER_REVIEW",
			title: "Application under review",
			description: "An administrator is reviewing your application. You will see the result here.",
			href: null,
			tone: "info",
		};
	}
	if (s.applicationStatus === "REJECTED") {
		return {
			kind: "APPLICATION_REJECTED",
			title: "Application rejected",
			description: s.rejectionReason ?? "Your application was not accepted. You can edit and resubmit it.",
			href: "/student/admission-application",
			tone: "danger",
		};
	}
	if (s.admissionOutstanding > 0) {
		return {
			kind: "PAY_ADMISSION",
			title: "Pay your admission invoice",
			description: `Pay ৳${s.admissionOutstanding} to confirm your admission and receive your Student ID.`,
			href: "/student/payments/my-fees",
			tone: "warning",
		};
	}
	if (!s.semesterOpen) {
		return {
			kind: "NO_OPEN_SEMESTER",
			title: "No semester is open yet",
			description: "Course enrollment will start when the university opens the next semester.",
			href: null,
			tone: "info",
		};
	}
	if (s.enrolledCount === 0) {
		return {
			kind: "ENROLL",
			title: "Enroll in your courses",
			description: "Choose your sections for this semester.",
			href: "/student/programs",
			tone: "info",
		};
	}
	if (!s.hasSemesterInvoice) {
		return {
			kind: "GENERATE_SEMESTER_INVOICE",
			title: "Generate your semester invoice",
			description: "Create the fee invoice for the courses you enrolled in, then pay by installments.",
			href: "/student/semester-invoice",
			tone: "warning",
		};
	}
	return {
		kind: "ALL_SET",
		title: "You are all set",
		description: "Nothing needs your attention right now.",
		href: null,
		tone: "success",
	};
};