import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { Role } from "../../../generated/prisma/enums.js";
import { SectionController } from "./section.controller.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SectionValidation } from "./section.validation.js";

const router = Router();

router.get(
	"/",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	SectionController.getAllSections,
);
router.get(
	"/:id",
	auth(Role.STUDENT, Role.INSTRUCTOR, Role.ADMIN),
	SectionController.getSectionById,
);
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(SectionValidation.createSectionZodSchema),
	SectionController.createSection,
);
router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(SectionValidation.updateSectionZodSchema),
	SectionController.updateSection,
);
router.delete("/:id", auth(Role.ADMIN), SectionController.deleteSection);

export const SectionRoutes = router;