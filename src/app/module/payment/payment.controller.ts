import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PaymentService } from "./payment.service.js";
import { Request, Response } from "express";


const initBkashPayment = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user?.userId
    const payload = req.body;
	const result = await PaymentService.initBkashPayment(userId as string, payload);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "bKash payment initiated",
		data: result,
	});
});

const bkashCallback = catchAsync(async (req: Request, res: Response) => {
	const paymentID = req.query.paymentID as string;
	const status = req.query.status as string;
	const result = await PaymentService.bkashCallback(paymentID, status);
	sendResponse(res, {
		success: result.success,
		statusCode: httpStatus.OK,
		message: result.message,
		data: result,
	});
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.getAllPayments();
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payments retrieved",
		data: result,
	});
});

const getMyFees = catchAsync(async (req: Request, res: Response) => {
       const userId = req.user?.userId
    
	const result = await PaymentService.getMyFees(userId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Fees retrieved",
		data: result,
	});
});

export const PaymentController = {
	initBkashPayment,
	bkashCallback,
	getAllPayments,
	getMyFees,
};