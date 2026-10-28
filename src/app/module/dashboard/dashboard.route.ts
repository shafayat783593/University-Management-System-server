import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { DashboardController } from "./dashboard.controller.js";

const router = Router();

router.get("/summary", auth(Role.ADMIN), DashboardController.getDashboardSummary);
router.get("/summary", auth(Role.ADMIN), DashboardController.getDashboardSummary);
router.get("/student", auth(Role.STUDENT), DashboardController.getStudentDashboard);
router.get("/instructor", auth(Role.INSTRUCTOR), DashboardController.getInstructorDashboard);

export const DashboardRoutes = router;
