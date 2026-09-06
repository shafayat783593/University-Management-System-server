

import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { DashboardController } from "./dashboard.controller.js";

const router = Router();

router.get("/summary", auth(Role.ADMIN), DashboardController.getDashboardSummary);

export const DashboardRoutes = router;