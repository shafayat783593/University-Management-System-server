import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { PaymentService } from "./payment.service.js";

const actor = (req: Request) => ({ userId: req.user!.userId, role: req.user!.role });

const initPayment = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.initPayment(req.user?.userId as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "bKash payment initiated",
		data: result,
	});
});

// bKash redirects the student's browser here — no auth()
const bkashCallback = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.bkashCallback(
		req.query.paymentID as string,
		req.query.status as string,
	);
	sendResponse(res, {
		success: result.success,
		statusCode: httpStatus.OK,
		message: result.message,
		data: result,
	});
});

const verifyTransaction = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.verifyTransaction((req.params.id as string), actor(req));
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payment status checked",
		data: result,
	});
});

const refundTransaction = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.refundTransaction(actor(req), (req.params.id as string), req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Refund processed",
		data: result,
	});
});

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.getMyPayments(req.user?.userId as string, req.query);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payment history retrieved",
		data: result,
	});
});

const getTransactionById = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.getTransactionById((req.params.id as string), actor(req));
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Transaction retrieved",
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

const downloadReceipt = catchAsync(async (req: Request, res: Response) => {
	const { buffer, receiptNumber } = await PaymentService.getReceiptPdf((req.params.id as string), actor(req));
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", `attachment; filename="receipt-${receiptNumber}.pdf"`);
	res.send(buffer);
});

const getCollectionReport = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.getCollectionReport(req.query);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Collection report generated",
		data: result,
	});
});

export const PaymentController = {
	initPayment,
	bkashCallback,
	verifyTransaction,
	refundTransaction,
	getMyPayments,
	getTransactionById,
	getAllPayments,
	downloadReceipt,
	getCollectionReport,
};