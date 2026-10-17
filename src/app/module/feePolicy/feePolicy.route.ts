import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { FeePolicyController } from "./feePolicy.controller.js";
import { FeePolicyValidation } from "./feePolicy.validation.js";

const router = Router();

// Rate cards (students may read them to see what they will be charged)
router.get("/", auth(Role.ADMIN, Role.STUDENT), FeePolicyController.listFeePolicies);
router.post(
	"/",
	auth(Role.ADMIN),
	validateRequest(FeePolicyValidation.createFeePolicyZodSchema),
	FeePolicyController.createFeePolicy,
);

// Installment policies — declared before "/:id" so "installment-policies" isn't read as an id
router.get("/installment-policies", auth(Role.ADMIN), FeePolicyController.listInstallmentPolicies);
router.post(
	"/installment-policies",
	auth(Role.ADMIN),
	validateRequest(FeePolicyValidation.createInstallmentPolicyZodSchema),
	FeePolicyController.createInstallmentPolicy,
);
router.patch(
	"/installment-policies/:id",
	auth(Role.ADMIN),
	validateRequest(FeePolicyValidation.updateInstallmentPolicyZodSchema),
	FeePolicyController.updateInstallmentPolicy,
);

router.patch(
	"/:id",
	auth(Role.ADMIN),
	validateRequest(FeePolicyValidation.updateFeePolicyZodSchema),
	FeePolicyController.updateFeePolicy,
);

export const FeePolicyRoutes = router;