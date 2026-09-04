import { Request, Response } from "express";
import httpStatus from "http-status";
import { ResultService } from "./result.service.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { catchAsync } from "../../utils/catchAsync.js";


const submitResults = catchAsync(async (req:Request, res:Response) => {
    	const userId =req.user?.userId as string
		const examId = req.params.examId as string
		const payload = req.body.records
	const result = await ResultService.submitResults(userId ,examId,payload);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Results submitted",
		data: result,
	});
});

const publishExamResults = catchAsync(async (req, res) => {
    const examId = req.params.examId
	const result = await ResultService.publishExamResults(examId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Results published",
		data: result,
	});
});

const overrideResult = catchAsync(async (req:Request, res:Response) => {
   const userId = req.user?.userId as string
	const resultId = 	req.params.resultId as string
		const pyload = req.body
	const result = await ResultService.overrideResult(userId,resultId,pyload);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Result overridden",
		data: result,
	});
});

const getMyTranscript = catchAsync(async (req:Request, res:Response) => {
const userId = req.user?.userId
	const result = await ResultService.getTranscript(userId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Transcript retrieved",
		data: result,
	});
});

export const ResultController = {
	submitResults,
	publishExamResults,
	overrideResult,
	getMyTranscript,
};