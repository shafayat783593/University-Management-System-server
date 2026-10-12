import { Router } from "express";
import { PublicController } from "./public.controller.js";

const router = Router();

// No auth — landing page data for visitors.
router.get("/stats", PublicController.getStats);
router.get("/departments", PublicController.getDepartmentCards);
router.get("/faculty", PublicController.getFaculty);
router.get("/calendar", PublicController.getCurrentCalendar);

export const PublicRoutes = router;