import { z } from "zod";

const createAnnouncementZodSchema = z.object({
	title: z.string().min(3, "Title must be at least 3 characters"),
	body: z.string().min(10, "Body must be at least 10 characters"),
	isPublished: z
		.union([z.boolean(), z.string()])
		.optional()
		.transform((v) => (v === undefined ? true : v === "true" || v === true)),
	category: z.string().min(1).optional(),
	imageUrl: z.string().optional(),
	imagePublicId: z.string().optional(),
});

const updateAnnouncementZodSchema = z.object({
	title: z.string().min(3).optional(),
	body: z.string().min(10).optional(),
	isPublished: z
		.union([z.boolean(), z.string()])
		.optional()
		.transform((v) =>
			v === undefined ? undefined : v === "true" || v === true,
		),
	category: z.string().min(1).optional(),
	imageUrl: z.string().optional(),
	imagePublicId: z.string().optional(),
});

export const AnnouncementValidation = {
	createAnnouncementZodSchema,
	updateAnnouncementZodSchema,
};