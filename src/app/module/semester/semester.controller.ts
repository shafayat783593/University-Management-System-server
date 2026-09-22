

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
    const quary = req.query
	const {data,meta} = await SemesterService.getAllSemesters(quary);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Semesters retrieved",
		data: data,
        meta:meta
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



const updateSemesterDates = catchAsync(async (req, res) => {
	const result = await SemesterService.updateSemesterDates(req.params.id as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Semester dates updated",
		data: result,
	});
});
 
const getSemesterCalendar = catchAsync(async (req, res) => {
	const result = await SemesterService.getSemesterCalendar(req.params.id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Semester calendar retrieved",
		data: result,
	});
});

export const SemesterController = {
	createSemester,
	getAllSemesters,
	getSemesterById,
	updateSemesterStatus,
	updateSemesterDates,
	getSemesterCalendar
};