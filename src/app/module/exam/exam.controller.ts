import httpStatus from "http-status";

import { Request, Response } from "express";
import { ExamService } from "./exam.service.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";

const createExam = catchAsync(async (req:Request, res:Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	const result = await ExamService.createExam(req.user.userId, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Exam created",
		data: result,
	});
});

const getSectionExams = catchAsync(async (req:Request, res:Response) => {
    const sectionId = req.params.sectionId
	const result = await ExamService.getSectionExams(sectionId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Exams retrieved",
		data: result,
	});
});

export const ExamController = {
	createExam,
	getSectionExams,
};