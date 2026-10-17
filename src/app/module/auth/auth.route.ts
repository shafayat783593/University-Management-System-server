import { Router } from "express";
import { rateLimit } from "../../utils/Ratelimit.js";
import { authRateLimiter, refreshRateLimiter } from "../../utils/Ratelimiter.js";
import { AuthController } from "./auth.controller.js";
import { auth } from "../../middleware/auth.js";
import { requireNoDues } from "../../middleware/requireNoDues.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AuthValidation } from "./auth.validation.js";
import { Role } from "../../../generated/prisma/enums.js";
import { upload } from "../../lib/multer.js";


const router = Router();

router.post(
	"/register",
	rateLimit(authRateLimiter),
	validateRequest(AuthValidation.registerStudentZodSchema),
	AuthController.register,
);
router.post(
	"/verify-email",
	validateRequest(AuthValidation.verifyEmailZodSchema),
	AuthController.verifyEmail,
);
router.post(
	"/login",
	rateLimit(authRateLimiter),
	validateRequest(AuthValidation.loginZodSchema),
	AuthController.login,
);
router.post(
	"/google",
	validateRequest(AuthValidation.googleLoginZodSchema),
	AuthController.googleLogin,
);
router.post(
	"/refresh-token",
	rateLimit(refreshRateLimiter),
	AuthController.refreshToken,
);
router.post(
	"/forgot-password",
	rateLimit(authRateLimiter),
	AuthController.forgotPassword,
);
router.post("/reset-password", AuthController.resetPassword);

router.get(
	"/me",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	AuthController.getMe,
);
router.post(
	"/complete-profile",
	auth(Role.STUDENT),
	validateRequest(AuthValidation.completeProfileZodSchema),
	AuthController.completeProfile,
);
router.patch(
	"/change-password",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	AuthController.changePassword,
);
router.patch(
	"/profile-image",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	upload.single("image"),
	AuthController.updateProfileImage,
);
router.patch(
	"/student-profile",
	auth(Role.STUDENT),
	validateRequest(AuthValidation.updateStudentProfileZodSchema),
	AuthController.updateStudentProfile,
);
router.get("/id-card", auth(Role.STUDENT), requireNoDues, AuthController.downloadIdCard);
router.post("/logout", AuthController.logout)

export const AuthRoutes = router;