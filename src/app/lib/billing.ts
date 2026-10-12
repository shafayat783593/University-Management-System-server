// Pure billing math — no DB, no imports. Unit-tested in billing.test.ts.
// Money stays in BDT as plain numbers (Float in the DB, same convention
// as the rest of the codebase). Always round to 2 decimals at the end.

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Split a total into `count` installments whose sum is EXACTLY the total.
// Every row is floored to paisa except the last, which absorbs the
// remainder (so 67000 / 4 = 16750 × 4, and 100 / 3 = 33.33 + 33.33 + 33.34).
export function splitInstallments(total: number, count: number): number[] {
	const n = Math.max(1, Math.floor(count));
	const base = Math.floor((total / n) * 100) / 100;
	return Array.from({ length: n }, (_, i) =>
		i === n - 1 ? round2(total - base * (n - 1)) : base,
	);
}

// Final payable snapshot stored on the invoice. Never recalculated later
// (except once, through the authorized adjustment endpoint).
export function calcPayable(subtotal: number, discount: number, adjustment: number) {
	return round2(subtotal - Math.max(0, discount) + adjustment);
}

// Server-side balance. Only successfully PAID money counts — a pending
// gateway transaction never reduces what the student owes.
export function calcOutstanding(payable: number, paid: number) {
	return round2(Math.max(0, payable - Math.max(0, paid)));
}

// Unique, human-readable invoice numbers. Random suffix keeps concurrent
// generations from colliding; the DB unique constraint is the backstop.
export function makeInvoiceNo(prefix = "INV") {
	const year = new Date().getFullYear();
	const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
	return `${prefix}-${year}-${rand}`;
}

export interface PolicyInput {
	perCreditRate: number;
	registrationFee: number;
	labFee: number;
	examFee: number;
	libraryFee: number;
	otherFee: number;
	otherLabel?: string | null;
}

export interface InvoiceLine {
	label: string;
	kind: "TUITION" | "REGISTRATION" | "LAB" | "EXAM" | "LIBRARY" | "ADMISSION" | "OTHER";
	amount: number;
}

// Tuition = billable registered credits × approved per-credit rate.
// Fixed charges are appended as their own lines. Zero lines are skipped
// so invoices only show what the student actually owes.
export function buildPolicyLines(policy: PolicyInput, credits: number): InvoiceLine[] {
	const lines: InvoiceLine[] = [];
	const tuition = round2(Math.max(0, credits) * Math.max(0, policy.perCreditRate));
	if (tuition > 0) {
		lines.push({ label: `Tuition (${credits} credits × ৳${policy.perCreditRate.toLocaleString()})`, kind: "TUITION", amount: tuition });
	}
	const fixed: [keyof PolicyInput, string, InvoiceLine["kind"]][] = [
		["registrationFee", "Semester Registration Fee", "REGISTRATION"],
		["labFee", "Laboratory Fee", "LAB"],
		["examFee", "Examination Fee", "EXAM"],
		["libraryFee", "Library Fee", "LIBRARY"],
	];
	for (const [key, label, kind] of fixed) {
		const amount = round2(Number(policy[key]) || 0);
		if (amount > 0) lines.push({ label, kind, amount });
	}
	const other = round2(Number(policy.otherFee) || 0);
	if (other > 0) {
		lines.push({ label: policy.otherLabel?.trim() || "Other Charges", kind: "OTHER", amount: other });
	}
	return lines;
}

export function linesTotal(lines: InvoiceLine[]) {
	return round2(lines.reduce((sum, l) => sum + l.amount, 0));
}
