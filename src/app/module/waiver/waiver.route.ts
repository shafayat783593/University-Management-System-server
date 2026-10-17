import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { WaiverController } from "./waiver.controller.js";
import { WaiverValidation } from "./waiver.validation.js";

const router = Router();

router.get("/", auth(Role.ADMIN), WaiverController.listWaivers);
router.post("/", auth(Role.ADMIN), validateRequest(WaiverValidation.createWaiverZodSchema), WaiverController.createWaiver);
router.patch("/:id", auth(Role.ADMIN), validateRequest(WaiverValidation.updateWaiverZodSchema), WaiverController.updateWaiver);

export const WaiverRoutes = router;