import { describe, expect, it } from "vitest";
import {
	allocatePayment,
	applyDelta,
	BillingError,
	buildInstallments,
	buildInvoiceItems,
	computeLateFee,
	computePayable,
	computeWaiverAdjustments,
	deriveInvoiceStatus,
	effectiveInstallmentStatus,
	fromMinor,
	isAdmissionPaymentSettled,
	makeInvoiceNumber,
	outstandingMinor,
	pickPolicy,
	reverseAllocations,
	toMinor,
	type IPolicyLike,
} from "./billing.js";

const NOW = new Date("2027-01-01T00:00:00Z");
const FUTURE = new Date("2027-02-01T00:00:00Z");

const policy = (o: Partial<IPolicyLike>): IPolicyLike => ({
	invoiceType: "SEMESTER",
	itemType: "TUITION",
	calcMethod: "FLAT",
	amountMinor: 0,
	isRefundable: false,
	departmentId: null,
	semesterId: null,
	effectiveFrom: new Date("2026-01-01"),
	effectiveTo: null,
	isActive: true,
	...o,
});

const ctx = { departmentId: "cse", semesterId: "s1", at: NOW };
const sum = (xs: { amountMinor: number }[]) => xs.reduce((a, b) => a + b.amountMinor, 0);
const plan = (o = {}) => ({
	count: 4,
	advanceType: "NONE" as const,
	advanceMinorOrPercent: null,
	customPercents: null,
	intervalMonths: 1,
	firstDue: FUTURE,
	...o,
});

describe("money helpers", () => {
	it("round-trips minor units", () => {
		expect(toMinor("16750.00")).toBe(1675000);
		expect(toMinor(0.1 + 0.2)).toBe(30);
		expect(fromMinor(1675000)).toBe("16750.00");
	});
});

describe("fee calculation", () => {
	it("tuition = credits x per-credit rate; spec example totals 67,000", () => {
		const items = buildInvoiceItems(
			[
				policy({ itemType: "TUITION", calcMethod: "PER_CREDIT", amountMinor: 500000 }), // 5,000/credit
				policy({ itemType: "REGISTRATION", amountMinor: 500000 }),
				policy({ itemType: "LABORATORY", amountMinor: 200000 }),
			],
			{ invoiceType: "SEMESTER", ctx, credits: 12 },
		);
		expect(items.find((i) => i.itemType === "TUITION")!.amountMinor).toBe(6000000);
		expect(sum(items)).toBe(6700000);
	});

	it("skips per-credit items when credits = 0", () => {
		const items = buildInvoiceItems(
			[policy({ calcMethod: "PER_CREDIT", amountMinor: 500000 })],
			{ invoiceType: "SEMESTER", ctx, credits: 0 },
		);
		expect(items).toHaveLength(0);
	});

	it("supplementary invoices bill tuition only", () => {
		const items = buildInvoiceItems(
			[
				policy({ itemType: "TUITION", calcMethod: "PER_CREDIT", amountMinor: 500000 }),
				policy({ itemType: "REGISTRATION", amountMinor: 500000 }),
			],
			{ invoiceType: "SEMESTER", ctx, credits: 3, onlyTuition: true },
		);
		expect(items.map((i) => i.itemType)).toEqual(["TUITION"]);
		expect(sum(items)).toBe(1500000);
	});

	it("most specific policy wins; expired and inactive ones are ignored", () => {
		const global = policy({ id: "g", amountMinor: 100 });
		const dept = policy({ id: "d", departmentId: "cse", amountMinor: 200 });
		const deptSem = policy({ id: "ds", departmentId: "cse", semesterId: "s1", amountMinor: 300 });
		const expired = policy({ id: "x", departmentId: "cse", semesterId: "s1", amountMinor: 999, effectiveTo: new Date("2026-06-01") });
		const inactive = policy({ id: "i", departmentId: "cse", semesterId: "s1", amountMinor: 888, isActive: false });
		const other = policy({ id: "o", departmentId: "eee", amountMinor: 777 });
		expect(pickPolicy([global, dept, deptSem, expired, inactive, other], "TUITION", ctx)!.id).toBe("ds");
		expect(pickPolicy([global, other], "TUITION", ctx)!.id).toBe("g");
	});

	it("old invoices don't change when rates change (snapshot is the item itself)", () => {
		const before = buildInvoiceItems([policy({ calcMethod: "PER_CREDIT", amountMinor: 500000 })], { invoiceType: "SEMESTER", ctx, credits: 10 });
		const after = buildInvoiceItems([policy({ calcMethod: "PER_CREDIT", amountMinor: 600000 })], { invoiceType: "SEMESTER", ctx, credits: 10 });
		expect(sum(before)).toBe(5000000);
		expect(sum(after)).toBe(6000000);
	});
});

describe("id card fee billing", () => {
	const admissionPolicies = [
		policy({ invoiceType: "ADMISSION", itemType: "ADMISSION", amountMinor: 500000 }),
		policy({ invoiceType: "ADMISSION", itemType: "ID_CARD", amountMinor: 10000 }),
		policy({ invoiceType: "ADMISSION", itemType: "CAUTION_DEPOSIT", amountMinor: 300000 }),
	];

	it("the admission invoice never carries an ID card fee - it is billed separately", () => {
		const items = buildInvoiceItems(admissionPolicies, {
			invoiceType: "ADMISSION",
			ctx,
			excludeItemTypes: ["ID_CARD"],
		});
		expect(items.map((i) => i.itemType)).toEqual(["ADMISSION", "CAUTION_DEPOSIT"]);
		expect(sum(items)).toBe(800000);
	});

	it("without the exclusion the ID card fee would ride on the admission invoice", () => {
		const items = buildInvoiceItems(admissionPolicies, {
			invoiceType: "ADMISSION",
			ctx,
		});
		expect(items.map((i) => i.itemType)).toContain("ID_CARD");
	});

	it("the ID card invoice picks the ID_CARD item whatever invoice type the policy was filed under", () => {
		const items = buildInvoiceItems(admissionPolicies, {
			invoiceType: "ID_CARD",
			ctx,
			itemTypes: ["ID_CARD"],
		});
		expect(items).toHaveLength(1);
		expect(items[0].itemType).toBe("ID_CARD");
		expect(items[0].amountMinor).toBe(10000);
		expect(items[0].description).toBe("ID Card Fee");
	});
});

describe("waivers", () => {
	it("applies percent then fixed, capped at tuition", () => {
		const adj = computeWaiverAdjustments(1000000, [
			{ type: "SCHOLARSHIP", name: "Merit", percent: 50, fixedMinor: null },
			{ type: "WAIVER", name: "Hardship", percent: null, fixedMinor: 700000 },
		]);
		expect(adj.map((a) => a.amountMinor)).toEqual([-500000, -500000]); // second capped
	});
	it("never goes below zero payable", () => {
		expect(() => computePayable(100, 200, 0)).toThrow(BillingError);
		expect(computePayable(6700000, 500000, 0)).toBe(6200000);
	});
});

describe("installments", () => {
	it("4 equal installments of the spec example = 16,750 each", () => {
		const s = buildInstallments(6700000, plan(), NOW);
		expect(s.map((i) => i.amountMinor)).toEqual([1675000, 1675000, 1675000, 1675000]);
	});

	it("sum always equals total, even with awkward remainders", () => {
		for (const total of [1, 99, 100001, 6666667, 1234567]) {
			for (const count of [1, 2, 3, 5, 7, 12]) {
				const s = buildInstallments(total, plan({ count }), NOW);
				expect(sum(s)).toBe(total);
			}
		}
	});

	it("fixed advance becomes installment #1, rest split equally", () => {
		const s = buildInstallments(6700000, plan({ count: 4, advanceType: "FIXED", advanceMinorOrPercent: 2000000 }), NOW);
		expect(s[0].amountMinor).toBe(2000000);
		expect(sum(s)).toBe(6700000);
		expect(s.map((i) => i.amountMinor)).toEqual([2000000, 1566666, 1566666, 1566668]); // last absorbs the remainder
	});

	it("percent advance and custom percents both sum exactly", () => {
		expect(sum(buildInstallments(1000001, plan({ advanceType: "PERCENT", advanceMinorOrPercent: 30 }), NOW))).toBe(1000001);
		const custom = buildInstallments(1000001, plan({ customPercents: [40, 20, 20, 20] }), NOW);
		expect(sum(custom)).toBe(1000001);
		expect(custom[0].amountMinor).toBe(400000);
	});

	it("rejects bad plans", () => {
		expect(() => buildInstallments(100, plan({ count: 0 }), NOW)).toThrow(BillingError);
		expect(() => buildInstallments(100, plan({ customPercents: [50, 50] }), NOW)).toThrow(BillingError);
		expect(() => buildInstallments(100, plan({ customPercents: [50, 20, 20, 20] }), NOW)).toThrow(BillingError);
	});

	it("monthly due dates; late joiners get past dues pushed forward, never backwards", () => {
		const s = buildInstallments(400, plan({ firstDue: new Date("2026-12-01") }), NOW);
		expect(s[0].dueDate.getTime()).toBeGreaterThan(NOW.getTime());
		for (let i = 1; i < s.length; i++) {
			expect(s[i].dueDate.getTime()).toBeGreaterThanOrEqual(s[i - 1].dueDate.getTime());
		}
	});
});

describe("allocation, refunds and deltas", () => {
	const sched = [
		{ number: 1, amountMinor: 1000, paidMinor: 0 },
		{ number: 2, amountMinor: 1000, paidMinor: 0 },
		{ number: 3, amountMinor: 1000, paidMinor: 0 },
	];

	it("partial payment fills the oldest installment first", () => {
		expect(allocatePayment(sched, 400)).toEqual({ allocations: [{ number: 1, amountMinor: 400 }], excessMinor: 0 });
	});
	it("overflow spills to the next installment; overpayment shows up as excess", () => {
		expect(allocatePayment(sched, 1500).allocations).toEqual([{ number: 1, amountMinor: 1000 }, { number: 2, amountMinor: 500 }]);
		expect(allocatePayment(sched, 5000).excessMinor).toBe(2000);
	});
	it("refund reverses newest allocation first", () => {
		expect(reverseAllocations([{ number: 1, allocatedMinor: 1000 }, { number: 2, allocatedMinor: 500 }], 700)).toEqual([
			{ number: 2, amountMinor: 500 },
			{ number: 1, amountMinor: 200 },
		]);
		expect(() => reverseAllocations([{ number: 1, allocatedMinor: 100 }], 200)).toThrow(BillingError);
	});
	it("negative delta trims unpaid tail and keeps total consistent; refuses to cut into paid money", () => {
		const out = applyDelta([{ number: 1, amountMinor: 1000, paidMinor: 1000 }, { number: 2, amountMinor: 1000, paidMinor: 0 }], -600);
		expect(out.map((i) => i.amountMinor)).toEqual([1000, 400]);
		expect(() => applyDelta([{ number: 1, amountMinor: 1000, paidMinor: 1000 }], -1)).toThrow(BillingError);
	});
	it("positive delta goes to the last installment", () => {
		expect(applyDelta(sched, 250)[2].amountMinor).toBe(1250);
	});
});

describe("statuses and late fees", () => {
	it("overdue is derived from due date + grace + balance; pending gateway txns never count", () => {
		const i = { amountMinor: 1000, paidMinor: 0, dueDate: new Date("2026-12-25") };
		expect(effectiveInstallmentStatus(i, NOW, 0)).toBe("OVERDUE");
		expect(effectiveInstallmentStatus(i, NOW, 30)).toBe("PENDING");
		expect(effectiveInstallmentStatus({ ...i, paidMinor: 400 }, NOW, 0)).toBe("OVERDUE");
		expect(effectiveInstallmentStatus({ ...i, paidMinor: 1000 }, NOW, 0)).toBe("PAID");
	});
	it("invoice status transitions", () => {
		expect(deriveInvoiceStatus(1000, 0, false)).toBe("UNPAID");
		expect(deriveInvoiceStatus(1000, 1, false)).toBe("PARTIALLY_PAID");
		expect(deriveInvoiceStatus(1000, 1000, false)).toBe("PAID");
		expect(deriveInvoiceStatus(1000, 1000, true)).toBe("CANCELLED");
		expect(outstandingMinor(1000, 1200)).toBe(0);
	});
	it("late fee: fixed vs percent of remaining", () => {
		expect(computeLateFee(1000, "FIXED", 50)).toBe(50);
		expect(computeLateFee(1000, "PERCENT", 5)).toBe(50);
		expect(computeLateFee(0, "FIXED", 50)).toBe(0);
		expect(computeLateFee(1000, "NONE", 50)).toBe(0);
	});
	it("invoice numbers look right", () => {
		expect(makeInvoiceNumber(new Date("2027-03-05"), () => 0)).toBe("INV-202703-AAAAAA");
	});
});

describe("admission payment gate", () => {
	it("blocks a confirmed-but-unpaid admission when the live flag is ON", () => {
		// The exact bug: admission was confirmed while the flag was OFF, the
		// admin then turned the flag ON, and the student could still enroll.
		expect(isAdmissionPaymentSettled({ paymentRequired: true, invoiceStatus: "UNPAID" })).toBe(false);
		expect(isAdmissionPaymentSettled({ paymentRequired: true, invoiceStatus: "PARTIALLY_PAID" })).toBe(false);
	});

	it("passes once the admission invoice is PAID", () => {
		expect(isAdmissionPaymentSettled({ paymentRequired: true, invoiceStatus: "PAID" })).toBe(true);
	});

	it("flag OFF means payment is not required, whatever the invoice says", () => {
		for (const status of ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED", null]) {
			expect(isAdmissionPaymentSettled({ paymentRequired: false, invoiceStatus: status })).toBe(true);
		}
	});

	it("a CANCELLED invoice carries no obligation; a missing one defers to the confirmed check", () => {
		expect(isAdmissionPaymentSettled({ paymentRequired: true, invoiceStatus: "CANCELLED" })).toBe(true);
		expect(isAdmissionPaymentSettled({ paymentRequired: true, invoiceStatus: null })).toBe(true);
	});
});