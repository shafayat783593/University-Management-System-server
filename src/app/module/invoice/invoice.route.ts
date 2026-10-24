import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { InvoiceController } from "./invoice.controller.js";
import { InvoiceValidation } from "./invoice.validation.js";

const router = Router();

// ---- Student (all static paths — must stay above "/:id") ----
router.post("/application", auth(Role.STUDENT), InvoiceController.createApplicationInvoice);
router.post("/id-card", auth(Role.STUDENT), InvoiceController.createIdCardInvoice);
router.post(
	"/semester/generate-my",
	auth(Role.STUDENT),
	validateRequest(InvoiceValidation.generateMySemesterInvoiceZodSchema),
	InvoiceController.generateMySemesterInvoice,
);
router.get("/my", auth(Role.STUDENT), InvoiceController.getMyInvoices);
router.get("/my/summary", auth(Role.STUDENT), InvoiceController.getMySummary);
router.get("/my/overdue", auth(Role.STUDENT), InvoiceController.getMyOverdue);

// ---- Admin (static) ----
router.post(
	"/semester/generate",
	auth(Role.ADMIN),
	validateRequest(InvoiceValidation.generateSemesterInvoicesZodSchema),
	InvoiceController.generateSemesterInvoices,
);
router.get("/", auth(Role.ADMIN), InvoiceController.getAllInvoices);
router.get("/reports/outstanding", auth(Role.ADMIN), InvoiceController.getOutstandingDues);
router.get("/reports/overdue", auth(Role.ADMIN), InvoiceController.getOverdueReport);
router.post("/late-fees/apply", auth(Role.ADMIN), InvoiceController.applyLateFees);

// ---- Parameterised ----
router.get("/:id", auth(Role.STUDENT, Role.ADMIN), InvoiceController.getInvoiceById);
router.post(
	"/:id/adjustments",
	auth(Role.ADMIN),
	validateRequest(InvoiceValidation.adjustmentZodSchema),
	InvoiceController.addAdjustment,
);
router.post(
	"/:id/cancel",
	auth(Role.ADMIN),
	validateRequest(InvoiceValidation.cancelInvoiceZodSchema),
	InvoiceController.cancelInvoice,
);

export const InvoiceRoutes = router;