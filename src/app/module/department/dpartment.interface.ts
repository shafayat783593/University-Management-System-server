export interface ICreateDepartmentPayload {
	name: string;
	code: string;
}

export interface IUpdateDepartmentPayload {
	name?: string;
	code?: string;
}