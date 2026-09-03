import { Router } from "express";
import { upload } from "../../lib/multer.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { InstructorValidation } from "./Instructor.viladation.js";
import { auth } from "../../middleware/auth.js";
import { InstructorController } from "./Instructor.controller.js";
import { Role } from "../../../generated/prisma/enums.js";




const router = Router();

router.post(
	"/apply",
	upload.single("resume"),
	validateRequest(InstructorValidation.applyAsInstructorZodSchema),
	InstructorController.applyAsInstructor,
);
router.post(
	"/verify-email",
	validateRequest(InstructorValidation.verifyInstructorEmailZodSchema),
	InstructorController.verifyEmail,
);
router.patch(
	"/:instructorId/review",
	auth(Role.ADMIN),
	validateRequest(InstructorValidation.reviewInstructorZodSchema),
	InstructorController.reviewApplication,
);
router.get(
	"/",
	auth(Role.ADMIN),
	InstructorController.getAllInstructorApplications,
);

export const InstructorRoutes = router;