import httpStatus from "http-status";
import { InstallmentStatus, InvoiceStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../utils/AppError.js";
import { isInstallmentOverdue, toMinor } from "./billing.js";
import { readPlanSnapshot } from "./invoiceCore.js";
import { prisma } from "./prisma.js";

export interface IOverdueInstallment {
	invoiceId: string;
	invoiceNumber: string;
	installmentId: string;
	number: number;
	dueDate: Date;
	remaining: number;
}

/** Overdue = unpaid balance past dueDate + the policy's grace days (snapshotted on the invoice). */
export const getOverdueInstallments = async (
	studentId: string,
	opts: { onlyRestricting?: boolean } = {},
): Promise<IOverdueInstallment[]> => {
	const now = new Date();
	const rows = await prisma.installment.findMany({
		where: {
			status: { in: [InstallmentStatus.PENDING, InstallmentStatus.PARTIALLY_PAID] },
			dueDate: { lt: now },
			invoice: { studentId, status: { not: InvoiceStatus.CANCELLED } },
		},
		include: { invoice: { select: { id: true, invoiceNumber: true, policySnapshot: true } } },
		orderBy: { dueDate: "asc" },
	});

	return rows
		.filter((r) => {
			const plan = readPlanSnapshot(r.invoice.policySnapshot);
			if (opts.onlyRestricting && !plan.restrictOnOverdue) return false;
			return isInstallmentOverdue(
				{ amountMinor: toMinor(r.amount), paidMinor: toMinor(r.paidAmount), dueDate: r.dueDate },
				now,
				plan.graceDays,
			);
		})
		.map((r) => ({
			invoiceId: r.invoice.id,
			invoiceNumber: r.invoice.invoiceNumber,
			installmentId: r.id,
			number: r.number,
			dueDate: r.dueDate,
			remaining: (toMinor(r.amount) - toMinor(r.paidAmount)) / 100,
		}));
};

/**
 * Blocks (403) when the student has overdue installments whose policy
 * restricts access. Never applied to payment, drop or withdraw routes —
 * a student must always be able to pay what they owe.
 */
export const assertNoOverdueDues = async (studentId: string) => {
	const overdue = await getOverdueInstallments(studentId, { onlyRestricting: true });
	if (overdue.length > 0) {
		const first = overdue[0];
		throw new AppError(
			httpStatus.FORBIDDEN,
			`Overdue payment: installment ${first.number} of invoice ${first.invoiceNumber} (৳${first.remaining}) was due ${first.dueDate.toISOString().slice(0, 10)}. Clear your dues to continue.`,
		);
	}
};

/** Enrollment and semester billing need a confirmed admission (and with it, a student ID). */
export const assertAdmissionConfirmed = async (studentId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { id: studentId },
		select: { admissionConfirmedAt: true },
	});
	if (student?.admissionConfirmedAt) return;

	const application = await prisma.admissionApplication.findUnique({
		where: { studentId },
		select: { status: true },
	});
	const message = !application
		? "Submit your admission application first"
		: application.status === "SUBMITTED"
			? "Your admission application is still under review"
			: application.status === "REJECTED"
				? "Your admission application was rejected"
				: "Pay your admission invoice to confirm your admission";
	throw new AppError(httpStatus.FORBIDDEN, message);
};