import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { DashboardService } from "./dashboard.service.js";

const getDashboardSummary = catchAsync(async (_req: Request, res: Response) => {
	const result = await DashboardService.getDashboardSummary();
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dashboard summary retrieved",
		data: result,
	});
});


const getStudentDashboard = catchAsync(async (req, res) => {
	const result = await DashboardService.getStudentDashboard(req.user!.userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Student dashboard retrieved",
		data: result,
	});
});
 
const getInstructorDashboard = catchAsync(async (req, res) => {
	const result = await DashboardService.getInstructorDashboard(req.user!.userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Instructor dashboard retrieved",
		data: result,
	});
});

export const DashboardController = {
	getDashboardSummary,
	getStudentDashboard,
	getInstructorDashboard,
};
