import type { Response } from "express";

type TMeta = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
	// Extra totals some reports attach (e.g. /invoices/reports/outstanding).
	totalOutstanding?: number;
};

type TResponseData<T> = {
	success: boolean;
	statusCode: number;
	message: string;
	data: T;
	meta?: TMeta;
};

export const sendResponse = <T>(res: Response, data: TResponseData<T>) => {
	res.status(data.statusCode).json({
		success: data.success,
		statusCode: data.statusCode,
		message: data.message,
		data: data.data,
		meta: data.meta,
	});
};
