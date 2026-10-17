export interface ISubmitAdmissionApplicationPayload {
	previousInstitution: string;
	sscBoard?: string;
	sscYear?: number;
	sscGpa?: number;
	hscBoard?: string;
	hscYear?: number;
	hscGpa?: number;
	guardianOccupation?: string;
	presentAddress?: string;
	permanentAddress?: string;
}

export interface IReviewApplicationPayload {
	status: "APPROVED" | "REJECTED";
	rejectionReason?: string;
}