/**
 * Pure billing math — no DB, no Prisma, no I/O. Everything is computed in
 * integer minor units (paisa) so rounding can never leak a cent: the sum
 * of installments ALWAYS equals the payable amount.
 *
 * Money crosses the DB boundary as Decimal(12,2); use toMinor()/fromMinor().
 */
import { addDays, addMonths } from "date-fns";

export class BillingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BillingError";
	}
}

// ---------- minor-unit helpers ----------

/** Accepts number | string | Prisma.Decimal (anything whose toString is a decimal). */
export const toMinor = (v: { toString(): string } | number | string): number =>
	Math.round(Number(v.toString()) * 100);

/** Prisma accepts a 2-dp string for Decimal columns. */
export const fromMinor = (n: number): string => (n / 100).toFixed(2);

// ---------- policy resolution ----------

export interface IPolicyLike {
	id?: string;
	invoiceType: string;
	itemType: string;
	calcMethod: "FLAT" | "PER_CREDIT";
	amountMinor: number;
	isRefundable: boolean;
	departmentId: string | null;
	semesterId: string | null;
	effectiveFrom: Date;
	effectiveTo: Date | null;
	isActive: boolean;
}

export interface IPolicyContext {
	departmentId: string;
	semesterId: string | null;
	at: Date;
}

const matches = (p: IPolicyLike, c: IPolicyContext) =>
	p.isActive &&
	p.effectiveFrom <= c.at &&
	(p.effectiveTo === null || p.effectiveTo >= c.at) &&
	(p.departmentId === null || p.departmentId === c.departmentId) &&
	(p.semesterId === null || p.semesterId === c.semesterId);

const specificity = (p: IPolicyLike) =>
	(p.semesterId ? 2 : 0) + (p.departmentId ? 1 : 0);

/** Most specific matching policy wins; ties go to the latest effectiveFrom. */
export const pickPolicy = <T extends IPolicyLike>(
	policies: T[],
	itemType: string,
	ctx: IPolicyContext,
): T | undefined =>
	policies
		.filter((p) => p.itemType === itemType && matches(p, ctx))
		.sort(
			(a, b) =>
				specificity(b) - specificity(a) ||
				b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
		)[0];

// ---------- invoice items ----------

export interface IInvoiceItemDraft {
	itemType: string;
	description: string;
	quantity: number;
	unitMinor: number;
	amountMinor: number;
	isRefundable: boolean;
	policyId?: string;
}

const LABELS: Record<string, string> = {
	APPLICATION: "Application Fee",
	ADMISSION: "Admission Fee",
	ID_CARD: "ID Card Fee",
	CAUTION_DEPOSIT: "Caution Deposit (refundable)",
	TUITION: "Tuition Fee",
	REGISTRATION: "Semester Registration Fee",
	LABORATORY: "Laboratory Fee",
	EXAMINATION: "Examination Fee",
	LIBRARY: "Library Fee",
	OTHER: "Other Fee",
};

/**
 * One item per distinct itemType found in the policies for this invoice type.
 * PER_CREDIT items bill `credits` units; zero-amount items are skipped.
 *
 * `onlyTuition` is for supplementary invoices (credits added after the first
 * invoice): registration/lab/exam/library are NOT charged a second time.
 */
export const buildInvoiceItems = (
	policies: IPolicyLike[],
	params: {
		invoiceType: string;
		ctx: IPolicyContext;
		credits?: number;
		onlyTuition?: boolean;
	},
): IInvoiceItemDraft[] => {
	const scoped = policies.filter((p) => p.invoiceType === params.invoiceType);
	const types = [...new Set(scoped.map((p) => p.itemType))];
	const items: IInvoiceItemDraft[] = [];

	for (const itemType of types) {
		if (params.onlyTuition && itemType !== "TUITION") continue;
		const policy = pickPolicy(scoped, itemType, params.ctx);
		if (!policy) continue;

		const perCredit = policy.calcMethod === "PER_CREDIT";
		const quantity = perCredit ? (params.credits ?? 0) : 1;
		const amountMinor = policy.amountMinor * quantity;
		if (quantity <= 0 || amountMinor <= 0) continue;

		items.push({
			itemType,
			description: perCredit
				? `${LABELS[itemType] ?? itemType} (${quantity} credits)`
				: (LABELS[itemType] ?? itemType),
			quantity,
			unitMinor: policy.amountMinor,
			amountMinor,
			isRefundable: policy.isRefundable,
			policyId: policy.id,
		});
	}
	return items;
};

// ---------- waivers / scholarships ----------

export interface IWaiverLike {
	id?: string;
	type: "WAIVER" | "SCHOLARSHIP" | "DISCOUNT";
	name: string;
	percent: number | null; // 0-100
	fixedMinor: number | null;
}

export interface IWaiverAdjustment {
	type: IWaiverLike["type"];
	reason: string;
	amountMinor: number; // negative
}

/**
 * Waivers apply to TUITION only and can never push tuition below zero:
 * the running total of discounts is capped at the tuition amount.
 * Percent waivers are computed on the ORIGINAL tuition (not compounded).
 */
export const computeWaiverAdjustments = (
	tuitionMinor: number,
	waivers: IWaiverLike[],
): IWaiverAdjustment[] => {
	let remaining = tuitionMinor;
	const out: IWaiverAdjustment[] = [];
	for (const w of waivers) {
		if (remaining <= 0) break;
		let amt = 0;
		if (w.percent !== null) amt += Math.floor((tuitionMinor * w.percent) / 100);
		if (w.fixedMinor !== null) amt += w.fixedMinor;
		amt = Math.min(Math.max(amt, 0), remaining);
		if (amt === 0) continue;
		remaining -= amt;
		out.push({ type: w.type, reason: w.name, amountMinor: -amt });
	}
	return out;
};

export const computePayable = (
	subtotalMinor: number,
	discountMinor: number,
	adjustmentMinor: number,
): number => {
	const payable = subtotalMinor - discountMinor + adjustmentMinor;
	if (payable < 0) throw new BillingError("Payable amount cannot be negative");
	return payable;
};

// ---------- installment plans ----------

export interface IInstallmentPlan {
	count: number;
	advanceType: "NONE" | "PERCENT" | "FIXED";
	advanceMinorOrPercent: number | null; // percent (0-100) for PERCENT, minor units for FIXED
	customPercents: number[] | null;
	intervalMonths: number;
	firstDue: Date;
}

export interface IInstallmentDraft {
	number: number;
	amountMinor: number;
	dueDate: Date;
}

const LATE_JOINER_GRACE_DAYS = 7;

/** Splits `total` over n slots; the LAST slot absorbs the rounding remainder. */
const equalSplit = (total: number, n: number): number[] => {
	if (n <= 0) return [];
	const base = Math.floor(total / n);
	const parts = Array<number>(n).fill(base);
	parts[n - 1] = total - base * (n - 1);
	return parts;
};

export const validatePlan = (plan: IInstallmentPlan): void => {
	if (!Number.isInteger(plan.count) || plan.count < 1 || plan.count > 24) {
		throw new BillingError("Installment count must be an integer between 1 and 24");
	}
	if (plan.customPercents) {
		if (plan.customPercents.length !== plan.count) {
			throw new BillingError("customPercents length must equal installment count");
		}
		const sum = plan.customPercents.reduce((a, b) => a + b, 0);
		if (Math.abs(sum - 100) > 0.0001 || plan.customPercents.some((p) => p <= 0)) {
			throw new BillingError("customPercents must be positive and sum to 100");
		}
	}
	if (plan.advanceType === "PERCENT") {
		const v = plan.advanceMinorOrPercent ?? 0;
		if (v <= 0 || v >= 100) throw new BillingError("Advance percent must be between 0 and 100");
	}
};

/**
 * Builds the schedule. Invariant: sum(amountMinor) === totalMinor, always.
 * Past-due dates (late joiners) are pushed to now + 7 days, and due dates
 * never go backwards.
 */
export const buildInstallments = (
	totalMinor: number,
	plan: IInstallmentPlan,
	now: Date = new Date(),
): IInstallmentDraft[] => {
	validatePlan(plan);
	if (totalMinor < 0) throw new BillingError("Total cannot be negative");

	const n = plan.count;
	let amounts: number[];

	if (n === 1) {
		amounts = [totalMinor];
	} else if (plan.customPercents) {
		let used = 0;
		amounts = plan.customPercents.map((p, i) => {
			if (i === n - 1) return totalMinor - used;
			const a = Math.floor((totalMinor * p) / 100);
			used += a;
			return a;
		});
	} else if (plan.advanceType !== "NONE" && plan.advanceMinorOrPercent) {
		const adv =
			plan.advanceType === "PERCENT"
				? Math.floor((totalMinor * plan.advanceMinorOrPercent) / 100)
				: Math.min(plan.advanceMinorOrPercent, totalMinor);
		amounts = [adv, ...equalSplit(totalMinor - adv, n - 1)];
	} else {
		amounts = equalSplit(totalMinor, n);
	}

	let prev: Date | null = null;
	return amounts.map((amountMinor, i) => {
		let dueDate = addMonths(plan.firstDue, i * plan.intervalMonths);
		if (dueDate < now) dueDate = addDays(now, LATE_JOINER_GRACE_DAYS);
		if (prev && dueDate < prev) dueDate = prev;
		prev = dueDate;
		return { number: i + 1, amountMinor, dueDate };
	});
};

// ---------- applying deltas (waivers, adjustments, late fees) ----------

export interface IInstallmentAmounts {
	number: number;
	amountMinor: number;
	paidMinor: number;
}

/**
 * Applies a signed delta to a schedule WITHOUT touching what's already paid.
 *  - positive: added to the last installment
 *  - negative: trimmed from the last installments backwards, never below paid
 * Throws if the reduction would drop the invoice below what's already paid
 * (that case needs a refund first, not a silent adjustment).
 */
export const applyDelta = (
	schedule: IInstallmentAmounts[],
	deltaMinor: number,
): IInstallmentAmounts[] => {
	const out = schedule.map((s) => ({ ...s })).sort((a, b) => a.number - b.number);
	if (out.length === 0) throw new BillingError("Invoice has no installments");

	if (deltaMinor >= 0) {
		out[out.length - 1].amountMinor += deltaMinor;
		return out;
	}

	let toCut = -deltaMinor;
	for (let i = out.length - 1; i >= 0 && toCut > 0; i--) {
		const room = out[i].amountMinor - out[i].paidMinor;
		const cut = Math.min(room, toCut);
		out[i].amountMinor -= cut;
		toCut -= cut;
	}
	if (toCut > 0) {
		throw new BillingError(
			"Reduction exceeds the unpaid balance — refund the paid amount first",
		);
	}
	return out;
};

// ---------- payments ----------

export interface IAllocationResult {
	allocations: { number: number; amountMinor: number }[];
	excessMinor: number;
}

/** Waterfall: oldest installment first, never beyond an installment's remaining balance. */
export const allocatePayment = (
	schedule: IInstallmentAmounts[],
	paymentMinor: number,
): IAllocationResult => {
	let left = paymentMinor;
	const allocations: IAllocationResult["allocations"] = [];
	for (const s of [...schedule].sort((a, b) => a.number - b.number)) {
		if (left <= 0) break;
		const remaining = s.amountMinor - s.paidMinor;
		if (remaining <= 0) continue;
		const take = Math.min(remaining, left);
		allocations.push({ number: s.number, amountMinor: take });
		left -= take;
	}
	return { allocations, excessMinor: left };
};

/** First installment that still has a balance (what "Pay now" defaults to). */
export const nextInstallmentRemaining = (
	schedule: IInstallmentAmounts[],
): { number: number; remainingMinor: number } | null => {
	for (const s of [...schedule].sort((a, b) => a.number - b.number)) {
		const remaining = s.amountMinor - s.paidMinor;
		if (remaining > 0) return { number: s.number, remainingMinor: remaining };
	}
	return null;
};

/**
 * Validates a student-requested payment against the invoice schedule and
 * returns how it will be allocated. Rejects non-positive amounts, anything
 * above the outstanding balance, and — unless the policy allows partial
 * payments — any amount that would leave an installment partly paid.
 */
export const planPayment = (
	schedule: IInstallmentAmounts[],
	amountMinor: number,
	allowPartial: boolean,
): IAllocationResult => {
	if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
		throw new BillingError("Payment amount must be greater than zero");
	}
	const outstanding = schedule.reduce((a, s) => a + Math.max(s.amountMinor - s.paidMinor, 0), 0);
	if (outstanding <= 0) throw new BillingError("Nothing is due on this invoice");
	if (amountMinor > outstanding) {
		throw new BillingError("Payment exceeds the outstanding balance");
	}
	const result = allocatePayment(schedule, amountMinor);
	if (!allowPartial) {
		const remaining = new Map(schedule.map((s) => [s.number, s.amountMinor - s.paidMinor]));
		for (const a of result.allocations) {
			if (a.amountMinor < (remaining.get(a.number) ?? 0)) {
				throw new BillingError(
					"Partial payments are not allowed for this invoice — pay whole installments",
				);
			}
		}
	}
	return result;
};

/** Refunds reverse allocations newest installment first. */
export const reverseAllocations = (
	allocated: { number: number; allocatedMinor: number }[],
	refundMinor: number,
): { number: number; amountMinor: number }[] => {
	let left = refundMinor;
	const out: { number: number; amountMinor: number }[] = [];
	for (const a of [...allocated].sort((x, y) => y.number - x.number)) {
		if (left <= 0) break;
		const take = Math.min(a.allocatedMinor, left);
		if (take > 0) out.push({ number: a.number, amountMinor: take });
		left -= take;
	}
	if (left > 0) throw new BillingError("Refund exceeds the allocated amount");
	return out;
};

// ---------- statuses ----------

/** The value we STORE (never OVERDUE). */
export const storedInstallmentStatus = (
	amountMinor: number,
	paidMinor: number,
): "PENDING" | "PARTIALLY_PAID" | "PAID" => {
	if (paidMinor >= amountMinor) return "PAID";
	if (paidMinor > 0) return "PARTIALLY_PAID";
	return "PENDING";
};

export const isInstallmentOverdue = (
	i: { amountMinor: number; paidMinor: number; dueDate: Date },
	now: Date,
	graceDays: number,
): boolean =>
	i.amountMinor - i.paidMinor > 0 && addDays(i.dueDate, graceDays) < now;

/** The value we SHOW (OVERDUE derived from the due date + balance). */
export const effectiveInstallmentStatus = (
	i: { amountMinor: number; paidMinor: number; dueDate: Date },
	now: Date,
	graceDays: number,
): "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" =>
	isInstallmentOverdue(i, now, graceDays)
		? "OVERDUE"
		: storedInstallmentStatus(i.amountMinor, i.paidMinor);

export const deriveInvoiceStatus = (
	payableMinor: number,
	paidMinor: number,
	cancelled: boolean,
): "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" => {
	if (cancelled) return "CANCELLED";
	if (paidMinor >= payableMinor) return "PAID";
	if (paidMinor > 0) return "PARTIALLY_PAID";
	return "UNPAID";
};

export const outstandingMinor = (payableMinor: number, paidMinor: number): number =>
	Math.max(payableMinor - paidMinor, 0);

export const computeLateFee = (
	remainingMinor: number,
	type: "NONE" | "FIXED" | "PERCENT",
	valueMinorOrPercent: number,
): number => {
	if (remainingMinor <= 0 || type === "NONE") return 0;
	if (type === "FIXED") return valueMinorOrPercent;
	return Math.floor((remainingMinor * valueMinorOrPercent) / 100);
};

// ---------- identifiers ----------

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const randomCode = (length: number, rand: () => number = Math.random): string =>
	Array.from({ length }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");

/** e.g. INV-202610-K7QH2M. Uniqueness is enforced by the DB; callers retry on collision. */
export const makeInvoiceNumber = (now: Date = new Date(), rand?: () => number): string =>
	`INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${randomCode(6, rand)}`;

export const makeReceiptNumber = (now: Date = new Date(), rand?: () => number): string =>
	`RCT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${randomCode(6, rand)}`;