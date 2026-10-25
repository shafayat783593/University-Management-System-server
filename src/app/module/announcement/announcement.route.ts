import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { AnnouncementController } from "./announcement.controller.js";
import { AnnouncementValidation } from "./announcement.validation.js";
import { auth } from "../../middleware/auth.js";
import { upload } from "../../lib/multer.js";

const router = Router();

router.get("/admin", auth(Role.ADMIN), AnnouncementController.getAllAnnouncementsForAdmin);
router.get("/", AnnouncementController.getPublishedAnnouncements);
router.get("/:id", AnnouncementController.getAnnouncementById);

router.post(
	"/",
	auth(Role.ADMIN),
	upload.single("image"),
	validateRequest(AnnouncementValidation.createAnnouncementZodSchema),
	AnnouncementController.createAnnouncement,
);
router.patch(
	"/:id",
	auth(Role.ADMIN),
	upload.single("image"),
	validateRequest(AnnouncementValidation.updateAnnouncementZodSchema),
	AnnouncementController.updateAnnouncement,
);
router.delete("/:id", auth(Role.ADMIN), AnnouncementController.deleteAnnouncement);

export const AnnouncementRoutes = router;