import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import crypto from "crypto";
import path from "path";
import ejs from "ejs";
import type { SignOptions, JwtPayload } from "jsonwebtoken";
import { jwtUtils } from "../../utils/jwt.js";
import config from "../../config/index.js";


import type {
	ICompleteProfilePayload,
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterStudentPayload,
	IRequestUser,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { redisClient } from "../../lib/redis.js";
import { transporter } from "../../lib/nodmailer.js";
import { AuthProvider, Role, UserStatus } from "../../../generated/prisma/enums.js";
import type { UserModel } from "../../../generated/prisma/models/User.js";
import { googleClient } from "../../lib/googleAuth.js";

const OTP_TTL_SECONDS = 5 * 60;


const registerStudent = async (payload: IRegisterStudentPayload) => {
	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({ where: { email } });
	if (existingUser) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	const existingStudentId = await prisma.studentProfile.findUnique({
		where: { studentIdCode: payload.studentIdCode },
	});
	if (existingStudentId) {
		throw new AppError(httpStatus.CONFLICT, "Student ID already in use");
	}

	const hashedPassword = await bcrypt.hash(
		payload.password,
		Number(config.bcrypt_salt_rounds),
	);

	const otp = crypto.randomInt(100000, 1000000).toString();
	const otpKey = `student-registration-otp:${email}`;
	const dataKey = `student-registration-data:${email}`;

	await redisClient.set(otpKey, otp, {
		expiration: { type: "EX", value: OTP_TTL_SECONDS },
	});
	await redisClient.set(
		dataKey,
		JSON.stringify({
			name: payload.name,
			email,
			password: hashedPassword,
			departmentId: payload.departmentId,
			studentIdCode: payload.studentIdCode,
			phone: payload.phone,
		}),
		{ expiration: { type: "EX", value: OTP_TTL_SECONDS } },
	);

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/registration-otp.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: payload.name,
		otp,
		expirationMinutes: OTP_TTL_SECONDS / 60,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Verify your email",
		html,
	});
};

const verifyStudentEmail = async (payload: IVerifyEmailPayload) => {
	const email = payload.email.trim().toLowerCase();

	const otpKey = `student-registration-otp:${email}`;
	const dataKey = `student-registration-data:${email}`;

	const storedOtp = await redisClient.get(otpKey);
	if (!storedOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP expired or not found");
	}
	if (storedOtp !== payload.otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
	}

	const storedData = await redisClient.get(dataKey);
	if (!storedData) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Registration data expired, please register again",
		);
	}
	const parsed = JSON.parse(storedData);

	const createdUser = await prisma.user.create({
		data: {
			name: parsed.name,
			email: parsed.email,
			password: parsed.password,
			role: Role.STUDENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			studentProfile: {
				create: {
					studentIdCode: parsed.studentIdCode,
					departmentId: parsed.departmentId,
					phone: parsed.phone || null,
				},
			},
		},
		omit: { password: true },
		include: { studentProfile: true },
	});

	await redisClient.del([otpKey, dataKey]);
	const jwtPayload = {
		userId: createdUser.id,
		name: createdUser.name,
		email: createdUser.email,
		role: createdUser.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		refreshToken,
		accessToken
	}
};

const loginUser = async (payload: ILoginUserPayload) => {
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
		if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}

	if (!user.password) {
		throw new AppError(
			httpStatus.CONFLICT,
			user.authProvider === "GOOGLE"
				? "This account uses Google sign-in. Please log in with Google."
				: "No password set yet — your application may still be pending review.",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		payload.password,
		user.password,
	);
	if (!isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return { accessToken, refreshToken, needPasswordChange:user.needPasswordChange };
};

const getMe = async (user: IRequestUser) => {
	const found = await prisma.user.findUnique({
		where: { id: user.userId },
		include: { studentProfile: true, instructorProfile: true },
		omit: { password: true },
	});
	if (!found) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	return found;
};

const refreshToken = async (token: string) => {
	const verified = jwtUtils.verifyToken(token, config.jwt_refresh_secret);
	if (!verified.success || !verified.data) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
	}
	const data = verified.data as JwtPayload;

	const user = await prisma.user.findUnique({ where: { id: data.userId } });
	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
		if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}


	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);
	return { accessToken, refreshToken };
};


const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleTokenPayload: {
		email?: string;
		name?: string;
		sub?: string;
	} | null | undefined;

	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		googleTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID token verification failed:", error);
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid or expired Google ID token",
		);
	}

	if (!googleTokenPayload) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid or expired Google ID token",
		);
	}

	const googleEmail = googleTokenPayload.email;
	const googleName = googleTokenPayload.name;
	if (!googleEmail) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google email not found");
	}
	if (!googleName) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google name not found");
	}

	const email = googleEmail.trim().toLowerCase();
	const existing = await prisma.user.findUnique({ where: { email } });

	// Google login is only allowed for student accounts.
	let user: UserModel;

	if (existing) {
		if (existing.role !== Role.STUDENT) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"This email is registered as a non-student account",
			);
		}

		if (existing.authProvider === AuthProvider.GOOGLE) {
			// Already a Google student — normal returning login.
			user = existing;
		} else {
			// Student registered with credentials; link this Google account.
			if (!existing.emailVerified) {
				throw new AppError(httpStatus.FORBIDDEN, "Email not verified");
			}
			if (existing.status === UserStatus.BLOCKED) {
				throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
			}
			if (existing.isDeleted || existing.status === UserStatus.DELETED) {
				throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
			}
			user = await prisma.user.update({
				where: { id: existing.id },
				data: {
					googleId: googleTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
				},
			});
		}

		if (user.status === UserStatus.BLOCKED) {
			throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
		}
		if (user.isDeleted || user.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
		}
	} else {
	
		user = await prisma.user.create({
			data: {
				name: googleName,
				email,
				role: Role.STUDENT,
				authProvider: AuthProvider.GOOGLE,
				googleId: googleTokenPayload.sub,
				emailVerified: true,
			},
		});
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);
	return { accessToken, refreshToken };
};

const completeProfile = async (
	user: IRequestUser,
	payload: ICompleteProfilePayload,
) => {
	const existingProfile = await prisma.studentProfile.findUnique({
		where: { userId: user.userId },
	});
	if (existingProfile) {
		throw new AppError(httpStatus.CONFLICT, "Profile already completed");
	}

	const existingStudentId = await prisma.studentProfile.findUnique({
		where: { studentIdCode: payload.studentIdCode },
	});
	if (existingStudentId) {
		throw new AppError(httpStatus.CONFLICT, "Student ID already in use");
	}

	return prisma.studentProfile.create({
		data: {
			userId: user.userId,
			departmentId: payload.departmentId,
			studentIdCode: payload.studentIdCode,
			phone: payload.phone || null,
		},
	});
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const email = payload.email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}	if (!user.password) {
		throw new AppError(httpStatus.CONFLICT, "This account uses Google sign-in");
	}

	const otp = crypto.randomInt(100000, 1000000).toString();
	const key = `forgot-password-otp:${email}`;
	await redisClient.set(key, otp, {
		expiration: { type: "EX", value: OTP_TTL_SECONDS },
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/forgot-password.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: user.name,
		otp,
		expirationMinutes: OTP_TTL_SECONDS / 60,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Reset your password",
		html,
	});
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const email = payload.email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
	const key = `forgot-password-otp:${email}`;
	const storedOtp = await redisClient.get(key);
	if (!storedOtp || storedOtp !== payload.otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	const hashedPassword = await bcrypt.hash(
		payload.newPassword,
		Number(config.bcrypt_salt_rounds),
	);
	await prisma.user.update({
		where: { email },
		data: { password: hashedPassword },
	});
	await redisClient.del([key]);
};

const changePassword = async (
	user: IRequestUser,
	payload: IChangePasswordPayload,
) => {
	const found = await prisma.user.findUnique({ where: { id: user.userId } });
	if (!found) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	if (!found.password) {
		throw new AppError(httpStatus.CONFLICT, "This account uses Google sign-in");
	}

	const isOldPasswordMatched = await bcrypt.compare(
		payload.oldPassword,
		found.password,
	);
	if (!isOldPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Old password is incorrect");
	}

	const hashedNewPassword = await bcrypt.hash(
		payload.newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: { id: user.userId },
		data: { password: hashedNewPassword, needPasswordChange: false },
	});
};

export const AuthService = {
	registerStudent,
	verifyStudentEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	completeProfile,
	forgotPassword,
	resetPassword,
	changePassword,
};