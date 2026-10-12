// Unit tests for pure billing math (src/app/lib/billing.ts).
// Run: npx vitest run src/app/lib/billing.test.ts
import { describe, expect, it } from "vitest";
import {
	buildPolicyLines,
	calcOutstanding,
	calcPayable,
	linesTotal,
	makeInvoiceNo,
	splitInstallments,
} from "./billing.js";

describe("splitInstallments", () => {
	it("splits evenly (67000 / 4 = 16750 x 4)", () => {
		expect(splitInstallments(67000, 4)).toEqual([16750, 16750, 16750, 16750]);
	});
	it("last installment absorbs rounding (100 / 3)", () => {
		const parts = splitInstallments(100, 3);
		expect(parts).toEqual([33.33, 33.33, 33.34]);
		expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
	});
	it("single installment returns the total", () => {
		expect(splitInstallments(5000, 1)).toEqual([5000]);
	});
	it("sum always equals the total", () => {
		for (const [total, count] of [[9999, 7], [12345.67, 5], [1, 12]] as const) {
			const sum = splitInstallments(total, count).reduce((a, b) => a + b, 0);
			expect(sum).toBeCloseTo(total, 2);
		}
	});
});

describe("calcPayable / calcOutstanding", () => {
	it("payable = subtotal - discount + adjustment", () => {
		expect(calcPayable(67000, 5000, 0)).toBe(62000);
		expect(calcPayable(67000, 0, 1500)).toBe(68500);
	});
	it("outstanding = payable - paid (never negative)", () => {
		expect(calcOutstanding(62000, 15500)).toBe(46500);
		expect(calcOutstanding(62000, 62000)).toBe(0);
		expect(calcOutstanding(62000, 99999)).toBe(0); // overpay can't go negative
	});
	it("pending gateway money is simply not passed in as paid", () => {
		expect(calcOutstanding(20000, 0)).toBe(20000);
	});
});

describe("buildPolicyLines", () => {
	const policy = {
		perCreditRate: 4500,
		registrationFee: 5000,
		labFee: 2000,
		examFee: 0,
		libraryFee: 500,
		otherFee: 0,
		otherLabel: null,
	};
	it("tuition = credits x rate + fixed lines", () => {
		const lines = buildPolicyLines(policy, 12);
		expect(linesTotal(lines)).toBe(12 * 4500 + 5000 + 2000 + 500);
		expect(lines[0].kind).toBe("TUITION");
	});
	it("zero charges are skipped", () => {
		const lines = buildPolicyLines(policy, 0);
		expect(lines.some((l) => l.kind === "TUITION")).toBe(false);
		expect(lines.some((l) => l.kind === "EXAM")).toBe(false);
	});
	it("a student with no credits and no fixed fees gets no lines", () => {
		expect(buildPolicyLines({ ...policy, registrationFee: 0, labFee: 0, libraryFee: 0 }, 0)).toEqual([]);
	});
});

describe("makeInvoiceNo", () => {
	it("is unique and prefixed", () => {
		const a = makeInvoiceNo();
		const b = makeInvoiceNo();
		expect(a).not.toBe(b);
		expect(a.startsWith("INV-")).toBe(true);
	});
});
