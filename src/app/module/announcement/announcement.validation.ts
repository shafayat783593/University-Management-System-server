
import { z } from "zod";

const createAnnouncementZodSchema = z.object({
	title: z.string().min(3, "Title must be at least 3 characters"),
	body: z.string().min(10, "Body must be at least 10 characters"),
	isPublished: z.boolean().optional(),
});

const updateAnnouncementZodSchema = z.object({
	title: z.string().min(3).optional(),
	body: z.string().min(10).optional(),
	isPublished: z.boolean().optional(),
});

export const AnnouncementValidation = {
	createAnnouncementZodSchema,
	updateAnnouncementZodSchema,
};