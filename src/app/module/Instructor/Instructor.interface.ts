import { InstructorApplicationStatus } from "../../../generated/prisma/enums.js";

export interface IApplyAsInstructorPayload {
	name: string;
	email: string;
	departmentId: string;
	qualification?: string;
}

export interface IVerifyInstructorEmailPayload {
	email: string;
	otp: string;
}

export interface IReviewInstructorPayload {
	verificationStatus: InstructorApplicationStatus;
	rejectionReason?: string;
}