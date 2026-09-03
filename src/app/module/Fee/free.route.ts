import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { FeeValidation } from "./free.validation.js";
import { Role } from "../../../generated/prisma/enums.js";
import { FeeController } from "./fee.controller.js";


const router = Router();

router.post(
	"/generate",
	auth(Role.ADMIN),
	validateRequest(FeeValidation.generateFeesZodSchema),
	FeeController.generateFeesForSemester,
);

export const FeeRoutes = router;