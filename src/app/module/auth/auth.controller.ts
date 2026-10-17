import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { AuthService } from "./auth.service.js";
import { sendResponse } from "../../utils/sendResponse.js";
import httpStatus from "http-status";
import config from "../../config/index.js";

const ACCESS_TOKEN_MAX_AGE = 1000 * 60 * 60 * 24; // 1 day
const REFRESH_TOKEN_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

const setAuthCookies = (
	res: Response,
	tokens: { accessToken: string; refreshToken: string },
) => {
	// Frontend and backend are different domains (two separate Vercel
	// deployments), so this is a cross-site cookie. Cross-site cookies
	// are only accepted by browsers when Secure is true AND
	// SameSite=None — `secure: false` here would make Chrome/Firefox
	// silently drop the Set-Cookie header in production, which is
	// exactly the "token not saving" symptom this would otherwise cause.
	// Locally (http://localhost), SameSite=Lax + no Secure is what
	// actually works, so this branches on environment rather than
	// hardcoding one or the other.
	const isProduction = config.node_env === "production";

	res.cookie("accessToken", tokens.accessToken, {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "none" : "lax",
		maxAge: ACCESS_TOKEN_MAX_AGE,
	});
	res.cookie("refreshToken", tokens.refreshToken, {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "none" : "lax",
		maxAge: REFRESH_TOKEN_MAX_AGE,
	});
};

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
	setAuthCookies(res, result);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Registration complete",
		data: result,
	});
});

const login = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.loginUser(req.body);
	setAuthCookies(res, result);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: result,
	});
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.googleLogin(req.body);
	setAuthCookies(res, result);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Login successful",
		data: result,
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
	const token = req.cookies?.refreshToken ?? req.body.refreshToken;
	const result = await AuthService.refreshToken(token);
	setAuthCookies(res, result);
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

const updateProfileImage = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const file = req.file as Express.Multer.File | undefined;
	const result = await AuthService.updateProfileImage(user.userId, file);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Profile image updated",
		data: result,
	});
});

const updateStudentProfile = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AuthService.updateStudentProfile(user.userId, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Profile updated",
		data: result,
	});
});

const downloadIdCard = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const { buffer, student } = await AuthService.generateIdCard(user.userId);
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader(
		"Content-Disposition",
		`inline; filename="id-card-${student.studentIdCode ?? "card"}.pdf"`,
	);
	res.send(buffer);
});



const logout = catchAsync(async(req:Request,res:Response)=>{
	
	res.clearCookie("accessToken");
	res.clearCookie("refreshToken");
		sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged out successfully",
		data:null
	});
})
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
	changePassword,
	updateProfileImage,
	updateStudentProfile,
	downloadIdCard,
	logout
};