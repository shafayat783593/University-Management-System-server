import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import crypto from "crypto";
import path from "path";
import ejs from "ejs";
import type { SignOptions, JwtPayload } from "jsonwebtoken";
import { jwtUtils } from "../../utils/jwt.js";
import config from "../../config/index.js";


import type {
	IChangePasswordPayload,
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
import { googleClient } from "../../lib/googleAuth.js";

const OTP_TTL_SECONDS = 5 * 60;

const issueTokenPair = (user: {
	id: string;
	name: string;
	email: string;
	role: Role;
}) => {
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

const assertUserIsUsable = (user: {
	status: UserStatus;
	isDeleted: boolean;
}) => {
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
};

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

	return issueTokenPair(createdUser);
};

const loginUser = async (payload: ILoginUserPayload) => {
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	assertUserIsUsable(user);

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

	return { ...issueTokenPair(user), needPasswordChange: user.needPasswordChange };
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
	assertUserIsUsable(user);

	return issueTokenPair(user);
};

/**
 * Fixed version of the Healthcare-server googleLogin bug:
 * - single lookup by `email`, the only field that's actually unique in the
 *   schema (no compound findUnique on {email, role, googleId})
 * - no unconditional throw after create/update
 * - no `gooleId` / `googlProvider` field-name typos
 *
 * Design note: Google gives us no department, so a brand-new Google
 * signup creates the User only. Downstream code must check
 * `user.studentProfile === null` and block enrollment until the student
 * calls POST /auth/complete-profile.
 */
const googleLogin = async (payload: IGoogleLoginPayload) => {
	let tokenPayload;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		tokenPayload = ticket.getPayload();
	} catch {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid or expired Google ID token",
		);
	}

	if (!tokenPayload?.email) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google account has no email");
	}

	const email = tokenPayload.email.trim().toLowerCase();
	let user = await prisma.user.findUnique({ where: { email } });

	if (!user) {
		user = await prisma.user.create({
			data: {
				name: tokenPayload.name ?? email,
				email,
				role: Role.STUDENT,
				authProvider: AuthProvider.GOOGLE,
				googleId: tokenPayload.sub,
				emailVerified: true,
			},
		});
	} else {
		assertUserIsUsable(user);
		if (!user.googleId) {
			user = await prisma.user.update({
				where: { id: user.id },
				data: { googleId: tokenPayload.sub },
			});
		}
	}

	return issueTokenPair(user);
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
	assertUserIsUsable(user);
	if (!user.password) {
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
	assertUserIsUsable(user);

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