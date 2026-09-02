import httpStatus from "http-status";

import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { DepartmentService } from "./dpartment.service.js";
import { sendResponse } from "../../utils/sendResponse.js";

const createDepartment = catchAsync(async (req:Request, res:Response) => {
	const result = await DepartmentService.createDepartment(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Department created",
		data: result,
	});
});

const getAllDepartments = catchAsync(async (req:Request, res:Response) => {
	const result = await DepartmentService.getAllDepartments();
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Departments retrieved",
		data: result,
	});
});

const getDepartmentById = catchAsync(async (req: Request, res: Response) => {
      const id = req.params.id
	const result = await DepartmentService.getDepartmentById(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Department retrieved",
		data: result,
	});
});

const updateDepartment = catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id
    const data = 	req.body
	const result = await DepartmentService.updateDepartment(
        id as string,
        data
	
	);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Department updated",
		data: result,
	});
});

const deleteDepartment = catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id
	await DepartmentService.deleteDepartment(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Department deleted",
		data: null,
	});
});

export const DepartmentController = {
	createDepartment,
	getAllDepartments,
	getDepartmentById,
	updateDepartment,
	deleteDepartment,
};