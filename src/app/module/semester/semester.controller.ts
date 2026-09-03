

import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { SemesterService } from "./semester.service.js";
import { Request, Response } from "express";
import { sendResponse } from "../../utils/sendResponse.js";


const createSemester = catchAsync(async (req: Request, res: Response) => {
	const result = await SemesterService.createSemester(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Semester created",
		data: result,
	});
});

const getAllSemesters = catchAsync(async (req:Request, res:Response) => {
	const result = await SemesterService.getAllSemesters();
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Semesters retrieved",
		data: result,
	});
});

const getSemesterById = catchAsync(async (req:Request, res:Response) => {
    const id = req.params.id
	const result = await SemesterService.getSemesterById(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Semester retrieved",
		data: result,
	});
});

const updateSemesterStatus = catchAsync(async (req:Request, res:Response) => {
        const id = req.params.id

	const result = await SemesterService.updateSemesterStatus(
	id as string,
		req.body,
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Semester status updated",
		data: result,
	});
});

export const SemesterController = {
	createSemester,
	getAllSemesters,
	getSemesterById,
	updateSemesterStatus,
};