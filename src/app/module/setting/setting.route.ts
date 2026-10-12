

import { Router } from "express";
import { SettingController } from "./setting.controller.js";
import { auth } from "../../middleware/auth.js";
import { SettingValidation } from "./setting.validation.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { Role } from "../../../generated/prisma/enums.js";

const router = Router();

// Public — a student filling out the admission application should see
// the fee amount before submitting, not just after.
router.get("/", SettingController.getSettings);
router.patch(
	"/",
	auth(Role.ADMIN),
	validateRequest(SettingValidation.updateSystemSettingZodSchema),
	SettingController.updateSettings,
);

export const SettingRoutes = router;