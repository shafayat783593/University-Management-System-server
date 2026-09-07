import httpStatus from "http-status";
import { format, isBefore } from "date-fns";
import ejs from "ejs";
import path from "path";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { FeeStatus, PaymentStatus } from "../../../generated/prisma/enums.js";
import { bkashClient } from "../../lib/bkash.js";
import config from "../../config/index.js";
import { PaymentWhereInput } from "../../../generated/prisma/models.js";
import { IQuary } from "../../interface/index.js";
import { transporter } from "../../lib/nodmailer.js";


interface IInitBkashPaymentPayload {
	feeId: string;
}

const initBkashPayment = async (
	userId: string,
	payload: IInitBkashPaymentPayload,
) => {
	const student = await prisma.studentProfile.findUnique({
		where: { 
			userId
		 },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const fee = await prisma.fee.findUnique({
		where: { id: payload.feeId },
	});
	if (!fee) {
		throw new AppError(httpStatus.NOT_FOUND, "Fee record not found");
	}
	if (fee.studentId !== student.id) {
		throw new AppError(httpStatus.FORBIDDEN, "This fee does not belong to you");
	}
	if (fee.status === FeeStatus.PAID) {
		throw new AppError(httpStatus.CONFLICT, "This fee has already been paid");
	}

	const bkashResponse = await bkashClient.createPayment({
		amount: fee.amount,
		invoiceNumber: fee.id,
		callbackURL: `${config.bkash_callback_url}/payments/bkash/callback`,
	});

	await prisma.payment.upsert({
		where: { feeId: fee.id },
		create: {
			feeId: fee.id,
			paymentId: bkashResponse.paymentID,
			amount: fee.amount,
			status: PaymentStatus.PENDING,
		},
		update: {
			paymentId: bkashResponse.paymentID,
			status: PaymentStatus.PENDING,
			trxId: null,
			paidAt: null,
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


	const executeResult = await bkashClient.executePayment(paymentID);

	const updatedPayment = await prisma.$transaction(async (tx) => {
		await tx.fee.update({
			where: { id: paymentRecord.feeId },
			data: { status: FeeStatus.PAID },
		});

		return tx.payment.update({
			where: { id: paymentRecord.id },
			data: {
				status: PaymentStatus.PAID,
				trxId: executeResult.trxID,
				paidAt: new Date(),
				gatewayResponse: executeResult as object,
			},
		});
	});

	
	const feeWithStudent = await prisma.fee.findUnique({
		where: { id: paymentRecord.feeId },
		include: { student: { include: { user: true } }, semester: true },
	});

	if (feeWithStudent) {
		const templatePath = path.join(
			process.cwd(),
			"src/app/templates/payment-confirmation.ejs",
		);
		const html = await ejs.renderFile(templatePath, {
			name: feeWithStudent.student.user.name,
			semesterName: feeWithStudent.semester.name,
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
			.catch(() => null); // don't let an email failure surface as a payment failure
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
		andConditions.push({
			OR: [
				{ trxId: { contains: query.searchTerm, mode: "insensitive" } },
				{ paymentId: { contains: query.searchTerm, mode: "insensitive" } },
				{
					fee: {
						student: {
							studentIdCode: { contains: query.searchTerm, mode: "insensitive" },
						},
					},
				},
				{
					fee: {
						student: {
							user: { name: { contains: query.searchTerm, mode: "insensitive" } },
						},
					},
				},
				{
					fee: {
						student: {
							user: { email: { contains: query.searchTerm, mode: "insensitive" } },
						},
					},
				},
				{
					fee: {
						semester: { name: { contains: query.searchTerm, mode: "insensitive" } },
					},
				},
			],
		});
	}

	if (query.studentId) {
		andConditions.push({ fee: { studentId: query.studentId } });
	}

	if (query.semesterId) {
		andConditions.push({ fee: { semesterId: query.semesterId } });
	}

	const payments = await prisma.payment.findMany({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			fee: {
				include: {
					student: { include: { user: { omit: { password: true } } } },
					semester: true,
				},
			},
		},
	});

	const totalPaymentCount = await prisma.payment.count({
		where: { AND: andConditions.length > 0 ? andConditions : undefined },
	});

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

const getMyFees = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	return prisma.fee.findMany({
		where: { studentId: student.id },
		include: { semester: true, payment: true },
		orderBy: { createdAt: "desc" },
	});
};


const cancelPayment = async (userId: string, feeId: string) => {
	const student = await prisma.studentProfile.findUnique({
		where: { userId },
	});
	if (!student) {
		throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	}

	const fee = await prisma.fee.findUnique({
		where: { id: feeId },
		include: { semester: true, payment: true },
	});
	if (!fee) {
		throw new AppError(httpStatus.NOT_FOUND, "Fee record not found");
	}
	if (fee.studentId !== student.id) {
		throw new AppError(httpStatus.FORBIDDEN, "This fee does not belong to you");
	}
	if (!fee.payment || fee.payment.status !== PaymentStatus.PAID) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This fee has no completed payment to cancel",
		);
	}

	const isEligibleForRefund = fee.semester.enrollmentEnd
		? isBefore(new Date(), fee.semester.enrollmentEnd)
		: false;

	if (!isEligibleForRefund) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Refund window has closed — this semester's add/drop deadline has passed",
		);
	}

	const refundResult = await bkashClient.refundPayment({
		paymentID: fee.payment.paymentId,
		trxID: fee.payment.trxId as string,
		amount: fee.payment.amount,
		sku: "Semester Fee Cancellation",
		reason: "Student requested fee cancellation",
	});

	const [updatedPayment] = await prisma.$transaction([
		prisma.payment.update({
			where: { id: fee.payment.id },
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
		}),
		prisma.fee.update({
			where: { id: fee.id },
			data: { status: FeeStatus.PENDING },
		}),
	]);

	return { payment: updatedPayment };
};

export const PaymentService = {
	initBkashPayment,
	bkashCallback,
	getAllPayments,
	getMyFees,
	cancelPayment,
};