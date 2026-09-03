import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { EnrollmentController } from "./enrollment.controller.js";
import { auth } from "../../middleware/auth.js";


const router = Router();

router.post(
	"/",
	auth(Role.STUDENT),
	EnrollmentController.createEnrollment,
);
router.get("/my", auth(Role.STUDENT), EnrollmentController.getMyEnrollments);
router.delete(
	"/:sectionId",
	auth(Role.STUDENT),
	EnrollmentController.dropEnrollment,
);

export const EnrollmentRoutes = router;