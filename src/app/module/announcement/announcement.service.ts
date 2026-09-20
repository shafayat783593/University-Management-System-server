
import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	IAnnouncementFilters,
	ICreateAnnouncementPayload,
	IUpdateAnnouncementPayload,
} from "./announcement.interface.js";

const createAnnouncement = async (
	authorId: string,
	payload: ICreateAnnouncementPayload,
) => {
	return prisma.announcement.create({
		data: {
			title: payload.title,
			body: payload.body,
			authorId,
			isPublished: payload.isPublished ?? true,
		},
	});
};

// Public — anonymous visitors on the homepage only ever see published
// announcements. Admin reviewing drafts uses getAllAnnouncementsForAdmin.
const getPublishedAnnouncements = async (filters: IAnnouncementFilters) => {
	const limit = filters.limit ?? 10;
	const page = filters.page ?? 1;
	const skip = (page - 1) * limit;

	const [data, total] = await Promise.all([
		prisma.announcement.findMany({
			where: { isPublished: true },
			orderBy: { createdAt: "desc" },
			take: limit,
			skip,
		}),
		prisma.announcement.count({ where: { isPublished: true } }),
	]);

	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getAllAnnouncementsForAdmin = async (filters: IAnnouncementFilters) => {
	const limit = filters.limit ?? 10;
	const page = filters.page ?? 1;
	const skip = (page - 1) * limit;

	const [data, total] = await Promise.all([
		prisma.announcement.findMany({
			orderBy: { createdAt: "desc" },
			take: limit,
			skip,
		}),
		prisma.announcement.count(),
	]);

	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getAnnouncementById = async (id: string) => {
	const announcement = await prisma.announcement.findUnique({ where: { id } });
	if (!announcement) {
		throw new AppError(httpStatus.NOT_FOUND, "Announcement not found");
	}
	return announcement;
};

const updateAnnouncement = async (
	id: string,
	payload: IUpdateAnnouncementPayload,
) => {
	await getAnnouncementById(id);
	return prisma.announcement.update({ where: { id }, data: payload });
};

const deleteAnnouncement = async (id: string) => {
	await getAnnouncementById(id);
	return prisma.announcement.delete({ where: { id } });
};

export const AnnouncementService = {
	createAnnouncement,
	getPublishedAnnouncements,
	getAllAnnouncementsForAdmin,
	getAnnouncementById,
	updateAnnouncement,
	deleteAnnouncement,
};