import { z } from "zod";
import {
	AdvanceType,
	FeeCalcMethod,
	FeeItemType,
	InvoiceType,
	LateFeeType,
} from "../../../generated/prisma/enums.js";

const money = z.number().nonnegative().multipleOf(0.01);

const createFeePolicyZodSchema = z.object({
	name: z.string().min(2),
	invoiceType: z.enum(InvoiceType),
	itemType: z.enum(FeeItemType),
	calcMethod: z.enum(FeeCalcMethod).default("FLAT"),
	amount: money.refine((v) => v > 0, "Amount must be positive"),
	isRefundable: z.boolean().default(false),
	departmentId: z.string().min(1).optional(),
	semesterId: z.string().min(1).optional(),
	effectiveFrom: z.string().optional(),
	effectiveTo: z.string().optional(),
});

const updateFeePolicyZodSchema = z.object({
	name: z.string().min(2).optional(),
	amount: money.optional(),
	isRefundable: z.boolean().optional(),
	effectiveTo: z.string().nullable().optional(),
	isActive: z.boolean().optional(),
});

const installmentPolicyBase = z.object({
	name: z.string().min(2),
	semesterId: z.string().min(1).optional(),
	isDefault: z.boolean().default(false),
	installmentCount: z.number().int().min(1).max(24).default(1),
	advanceType: z.enum(AdvanceType).default("NONE"),
	advanceValue: money.optional(),
	customPercents: z.array(z.number().positive()).optional(),
	intervalMonths: z.number().int().min(1).max(12).default(1),
	firstDueDate: z.string().optional(),
	firstDueOffsetDays: z.number().int().min(0).max(120).default(7),
	graceDays: z.number().int().min(0).max(90).default(0),
	lateFeeType: z.enum(LateFeeType).default("NONE"),
	lateFeeValue: money.default(0),
	allowPartialPayment: z.boolean().default(false),
	restrictOnOverdue: z.boolean().default(true),
});

const createInstallmentPolicyZodSchema = installmentPolicyBase.refine(
	(v) => v.isDefault !== !!v.semesterId,
	"Set exactly one of: isDefault=true, or semesterId",
);

const updateInstallmentPolicyZodSchema = installmentPolicyBase.partial().extend({
	isActive: z.boolean().optional(),
});

export const FeePolicyValidation = {
	createFeePolicyZodSchema,
	updateFeePolicyZodSchema,
	createInstallmentPolicyZodSchema,
	updateInstallmentPolicyZodSchema,
};