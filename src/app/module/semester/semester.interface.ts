import { SemesterStatus } from "../../../generated/prisma/enums.js";



 
export interface ICreateSemesterPayload {
	name: string;
	year: number;
	term: string;
	enrollmentStart?: string;
	enrollmentEnd?: string;
}
 
export interface IUpdateSemesterStatusPayload {
	status: SemesterStatus;
}
 

