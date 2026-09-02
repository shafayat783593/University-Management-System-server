import { Request, Response } from "express";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { CourseService } from "./course.service.js";


const createCourse = catchAsync(async (req:Request, res:Response) => {
	const result = await CourseService.createCourse(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Course created",
		data: result,
	});
});

const getAllCourses = catchAsync(async (req:Request, res:Response) => {
	const departmentId = req.query.departmentId as string | undefined;
	const result = await CourseService.getAllCourses(departmentId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Courses retrieved",
		data: result,
	});
});

const getCourseById = catchAsync(async (req: Request, res: Response) => {
        const id = req.params.id

	const result = await CourseService.getCourseById(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Course retrieved",
		data: result,
	});
});

const updateCourse = catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id
	const result = await CourseService.updateCourse(id as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Course updated",
		data: result,
	});
});

const deleteCourse = catchAsync(async (req: Request, res: Response) => {
        const id = req.params.id

	await CourseService.deleteCourse(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Course deleted",
		data: null,
	});
});

export const CourseController = {
	createCourse,
	getAllCourses,
	getCourseById,
	updateCourse,
	deleteCourse,
};