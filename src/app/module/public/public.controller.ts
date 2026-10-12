import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PublicService } from "./public.service.js";

const getStats = catchAsync(async (_req, res) => {
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Stats retrieved",
		data: await PublicService.getStats(),
	});
});

const getDepartmentCards = catchAsync(async (_req, res) => {
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Departments retrieved",
		data: await PublicService.getDepartmentCards(),
	});
});

const getFaculty = catchAsync(async (req, res) => {
	const limit = req.query.limit ? Number(req.query.limit) : 6;
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Faculty retrieved",
		data: await PublicService.getFaculty(limit),
	});
});

const getCurrentCalendar = catchAsync(async (_req, res) => {
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Calendar retrieved",
		data: await PublicService.getCurrentCalendar(),
	});
});

export const PublicController = {
	getStats,
	getDepartmentCards,
	getFaculty,
	getCurrentCalendar,
};