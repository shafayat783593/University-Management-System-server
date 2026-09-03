

import httpStatus from "http-status";

import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { EnrollmentService } from "./enrollment.service.js";
import { sendResponse } from "../../utils/sendResponse.js";

const createEnrollment = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user?.userId
	const result = await EnrollmentService.createEnrollment(userId as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Enrolled successfully",
		data: result,
	});
});

const dropEnrollment = catchAsync(async (req:Request, res:Response) => {
        const userId = req.user?.userId
        const  sectionId = req.params.sectionId

	const result = await EnrollmentService.dropEnrollment(userId as string, sectionId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dropped successfully",
		data: result,
	});
});

const getMyEnrollments = catchAsync(async (req:Request, res:Response) => {
	        const userId = req.user?.userId

	const result = await EnrollmentService.getMyEnrollments(userId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Enrollments retrieved",
		data: result,
	});
});

export const EnrollmentController = {
	createEnrollment,
	dropEnrollment,
	getMyEnrollments,
};