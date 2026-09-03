import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { Request, Response } from "express";
import { FeeService } from "./fee.service.js";


const generateFeesForSemester = catchAsync(async (req:Request, res:Response) => {
	const result = await FeeService.generateFeesForSemester(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Fees generated for semester",
		data: result,
	});
});

export const FeeController = {
	generateFeesForSemester,
};