

import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";


const router = Router();

router.post("/register", AuthController.register);
router.post("/verify-email", AuthController.verifyEmail);
router.post("/login", AuthController.login);
router.post("/google", AuthController.googleLogin);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/forgot-password", AuthController.forgotPassword);
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

export const AuthRoutes = router;