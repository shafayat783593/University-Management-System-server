/**
 * Shared DB-side billing helpers used by invoice, payment and enrollment
 * services. The arithmetic itself lives in billing.ts (pure + unit tested);
 * this file only loads rows, writes rows and keeps invoice totals in sync.
 */
import { addDays } from "date-fns";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client.js";
import {
	AdjustmentType,
	InvoiceStatus,
	type InvoiceType,
} from "../../generated/prisma/enums.js";
import { AppError } from "../utils/AppError.js";
import {
	BillingError,
	buildInstallments,
	computePayable,
	deriveInvoiceStatus,
	fromMinor,
	makeInvoiceNumber,
	pickPolicy,
	toMinor,
	type IInstallmentPlan,
	type IInvoiceItemDraft,
	type IPolicyLike,
	type IWaiverAdjustment,
} from "./billing.js";

export type Db = Prisma.TransactionClient;

/** BillingError (pure lib) -> 400 AppError (what the API returns). */
export const asAppError = (e: unknown): never => {
	if (e instanceof BillingError) throw new AppError(httpStatus.BAD_REQUEST, e.message);
	throw e;
};

// ---------- plan snapshot (stored on the invoice, never recomputed) ----------

export interface IPlanSnapshot {
	policyId: string | null;
	name: string;
	count: number;
	advanceType: "NONE" | "PERCENT" | "FIXED";
	advanceValue: number | null; // percent, or minor units for FIXED
	customPercents: number[] | null;
	intervalMonths: number;
	firstDueDate: string | null;
	firstDueOffsetDays: number;
	graceDays: number;
	lateFeeType: "NONE" | "FIXED" | "PERCENT";
	lateFeeValue: number; // percent, or minor units for FIXED
	allowPartialPayment: boolean;
	restrictOnOverdue: boolean;
}

/** Used for APPLICATION / ADMISSION invoices and when no installment policy exists. */
export const SINGLE_PAYMENT_PLAN: IPlanSnapshot = {
	policyId: null,
	name: "Single payment",
	count: 1,
	advanceType: "NONE",
	advanceValue: null,
	customPercents: null,
	intervalMonths: 1,
	firstDueDate: null,
	firstDueOffsetDays: 7,
	graceDays: 0,
	lateFeeType: "NONE",
	lateFeeValue: 0,
	allowPartialPayment: false,
	restrictOnOverdue: true,
};

export const loadPolicies = async (db: Db): Promise<(IPolicyLike & { id: string })[]> => {
	const rows = await db.feePolicy.findMany({ where: { isActive: true } });
	return rows.map((r) => ({
		id: r.id,
		invoiceType: r.invoiceType,
		itemType: r.itemType,
		calcMethod: r.calcMethod,
		amountMinor: toMinor(r.amount),
		isRefundable: r.isRefundable,
		departmentId: r.departmentId,
		semesterId: r.semesterId,
		effectiveFrom: r.effectiveFrom,
		effectiveTo: r.effectiveTo,
		isActive: r.isActive,
	}));
};

/** Semester-specific active policy first, then the default one, else a single full payment. */
export const resolvePlanSnapshot = async (
	db: Db,
	semesterId: string | null,
): Promise<IPlanSnapshot> => {
	const row =
		(semesterId
			? await db.installmentPolicy.findFirst({ where: { semesterId, isActive: true } })
			: null) ??
		(await db.installmentPolicy.findFirst({
			where: { isDefault: true, isActive: true },
			orderBy: { createdAt: "desc" },
		}));
	if (!row) return SINGLE_PAYMENT_PLAN;

	const advance = row.advanceValue ? Number(row.advanceValue.toString()) : null;
	return {
		policyId: row.id,
		name: row.name,
		count: row.installmentCount,
		advanceType: row.advanceType,
		advanceValue:
			advance === null ? null : row.advanceType === "FIXED" ? toMinor(advance) : advance,
		customPercents: Array.isArray(row.customPercents)
			? (row.customPercents as number[])
			: null,
		intervalMonths: row.intervalMonths,
		firstDueDate: row.firstDueDate ? row.firstDueDate.toISOString() : null,
		firstDueOffsetDays: row.firstDueOffsetDays,
		graceDays: row.graceDays,
		lateFeeType: row.lateFeeType,
		lateFeeValue:
			row.lateFeeType === "FIXED" ? toMinor(row.lateFeeValue) : Number(row.lateFeeValue.toString()),
		allowPartialPayment: row.allowPartialPayment,
		restrictOnOverdue: row.restrictOnOverdue,
	};
};

export const readPlanSnapshot = (json: unknown): IPlanSnapshot => {
	const p = (json as { plan?: IPlanSnapshot } | null)?.plan;
	return p ?? SINGLE_PAYMENT_PLAN;
};

const toPlan = (s: IPlanSnapshot, issueDate: Date): IInstallmentPlan => ({
	count: s.count,
	advanceType: s.advanceType,
	advanceMinorOrPercent: s.advanceValue,
	customPercents: s.customPercents,
	intervalMonths: s.intervalMonths,
	firstDue: s.firstDueDate
		? new Date(s.firstDueDate)
		: addDays(issueDate, s.firstDueOffsetDays),
});

// ---------- invoice creation ----------

export interface ICreateInvoiceInput {
	type: InvoiceType;
	studentId: string;
	semesterId: string | null;
	items: IInvoiceItemDraft[];
	waivers: IWaiverAdjustment[];
	plan: IPlanSnapshot;
	billedCredits: number;
	createdById?: string | null;
	extraSnapshot?: Record<string, unknown>;
}

const uniqueInvoiceNumber = async (db: Db): Promise<string> => {
	for (let i = 0; i < 5; i++) {
		const n = makeInvoiceNumber();
		if (!(await db.feeInvoice.findUnique({ where: { invoiceNumber: n } }))) return n;
	}
	throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Could not allocate an invoice number");
};

/** Creates invoice + items + waiver adjustments + installments in the caller's transaction. */
export const createInvoiceRecord = async (db: Db, input: ICreateInvoiceInput) => {
	try {
		const issueDate = new Date();
		const subtotal = input.items.reduce((a, i) => a + i.amountMinor, 0);
		const discount = -input.waivers.reduce((a, w) => a + w.amountMinor, 0);
		const payable = computePayable(subtotal, discount, 0);
		const installments = buildInstallments(payable, toPlan(input.plan, issueDate), issueDate);
		const dueDate = installments[installments.length - 1].dueDate;

		return await db.feeInvoice.create({
			data: {
				invoiceNumber: await uniqueInvoiceNumber(db),
				type: input.type,
				studentId: input.studentId,
				semesterId: input.semesterId,
				status: payable === 0 ? InvoiceStatus.PAID : InvoiceStatus.UNPAID,
				subtotal: fromMinor(subtotal),
				discountTotal: fromMinor(discount),
				payableAmount: fromMinor(payable),
				billedCredits: input.billedCredits,
				issueDate,
				dueDate,
				createdById: input.createdById ?? null,
				policySnapshot: {
					plan: input.plan,
					items: input.items,
					waivers: input.waivers,
					generatedAt: issueDate.toISOString(),
					...input.extraSnapshot,
				} as unknown as Prisma.InputJsonValue,
				items: {
					create: input.items.map((i) => ({
						itemType: i.itemType as never,
						description: i.description,
						quantity: i.quantity,
						unitAmount: fromMinor(i.unitMinor),
						amount: fromMinor(i.amountMinor),
						isRefundable: i.isRefundable,
						policyId: i.policyId ?? null,
					})),
				},
				adjustments: {
					create: input.waivers.map((w) => ({
						type: w.type as AdjustmentType,
						amount: fromMinor(w.amountMinor),
						reason: w.reason,
						createdById: input.createdById ?? null,
					})),
				},
				installments: {
					create: installments.map((i) => ({
						number: i.number,
						amount: fromMinor(i.amountMinor),
						dueDate: i.dueDate,
						status: payable === 0 ? ("PAID" as const) : ("PENDING" as const),
					})),
				},
			},
			include: { items: true, installments: true, adjustments: true },
		});
	} catch (e) {
		return asAppError(e);
	}
};

// ---------- locking + recompute ----------

/** Serialises every money-moving operation on one invoice (row lock until the tx ends). */
export const lockInvoice = async (db: Db, invoiceId: string) => {
	const rows = await db.$queryRaw<{ id: string }[]>`
		SELECT id FROM fee_invoices WHERE id = ${invoiceId} FOR UPDATE`;
	if (rows.length === 0) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");
};

/** Per-key advisory lock, released at the end of the transaction. */
export const advisoryLock = async (db: Db, key: string) => {
	await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
};

/**
 * Re-derives subtotal / discount / adjustment / payable / paid / status from
 * the child rows, then checks the invariant sum(installments) === payable.
 * If that invariant ever breaks the transaction is aborted rather than
 * persisting a ledger that doesn't add up.
 */
export const recomputeInvoice = async (db: Db, invoiceId: string) => {
	const inv = await db.feeInvoice.findUnique({
		where: { id: invoiceId },
		include: { items: true, adjustments: true, installments: true },
	});
	if (!inv) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");

	const subtotal = inv.items.reduce((a, i) => a + toMinor(i.amount), 0);
	const reductionTypes: AdjustmentType[] = [
		AdjustmentType.WAIVER,
		AdjustmentType.SCHOLARSHIP,
		AdjustmentType.DISCOUNT,
	];
	let discount = 0;
	let adjustment = 0;
	for (const a of inv.adjustments) {
		const m = toMinor(a.amount);
		if (reductionTypes.includes(a.type)) discount += -m;
		else adjustment += m;
	}
	const payable = computePayable(subtotal, discount, adjustment);
	const installmentSum = inv.installments.reduce((a, i) => a + toMinor(i.amount), 0);
	if (installmentSum !== payable) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			`Ledger mismatch on ${inv.invoiceNumber}: installments ${installmentSum} != payable ${payable}`,
		);
	}
	const paid = inv.installments.reduce((a, i) => a + toMinor(i.paidAmount), 0);

	return db.feeInvoice.update({
		where: { id: invoiceId },
		data: {
			subtotal: fromMinor(subtotal),
			discountTotal: fromMinor(discount),
			adjustmentTotal: fromMinor(adjustment),
			payableAmount: fromMinor(payable),
			paidAmount: fromMinor(paid),
			status: deriveInvoiceStatus(payable, paid, inv.status === InvoiceStatus.CANCELLED),
		},
	});
};

// ---------- public fee preview (what a prospective student will be charged) ----------

export interface IFeeScheduleLine {
	itemType: string;
	label: string;
	calcMethod: "FLAT" | "PER_CREDIT";
	amount: number; // per credit for PER_CREDIT, else the flat amount
	isRefundable: boolean;
}

/** Rate card for one department/semester, resolved exactly like invoice generation does. */
export const getFeeSchedule = async (
	db: Db,
	invoiceType: InvoiceType,
	departmentId: string,
	semesterId: string | null,
): Promise<IFeeScheduleLine[]> => {
	const policies = (await loadPolicies(db)).filter((p) => p.invoiceType === invoiceType);
	const ctx = { departmentId, semesterId, at: new Date() };
	const types = [...new Set(policies.map((p) => p.itemType))];
	const lines: IFeeScheduleLine[] = [];
	for (const itemType of types) {
		const p = pickPolicy(policies, itemType, ctx);
		if (!p) continue;
		lines.push({
			itemType,
			label: itemType.replace(/_/g, " ").toLowerCase(),
			calcMethod: p.calcMethod,
			amount: p.amountMinor / 100,
			isRefundable: p.isRefundable,
		});
	}
	return lines;
};