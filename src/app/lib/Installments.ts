import { addDays, addMonths, isBefore } from "date-fns";
import { prisma } from "./prisma.js";
import { FeeStatus } from "../../generated/prisma/browser.js";


// Installments whose due date has already passed by the time a student is
// billed (late enrollment) are pushed to now + this many days, so the
// student isn't born overdue. Amounts are NOT merged — each stays equal.
const LATE_JOINER_GRACE_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const buildInstallments = (params: {
	total: number;
	count: number;
	firstDue: Date;
	now?: Date;
}) => {
	const now = params.now ?? new Date();
	const n = Math.max(1, Math.floor(params.count));
	const base = Math.floor((params.total / n) * 100) / 100;

	return Array.from({ length: n }, (_, i) => {
		// last installment absorbs the rounding remainder so the sum is exact
		const amount = i === n - 1 ? round2(params.total - base * (n - 1)) : base;
		let dueDate = addMonths(params.firstDue, i);
		if (isBefore(dueDate, now)) dueDate = addDays(now, LATE_JOINER_GRACE_DAYS);
		return { number: i + 1, amount, dueDate };
	});
};

interface ISemesterBilling {
	id: string;
	feeAmount: number | null;
	installmentCount: number;
	firstInstallmentDue: Date | null;
}

/** Data for `prisma.fee.create` — Fee + its installments in one nested write. */
export const tuitionFeeCreateData = (studentId: string, s: ISemesterBilling) => {
	const total = s.feeAmount as number;
	const firstDue = s.firstInstallmentDue ?? addDays(new Date(), 14);
	return {
		studentId,
		semesterId: s.id,
		amount: total,
		dueDate: firstDue,
		installments: {
			create: buildInstallments({ total, count: s.installmentCount, firstDue }),
		},
	};
};

type Db = Pick<typeof prisma, "installment" | "fee">;

/** Fee status is always derived from its installments, never set by hand. */
export const syncFeeStatus = async (db: Db, feeId: string) => {
	const rows = await db.installment.findMany({
		where: { feeId },
		select: { status: true },
	});
	const paid = rows.filter((r) => r.status === FeeStatus.PAID).length;
	const status =
		paid === 0
			? FeeStatus.PENDING
			: paid === rows.length
				? FeeStatus.PAID
				: FeeStatus.PARTIALLY_PAID;
	return db.fee.update({ where: { id: feeId }, data: { status } });
};