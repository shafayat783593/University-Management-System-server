
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { AuthService } from "./auth.service.js";
import { sendResponse } from "../../utils/sendResponse.js";
import httpStatus from "http-status"
const register = catchAsync(async (req:Request, res:Response) => {
	await AuthService.registerStudent(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "OTP sent to email, verify to complete registration",
		data: null,
	});
});

const verifyEmail = catchAsync(async (req:Request, res:Response) => {
	const result = await AuthService.verifyStudentEmail(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Registration complete",
		data: result,
	});
});

const login = catchAsync(async (req:Request, res:Response) => {
	const result = await AuthService.loginUser(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: result,
	});
});

const googleLogin = catchAsync(async (req:Request, res:Response) => {
	const result = await AuthService.googleLogin(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: result,
	});
});

const completeProfile = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!
	const result = await AuthService.completeProfile(user, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Profile completed",
		data: result,
	});
});

const getMe = catchAsync(async (req: Request, res: Response) => {
        const user = req.user!

	const result = await AuthService.getMe(user);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Profile retrieved",
		data: result,
	});
});

const refreshToken = catchAsync(async (req:Request, res:Response) => {
	const token = req.body.refreshToken ?? req.cookies?.refreshToken;
	const result = await AuthService.refreshToken(token);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Token refreshed",
		data: result,
	});
});

const forgotPassword = catchAsync(async (req:Request, res:Response) => {
	await AuthService.forgotPassword(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "OTP sent to email",
		data: null,
	});
});

const resetPassword = catchAsync(async (req:Request, res:Response) => {
	await AuthService.resetPassword(req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Password reset successful",
		data: null,
	});
});

export const AuthController = {
	register,
	verifyEmail,
	login,
	googleLogin,
	completeProfile,
	getMe,
	refreshToken,
	forgotPassword,
	resetPassword,
};