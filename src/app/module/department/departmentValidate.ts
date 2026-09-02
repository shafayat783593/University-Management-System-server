import { z } from "zod";

const createDepartmentZodSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	code: z.string().min(2).max(10),
});

const updateDepartmentZodSchema = z.object({
	name: z.string().min(2).optional(),
	code: z.string().min(2).max(10).optional(),
});

export const DepartmentValidation = {
	createDepartmentZodSchema,
	updateDepartmentZodSchema,
};