import { z } from "zod";

const registerStudentZodSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.string().email("Invalid email"),
	password: z.string().min(6, "Password must be at least 6 characters"),
});


const completeProfileZodSchema = z.object({
	departmentId: z.string().min(1, "departmentId is required"),
	studentIdCode: z.string().min(1, "studentIdCode is required"),
	phone: z.string().optional(),

	previousInstitute: z.string().min(2),
	group: z.enum(["SCIENCE", "COMMERCE", "ARTS", "BUSINESS_STUDIES"]),

	sscBoard: z.string().min(2),
	sscRoll: z.string().min(1),
	sscRegistration: z.string().min(1),
	sscGPA: z.number().min(0).max(5),
	sscPassingYear: z.number().int().min(1990).max(new Date().getFullYear()),

	hscBoard: z.string().min(2),
	hscRoll: z.string().min(1),
	hscRegistration: z.string().min(1),
	hscGPA: z.number().min(0).max(5),
	hscPassingYear: z.number().int().min(1990).max(new Date().getFullYear()),
});

export const AuthValidation = {
	registerStudentZodSchema,
	completeProfileZodSchema,
};