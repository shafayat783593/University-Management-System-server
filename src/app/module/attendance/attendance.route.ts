import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { Role } from "../../../generated/prisma/enums.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AttendanceValidation } from "./attendance.validation.js";
import { AttendanceController } from "./attendance.controller.js";


const router = Router();

router.post(
	"/sessions",
	auth(Role.INSTRUCTOR),
	validateRequest(AttendanceValidation.createAttendanceSessionZodSchema),
	AttendanceController.createSession,
);
router.post(
	"/sessions/:sessionId/mark",
	auth(Role.INSTRUCTOR),
	validateRequest(AttendanceValidation.markAttendanceZodSchema),
	AttendanceController.markAttendance,
);
router.get(
	"/sections/:sectionId",
	auth(Role.INSTRUCTOR, Role.ADMIN),
	AttendanceController.getSectionAttendance,
);
router.get("/my", auth(Role.STUDENT), AttendanceController.getMyAttendance);

export const AttendanceRoutes = router;