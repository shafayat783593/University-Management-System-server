
import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AuditLogLite } from "../../lib/audit.js";
import { fromMinor, toMinor, validatePlan, BillingError } from "../../lib/billing.js";
import { AppError } from "../../utils/AppError.js";
import type { z } from "zod";
import type { FeePolicyValidation } from "./feePolicy.validation.js";

// Types
type CreateFee = z.infer<typeof FeePolicyValidation.createFeePolicyZodSchema>;

type UpdateFee = z.infer<typeof FeePolicyValidation.updateFeePolicyZodSchema>;
type CreateInst = z.infer<typeof FeePolicyValidation.createInstallmentPolicyZodSchema>;
type UpdateInst = z.infer<typeof FeePolicyValidation.updateInstallmentPolicyZodSchema>;

// Convert Prisma Decimal to number
const toNumber = (value: any) =>
	value == null ? null : Number(value.toString());

// Format fee policy
const formatFee = (fee: any) => ({
	...fee,
	amount: toNumber(fee.amount),
});

// Format installment policy
const formatInstallment = (policy: any) => ({
	...policy,
	advanceValue: toNumber(policy.advanceValue),
	lateFeeValue: toNumber(policy.lateFeeValue),
});

// ==================== FEE POLICIES ====================

export type FeePolicyFilters = {
	invoiceType?: string;
	itemType?: string;
	departmentId?: string;
	semesterId?: string;
	activeOnly?: string;
};

// Get all fee policies
const  listFeePolicies = async (query: FeePolicyFilters) => {
	
	const fees = await prisma.feePolicy.findMany({
		where: {
			invoiceType: query.invoiceType as any,
			departmentId: query.departmentId,
			semesterId: query.semesterId,
			isActive: query.activeOnly === "true" ? true : undefined,
		},
		include: {
			department: {
				select: { name: true, code: true },
			},
			semester: {
				select: { name: true },
			},
		},
		orderBy: {
			effectiveFrom: "desc",
		},
	});

	return fees.map(formatFee);
};

// Create fee policy
const createFeePolicy = async (actorId: string, data: CreateFee) => {

	if (data.calcMethod === "PER_CREDIT" && data.itemType !== "TUITION") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only TUITION can be billed per credit",
		);
	}

	if (data.calcMethod === "PER_CREDIT" && data.invoiceType !== "SEMESTER") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Per-credit billing only applies to SEMESTER invoices",
		);
	}

	if (data.itemType === "CAUTION_DEPOSIT") {
		data.isRefundable = true;
	}

	const fee = await prisma.feePolicy.create({
		data: {
			name: data.name,
			invoiceType: data.invoiceType,
			itemType: data.itemType,
			calcMethod: data.calcMethod,
			amount: fromMinor(toMinor(data.amount)),
			isRefundable: data.isRefundable,
			departmentId: data.departmentId ?? null,
			semesterId: data.semesterId ?? null,
			effectiveFrom: data.effectiveFrom
				? new Date(data.effectiveFrom)
				: undefined,
			effectiveTo: data.effectiveTo
				? new Date(data.effectiveTo)
				: null,
			createdById: actorId,
		},
	});

	await AuditLogLite.write(
		actorId,
		"FEE_POLICY_CREATED",
		"FeePolicy",
		fee.id,
		null,
		formatFee(fee),
	);

	return formatFee(fee);
};

// Update fee policy
const updateFeePolicy = async (
	actorId: string,
	id: string,
	data: UpdateFee,
) => {
	const oldFee = await prisma.feePolicy.findUnique({
		where: { id },
	});

	if (!oldFee) {
		throw new AppError(httpStatus.NOT_FOUND, "Fee policy not found");
	}

	const fee = await prisma.feePolicy.update({
		where: { id },
		data: {
			name: data.name,
			amount:
				data.amount === undefined
					? undefined
					: fromMinor(toMinor(data.amount)),
			isRefundable: data.isRefundable,
			effectiveTo: data.effectiveTo
				? new Date(data.effectiveTo)
				: data.effectiveTo === null
					? null
					: undefined,
			isActive: data.isActive,
		},
	});

	await AuditLogLite.write(
		actorId,
		"FEE_POLICY_UPDATED",
		"FeePolicy",
		id,
		formatFee(oldFee),
		formatFee(fee),
	);

	return formatFee(fee);
};

// ==================== INSTALLMENT POLICIES ====================

// Validate installment plan
const checkPlan = (data: {
	installmentCount?: number;
	advanceType?: string;
	advanceValue?: number;
	customPercents?: number[];
}) => {
	try {
		validatePlan({
			count: data.installmentCount ?? 1,
			advanceType: (data.advanceType ?? "NONE") as any,
			advanceMinorOrPercent: data.advanceValue ?? null,
			customPercents: data.customPercents ?? null,
			intervalMonths: 1,
			firstDue: new Date(),
		});
	} catch (error) {
		if (error instanceof BillingError) {
			throw new AppError(httpStatus.BAD_REQUEST, error.message);
		}

		throw error;
	}

	if (data.advanceType === "FIXED" && data.advanceValue == null) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"advanceValue is required for FIXED advance",
		);
	}
};

// Get all installment policies
const listInstallmentPolicies = async () => {
	const policies = await prisma.installmentPolicy.findMany({
		include: {
			semester: {
				select: { name: true },
			},
		},
		orderBy: {
			createdAt: "desc",
		},
	});

	return policies.map(formatInstallment);
};

// Create installment policy
const createInstallmentPolicy = async (actorId: string, data: CreateInst,) => {
	
	checkPlan(data);

	if (data.isDefault) {
		await prisma.installmentPolicy.updateMany({
			where: {
				isDefault: true,
				isActive: true,
			},
			data: {
				isActive: false,
			},
		});
	}

	if (data.semesterId) {
		const existing = await prisma.installmentPolicy.findUnique({
			where: { semesterId: data.semesterId },
		});

		if (existing) {
			throw new AppError(
				httpStatus.CONFLICT,
				"This semester already has an installment policy",
			);
		}
	}

	const policy = await prisma.installmentPolicy.create({
		data: {
			name: data.name,
			semesterId: data.semesterId ?? null,
			isDefault: data.isDefault,
			installmentCount: data.installmentCount,
			advanceType: data.advanceType,
			advanceValue:
				data.advanceValue == null
					? null
					: fromMinor(toMinor(data.advanceValue)),
			customPercents: data.customPercents ?? undefined,
			intervalMonths: data.intervalMonths,
			firstDueDate: data.firstDueDate
				? new Date(data.firstDueDate)
				: null,
			firstDueOffsetDays: data.firstDueOffsetDays,
			graceDays: data.graceDays,
			lateFeeType: data.lateFeeType,
			lateFeeValue: fromMinor(toMinor(data.lateFeeValue)),
			allowPartialPayment: data.allowPartialPayment,
			restrictOnOverdue: data.restrictOnOverdue,
			createdById: actorId,
		},
	});

	await AuditLogLite.write(
		actorId,
		"INSTALLMENT_POLICY_CREATED",
		"InstallmentPolicy",
		policy.id,
		null,
		formatInstallment(policy),
	);

	return formatInstallment(policy);
};

// Update installment policy
const updateInstallmentPolicy = async (
	actorId: string,
	id: string,
	data: UpdateInst,
) => {
	const oldPolicy = await prisma.installmentPolicy.findUnique({
		where: { id },
	});

	if (!oldPolicy) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Installment policy not found",
		);
	}

	checkPlan({
		installmentCount:
			data.installmentCount ?? oldPolicy.installmentCount,
		advanceType: data.advanceType ?? oldPolicy.advanceType,
		advanceValue:
			data.advanceValue ?? toNumber(oldPolicy.advanceValue) ?? undefined,
		customPercents:
			data.customPercents ??
			(Array.isArray(oldPolicy.customPercents)
				? (oldPolicy.customPercents as number[])
				: undefined),
	});

	const policy = await prisma.installmentPolicy.update({
		where: { id },
		data: {
			name: data.name,
			installmentCount: data.installmentCount,
			advanceType: data.advanceType,
			advanceValue:
				data.advanceValue === undefined
					? undefined
					: fromMinor(toMinor(data.advanceValue)),
			customPercents: data.customPercents,
			intervalMonths: data.intervalMonths,
			firstDueDate: data.firstDueDate
				? new Date(data.firstDueDate)
				: undefined,
			firstDueOffsetDays: data.firstDueOffsetDays,
			graceDays: data.graceDays,
			lateFeeType: data.lateFeeType,
			lateFeeValue:
				data.lateFeeValue === undefined
					? undefined
					: fromMinor(toMinor(data.lateFeeValue)),
			allowPartialPayment: data.allowPartialPayment,
			restrictOnOverdue: data.restrictOnOverdue,
			isActive: data.isActive,
		},
	});

	await AuditLogLite.write(
		actorId,
		"INSTALLMENT_POLICY_UPDATED",
		"InstallmentPolicy",
		id,
		formatInstallment(oldPolicy),
		formatInstallment(policy),
	);

	return formatInstallment(policy);
};

// Export service
export const FeePolicyService = {
	listFeePolicies,
	createFeePolicy,
	updateFeePolicy,
	listInstallmentPolicies,
	createInstallmentPolicy,
	updateInstallmentPolicy,
};
