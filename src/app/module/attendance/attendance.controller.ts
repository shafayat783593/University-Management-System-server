import httpStatus from "http-status";

import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { AttendanceService } from "./attendance.service.js";
import { Role } from "../../../generated/prisma/enums.js";

const createSession = catchAsync(async (req:Request, res:Response) => {
	const result = await AttendanceService.createAttendanceSession(req.user?.userId as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Attendance session created",
		data: result,
	});
});

const markAttendance = catchAsync(async (req:Request, res:Response) => {
    const userId = 	req.user?.userId as string
		const sessionId =  req.params.sessionId as string
		const pyload = req.body.records
	const result = await AttendanceService.markAttendance(
	userId,
    sessionId,
    pyload
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Attendance marked",
		data: result,
	});
});

const getSectionAttendance = catchAsync(async (req:Request, res:Response) => {
    const 	userId	=req.user?.userId as string
	const sectionId = 	req.params.sectionId as string
		const role = req.user?.role  as Role
	const result = await AttendanceService.getSectionAttendance(
userId,
sectionId,
role
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Attendance retrieved",
		data: result,
	});
});

const getMyAttendance = catchAsync(async (req:Request, res:Response) => {
    const userId = req.user?.userId as string
	const result = await AttendanceService.getMyAttendance(userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Attendance retrieved",
		data: result,
	});
});

export const AttendanceController = {
	createSession,
	markAttendance,
	getSectionAttendance,
	getMyAttendance,
};