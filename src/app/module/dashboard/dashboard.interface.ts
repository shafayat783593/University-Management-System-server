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
	finance: {
		totalCollected: number;
		totalPending: number;
		totalFailedOrCancelled: number;
	};
}