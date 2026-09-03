export interface ICreateSectionPayload {
	courseId: string;
	semesterId: string;
	instructorId: string;
	capacity: number;
	schedule?: string;
}

export interface IUpdateSectionPayload {
	instructorId?: string;
	capacity?: number;
	schedule?: string;
}

export interface ISectionFilters {
	semesterId?: string;
	courseId?: string;
}