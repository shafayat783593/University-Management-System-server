import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { Request, Response } from "express";
import { FeeService } from "./fee.service.js";
import { FeeBillingService } from "./invoice.service.js";


const generateFeesForSemester = catchAsync(async (req:Request, res:Response) => {
	const result = await FeeService.generateFeesForSemester(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Fees generated for semester",
		data: result,
	});
});

const getPolicy = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.getPolicy(req.query.semesterId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Fee policy retrieved",
		data: result,
	});
});

const upsertPolicy = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.upsertPolicy(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Fee policy saved",
		data: result,
	});
});

const generateFromPolicy = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.generateFromPolicy(req.body.semesterId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Invoices generated from policy",
		data: result,
	});
});

const adjustFee = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.adjustFee(req.params.feeId as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Invoice adjusted",
		data: result,
	});
});

const cancelFee = catchAsync(async (req: Request, res: Response) => {
	const reason = (req.body?.reason as string | undefined) ?? "Cancelled by admin";
	const result = await FeeBillingService.cancelFee(req.params.feeId as string, reason);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Invoice cancelled",
		data: result,
	});
});

const outstandingDues = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.outstandingDues(req.query.semesterId as string | undefined);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Outstanding dues retrieved",
		data: result,
	});
});

const overdueInstallments = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.overdueInstallments(req.query.semesterId as string | undefined);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Overdue installments retrieved",
		data: result,
	});
});

const collectionSummary = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.collectionSummary(req.query.semesterId as string | undefined);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Collection summary retrieved",
		data: result,
	});
});

const getAdmissionFeeSetting = catchAsync(async (_req: Request, res: Response) => {
	const result = await FeeBillingService.getAdmissionFeeSetting();
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Admission fee setting retrieved",
		data: result,
	});
});

const setAdmissionFeeSetting = catchAsync(async (req: Request, res: Response) => {
	const result = await FeeBillingService.setAdmissionFeeSetting(req.body.amount ?? null, {
		applicationFeeAmount: req.body.applicationFeeAmount,
		admissionInstallmentCount: req.body.admissionInstallmentCount,
	});
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Admission fee setting saved",
		data: result,
	});
});

export const FeeController = {
	generateFeesForSemester,
	getPolicy,
	upsertPolicy,
	generateFromPolicy,
	adjustFee,
	cancelFee,
	outstandingDues,
	overdueInstallments,
	collectionSummary,
	getAdmissionFeeSetting,
	setAdmissionFeeSetting,
};
