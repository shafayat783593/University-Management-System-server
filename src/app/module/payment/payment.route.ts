import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { PaymentController } from "./payment.controller.js";
import { PaymentValidation } from "./payment.validation.js";

const router = Router();

// Student
router.post(
	"/init",
	auth(Role.STUDENT),
	validateRequest(PaymentValidation.initPaymentZodSchema),
	PaymentController.initPayment,
);
router.get("/my", auth(Role.STUDENT), PaymentController.getMyPayments);

// bKash redirects the student's browser here directly — no auth() possible
router.get("/bkash/callback", PaymentController.bkashCallback);

// Admin (static paths first, "/:id..." routes after)
router.get("/", auth(Role.ADMIN), PaymentController.getAllPayments);
router.get("/reports/collection", auth(Role.ADMIN), PaymentController.getCollectionReport);

// Student (own) or Admin
router.get("/:id", auth(Role.STUDENT, Role.ADMIN), PaymentController.getTransactionById);
router.post("/:id/verify", auth(Role.STUDENT, Role.ADMIN), PaymentController.verifyTransaction);
router.get("/:id/receipt", auth(Role.STUDENT, Role.ADMIN), PaymentController.downloadReceipt);
router.post(
	"/:id/refund",
	auth(Role.ADMIN),
	validateRequest(PaymentValidation.refundZodSchema),
	PaymentController.refundTransaction,
);

export const PaymentRoutes = router;