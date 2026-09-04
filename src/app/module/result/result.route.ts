import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ResultValidation } from "./validation.result.js";
import { ResultController } from "./result.controller.js";


const router = Router();

router.post(
	"/exams/:examId/submit",
	auth(Role.INSTRUCTOR),
	validateRequest(ResultValidation.submitResultsZodSchema),
	ResultController.submitResults,
);
router.patch(
	"/exams/:examId/publish",
	auth(Role.ADMIN),
	ResultController.publishExamResults,
);
router.patch(
	"/:resultId/override",
	auth(Role.ADMIN),
	validateRequest(ResultValidation.overrideResultZodSchema),
	ResultController.overrideResult,
);
router.get("/transcript", auth(Role.STUDENT), ResultController.getMyTranscript);

export const ResultRoutes = router;