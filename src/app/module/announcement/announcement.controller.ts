

import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { AnnouncementService } from "./announcement.service.js";



const createAnnouncement = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AnnouncementService.createAnnouncement(user.userId, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Announcement created",
		data: result,
	});
});

const getPublishedAnnouncements = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AnnouncementService.getPublishedAnnouncements({
		page: req.query.page ? Number(req.query.page) : undefined,
		limit: req.query.limit ? Number(req.query.limit) : undefined,
	});
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Announcements retrieved",
		data: { data, meta },
	});
});

const getAllAnnouncementsForAdmin = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AnnouncementService.getAllAnnouncementsForAdmin({
		page: req.query.page ? Number(req.query.page) : undefined,
		limit: req.query.limit ? Number(req.query.limit) : undefined,
	});
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Announcements retrieved",
		data: { data, meta },
	});
});

const getAnnouncementById = catchAsync(async (req: Request, res: Response) => {

    const id = req.params.id
	const result = await AnnouncementService.getAnnouncementById(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Announcement retrieved",
		data: result,
	});
});

const updateAnnouncement = catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id
    const payload = req.body
	const result = await AnnouncementService.updateAnnouncement(id as string, payload);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Announcement updated",
		data: result,
	});
});

const deleteAnnouncement = catchAsync(async (req: Request, res: Response) => {
        const id = req.params.id

	await AnnouncementService.deleteAnnouncement(id as string);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Announcement deleted",
		data: null,
	});
});

export const AnnouncementController = {
	createAnnouncement,
	getPublishedAnnouncements,
	getAllAnnouncementsForAdmin,
	getAnnouncementById,
	updateAnnouncement,
	deleteAnnouncement,
};