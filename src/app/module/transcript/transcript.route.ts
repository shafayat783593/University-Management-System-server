import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { TranscriptController } from "./transcript.controller.js";

const router = Router();

// GET /api/v1/transcript/download?studentId=&semesterId=
// Students always download their own; ADMIN may pass studentId of any student.
router.get(
	"/download",
	auth(Role.STUDENT, Role.ADMIN),
	TranscriptController.downloadTranscript,
);

// POST /api/v1/transcript/email  body: { studentId?, semesterId? }
// Students email the PDF to their own inbox; ADMIN may pass studentId.
router.post(
	"/email",
	auth(Role.STUDENT, Role.ADMIN),
	TranscriptController.emailTranscript,
);

export const TranscriptRoutes = router;