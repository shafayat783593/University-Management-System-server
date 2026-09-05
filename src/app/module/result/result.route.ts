import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { ResultValidation } from "./validation.result.js";
import { validateRequest } from "../../middleware/validateRequest.js";
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
router.get(
	"/transcript/download",
	auth(Role.STUDENT),
	ResultController.downloadTranscript,
);
router.post(
	"/transcript/email",
	auth(Role.STUDENT),
	ResultController.emailTranscript,
);
router.get(
	"/sections/:sectionId/my-result",
	auth(Role.STUDENT),
	ResultController.getSectionResultSheet,
);
router.get(
	"/sections/:sectionId/my-result/download",
	auth(Role.STUDENT),
	ResultController.downloadResultSheet,
);
router.post(
	"/sections/:sectionId/my-result/email",
	auth(Role.STUDENT),
	ResultController.emailResultSheet,
);

export const ResultRoutes = router;