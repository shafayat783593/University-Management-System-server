import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { TranscriptController } from "./transcript.controller.js";

const router = Router();

router.get(
	"/download",
	auth(Role.STUDENT, Role.ADMIN),
	TranscriptController.downloadTranscript,
);


router.post(
	"/email",
	auth(Role.STUDENT, Role.ADMIN),
	TranscriptController.emailTranscript,
);

export const TranscriptRoutes = router;