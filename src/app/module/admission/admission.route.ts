import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AdmissionController } from "./admission.controller.js";
import { AdmissionValidation } from "./admission.validation.js";

const router = Router();

router.post(
	"/",
	auth(Role.STUDENT),
	validateRequest(AdmissionValidation.submitAdmissionApplicationZodSchema),
	AdmissionController.submitApplication,
);
router.patch(
	"/",
	auth(Role.STUDENT),
	validateRequest(AdmissionValidation.submitAdmissionApplicationZodSchema),
	AdmissionController.updateApplication,
);
router.get("/me", auth(Role.STUDENT), AdmissionController.getMyApplication);

// Admin — static paths above, "/:id/review" below, so nothing is read as an id by mistake
router.get("/", auth(Role.ADMIN), AdmissionController.listApplications);
router.patch(
	"/:id/review",
	auth(Role.ADMIN),
	validateRequest(AdmissionValidation.reviewApplicationZodSchema),
	AdmissionController.reviewApplication,
);

export const AdmissionRoutes = router;