import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { AuthService } from "./auth.service.js";
import { sendResponse } from "../../utils/sendResponse.js";
import httpStatus from "http-status";

const register = catchAsync(async (req: Request, res: Response) => {
	await AuthService.registerStudent(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "OTP sent to email, verify to complete registration",
		data: null,
	});
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.verifyStudentEmail(req.body);
	const { accessToken, refreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Registration complete",
		data: result,
	});
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const result = await AuthService.loginUser(payload);
	const { accessToken, refreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Login successful",
		data: {
			accessToken,
			refreshToken,
		},
	});
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.googleLogin(req.body);
	const { accessToken, refreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: {
			accessToken,
			refreshToken,
		},
	});
});

const completeProfile = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AuthService.completeProfile(user, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Profile completed",
		data: result,
	});
});

const getMe = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AuthService.getMe(user);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Profile retrieved",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const token = req.body.refreshToken ?? req.cookies?.refreshToken;
	const result = await AuthService.refreshToken(token);
	const { accessToken, refreshToken: newRefreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", newRefreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Token refreshed",
		data: result,
	});
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.forgotPassword(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "OTP sent to email",
		data: null,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.resetPassword(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Password reset successful",
		data: null,
	});
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	await AuthService.changePassword(user, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Password changed successfully",
		data: null,
	});
});

export const AuthController = {
	register,
	verifyEmail,
	login: loginUser,
	googleLogin,
	completeProfile,
	getMe,
	refreshToken,
	forgotPassword,
	resetPassword,
	changePassword,
};