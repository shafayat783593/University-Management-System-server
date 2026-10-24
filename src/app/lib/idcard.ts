import httpStatus from "http-status";
import {
	FeeItemType,
	InvoiceStatus,
	InvoiceType,
} from "../../generated/prisma/enums.js";
import { AppError } from "../utils/AppError.js";
import { pickPolicy, toMinor, type IPolicyLike } from "./billing.js";
import { loadPolicies } from "./invoiceCore.js";
import { prisma } from "./prisma.js";

/**
 * ID card charge + access rules.
 *
 * The university may or may not charge for the physical ID card. When an
 * ID_CARD fee policy is active the student has to pay it before the card can
 * be downloaded; when no such policy exists the card is free.
 *
 * The rule is deliberately based on the ID_CARD LINE ITEM rather than on the
 * invoice type: a student whose card was bundled onto an older ADMISSION
 * invoice (before the ID_CARD invoice type existed) still counts as paid.
 */

export type IIdCardFeeStatus =
	| "NOT_REQUIRED" // no ID card fee is configured -> the card is free
	| "NOT_INVOICED" // a fee exists but the student has not been billed yet
	| "UNPAID" // an invoice exists and still owes money
	| "PAID"; // an invoice containing an ID card fee is settled

export interface IIdCardFeeState {
	required: boolean;
	status: IIdCardFeeStatus;
	/** The amount still owed, in BDT. 0 when nothing is owed. */
	amountDue: number;
	invoiceId: string | null;
	invoiceNumber: string | null;
}

/** Active ID_CARD policies that apply to the student's department right now. */
const idCardPolicies = async (departmentId: string): Promise<(IPolicyLike & { id: string })[]> => {
	const policies = (await loadPolicies(prisma)).filter(
		(p) => p.itemType === FeeItemType.ID_CARD,
	);
	const ctx = { departmentId, semesterId: null, at: new Date() };
	const picked = pickPolicy(policies, FeeItemType.ID_CARD, ctx);
	return picked ? [picked] : [];
};

/**
 * The student's ID card invoices — any invoice carrying an ID_CARD line item,
 * regardless of which invoice type it was billed on.
 */
const idCardInvoices = async (studentId: string) => {
	return prisma.feeInvoice.findMany({
		where: {
			studentId,
			status: { not: InvoiceStatus.CANCELLED },
			items: { some: { itemType: FeeItemType.ID_CARD } },
		},
		select: {
			id: true,
			invoiceNumber: true,
			type: true,
			status: true,
			payableAmount: true,
			paidAmount: true,
			items: { where: { itemType: FeeItemType.ID_CARD }, select: { amount: true } },
		},
		orderBy: { createdAt: "asc" },
	});
};

const toNumber = (v: { toString(): string } | null | undefined) =>
	v == null ? 0 : Number(v.toString());

/**
 * Current ID card fee state for a student. Read live, so paying the invoice
 * immediately flips the state to PAID — there is no cached snapshot.
 */
export const getIdCardFeeState = async (
	studentId: string,
	departmentId: string,
): Promise<IIdCardFeeState> => {
	const policies = await idCardPolicies(departmentId);
	if (policies.length === 0) {
		return {
			required: false,
			status: "NOT_REQUIRED",
			amountDue: 0,
			invoiceId: null,
			invoiceNumber: null,
		};
	}

	const invoices = await idCardInvoices(studentId);
	if (invoices.length === 0) {
		return {
			required: true,
			status: "NOT_INVOICED",
			amountDue: policies.reduce((sum, p) => sum + p.amountMinor, 0) / 100,
			invoiceId: null,
			invoiceNumber: null,
		};
	}

	const paid = invoices.find((i) => i.status === InvoiceStatus.PAID);
	if (paid) {
		return {
			required: true,
			status: "PAID",
			amountDue: 0,
			invoiceId: paid.id,
			invoiceNumber: paid.invoiceNumber,
		};
	}

	// Oldest outstanding invoice wins — that is the one the student should pay.
	const outstanding = invoices[0];
	const amountDue = Math.max(
		toNumber(outstanding.payableAmount) - toNumber(outstanding.paidAmount),
		0,
	);
	return {
		required: true,
		status: "UNPAID",
		amountDue,
		invoiceId: outstanding.id,
		invoiceNumber: outstanding.invoiceNumber,
	};
};

/**
 * Blocks the ID card download while the ID card fee is still owed.
 * No fee policy -> free, nothing to assert.
 */
export const assertIdCardFeePaid = async (
	studentId: string,
	departmentId: string,
): Promise<IIdCardFeeState> => {
	const state = await getIdCardFeeState(studentId, departmentId);
	if (state.status === "PAID" || state.status === "NOT_REQUIRED") return state;

	if (state.status === "NOT_INVOICED") {
		throw new AppError(
			httpStatus.PAYMENT_REQUIRED,
			`An ID card fee of ৳${state.amountDue.toFixed(2)} applies. Generate the ID card invoice and pay it to download your ID card.`,
		);
	}

	throw new AppError(
		httpStatus.PAYMENT_REQUIRED,
		`Pay your ID card fee (৳${state.amountDue.toFixed(2)}) to download your ID card. Invoice ${state.invoiceNumber}.`,
	);
};

/**
 * True when the student has an ID card fee on an invoice that is not settled
 * yet. Used by the invoice builder to avoid billing a card fee twice (a
 * student who already had it bundled on an admission invoice is covered).
 */
export const hasOutstandingIdCardCharge = async (studentId: string): Promise<boolean> => {
	const invoices = await idCardInvoices(studentId);
	return invoices.some((i) => i.status !== InvoiceStatus.PAID);
};

export { idCardInvoices, idCardPolicies };
