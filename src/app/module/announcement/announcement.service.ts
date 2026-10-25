import httpStatus from "http-status";
import type { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { cloudinary } from "../../lib/cloudinary.js";
import type {
	IAnnouncementFilters,
	ICreateAnnouncementPayload,
	IUpdateAnnouncementPayload,
} from "./announcement.interface.js";

const uploadToCloudinary = (
	file: Express.Multer.File,
): Promise<UploadApiResponse> => {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{ resource_type: "image", folder: "announcements" },
			(error, result) => {
				if (error) return reject(new Error(error.message));
				if (!result)
					return reject(new Error("No result returned from Cloudinary"));
				resolve(result);
			},
		);
		uploadStream.end(file.buffer);
	});
};

const createAnnouncement = async (
	authorId: string,
	payload: ICreateAnnouncementPayload,
	file?: Express.Multer.File,
) => {
	let imageUrl: string | undefined;
	let imagePublicId: string | undefined;

	if (file) {
		const result = await uploadToCloudinary(file);
		imageUrl = result.secure_url;
		imagePublicId = result.public_id;
	} else if (payload.imageUrl) {
		imageUrl = payload.imageUrl;
		imagePublicId = payload.imagePublicId;
	}

	return prisma.announcement.create({
		data: {
			title: payload.title,
			body: payload.body,
			authorId,
			isPublished: payload.isPublished ?? true,
			category: payload.category ?? "News",
			imageUrl,
			imagePublicId,
		},
	});
};

const buildWhere = (filters: IAnnouncementFilters) => {
	const where: Record<string, unknown> = {};
	if (filters.category && filters.category !== "All News") {
		where.category = filters.category;
	}
	return where;
};

const getPublishedAnnouncements = async (filters: IAnnouncementFilters) => {
	const limit = filters.limit ?? 10;
	const page = filters.page ?? 1;
	const skip = (page - 1) * limit;

	const where = { isPublished: true, ...buildWhere(filters) };

	const [data, total] = await Promise.all([
		prisma.announcement.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: limit,
			skip,
		}),
		prisma.announcement.count({ where }),
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

	const where = buildWhere(filters);

	const [data, total] = await Promise.all([
		prisma.announcement.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: limit,
			skip,
		}),
		prisma.announcement.count({ where }),
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
	file?: Express.Multer.File,
) => {
	await getAnnouncementById(id);

	let imageUrl: string | undefined;
	let imagePublicId: string | undefined;
	let removeImage = false;

	if (file) {
		const result = await uploadToCloudinary(file);
		imageUrl = result.secure_url;
		imagePublicId = result.public_id;
	} else if (payload.imageUrl === "__remove__") {
		removeImage = true;
	}

	const data: Record<string, unknown> = { ...payload };
	delete (data as any).imageUrl;
	delete (data as any).imagePublicId;

	if (payload.category !== undefined) data.category = payload.category;
	if (payload.isPublished !== undefined) data.isPublished = payload.isPublished;
	if (payload.title !== undefined) data.title = payload.title;
	if (payload.body !== undefined) data.body = payload.body;

	if (file || payload.imageUrl !== undefined) {
		data.imageUrl = imageUrl ?? payload.imageUrl;
		data.imagePublicId = imagePublicId ?? payload.imagePublicId;
	}
	if (removeImage) {
		data.imageUrl = null;
		data.imagePublicId = null;
	}

	return prisma.announcement.update({ where: { id }, data });
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