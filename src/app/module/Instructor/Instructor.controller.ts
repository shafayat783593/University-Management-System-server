import { Request, Response } from "express";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { InstructorService } from "./Instructor.service.js";

const applyAsInstructor = catchAsync(async (req: Request, res: Response) => {
	const resume = req.file as Express.Multer.File | undefined;
	const payload = req.body;
	const result = await InstructorService.applyAsInstructor(payload, resume);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Application submitted, check your email for the verification OTP",
		data: result,
	});
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await InstructorService.verifyInstructorEmail(payload);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Email verified, your application is now pending review",
		data: result,
	});
});

const reviewApplication = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const userId = req.user?.userId;
    const instructorId = req.params.instructorId


	const result = await InstructorService.reviewInstructorApplication(
		instructorId as string,
		payload,
		userId as string,
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Application reviewed",
		data: result,
	});
});

const getAllInstructorApplications = catchAsync(async (req: Request, res: Response) => {
    const quary = req.query
		const { data, meta }  = await InstructorService.getAllInstructorApplications(quary);
		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Instructor applications retrieved",
			data: data ,
            meta:meta
		});
	},
);

export const InstructorController = {
	applyAsInstructor,
	verifyEmail,
	reviewApplication,
	getAllInstructorApplications,
};
