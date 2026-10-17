import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { FeePolicyFilters, FeePolicyService } from "./feePolicy.service.js";


const listFeePolicies = catchAsync(async (req: Request, res: Response) => {
	const query = req.query;
	const result = await FeePolicyService.listFeePolicies(query as FeePolicyFilters);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Fee policies retrieved",
		data: result,
	});
});

const createFeePolicy = catchAsync(async (req: Request, res: Response) => {
	const result = await FeePolicyService.createFeePolicy(
		req.user!.userId,
		req.body,
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Fee policy created",
		data: result,
	});
});

const updateFeePolicy = catchAsync(async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const result = await FeePolicyService.updateFeePolicy(
		req.user!.userId,
		id,
		req.body,
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Fee policy updated",
		data: result,
	});
});

const listInstallmentPolicies = catchAsync(
	async (_req: Request, res: Response) => {
		const result = await FeePolicyService.listInstallmentPolicies();
		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Installment policies retrieved",
			data: result,
		});
	},
);

const createInstallmentPolicy = catchAsync(
	async (req: Request, res: Response) => {
		const result = await FeePolicyService.createInstallmentPolicy(
			req.user!.userId,
			req.body,
		);
		sendResponse(res, {
			success: true,
			statusCode: httpStatus.CREATED,
			message: "Installment policy created",
			data: result,
		});
	},
);

const updateInstallmentPolicy = catchAsync(
	async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const result = await FeePolicyService.updateInstallmentPolicy(
			req.user!.userId,
			id,
			req.body,
		);
		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Installment policy updated",
			data: result,
		});
	},
);

export const FeePolicyController = {
	listFeePolicies,
	createFeePolicy,
	updateFeePolicy,
	listInstallmentPolicies,
	createInstallmentPolicy,
	updateInstallmentPolicy,
};
