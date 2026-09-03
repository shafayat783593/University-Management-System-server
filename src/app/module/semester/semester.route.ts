

import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { SemesterController } from "./semester.controller.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SemesterValidation } from "./semester.validation.js";


const router = Router();

router.get(
	"/",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	SemesterController.getAllSemesters,
);
router.get(
	"/:id",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	SemesterController.getSemesterById,
);
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(SemesterValidation.createSemesterZodSchema),
	SemesterController.createSemester,
);
router.patch(
	"/:id/status",
	auth(Role.ADMIN),
	validateRequest(SemesterValidation.updateSemesterStatusZodSchema),
	SemesterController.updateSemesterStatus,
);

export const SemesterRoutes = router;