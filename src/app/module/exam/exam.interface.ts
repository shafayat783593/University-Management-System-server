import { ExamType } from "../../../generated/prisma/enums.js";

export interface ICreateExamPayload {
	sectionId: string;
	title: string;
	examType: ExamType;
	totalMarks: number;
	examDate?: string;
}

export interface ICreateBulkExamsPayload {
	exams: ICreateExamPayload[];
}

