import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { AdmissionService } from "./admission.service.js";

const submitApplication = catchAsync(async (req, res) => {
	const result = await AdmissionService.submitApplication(req.user?.userId as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Admission application submitted — awaiting review",
		data: result,
	});
});

const updateApplication = catchAsync(async (req, res) => {
	const result = await AdmissionService.updateApplication(req.user?.userId as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Admission application updated",
		data: result,
	});
});

const getMyApplication = catchAsync(async (req, res) => {
	const result = await AdmissionService.getMyApplication(req.user?.userId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Admission status retrieved",
		data: result,
	});
});

const listApplications = catchAsync(async (req, res) => {
	const { data, meta } = await AdmissionService.listApplications(req.query);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Applications retrieved",
		data: { data, meta },
	});
});

const reviewApplication = catchAsync(async (req, res) => {
	const result = await AdmissionService.reviewApplication(
		req.user?.userId as string,
		req.params.id,
		req.body,
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: `Application ${result.status.toLowerCase()}`,
		data: result,
	});
});

export const AdmissionController = {
	submitApplication,
	updateApplication,
	getMyApplication,
	listApplications,
	reviewApplication,
};
