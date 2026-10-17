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

export const DashboardController = {
	getDashboardSummary,
};
