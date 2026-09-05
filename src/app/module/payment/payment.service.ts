import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { FeeStatus, PaymentStatus } from "../../../generated/prisma/enums.js";
import { bkashClient } from "../../lib/bkash.js";
import config from "../../config/index.js";
import { PaymentWhereInput } from "../../../generated/prisma/models.js";
import { IQuary } from "../../interface/index.js";

interface IInitBkashPaymentPayload {
	feeId: string;
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
		callbackURL:`${config.bkash_callback_url}/payments/bkash/callback`,
		

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

	console.log("bkashCallback called with paymentID:", paymentID, "status:", status);
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

export const PaymentService = {
	initBkashPayment,
	bkashCallback,
	getAllPayments,
	getMyFees,
};