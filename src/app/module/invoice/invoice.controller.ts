import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { InvoiceService } from "./invoice.service.js";

const actor = (req: Request) => ({ userId: req.user!.userId, role: req.user!.role });
const ok = (res: Response, message: string, data: unknown, statusCode: number = httpStatus.OK) =>
	sendResponse(res, { success: true, statusCode, message, data });

const createApplicationInvoice = catchAsync(async (req, res) =>
	ok(res, "Application fee invoice ready", await InvoiceService.createApplicationInvoice(req.user!.userId), httpStatus.CREATED),
);

const generateMySemesterInvoice = catchAsync(async (req, res) =>
	ok(res, "Semester invoice generated", await InvoiceService.generateMySemesterInvoice(req.user!.userId, req.body.semesterId), httpStatus.CREATED),
);

const generateSemesterInvoices = catchAsync(async (req, res) =>
	ok(res, "Semester invoices generated", await InvoiceService.generateSemesterInvoices(req.user!.userId, req.body)),
);

const getMyInvoices = catchAsync(async (req, res) =>
	ok(res, "Invoices retrieved", await InvoiceService.getMyInvoices(req.user!.userId, req.query)),
);

const getMySummary = catchAsync(async (req, res) =>
	ok(res, "Fee summary retrieved", await InvoiceService.getMySummary(req.user!.userId)),
);

const getMyOverdue = catchAsync(async (req, res) =>
	ok(res, "Overdue installments retrieved", await InvoiceService.getMyOverdue(req.user!.userId)),
);

const getInvoiceById = catchAsync(async (req, res) =>
	ok(res, "Invoice retrieved", await InvoiceService.getInvoiceById((req.params.id as string), actor(req))),
);

const getAllInvoices = catchAsync(async (req, res) => {
	const { data, meta } = await InvoiceService.getAllInvoices(req.query);
	ok(res, "Invoices retrieved", { data, meta });
});

const addAdjustment = catchAsync(async (req, res) =>
	ok(res, "Adjustment applied", await InvoiceService.addAdjustment((req.params.id as string), actor(req), req.body)),
);

const cancelInvoice = catchAsync(async (req, res) =>
	ok(res, "Invoice cancelled", await InvoiceService.cancelInvoice((req.params.id as string), actor(req), req.body.reason)),
);

const getOutstandingDues = catchAsync(async (req, res) =>
	ok(res, "Outstanding dues retrieved", await InvoiceService.getOutstandingDues(req.query)),
);

const getOverdueReport = catchAsync(async (req, res) =>
	ok(res, "Overdue report retrieved", await InvoiceService.getOverdueReport(req.query)),
);

const applyLateFees = catchAsync(async (req, res) =>
	ok(res, "Late fees applied", await InvoiceService.applyLateFees(actor(req))),
);

export const InvoiceController = {
	createApplicationInvoice,
	generateMySemesterInvoice,
	generateSemesterInvoices,
	getMyInvoices,
	getMySummary,
	getMyOverdue,
	getInvoiceById,
	getAllInvoices,
	addAdjustment,
	cancelInvoice,
	getOutstandingDues,
	getOverdueReport,
	applyLateFees,
};