import httpStatus from "http-status";
import { addDays, isBefore } from "date-fns";
import { prisma } from "../../lib/prisma.js";
import { FeeStatus, FeeType } from "../../../generated/prisma/enums.js";
import { AppError } from "../../utils/AppError.js";
import { buildInstallments } from "../../lib/Installments.js";
import {
	buildPolicyLines,
	calcOutstanding,
	calcPayable,
	linesTotal,
	makeInvoiceNo,
	round2,
} from "../../lib/billing.js";

/* Fee policy (one active policy per semester) ------------------- */

const getPolicy = async (semesterId: string) => {
	return prisma.feePolicy.findUnique({ where: { semesterId } });
};

const upsertPolicy = async (payload: {
	semesterId: string;
	perCreditRate?: number;
	registrationFee?: number;
	labFee?: number;
	examFee?: number;
	libraryFee?: number;
	otherFee?: number;
	otherLabel?: string;
	installmentCount?: number;
	firstDueDate?: string;
	graceDays?: number;
	lateFeeAmount?: number;
}) => {
	const semester = await prisma.semester.findUnique({
		where: { id: payload.semesterId },
	});
	if (!semester) throw new AppError(httpStatus.NOT_FOUND, "Semester not found");

	const { semesterId, firstDueDate, ...rest } = payload;
	return prisma.feePolicy.upsert({
		where: { semesterId },
		update: { ...rest, firstDueDate: firstDueDate ? new Date(firstDueDate) : undefined },
		create: {
			semesterId,
			...rest,
			firstDueDate: firstDueDate ? new Date(firstDueDate) : undefined,
		},
	});
};

/* Itemized generation from the policy --------------------------- */

// Billable credits = ENROLLED enrollments only (dropped/withdrawn don't count,
// and the enrollment service already blocks duplicate-course enrollments).
const billableCredits = async (studentId: string, semesterId: string) => {
	const rows = await prisma.enrollment.findMany({
		where: { studentId, status: "ENROLLED", section: { semesterId } },
		include: { section: { include: { course: true } } },
	});
	return rows.reduce((sum, e) => sum + (e.section.course.creditHours ?? 0), 0);
};

const generateFromPolicy = async (semesterId: string) => {
	const semester = await prisma.semester.findUnique({ where: { id: semesterId } });
	if (!semester) throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	const policy = await prisma.feePolicy.findUnique({ where: { semesterId } });
	if (!policy) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"No fee policy for this semester yet — save one first",
		);
	}

	const count = Math.max(1, policy.installmentCount);
	const firstDue = policy.firstDueDate ?? addDays(new Date(), 14);

	const students = await prisma.studentProfile.findMany({
		where: { user: { status: "ACTIVE", isDeleted: false } },
		select: { id: true },
	});
	const billed = await prisma.fee.findMany({
		where: { semesterId },
		select: { studentId: true },
	});
	const billedIds = new Set(billed.map((f) => f.studentId));
	const toBill = students.filter((s) => !billedIds.has(s.id));

	let generatedCount = 0;
	for (const s of toBill) {
		const credits = await billableCredits(s.id, semesterId);
		const lines = buildPolicyLines(policy, credits);
		if (lines.length === 0) continue; // nothing to charge this student
		const subtotal = linesTotal(lines);
		const payable = calcPayable(subtotal, 0, 0);
		await prisma.fee
			.create({
				data: {
					studentId: s.id,
					semesterId,
					type: FeeType.TUITION,
					amount: payable,
					subtotal,
					discountAmount: 0,
					adjustmentAmount: 0,
					dueDate: firstDue,
					invoiceNo: makeInvoiceNo("INV"),
					items: { create: lines },
					installments: {
						create: buildInstallments({ total: payable, count, firstDue }),
					},
				},
			})
			.catch(() => null); // already billed concurrently — skip
		generatedCount += 1;
	}

	return { generatedCount, totalActiveStudents: students.length, installmentCount: count };
};

/* Adjustment & cancellation (admin, unpaid invoices only) -------- */

const paidOf = (fee: { installments: { status: string; amount: number }[] }) =>
	round2(
		fee.installments
			.filter((i) => i.status === FeeStatus.PAID)
			.reduce((sum, i) => sum + i.amount, 0),
	);

const adjustFee = async (
	feeId: string,
	payload: { discountAmount?: number; adjustmentAmount?: number; reason: string },
) => {
	const fee = await prisma.fee.findUnique({
		where: { id: feeId },
		include: { installments: { include: { payment: true } } },
	});
	if (!fee) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");
	if (fee.status === FeeStatus.CANCELLED) {
		throw new AppError(httpStatus.BAD_REQUEST, "A cancelled invoice cannot be adjusted");
	}
	if (paidOf(fee) > 0 || fee.installments.some((i) => i.payment && ["PAID", "REFUNDED"].includes(i.payment.status))) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This invoice already has payments — adjust it only before anything is paid",
		);
	}

	const discount = payload.discountAmount ?? fee.discountAmount;
	const adjustment = payload.adjustmentAmount ?? fee.adjustmentAmount;
	const payable = calcPayable(fee.subtotal || fee.amount, discount, adjustment);
	const firstDue = fee.dueDate ?? addDays(new Date(), 14);
	const count = Math.max(1, fee.installments.length);

	return prisma.$transaction(async (tx) => {
		// Abandoned (never-paid) attempts are safe to drop with the old rows.
		await tx.payment.deleteMany({
			where: { installment: { feeId }, status: { notIn: ["PAID", "REFUNDED"] } },
		});
		await tx.installment.deleteMany({ where: { feeId } });
		return tx.fee.update({
			where: { id: feeId },
			data: {
				amount: payable,
				discountAmount: discount,
				adjustmentAmount: adjustment,
				notes: `Adjustment: ${payload.reason}`,
				installments: {
					create: buildInstallments({ total: payable, count, firstDue }),
				},
			},
			include: { installments: true, items: true },
		});
	});
};

const cancelFee = async (feeId: string, reason: string) => {
	const fee = await prisma.fee.findUnique({
		where: { id: feeId },
		include: { installments: true },
	});
	if (!fee) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");
	if (fee.status === FeeStatus.CANCELLED) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invoice is already cancelled");
	}
	if (paidOf(fee) > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This invoice has payments — refund the installments instead of cancelling",
		);
	}
	return prisma.fee.update({
		where: { id: feeId },
		data: { status: FeeStatus.CANCELLED, cancelledAt: new Date(), notes: `Cancelled: ${reason}` },
	});
};

/* Reports -------------------------------------------------------- */

const feeWithPaid = {
	semester: true,
	installments: { include: { payment: true }, orderBy: { number: "asc" as const } },
	items: true,
};

const outstandingDues = async (semesterId?: string) => {
	const fees = await prisma.fee.findMany({
		where: {
			status: { notIn: [FeeStatus.PAID, FeeStatus.CANCELLED] },
			...(semesterId ? { semesterId } : {}),
		},
		include: {
			...feeWithPaid,
			student: { include: { user: { select: { name: true, email: true } } } },
		},
		orderBy: { createdAt: "desc" },
	});
	return fees.map((f) => {
		const paid = paidOf(f);
		return {
			feeId: f.id,
			invoiceNo: f.invoiceNo,
			type: f.type,
			student: f.student.user.name,
			email: f.student.user.email,
			studentIdCode: f.student.studentIdCode,
			semester: f.semester?.name ?? "Admission",
			payable: f.amount,
			paid,
			outstanding: calcOutstanding(f.amount, paid),
			status: f.status,
		};
	});
};

const overdueInstallments = async (semesterId?: string) => {
	const now = new Date();
	const rows = await prisma.installment.findMany({
		where: {
			status: { not: FeeStatus.PAID },
			dueDate: { lt: now },
			fee: {
				status: { not: FeeStatus.CANCELLED },
				...(semesterId ? { semesterId } : {}),
			},
		},
		include: {
			fee: {
				include: {
					semester: true,
					student: { include: { user: { select: { name: true, email: true } } } },
				},
			},
		},
		orderBy: { dueDate: "asc" },
	});
	return rows.map((i) => ({
		installmentId: i.id,
		number: i.number,
		amount: i.amount,
		dueDate: i.dueDate,
		overdue: isBefore(i.dueDate, now),
		invoiceNo: i.fee.invoiceNo,
		student: i.fee.student.user.name,
		email: i.fee.student.user.email,
		semester: i.fee.semester?.name ?? "Admission",
	}));
};

const collectionSummary = async (semesterId?: string) => {
	const fees = await prisma.fee.findMany({
		where: {
			status: { not: FeeStatus.CANCELLED },
			...(semesterId ? { semesterId } : {}),
		},
		include: { installments: true },
	});
	let collected = 0;
	let outstanding = 0;
	const byStatus: Record<string, number> = {};
	const byType: Record<string, { collected: number; outstanding: number }> = {};
	for (const f of fees) {
		const paid = paidOf(f);
		collected = round2(collected + paid);
		outstanding = round2(outstanding + calcOutstanding(f.amount, paid));
		byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
		const t = (byType[f.type] ??= { collected: 0, outstanding: 0 });
		t.collected = round2(t.collected + paid);
		t.outstanding = round2(t.outstanding + calcOutstanding(f.amount, paid));
	}
	return { invoices: fees.length, collected, outstanding, byStatus, byType };
};

/* Admission fee setting ------------------------------------------ */

const getAdmissionFeeSetting = async () => {
	const row = await prisma.systemSetting.findFirst();
	return {
		amount: row?.admissionFeeAmount ?? null,
		applicationFeeAmount: row?.applicationFeeAmount ?? null,
		admissionInstallmentCount: row?.admissionInstallmentCount ?? 1,
	};
};

const setAdmissionFeeSetting = async (
	amount: number | null,
	extra?: { applicationFeeAmount?: number | null; admissionInstallmentCount?: number },
) => {
	const existing = await prisma.systemSetting.findFirst();
	const data = {
		admissionFeeAmount: amount,
		...(extra?.applicationFeeAmount !== undefined ? { applicationFeeAmount: extra.applicationFeeAmount } : {}),
		...(extra?.admissionInstallmentCount !== undefined
			? { admissionInstallmentCount: Math.max(1, Math.min(12, extra.admissionInstallmentCount)) }
			: {}),
	};
	if (!existing) return prisma.systemSetting.create({ data });
	return prisma.systemSetting.update({ where: { id: existing.id }, data });
};

export const InvoiceService = {
	getPolicy,
	upsertPolicy,
	generateFromPolicy,
	adjustFee,
	cancelFee,
	outstandingDues,
	overdueInstallments,
	collectionSummary,
	getAdmissionFeeSetting,
	setAdmissionFeeSetting,
};
