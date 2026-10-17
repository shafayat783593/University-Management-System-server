import { format } from "date-fns";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";
import { Prisma } from "../../../generated/prisma/client.js";
import {
	InstallmentStatus,
	InvoiceStatus,
	InvoiceType,
	RefundStatus,
	Role,
	TransactionStatus,
} from "../../../generated/prisma/enums.js";
import type { PaymentTransactionWhereInput } from "../../../generated/prisma/models.js";
import { confirmAdmission, sendAdmissionConfirmedEmail } from "../../lib/admission.js";
import { AuditLogLite } from "../../lib/audit.js";
import {
	fromMinor,
	makeReceiptNumber,
	nextInstallmentRemaining,
	planPayment,
	randomCode,
	reverseAllocations,
	storedInstallmentStatus,
	toMinor,
	allocatePayment,
} from "../../lib/billing.js";
import { bkashClient } from "../../lib/bkash.js";
import {
	asAppError,
	lockInvoice,
	readPlanSnapshot,
	recomputeInvoice,
} from "../../lib/invoiceCore.js";
import { transporter } from "../../lib/nodmailer.js";
import { pdfGenerator } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";
import config from "../../config/index.js";
import { IQuary } from "../../interface/index.js";
import { AppError } from "../../utils/AppError.js";
import type { IInitPaymentPayload, IRefundPayload } from "./payment.interface.js";

interface IActor {
	userId: string;
	role: Role;
}

const n = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : 0);

const getStudentOrThrow = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({ where: { userId } });
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	return student;
};

const showTransaction = <T extends { amount: unknown; excessAmount: unknown; refundedAmount: unknown }>(
	t: T,
) => ({
	...t,
	amount: n(t.amount as never),
	excessAmount: n(t.excessAmount as never),
	refundedAmount: n(t.refundedAmount as never),
});

// ---------------------------------------------------------------------------
// 1. Initiate
// ---------------------------------------------------------------------------

/**
 * Creates the bKash payment AND our PaymentTransaction (INITIATED) holding
 * bKash's paymentID. The amount is decided here from the server's own
 * schedule — the client can only ask for an amount, and it is validated
 * against what is actually owed and the invoice's partial-payment policy.
 */
const initPayment = async (userId: string, payload: IInitPaymentPayload) => {
	const student = await getStudentOrThrow(userId);

	const invoice = await prisma.feeInvoice.findUnique({
		where: { id: payload.invoiceId },
		include: { installments: true },
	});
	// same response for "not yours" and "doesn't exist" so ids can't be probed
	if (!invoice || invoice.studentId !== student.id) {
		throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");
	}
	if (invoice.status === InvoiceStatus.CANCELLED) {
		throw new AppError(httpStatus.CONFLICT, "This invoice was cancelled");
	}
	if (invoice.status === InvoiceStatus.PAID) {
		throw new AppError(httpStatus.CONFLICT, "This invoice is already fully paid");
	}

	const schedule = invoice.installments.map((i) => ({
		number: i.number,
		amountMinor: toMinor(i.amount),
		paidMinor: toMinor(i.paidAmount),
	}));
	const plan = readPlanSnapshot(invoice.policySnapshot);

	const amountMinor = payload.amount
		? toMinor(payload.amount)
		: (nextInstallmentRemaining(schedule)?.remainingMinor ?? 0);
	try {
		planPayment(schedule, amountMinor, plan.allowPartialPayment);
	} catch (e) {
		return asAppError(e);
	}

	const bkash = await bkashClient.createPayment({
		amount: amountMinor / 100,
		invoiceNumber: `${invoice.invoiceNumber}-${randomCode(4)}`,
		callbackURL: config.bkash_callback_url,
	});

	const transaction = await prisma.paymentTransaction.create({
		data: {
			invoiceId: invoice.id,
			studentId: student.id,
			gatewayPaymentId: bkash.paymentID,
			amount: fromMinor(amountMinor),
			status: TransactionStatus.INITIATED,
		},
	});

	return {
		transactionId: transaction.id,
		paymentID: bkash.paymentID,
		bkashURL: bkash.bkashURL,
		amount: amountMinor / 100,
	};
};

// ---------------------------------------------------------------------------
// 2. Verify + settle (callback and manual re-verify share this path)
// ---------------------------------------------------------------------------

interface IGatewayResult {
	trxID: string;
	paymentID?: string;
	amount: string;
	currency?: string;
	transactionStatus: string;
}

/**
 * Confirms with bKash that the money was really captured. Tries `execute`
 * (the normal first step after the redirect); if that fails — most often
 * because a duplicate callback already executed it — falls back to a
 * server-to-server status query. Only a "Completed" answer counts.
 */
const confirmWithGateway = async (paymentID: string): Promise<IGatewayResult | null> => {
	try {
		return await bkashClient.executePayment(paymentID);
	} catch {
		try {
			const status = await bkashClient.queryPayment(paymentID);
			return status.transactionStatus === "Completed" ? status : null;
		} catch {
			return null;
		}
	}
};

/**
 * Books a gateway-confirmed payment against the invoice, atomically and
 * idempotently:
 *  - the invoice row is locked, so concurrent callbacks/verifies queue up
 *  - an already-SUCCESS transaction is returned untouched (no double count)
 *  - the captured amount is what bKash says, never what the client claims
 *  - anything that can't be allocated (invoice cancelled meanwhile, amount
 *    mismatch, overpayment race) is recorded as `excessAmount` so it can be
 *    refunded instead of silently disappearing
 */
const settleTransaction = async (transactionId: string, gw: IGatewayResult) => {
	const capturedMinor = toMinor(gw.amount);

	const outcome = await prisma.$transaction(
		async (tx) => {
			const row = await tx.paymentTransaction.findUniqueOrThrow({
				where: { id: transactionId },
			});
			await lockInvoice(tx, row.invoiceId);

			const fresh = await tx.paymentTransaction.findUniqueOrThrow({
				where: { id: transactionId },
			});
			if (fresh.status === TransactionStatus.SUCCESS || fresh.status === TransactionStatus.REFUNDED) {
				return { alreadyDone: true as const, transaction: fresh, newlyConfirmed: false, invoiceId: fresh.invoiceId };
			}

			const invoice = await tx.feeInvoice.findUniqueOrThrow({
				where: { id: fresh.invoiceId },
				include: { installments: true },
			});

			const expectedMinor = toMinor(fresh.amount);
			const mismatch =
				capturedMinor !== expectedMinor ||
				(gw.paymentID !== undefined && gw.paymentID !== fresh.gatewayPaymentId) ||
				(gw.currency !== undefined && gw.currency !== fresh.currency);

			let allocations: { number: number; amountMinor: number }[] = [];
			let excessMinor = capturedMinor;
			if (!mismatch && invoice.status !== InvoiceStatus.CANCELLED) {
				const result = allocatePayment(
					invoice.installments.map((i) => ({
						number: i.number,
						amountMinor: toMinor(i.amount),
						paidMinor: toMinor(i.paidAmount),
					})),
					capturedMinor,
				);
				allocations = result.allocations;
				excessMinor = result.excessMinor;
			}

			for (const a of allocations) {
				const inst = invoice.installments.find((i) => i.number === a.number)!;
				const newPaid = toMinor(inst.paidAmount) + a.amountMinor;
				await tx.installment.update({
					where: { id: inst.id },
					data: {
						paidAmount: fromMinor(newPaid),
						status: storedInstallmentStatus(toMinor(inst.amount), newPaid) as InstallmentStatus,
					},
				});
				await tx.paymentAllocation.create({
					data: {
						transactionId: fresh.id,
						installmentId: inst.id,
						amount: fromMinor(a.amountMinor),
					},
				});
			}

			const updated = await tx.paymentTransaction.update({
				where: { id: fresh.id },
				data: {
					status: TransactionStatus.SUCCESS,
					amount: fromMinor(capturedMinor), // what bKash actually captured
					gatewayTrxId: gw.trxID,
					receiptNumber: makeReceiptNumber(),
					completedAt: new Date(),
					excessAmount: fromMinor(excessMinor),
					gatewayResponse: gw as unknown as Prisma.InputJsonValue,
					failureReason: mismatch
						? `Gateway mismatch: expected ${expectedMinor / 100}, captured ${capturedMinor / 100}`
						: invoice.status === InvoiceStatus.CANCELLED
							? "Invoice was cancelled before the payment was confirmed"
							: null,
				},
			});

			const recomputed = await recomputeInvoice(tx, invoice.id);

			let newlyConfirmed = false;
			if (invoice.type === InvoiceType.ADMISSION && recomputed.status === InvoiceStatus.PAID) {
				newlyConfirmed = (await confirmAdmission(tx, invoice.studentId)).newlyConfirmed;
			}

			return { alreadyDone: false as const, transaction: updated, newlyConfirmed, invoiceId: invoice.id };
		},
		{ timeout: 20000 },
	);

	if (!outcome.alreadyDone) {
		if (toMinor(outcome.transaction.excessAmount) > 0) {
			console.error(
				`[payments] ${outcome.transaction.id}: ৳${n(outcome.transaction.excessAmount)} captured but not allocated — needs a refund`,
			);
		}
		void sendPaymentConfirmation(outcome.transaction.id);
		if (outcome.newlyConfirmed) void sendAdmissionConfirmedEmail(outcome.transaction.studentId);
	}
	return outcome.transaction;
};

const sendPaymentConfirmation = async (transactionId: string) => {
	try {
		const t = await prisma.paymentTransaction.findUnique({
			where: { id: transactionId },
			include: {
				invoice: { include: { semester: { select: { name: true } } } },
				student: { include: { user: true } },
			},
		});
		if (!t || !t.receiptNumber) return;

		const label =
			t.invoice.type === InvoiceType.SEMESTER
				? `${t.invoice.semester?.name ?? "Semester"} fees`
				: t.invoice.type === InvoiceType.ADMISSION
					? "Admission fees"
					: "Application fee";
		const html = await ejs.renderFile(
			path.join(process.cwd(), "src/app/templates/payment-confirmation.ejs"),
			{
				name: t.student.user.name,
				semesterName: label,
				amount: n(t.amount),
				trxId: t.gatewayTrxId,
				receiptNumber: t.receiptNumber,
				invoiceNumber: t.invoice.invoiceNumber,
				outstanding: Math.max(toMinor(t.invoice.payableAmount) - toMinor(t.invoice.paidAmount), 0) / 100,
				paidAt: format(t.completedAt ?? new Date(), "dd MMM yyyy, hh:mm a"),
			},
		);
		await transporter.sendMail({
			from: config.email_sender,
			to: t.student.user.email,
			subject: `Payment Receipt ${t.receiptNumber}`,
			html,
		});
	} catch {
		// the payment is already committed; a failed email must not undo or hide it
	}
};

/** bKash redirects the browser here. No auth possible — the transaction is found by bKash's paymentID. */
const bkashCallback = async (paymentID: string, status: string) => {
	if (!paymentID) throw new AppError(httpStatus.BAD_REQUEST, "Missing paymentID");
	if (!status) throw new AppError(httpStatus.BAD_REQUEST, "Missing status");

	const transaction = await prisma.paymentTransaction.findUnique({
		where: { gatewayPaymentId: paymentID },
	});
	if (!transaction) {
		throw new AppError(httpStatus.BAD_REQUEST, "No matching payment attempt found for this paymentID");
	}

	if (transaction.status === TransactionStatus.SUCCESS || transaction.status === TransactionStatus.REFUNDED) {
		return { success: true, message: "Payment already recorded", transactionId: transaction.id };
	}

	if (status !== "success") {
		await prisma.paymentTransaction.updateMany({
			where: {
				id: transaction.id,
				status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] },
			},
			data: {
				status: status === "cancel" ? TransactionStatus.CANCELLED : TransactionStatus.FAILED,
				failureReason: `Gateway reported: ${status}`,
			},
		});
		return { success: false, message: `Payment ${status}`, transactionId: transaction.id };
	}

	// in flight — NOT counted as paid until bKash confirms below
	await prisma.paymentTransaction.updateMany({
		where: { id: transaction.id, status: TransactionStatus.INITIATED },
		data: { status: TransactionStatus.PENDING },
	});

	const gw = await confirmWithGateway(paymentID);
	if (!gw) {
		await prisma.paymentTransaction.updateMany({
			where: { id: transaction.id, status: TransactionStatus.PENDING },
			data: { status: TransactionStatus.FAILED, failureReason: "bKash did not confirm the payment" },
		});
		return { success: false, message: "Payment could not be verified", transactionId: transaction.id };
	}

	const settled = await settleTransaction(transaction.id, gw);
	return {
		success: true,
		message: "Payment successful",
		transactionId: settled.id,
		receiptNumber: settled.receiptNumber,
	};
};

/**
 * Re-checks a stuck INITIATED/PENDING transaction with bKash (student closed
 * the tab before the callback, callback request failed, …). Safe to call any
 * number of times — settling is idempotent.
 */
const verifyTransaction = async (transactionId: string, actor: IActor) => {
	const transaction = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
	if (!transaction) throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");

	if (actor.role === Role.STUDENT) {
		const student = await getStudentOrThrow(actor.userId);
		if (transaction.studentId !== student.id) {
			throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
		}
	}
	if (transaction.status === TransactionStatus.SUCCESS || transaction.status === TransactionStatus.REFUNDED) {
		return showTransaction(transaction);
	}

	const gw = await bkashClient.queryPayment(transaction.gatewayPaymentId);
	if (gw.transactionStatus === "Completed") {
		return showTransaction(await settleTransaction(transaction.id, gw));
	}
	return { ...showTransaction(transaction), gatewayStatus: gw.transactionStatus };
};

// ---------------------------------------------------------------------------
// 3. Refunds (admin)
// ---------------------------------------------------------------------------

const refundTransaction = async (actor: IActor, transactionId: string, payload: IRefundPayload) => {
	const reverseCharge = payload.reverseCharge ?? true;

	// Step 1 — reserve the refund amount under the invoice lock so two admins
	// clicking at once can't refund the same money twice.
	const reserved = await prisma.$transaction(async (tx) => {
		const t0 = await tx.paymentTransaction.findUnique({ where: { id: transactionId } });
		if (!t0) throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
		await lockInvoice(tx, t0.invoiceId);

		const t = await tx.paymentTransaction.findUniqueOrThrow({
			where: { id: transactionId },
			include: { allocations: true, refunds: true },
		});
		if (t.status !== TransactionStatus.SUCCESS) {
			throw new AppError(httpStatus.CONFLICT, `Only successful payments can be refunded (this one is ${t.status})`);
		}
		if (!t.gatewayTrxId) throw new AppError(httpStatus.CONFLICT, "Payment has no gateway transaction id");

		const reservedMinor = t.refunds
			.filter((r) => r.status === RefundStatus.PENDING || r.status === RefundStatus.SUCCESS)
			.reduce((a, r) => a + toMinor(r.amount), 0);
		const refundableMinor = toMinor(t.amount) - reservedMinor;
		const amountMinor = payload.amount ? toMinor(payload.amount) : refundableMinor;

		if (amountMinor <= 0) throw new AppError(httpStatus.CONFLICT, "Nothing left to refund on this payment");
		if (amountMinor > refundableMinor) {
			throw new AppError(httpStatus.BAD_REQUEST, `Refund exceeds the refundable amount (৳${refundableMinor / 100})`);
		}
		if (reverseCharge) {
			const allocated = t.allocations.reduce((a, x) => a + toMinor(x.amount), 0);
			if (amountMinor > allocated) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Refund exceeds the amount applied to the invoice — use reverseCharge=false to return an excess payment",
				);
			}
		}

		const refund = await tx.refund.create({
			data: {
				transactionId,
				amount: fromMinor(amountMinor),
				reason: payload.reason,
				reverseCharge,
				status: RefundStatus.PENDING,
				requestedById: actor.userId,
			},
		});
		return { refund, amountMinor, paymentID: t.gatewayPaymentId, trxID: t.gatewayTrxId };
	});

	// Step 2 — talk to bKash OUTSIDE any DB transaction.
	let gateway: Awaited<ReturnType<typeof bkashClient.refundPayment>>;
	try {
		gateway = await bkashClient.refundPayment({
			paymentID: reserved.paymentID,
			trxID: reserved.trxID,
			amount: reserved.amountMinor / 100,
			sku: "Fee Refund",
			reason: payload.reason,
		});
	} catch (e) {
		await prisma.refund.update({
			where: { id: reserved.refund.id },
			data: { status: RefundStatus.FAILED, gatewayResponse: { error: String(e) } },
		});
		throw e;
	}

	// Step 3 — book it.
	const updated = await prisma.$transaction(async (tx) => {
		const t0 = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } });
		await lockInvoice(tx, t0.invoiceId);

		const claimed = await tx.refund.updateMany({
			where: { id: reserved.refund.id, status: RefundStatus.PENDING },
			data: {
				status: RefundStatus.SUCCESS,
				gatewayRefundTrxId: gateway.refundTrxID,
				gatewayResponse: gateway as unknown as Prisma.InputJsonValue,
				completedAt: new Date(),
			},
		});
		if (claimed.count === 0) return tx.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId } });

		const t = await tx.paymentTransaction.findUniqueOrThrow({
			where: { id: transactionId },
			include: { allocations: { include: { installment: true } } },
		});

		if (reserved.refund.reverseCharge) {
			let plan: { number: number; amountMinor: number }[];
			try {
				plan = reverseAllocations(
					t.allocations.map((a) => ({ number: a.installment.number, allocatedMinor: toMinor(a.amount) })),
					reserved.amountMinor,
				);
			} catch (e) {
				return asAppError(e);
			}
			for (const r of plan) {
				const alloc = t.allocations.find((a) => a.installment.number === r.number)!;
				const inst = alloc.installment;
				const newPaid = toMinor(inst.paidAmount) - r.amountMinor;
				await tx.installment.update({
					where: { id: inst.id },
					data: {
						paidAmount: fromMinor(newPaid),
						status: storedInstallmentStatus(toMinor(inst.amount), newPaid) as InstallmentStatus,
					},
				});
				await tx.paymentAllocation.update({
					where: { id: alloc.id },
					data: { amount: fromMinor(toMinor(alloc.amount) - r.amountMinor) },
				});
			}
		}

		const refundedMinor = toMinor(t.refundedAmount) + reserved.amountMinor;
		const full = refundedMinor >= toMinor(t.amount);
		const result = await tx.paymentTransaction.update({
			where: { id: transactionId },
			data: {
				refundedAmount: fromMinor(refundedMinor),
				status: full ? TransactionStatus.REFUNDED : TransactionStatus.SUCCESS,
			},
		});
		await tx.feeInvoice.update({
			where: { id: t.invoiceId },
			data: { refundedAmount: { increment: fromMinor(reserved.amountMinor) } },
		});
		await recomputeInvoice(tx, t.invoiceId);
		await AuditLogLite.write(
			actor.userId,
			"PAYMENT_REFUNDED",
			"PaymentTransaction",
			transactionId,
			{ refunded: n(t.refundedAmount) },
			{ refunded: refundedMinor / 100, reverseCharge: reserved.refund.reverseCharge },
			payload.reason,
			tx,
		);
		return result;
	});

	return showTransaction(updated);
};

// ---------------------------------------------------------------------------
// 4. Reads: history, admin list, receipt, collection report
// ---------------------------------------------------------------------------

const TX_INCLUDE = {
	invoice: {
		select: {
			id: true,
			invoiceNumber: true,
			type: true,
			semester: { select: { id: true, name: true } },
		},
	},
	allocations: { select: { amount: true, installment: { select: { number: true } } } },
	refunds: { orderBy: { createdAt: "desc" as const } },
};

const getMyPayments = async (userId: string, query: IQuary) => {
	const student = await getStudentOrThrow(userId);
	const rows = await prisma.paymentTransaction.findMany({
		where: {
			studentId: student.id,
			status: (query.status as TransactionStatus) || undefined,
			invoiceId: query.invoiceId || undefined,
		},
		include: TX_INCLUDE,
		orderBy: { initiatedAt: "desc" },
	});
	return rows.map(showTransaction);
};

const getTransactionById = async (id: string, actor: IActor) => {
	const t = await prisma.paymentTransaction.findUnique({ where: { id }, include: TX_INCLUDE });
	if (!t) throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
	if (actor.role === Role.STUDENT) {
		const student = await getStudentOrThrow(actor.userId);
		if (t.studentId !== student.id) throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
	}
	return showTransaction(t);
};

const getAllPayments = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;

	const and: PaymentTransactionWhereInput[] = [];
	if (query.status) and.push({ status: query.status as TransactionStatus });
	if (query.studentId) and.push({ studentId: query.studentId });
	if (query.semesterId) and.push({ invoice: { semesterId: query.semesterId } });
	if (query.departmentId) and.push({ student: { departmentId: query.departmentId } });
	if (query.searchTerm) {
		const contains = { contains: query.searchTerm, mode: "insensitive" as const };
		and.push({
			OR: [
				{ gatewayTrxId: contains },
				{ gatewayPaymentId: contains },
				{ receiptNumber: contains },
				{ invoice: { invoiceNumber: contains } },
				{ student: { studentIdCode: contains } },
				{ student: { user: { name: contains } } },
				{ student: { user: { email: contains } } },
			],
		});
	}
	const where: PaymentTransactionWhereInput = { AND: and.length ? and : undefined };

	const [rows, total] = await Promise.all([
		prisma.paymentTransaction.findMany({
			where,
			include: {
				...TX_INCLUDE,
				student: {
					select: {
						studentIdCode: true,
						department: { select: { name: true } },
						user: { select: { name: true, email: true } },
					},
				},
			},
			orderBy: { initiatedAt: "desc" },
			take: limit,
			skip: (page - 1) * limit,
		}),
		prisma.paymentTransaction.count({ where }),
	]);

	return {
		data: rows.map(showTransaction),
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

const getReceiptPdf = async (id: string, actor: IActor) => {
	const t = await prisma.paymentTransaction.findUnique({
		where: { id },
		include: {
			invoice: { include: { semester: { select: { name: true } }, items: true } },
			allocations: { select: { amount: true, installment: { select: { number: true } } } },
			student: {
				include: { user: { select: { name: true, email: true } }, department: { select: { name: true } } },
			},
		},
	});
	if (!t) throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
	if (actor.role === Role.STUDENT) {
		const student = await getStudentOrThrow(actor.userId);
		if (t.studentId !== student.id) throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
	}
	if (!t.receiptNumber || (t.status !== TransactionStatus.SUCCESS && t.status !== TransactionStatus.REFUNDED)) {
		throw new AppError(httpStatus.CONFLICT, "A receipt is only available for successful payments");
	}

	const buffer = await pdfGenerator.generateReceiptPdf({
		receiptNumber: t.receiptNumber,
		invoiceNumber: t.invoice.invoiceNumber,
		invoiceType: t.invoice.type,
		semesterName: t.invoice.semester?.name ?? null,
		studentName: t.student.user.name,
		studentIdCode: t.student.studentIdCode,
		departmentName: t.student.department.name,
		gatewayTrxId: t.gatewayTrxId ?? "-",
		paidAt: format(t.completedAt ?? t.createdAt, "dd MMM yyyy, hh:mm a"),
		amount: n(t.amount),
		refundedAmount: n(t.refundedAmount),
		excessAmount: n(t.excessAmount),
		invoiceTotal: n(t.invoice.payableAmount),
		invoicePaid: n(t.invoice.paidAmount),
		allocations: t.allocations
			.map((a) => ({ installment: a.installment.number, amount: n(a.amount) }))
			.sort((a, b) => a.installment - b.installment),
		items: t.invoice.items.map((i) => ({ description: i.description, amount: n(i.amount) })),
	});
	return { buffer, receiptNumber: t.receiptNumber };
};

/** Money actually kept = captured − refunded, grouped by semester and department. */
const getCollectionReport = async (query: IQuary) => {
	const rows = await prisma.paymentTransaction.findMany({
		where: {
			status: { in: [TransactionStatus.SUCCESS, TransactionStatus.REFUNDED] },
			invoice: { semesterId: query.semesterId || undefined },
			student: { departmentId: query.departmentId || undefined },
			completedAt:
				query.from || query.to
					? {
							gte: query.from ? new Date(query.from) : undefined,
							lte: query.to ? new Date(query.to) : undefined,
						}
					: undefined,
		},
		select: {
			amount: true,
			refundedAmount: true,
			invoice: { select: { type: true, semester: { select: { id: true, name: true } } } },
			student: { select: { department: { select: { id: true, name: true } } } },
		},
	});

	const bySemester = new Map<string, { semester: string; collected: number; refunded: number; count: number }>();
	const byDepartment = new Map<string, { department: string; collected: number; refunded: number; count: number }>();
	let collected = 0;
	let refunded = 0;

	for (const r of rows) {
		const a = toMinor(r.amount);
		const f = toMinor(r.refundedAmount);
		collected += a;
		refunded += f;

		const sKey = r.invoice.semester?.id ?? r.invoice.type;
		const s = bySemester.get(sKey) ?? { semester: r.invoice.semester?.name ?? r.invoice.type, collected: 0, refunded: 0, count: 0 };
		s.collected += a; s.refunded += f; s.count += 1;
		bySemester.set(sKey, s);

		const d = byDepartment.get(r.student.department.id) ?? { department: r.student.department.name, collected: 0, refunded: 0, count: 0 };
		d.collected += a; d.refunded += f; d.count += 1;
		byDepartment.set(r.student.department.id, d);
	}

	const fmt = <T extends { collected: number; refunded: number }>(x: T) => ({
		...x,
		collected: x.collected / 100,
		refunded: x.refunded / 100,
		net: (x.collected - x.refunded) / 100,
	});
	return {
		totals: fmt({ collected, refunded, count: rows.length }),
		bySemester: [...bySemester.values()].map(fmt),
		byDepartment: [...byDepartment.values()].map(fmt),
	};
};

export const PaymentService = {
	initPayment,
	bkashCallback,
	verifyTransaction,
	refundTransaction,
	getMyPayments,
	getTransactionById,
	getAllPayments,
	getReceiptPdf,
	getCollectionReport,
};