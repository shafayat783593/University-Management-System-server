import httpStatus from "http-status";
import { format, isBefore } from "date-fns";
import ejs from "ejs";
import path from "path";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { FeeStatus, FeeType, PaymentStatus } from "../../../generated/prisma/enums.js";
import { bkashClient } from "../../lib/bkash.js";
import config from "../../config/index.js";
import { PaymentWhereInput } from "../../../generated/prisma/models.js";
import { IQuary } from "../../interface/index.js";
import { transporter } from "../../lib/nodmailer.js";
import { syncFeeStatus } from "../../lib/Installments.js";

interface IInitBkashPaymentPayload {
	installmentId: string;
}



const initBkashPayment = async (
	userId: string,
	payload: IInitBkashPaymentPayload,
) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const installment = await prisma.installment.findUnique({
		where: { id: payload.installmentId },
		include: { fee: true },
	});
	if (!installment) {
		throw new AppError(httpStatus.NOT_FOUND, "Installment not found");
	}
	if (installment.fee.studentId !== student.id) {
		throw new AppError(httpStatus.FORBIDDEN, "This installment does not belong to you");
	}
	if (installment.status === FeeStatus.PAID) {
		throw new AppError(httpStatus.CONFLICT, "This installment has already been paid");
	}

	// Pay in order: installment #3 can't be paid while #2 is still open.
	const earlierUnpaid = await prisma.installment.findFirst({
		where: {
			feeId: installment.feeId,
			number: { lt: installment.number },
			status: { not: FeeStatus.PAID },
		},
		orderBy: { number: "asc" },
	});
	if (earlierUnpaid) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Please pay installment ${earlierUnpaid.number} first`,
		);
	}

	const bkashResponse = await bkashClient.createPayment({
		amount: installment.amount,
		invoiceNumber: installment.id,
		callbackURL: config.bkash_callback_url,
	});

	// paymentID <-> installment link lives in the DB (Payment.paymentId,
	// unique). upsert handles retries: a cancelled/failed attempt, or a
	// refunded installment being paid again, overwrites the old row.
	await prisma.payment.upsert({
		where: { installmentId: installment.id },
		create: {
			installmentId: installment.id,
			paymentId: bkashResponse.paymentID,
			amount: installment.amount,
			status: PaymentStatus.PENDING,
		},
		update: {
			paymentId: bkashResponse.paymentID,
			amount: installment.amount,
			status: PaymentStatus.PENDING,
			trxId: null,
			paidAt: null,
			refundTrxId: null,
			refundAt: null,
			refundAmount: null,
			reason: null,
		},
	});

	return {
		bkashURL: bkashResponse.bkashURL,
		paymentID: bkashResponse.paymentID,
	};
};

const bkashCallback = async (paymentID: string, status: string) => {
	if (!paymentID) {
		throw new AppError(httpStatus.BAD_REQUEST, "Missing paymentID");
	}
	if (!status) {
		throw new AppError(httpStatus.BAD_REQUEST, "Missing status");
	}

	const paymentRecord = await prisma.payment.findUnique({
		where: { paymentId: paymentID },
	});
	if (!paymentRecord) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"No matching payment attempt found for this paymentID",
		);
	}

	if (status !== "success") {
		await prisma.payment.update({
			where: { id: paymentRecord.id },
			data: {
				status:
					status === "cancel" ? PaymentStatus.CANCELLED : PaymentStatus.FAILED,
			},
		});
		return { success: false, message: `Payment ${status}` };
	}

	if (paymentRecord.status === PaymentStatus.PAID) {
		return { success: true, message: "Already recorded as paid" };
	}

	// Execute OUTSIDE the DB transaction — it's a network call to bKash,
	// keeping it out of the transaction keeps the transaction's lock
	// window short (matches the Healthcare pattern's comment on this).
	const executeResult = await bkashClient.executePayment(paymentID);

	const { updatedPayment, installment } = await prisma.$transaction(async (tx) => {
		const installment = await tx.installment.update({
			where: { id: paymentRecord.installmentId },
			data: { status: FeeStatus.PAID },
		});
		await syncFeeStatus(tx, installment.feeId);

		const updatedPayment = await tx.payment.update({
			where: { id: paymentRecord.id },
			data: {
				status: PaymentStatus.PAID,
				trxId: executeResult.trxID,
				paidAt: new Date(),
				gatewayResponse: executeResult as object,
			},
		});
		return { updatedPayment, installment };
	});

	// Confirmation email — outside the transaction. If sending fails,
	// that shouldn't roll back a payment that's already been captured.
	const feeWithStudent = await prisma.fee.findUnique({
		where: { id: installment.feeId },
		include: {
			student: { include: { user: true } },
			semester: true,
			_count: { select: { installments: true } },
		},
	});

	if (feeWithStudent) {
		const baseLabel = feeWithStudent.semester?.name ?? "Admission Fee";
		const label =
			feeWithStudent._count.installments > 1
				? `${baseLabel} — Installment ${installment.number} of ${feeWithStudent._count.installments}`
				: baseLabel;

		const templatePath = path.join(
			process.cwd(),
			"src/app/templates/payment-confirmation.ejs",
		);
		const html = await ejs.renderFile(templatePath, {
			name: feeWithStudent.student.user.name,
			semesterName: label,
			amount: updatedPayment.amount,
			trxId: updatedPayment.trxId,
			paidAt: format(updatedPayment.paidAt ?? new Date(), "dd MMM yyyy, hh:mm a"),
		});

		await transporter
			.sendMail({
				from: config.email_sender,
				to: feeWithStudent.student.user.email,
				subject: "Payment Confirmation — University Management System",
				html,
			})
			.catch(() => null);
	}

	return { success: true, message: "Payment successful", payment: updatedPayment };
};

const getAllPayments = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;

	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const andConditions: PaymentWhereInput[] = [];

	if (query.status) {
		andConditions.push({ status: query.status as PaymentStatus });
	}

	if (query.searchTerm) {
		const contains = { contains: query.searchTerm, mode: "insensitive" as const };
		andConditions.push({
			OR: [
				{ trxId: contains },
				{ paymentId: contains },
				{ installment: { fee: { student: { studentIdCode: contains } } } },
				{ installment: { fee: { student: { user: { name: contains } } } } },
				{ installment: { fee: { student: { user: { email: contains } } } } },
				{ installment: { fee: { semester: { name: contains } } } },
			],
		});
	}

	if (query.studentId) {
		andConditions.push({ installment: { fee: { studentId: query.studentId } } });
	}

	if (query.semesterId) {
		andConditions.push({ installment: { fee: { semesterId: query.semesterId } } });
	}

	const where = { AND: andConditions.length > 0 ? andConditions : undefined };

	const payments = await prisma.payment.findMany({
		where,
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			installment: {
				include: {
					fee: {
						include: {
							student: { include: { user: { omit: { password: true } } } },
							semester: true,
						},
					},
				},
			},
		},
	});

	const totalPaymentCount = await prisma.payment.count({ where });

	return {
		data: payments,
		meta: {
			page,
			limit,
			total: totalPaymentCount,
			totalPages: Math.ceil(totalPaymentCount / limit),
		},
	};
};

/**
 * Each fee comes with its installments (ordered) and each installment's
 * payment. `isOverdue` is derived here: PENDING and past its due date.
 */
const getMyFees = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const fees = await prisma.fee.findMany({
		where: { studentId: student.id, status: { not: FeeStatus.CANCELLED } },
		include: {
			semester: true,
			items: true,
			installments: { include: { payment: true }, orderBy: { number: "asc" } },
		},
		orderBy: { createdAt: "desc" },
	});

	const now = new Date();
	return fees.map((fee) => ({
		...fee,
		paidAmount: fee.installments
			.filter((i) => i.status === FeeStatus.PAID)
			.reduce((sum, i) => sum + i.amount, 0),
		installments: fee.installments.map((i) => ({
			...i,
			isOverdue: i.status !== FeeStatus.PAID && isBefore(i.dueDate, now),
		})),
	}));
};

/**
 * Cancels (refunds) ONE paid installment. Refund-eligibility window is
 * the semester's enrollmentEnd (add/drop deadline). The bKash refund call
 * happens OUTSIDE the DB transaction so a slow gateway doesn't hold a
 * DB lock open.
 */
const cancelPayment = async (userId: string, installmentId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const installment = await prisma.installment.findUnique({
		where: { id: installmentId },
		include: { fee: { include: { semester: true } }, payment: true },
	});
	if (!installment) {
		throw new AppError(httpStatus.NOT_FOUND, "Installment not found");
	}
	if (installment.fee.studentId !== student.id) {
		throw new AppError(httpStatus.FORBIDDEN, "This installment does not belong to you");
	}
	if (!installment.payment || installment.payment.status !== PaymentStatus.PAID) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This installment has no completed payment to cancel",
		);
	}

	if (installment.fee.type === FeeType.ADMISSION) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Admission fees are not eligible for self-service cancellation — contact the admissions office",
		);
	}

	// Refund latest-first: refunding #2 while #3 is still paid would leave a
	// hole in the payment sequence.
	const laterPaid = await prisma.installment.findFirst({
		where: {
			feeId: installment.feeId,
			number: { gt: installment.number },
			status: FeeStatus.PAID,
		},
	});
	if (laterPaid) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cancel installment ${laterPaid.number} first`,
		);
	}

	const enrollmentEnd = installment.fee.semester?.enrollmentEnd;
	if (!enrollmentEnd || !isBefore(new Date(), enrollmentEnd)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Refund window has closed — this semester's add/drop deadline has passed",
		);
	}

	const refundResult = await bkashClient.refundPayment({
		paymentID: installment.payment.paymentId,
		trxID: installment.payment.trxId as string,
		amount: installment.payment.amount,
		sku: "Semester Fee Cancellation",
		reason: "Student requested fee cancellation",
	});

	const updatedPayment = await prisma.$transaction(async (tx) => {
		const payment = await tx.payment.update({
			where: { id: installment.payment!.id },
			data: {
				status: PaymentStatus.REFUNDED,
				refundTrxId: refundResult.refundTrxID,
				refundAt: refundResult.completedTime
					? new Date(refundResult.completedTime)
					: new Date(),
				refundAmount: Number(refundResult.amount),
				reason: "Student requested fee cancellation",
				gatewayResponse: refundResult as unknown as object,
			},
		});
		await tx.installment.update({
			where: { id: installment.id },
			data: { status: FeeStatus.PENDING },
		});
		await syncFeeStatus(tx, installment.feeId);
		return payment;
	});

	return { payment: updatedPayment };
};

// Downloadable receipt for one SUCCESSFUL payment. Students can only
// see their own; admins can see any. Only PAID payments get receipts.
const downloadReceipt = async (userId: string, role: string, paymentId: string) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		include: {
			installment: {
				include: {
					fee: {
						include: {
							semester: true,
							student: { include: { user: true } },
						},
					},
				},
			},
		},
	});
	if (!payment) throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
	if (role !== "ADMIN" && payment.installment.fee.student.userId !== userId) {
		throw new AppError(httpStatus.FORBIDDEN, "This receipt does not belong to you");
	}
	if (payment.status !== PaymentStatus.PAID) {
		throw new AppError(httpStatus.BAD_REQUEST, "Only successful payments have receipts");
	}

	const fee = payment.installment.fee;
	const student = fee.student;
	const doc = new PDFDocument({ margin: 50 });
	const chunks: Buffer[] = [];
	doc.on("data", (c) => chunks.push(c));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);
	});

	doc.fontSize(20).text("Payment Receipt", { align: "center" });
	doc.moveDown();
	doc.fontSize(11);
	doc.text(`Receipt No: ${payment.trxId ?? payment.paymentId}`);
	doc.text(`Date: ${format(payment.paidAt ?? new Date(), "dd MMM yyyy, hh:mm a")}`);
	doc.moveDown();
	doc.text(`Student: ${student.user.name} (${student.studentIdCode})`);
	doc.text(`Invoice: ${fee.invoiceNo ?? fee.id} (${fee.type})`);
	doc.text(`Semester: ${fee.semester?.name ?? "Admission"}`);
	doc.text(`Installment: ${payment.installment.number}`);
	doc.moveDown();
	doc.fontSize(14).text(`Amount Paid: ৳${payment.amount.toLocaleString()}`);
	doc.fontSize(11).text(`Transaction ID: ${payment.trxId ?? "—"}`);
	doc.moveDown();
	doc.fontSize(9).fillColor("gray").text("System-generated receipt. Pending gateway transactions are never counted as paid.");
	doc.end();

	return { buffer: await done, payment };
};

export const PaymentService = {
	initBkashPayment,
	bkashCallback,
	getAllPayments,
	getMyFees,
	cancelPayment,
	downloadReceipt,
};