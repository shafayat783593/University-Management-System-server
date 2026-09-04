


import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { Role } from "../../../generated/prisma/enums.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ExamValidation } from "./exam.validation.js";
import { ExamController } from "./Exam.controller.js";


const router = Router();

router.post(
	"/",
	auth(Role.INSTRUCTOR),
	validateRequest(ExamValidation.createExamZodSchema),
	ExamController.createExam,
);
router.get(
	"/sections/:sectionId",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	ExamController.getSectionExams,
);

export const ExamRoutes = router;