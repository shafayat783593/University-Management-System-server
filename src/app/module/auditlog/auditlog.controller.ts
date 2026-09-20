import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { AuditLogService } from "./auditlog.service.js";

const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AuditLogService.getAuditLogs({
		actorId: req.query.actorId as string | undefined,
		targetType: req.query.targetType as string | undefined,
		action: req.query.action as string | undefined,
		from: req.query.from as string | undefined,
		to: req.query.to as string | undefined,
		page: req.query.page ? Number(req.query.page) : undefined,
		limit: req.query.limit ? Number(req.query.limit) : undefined,
	});
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Audit logs retrieved",
		data: { data, meta },
	});
});

export const AuditLogController = {
	getAuditLogs,
};