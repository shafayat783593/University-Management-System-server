import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PaymentService } from "./payment.service.js";
import { Request, Response } from "express";

const initBkashPayment = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user?.userId;
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

const cancelPayment = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user?.userId;
	const result = await PaymentService.cancelPayment(userId as string, req.params.installmentId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payment cancelled and refund initiated",
		data: result,
	});
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await PaymentService.getAllPayments(req.query);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payments retrieved",
		data: { data, meta },
	});
});

const getMyFees = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user?.userId;
	const result = await PaymentService.getMyFees(userId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Fees retrieved",
		data: result,
	});
});

const downloadReceipt = catchAsync(async (req: Request, res: Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	const { buffer, payment } = await PaymentService.downloadReceipt(
		req.user.userId,
		req.user.role,
		req.params.paymentId as string,
	);
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="receipt-${payment.trxId ?? payment.paymentId}.pdf"`,
	);
	res.send(buffer);
});

export const PaymentController = {
	initBkashPayment,
	bkashCallback,
	cancelPayment,
	getAllPayments,
	getMyFees,
	downloadReceipt,
};