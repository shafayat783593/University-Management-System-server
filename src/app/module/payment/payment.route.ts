import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { Role } from "../../../generated/prisma/enums.js";
import { PaymentController } from "./payment.controller.js";
;

const router = Router();

router.post(
	"/bkash/init",
	auth(Role.STUDENT),
	// validateRequest(PaymentValidation.initBkashPaymentZodSchema),
	PaymentController.initBkashPayment,
);
// bKash redirects the student's browser here directly — no auth() possible
router.get("/bkash/callback", PaymentController.bkashCallback);
router.get("/my-fees", auth(Role.STUDENT), PaymentController.getMyFees);
router.get("/", auth(Role.ADMIN), PaymentController.getAllPayments);

export const PaymentRoutes = router;