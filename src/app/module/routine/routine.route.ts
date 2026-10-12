import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { RoutineController } from "./routine.controller.js";
import { Role } from "../../../generated/prisma/enums.js";
import { RoutineValidation } from "./routine.validated.js";
import { validateRequest } from "../../middleware/validateRequest.js";


const router = Router();

// static paths before dynamic ":id"/":sectionId" segments
router.get("/my", auth(Role.STUDENT), RoutineController.getMyRoutineAsStudent);
router.get(
	"/instructor/my",
	auth(Role.INSTRUCTOR),
	RoutineController.getMyRoutineAsInstructor,
);
router.get(
	"/sections/:sectionId",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	RoutineController.getSectionRoutine,
);

router.post(
	"/",
	auth(Role.INSTRUCTOR),
	validateRequest(RoutineValidation.createRoutineEntryZodSchema),
	RoutineController.createRoutineEntry,
);
router.delete("/:id", auth(Role.INSTRUCTOR), RoutineController.deleteRoutineEntry);

export const RoutineRoutes = router;