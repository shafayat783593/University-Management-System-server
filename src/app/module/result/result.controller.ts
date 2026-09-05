import httpStatus from "http-status";

import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { ResultService } from "./result.service.js";
import { sendResponse } from "../../utils/sendResponse.js";

const submitResults = catchAsync(async (req:Request, res:Response) => {

		const userId =  req.user?.userId as string
		const examId = req.params.examId as string
		const payload = req.body.records
	const result = await ResultService.submitResults(userId,examId,payload);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Results submitted",
		data: result,
	});
});

const publishExamResults = catchAsync(async (req:Request, res:Response) => {
	const examId =  req.params.examId as string
	const result = await ResultService.publishExamResults(examId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Results published",
		data: result,
	});
});

const overrideResult = catchAsync(async (req:Request, res:Response) => {

	const userId  = 	req.user?.userId as  string
		const resultId = req.params.resultId as string
		const pyload = req.body
	const result = await ResultService.overrideResult(
	userId,
	resultId,
	pyload
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Result overridden",
		data: result,
	});
});

const getMyTranscript = catchAsync(async (req:Request, res:Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	const result = await ResultService.getTranscript(req.user.userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Transcript retrieved",
		data: result,
	});
});

const downloadTranscript = catchAsync(async (req:Request, res:Response) => {
	const { buffer, student } = await ResultService.downloadTranscript(
		// @ts-expect-error req.user is attached by the auth() middleware
		req.user.userId,
	);
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="transcript-${student.studentIdCode}.pdf"`,
	);
	res.send(buffer);
});

const emailTranscript = catchAsync(async (req:Request, res:Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	await ResultService.emailTranscript(req.user.userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Transcript emailed",
		data: null,
	});
});

const getSectionResultSheet = catchAsync(async (req:Request, res:Response) => {
	const userId = req.user?.userId as string
	const sectionId = 	req.params.sectionId 
	const result = await ResultService.getSectionResultSheet(
		userId,
		sectionId as string
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Result sheet retrieved",
		data: result,
	});
});

const downloadResultSheet = catchAsync(async (req:Request, res:Response) => {
const userId = 	req.user?.userId
	const sectionId = 	req.params.sectionId

	const { buffer, student } = await ResultService.downloadResultSheet(userId as string,sectionId as string);
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="result-sheet-${student.studentIdCode}.pdf"`,
	);
	res.send(buffer);
});

const emailResultSheet = catchAsync(async (req:Request, res:Response) => {
const userId = 	req.user?.userId
	const sectionId = 	req.params.sectionId
	await ResultService.emailResultSheet(userId as string,sectionId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Result sheet emailed",
		data: null,
	});
});

export const ResultController = {
	submitResults,
	publishExamResults,
	overrideResult,
	getMyTranscript,
	downloadTranscript,
	emailTranscript,
	getSectionResultSheet,
	downloadResultSheet,
	emailResultSheet,
};