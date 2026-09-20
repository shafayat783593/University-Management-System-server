import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { AuditLogController } from "./auditlog.controller.js";

const router = Router();

router.get("/", auth(Role.ADMIN), AuditLogController.getAuditLogs);

export const AuditLogRoutes = router;