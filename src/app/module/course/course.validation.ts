import { z } from "zod";
 
const createCourseZodSchema = z.object({
	code: z.string().min(2).max(20),
	title: z.string().min(2),
	creditHours: z.number().min(1).max(6),
	departmentId: z.string().min(1),
	prerequisiteCourseIds: z.array(z.string()).optional(),
});
 
const updateCourseZodSchema = z.object({
	title: z.string().min(2).optional(),
	creditHours: z.number().min(1).max(6).optional(),
	prerequisiteCourseIds: z.array(z.string()).optional(),
});
 
export const CourseValidation = {
	createCourseZodSchema,
	updateCourseZodSchema,
};
 