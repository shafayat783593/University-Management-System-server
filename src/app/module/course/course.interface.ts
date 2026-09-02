export interface ICreateCoursePayload {
	code: string;
	title: string;
	creditHours: number;
	departmentId: string;
	prerequisiteCourseIds?: string[];
}
 
export interface IUpdateCoursePayload {
	title?: string;
	creditHours?: number;
	prerequisiteCourseIds?: string[];
}
 