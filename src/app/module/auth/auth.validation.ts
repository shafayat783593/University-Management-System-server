import { z } from "zod";

const bdPhone = z
	.string()
	.regex(/^01[3-9]\d{8}$/, "Invalid Bangladeshi phone number (e.g. 017XXXXXXXX)");

// §3: register takes department (+optional phone). studentIdCode must NOT be
// sent — the server issues a placeholder and the real Student ID is generated
// at admission confirmation.
const registerStudentZodSchema = z
	.object({
		name: z.string().min(2, "Name must be at least 2 characters"),
		email: z.string().email("Invalid email"),
		password: z.string().min(6, "Password must be at least 6 characters"),
		departmentId: z.string().min(1, "departmentId is required"),
		phone: bdPhone.optional(),
	})
	.strict();


const completeProfileZodSchema = z
	.object({
		departmentId: z.string().min(1, "departmentId is required"),
		phone: bdPhone.optional(),
	})
	.strict();

const loginZodSchema = z.object({
	email: z.string().email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});

const verifyEmailZodSchema = z.object({
	email: z.string().email("Invalid email"),
	otp: z.string().min(1, "OTP is required"),
});

const googleLoginZodSchema = z.object({
	idToken: z.string().min(1, "idToken is required"),
});

// §3: PATCH /auth/student-profile — all fields optional.
const updateStudentProfileZodSchema = z.object({
	phone: bdPhone.optional(),
	address: z.string().max(255).optional(),
	dateOfBirth: z.string().optional(),
	guardianName: z.string().max(100).optional(),
	guardianPhone: bdPhone.optional(),
	bloodGroup: z.string().optional(),
});

export const AuthValidation = {
	registerStudentZodSchema,
	completeProfileZodSchema,
	loginZodSchema,
	verifyEmailZodSchema,
	googleLoginZodSchema,
	updateStudentProfileZodSchema,
};