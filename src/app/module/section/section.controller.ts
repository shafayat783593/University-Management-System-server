import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { SectionService } from "./section.service.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { Request, Response } from "express";


const createSection = catchAsync(async (req:Request, res:Response) => {
	const result = await SectionService.createSection(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Section created",
		data: result,
	});
});

const getAllSections = catchAsync(async (req:Request, res:Response) => {
	const result = await SectionService.getAllSections({
		semesterId: req.query.semesterId as string | undefined,
		courseId: req.query.courseId as string | undefined,
	});
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Sections retrieved",
		data: result,
	});
});

const getSectionById = catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id;
	const result = await SectionService.getSectionById(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Section retrieved",
		data: result,
	});
});

const updateSection = catchAsync(async (req:Request, res:Response) => {
    const id = req.params.id;
	const result = await SectionService.updateSection(id as string, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Section updated",
		data: result,
	});
});

const deleteSection = catchAsync(async (req:Request, res:Response) => {
    const id  =req.params.id
	await SectionService.deleteSection(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Section deleted",
		data: null,
	});
});

export const SectionController = {
	createSection,
	getAllSections,
	getSectionById,
	updateSection,
	deleteSection,
};