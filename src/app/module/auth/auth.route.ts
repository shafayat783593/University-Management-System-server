import { Router } from "express";
import { rateLimit } from "../../utils/Ratelimit.js";
import { authRateLimiter, refreshRateLimiter } from "../../utils/Ratelimiter.js";
import { AuthController } from "./auth.controller.js";
import { auth } from "../../middleware/auth.js";
import { Role } from "../../../generated/prisma/enums.js";
import { upload } from "../../lib/multer.js";


const router = Router();

router.post("/register", rateLimit(authRateLimiter), AuthController.register);
router.post("/verify-email", AuthController.verifyEmail);
router.post("/login", rateLimit(authRateLimiter), AuthController.login);
router.post("/google", AuthController.googleLogin);
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
router.post("/complete-profile", auth(Role.STUDENT), AuthController.completeProfile);
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
	AuthController.updateStudentProfile,
);
router.get("/id-card", auth(Role.STUDENT), AuthController.downloadIdCard);

export const AuthRoutes = router;