import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { SettingService } from "./setting.service.js";

const getSettings = catchAsync(async (req, res) => {
	const result = await SettingService.getSettings();
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Settings retrieved",
		data: result,
	});
});

const updateSettings = catchAsync(async (req, res) => {
	const result = await SettingService.updateSettings(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Settings updated",
		data: result,
	});
});

export const SettingController = {
	getSettings,
	updateSettings,
};