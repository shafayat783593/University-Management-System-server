export interface ICreateSectionPayload {
	courseId: string;
	semesterId: string;
	instructorId: string;
	coInstructorIds?: string[];
	capacity: number;
	schedule?: string;
}

export interface IUpdateSectionPayload {
	instructorId?: string;
	coInstructorIds?: string[];
	capacity?: number;
	schedule?: string;
}

export interface ISectionFilters {
	semesterId?: string;
	courseId?: string;
}