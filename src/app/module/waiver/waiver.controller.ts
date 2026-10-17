import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { WaiverService } from "./waiver.service.js";

const createWaiver = catchAsync(async (req, res) =>
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Waiver created",
		data: await WaiverService.createWaiver(req.user!.userId, req.body),
	}));

const listWaivers = catchAsync(async (req, res) =>
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Waivers retrieved",
		data: await WaiverService.listWaivers(req.query as never),
	}));

const updateWaiver = catchAsync(async (req, res) =>
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Waiver updated",
		data: await WaiverService.updateWaiver(req.user!.userId, (req.params.id as string), req.body),
	}));

export const WaiverController = { createWaiver, listWaivers, updateWaiver };