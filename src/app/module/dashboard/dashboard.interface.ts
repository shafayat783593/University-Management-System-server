import { INextStep } from "../../lib/dashboardnextstep.js";

export interface IDashboardSummary {
	totals: {
		departments: number;
		courses: number;
		semesters: number;
		sections: number;
		students: number;
		instructors: number;
	};
	instructorApplications: {
		pending: number;
		approved: number;
		rejected: number;
	};
	activeSemester: {
		id: string;
		name: string;
		status: string;
	} | null;
	enrollment: {
		totalEnrolledThisSemester: number;
	};
	pendingAdmissionApplications: number;
	finance: {
		totalCollected: number;
		totalPending: number;
		totalFailedOrCancelled: number;
	};
}



export interface IDashboardAnnouncement {
	id: string;
	title: string;
	excerpt: string;
	createdAt: Date;
}

export interface IDashboardSemester {
	id: string;
	name: string;
	status: string;
	enrollmentStart: Date | null;
	enrollmentEnd: Date | null;
}

export interface IDashboardClass {
	id: string;
	dayOfWeek: string;
	startTime: string; // "HH:mm"
	endTime: string;
	room: string | null;
	sectionId: string;
	course: { id: string; code: string; title: string; creditHours: number };
	instructorName?: string; // student view only
}



export interface IStudentDashboard {
	profile: {
		name: string;
		email: string;
		imageUrl: string | null;
		department: { id: string; name: string; code: string };
		studentIdCode: string | null;
		admissionConfirmed: boolean;
	};
	semester: IDashboardSemester | null;
	nextStep: INextStep;
	admission: {
		applicationStatus: "SUBMITTED" | "APPROVED" | "REJECTED" | null;
		rejectionReason: string | null;
		applicationFee: { required: boolean; amount: number; isPaid: boolean };
		admissionInvoice: {
			id: string;
			invoiceNumber: string;
			status: string;
			payableAmount: number;
			paidAmount: number;
			outstandingBalance: number;
		} | null;
		/** Stepper for the UI: done / current / pending for each admission stage. */
		steps: { key: string; label: string; state: "done" | "current" | "pending" | "skipped" }[];
	};
	billing: {
		totalFees: number;
		totalPaid: number;
		outstandingBalance: number;
		nextInstallment: unknown | null;
		overdueInstallments: unknown[];
		invoiceCount: number;
		hasSemesterInvoice: boolean;
	};
	academics: {
		enrolledCourses: number;
		enrolledCredits: number;
		courses: {
			sectionId: string;
			code: string;
			title: string;
			creditHours: number;
			schedule: string | null;
			instructorName: string;
		}[];
		attendance: {
			totalClasses: number;
			present: number;
			absent: number;
			percentage: number | null; // null when there are no records yet
			lowAttendance: boolean; // below 75%
			byCourse: { code: string; title: string; total: number; present: number; percentage: number }[];
		};
	};
	routine: { today: IDashboardClass[]; nextClass: IDashboardClass | null; week: IDashboardClass[] };
	announcements: IDashboardAnnouncement[];
}


export interface IInstructorDashboard {
	profile: {
		name: string;
		email: string;
		imageUrl: string | null;
		department: { id: string; name: string; code: string };
		qualification: string | null;
		verificationStatus: string;
	};
	semester: IDashboardSemester | null;
	stats: {
		sections: number;
		students: number;
		classesToday: number;
		upcomingExams: number;
		pendingResultSubmissions: number;
	};
	sections: {
		id: string;
		course: { id: string; code: string; title: string; creditHours: number };
		capacity: number;
		enrolledStudents: number;
		schedule: string | null;
		attendanceSessions: number;
		lastAttendanceDate: Date | null;
		attendanceTakenToday: boolean;
		exams: number;
	}[];
	routine: { today: IDashboardClass[]; nextClass: IDashboardClass | null };
	upcomingExams: {
		id: string;
		title: string;
		examType: string;
		examDate: Date | null;
		totalMarks: number;
		sectionId: string;
		course: { code: string; title: string };
	}[];
	pendingActions: {
		/** Sections with a class today but no attendance taken yet. */
		attendanceToTake: { sectionId: string; courseCode: string; courseTitle: string; startTime: string }[];
		/** Past exams where fewer results were submitted than enrolled students. */
		resultsToSubmit: {
			examId: string;
			title: string;
			sectionId: string;
			courseCode: string;
			submitted: number;
			enrolled: number;
		}[];
	};
	announcements: IDashboardAnnouncement[];
}