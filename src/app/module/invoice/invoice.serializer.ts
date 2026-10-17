import {
	effectiveInstallmentStatus,
	isInstallmentOverdue,
	outstandingMinor,
	toMinor,
} from "../../lib/billing.js";
import { readPlanSnapshot } from "../../lib/invoiceCore.js";

type Dec = { toString(): string };

interface IInstallmentRow {
	id: string;
	number: number;
	amount: Dec;
	paidAmount: Dec;
	dueDate: Date;
	status: string;
}

export interface IInvoiceRow {
	id: string;
	invoiceNumber: string;
	type: string;
	status: string;
	subtotal: Dec;
	discountTotal: Dec;
	adjustmentTotal: Dec;
	payableAmount: Dec;
	paidAmount: Dec;
	refundedAmount: Dec;
	policySnapshot: unknown;
	installments?: IInstallmentRow[];
	items?: { amount: Dec; unitAmount: Dec; quantity: Dec }[];
	adjustments?: { amount: Dec }[];
	[k: string]: unknown;
}

const n = (d: Dec) => Number(d.toString());

/** Decimal -> number, plus derived outstanding / overdue fields. Never trusts anything client-side. */
export const serializeInvoice = (inv: IInvoiceRow, now: Date = new Date()) => {
	const plan = readPlanSnapshot(inv.policySnapshot);
	const installments = (inv.installments ?? [])
		.slice()
		.sort((a, b) => a.number - b.number)
		.map((i) => {
			const row = { amountMinor: toMinor(i.amount), paidMinor: toMinor(i.paidAmount), dueDate: i.dueDate };
			return {
				id: i.id,
				number: i.number,
				amount: n(i.amount),
				paidAmount: n(i.paidAmount),
				remaining: (row.amountMinor - row.paidMinor) / 100,
				dueDate: i.dueDate,
				status: effectiveInstallmentStatus(row, now, plan.graceDays),
				isOverdue: isInstallmentOverdue(row, now, plan.graceDays),
			};
		});

	return {
		...inv,
		subtotal: n(inv.subtotal),
		discountTotal: n(inv.discountTotal),
		adjustmentTotal: n(inv.adjustmentTotal),
		payableAmount: n(inv.payableAmount),
		paidAmount: n(inv.paidAmount),
		refundedAmount: n(inv.refundedAmount),
		outstandingBalance: outstandingMinor(toMinor(inv.payableAmount), toMinor(inv.paidAmount)) / 100,
		allowPartialPayment: plan.allowPartialPayment,
		items: inv.items?.map((i) => ({ ...i, amount: n(i.amount), unitAmount: n(i.unitAmount), quantity: n(i.quantity) })),
		adjustments: inv.adjustments?.map((a) => ({ ...a, amount: n(a.amount) })),
		installments,
	};
};