import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { FeeValidation } from "./free.validation.js";
import { Role } from "../../../generated/prisma/enums.js";
import { FeeController } from "./fee.controller.js";


const router = Router();

// Flat-amount generation (original flow — kept as-is).
router.post(
	"/generate",
	auth(Role.ADMIN),
	validateRequest(FeeValidation.generateFeesZodSchema),
	FeeController.generateFeesForSemester,
);

// Itemized generation from the semester's fee policy.
router.post(
	"/generate/policy",
	auth(Role.ADMIN),
	validateRequest(FeeValidation.generateFromPolicyZodSchema),
	FeeController.generateFromPolicy,
);

// Fee policy (one active policy per semester).
router.get("/policies", auth(Role.ADMIN), FeeController.getPolicy);
router.put(
	"/policies",
	auth(Role.ADMIN),
	validateRequest(FeeValidation.upsertPolicyZodSchema),
	FeeController.upsertPolicy,
);

// Admission fee amount (null = not configured yet).
router.get("/settings/admission-fee", auth(Role.ADMIN), FeeController.getAdmissionFeeSetting);
router.put(
	"/settings/admission-fee",
	auth(Role.ADMIN),
	validateRequest(FeeValidation.admissionFeeSettingZodSchema),
	FeeController.setAdmissionFeeSetting,
);

// Reports.
router.get("/dues", auth(Role.ADMIN), FeeController.outstandingDues);
router.get("/overdue", auth(Role.ADMIN), FeeController.overdueInstallments);
router.get("/collection", auth(Role.ADMIN), FeeController.collectionSummary);

// Authorized correction of an UNPAID invoice + voiding it entirely.
router.patch(
	"/:feeId/adjustment",
	auth(Role.ADMIN),
	validateRequest(FeeValidation.adjustFeeZodSchema),
	FeeController.adjustFee,
);
router.patch("/:feeId/cancel", auth(Role.ADMIN), FeeController.cancelFee);

export const FeeRoutes = router;
