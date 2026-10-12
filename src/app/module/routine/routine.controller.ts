import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { Request, Response } from "express";
import { RoutineService } from "./routine.service.js";

const createRoutineEntry = catchAsync(async (req: Request, res: Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	const result = await RoutineService.createRoutineEntry(req.user.userId, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Routine entry created",
		data: result,
	});
});

const getSectionRoutine = catchAsync(async (req: Request, res: Response) => {
	const result = await RoutineService.getSectionRoutine(req.params.sectionId as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Section routine retrieved",
		data: result,
	});
});

const getMyRoutineAsStudent = catchAsync(async (req: Request, res: Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	const result = await RoutineService.getMyRoutineAsStudent(req.user.userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Routine retrieved",
		data: result,
	});
});

const getMyRoutineAsInstructor = catchAsync(async (req: Request, res: Response) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	const result = await RoutineService.getMyRoutineAsInstructor(req.user.userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Routine retrieved",
		data: result,
	});
});

const deleteRoutineEntry = catchAsync(async (req, res) => {
	// @ts-expect-error req.user is attached by the auth() middleware
	await RoutineService.deleteRoutineEntry(req.user.userId, req.params.id);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Routine entry deleted",
		data: null,
	});
});

export const RoutineController = {
	createRoutineEntry,
	getSectionRoutine,
	getMyRoutineAsStudent,
	getMyRoutineAsInstructor,
	deleteRoutineEntry,
};