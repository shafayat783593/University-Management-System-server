import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { FeeStatus } from "../../../generated/prisma/enums.js";
import { bkashClient } from "../../lib/bkash.js";
import config from "../../config/index.js";
import { redisClient } from "../../lib/redis.js";

interface IInitBkashPaymentPayload {
	feeId: string;
}
 

const PAYMENT_FEE_MAP_TTL_SECONDS = 3600;
const paymentFeeMapKey = (paymentID: string) => `bkash:payment-fee:${paymentID}`;


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
		 where: {
			 id: payload.feeId 
			}
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
		callbackURL: config.bkash_callback_url,
	});
	const paymentFreeMapKey = `bkash:payment-fee:${bkashResponse.paymentID}`;

	await redisClient.set(paymentFreeMapKey, fee.id, {
		expiration: { type: "EX", value: PAYMENT_FEE_MAP_TTL_SECONDS },
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

	if (status !== "success") {
		return { success: false, message: "Payment was cancelled or failed" };
	}

	const paymentFreeMapKey = `bkash:payment-fee:${paymentID}`;

	const feeId = await redisClient.get(paymentFreeMapKey).catch(() => null);
	if (!feeId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"No matching fee found for this payment (session may have expired)",
		);
	}

	const fee = await prisma.fee.findUnique({ where: { id: feeId } });
	if (!fee) {
		throw new AppError(httpStatus.NOT_FOUND, "Fee record not found");
	}
	if (fee.status === FeeStatus.PAID) {
		return { success: true, message: "Already recorded as paid" };
	}

	const executeResult = await bkashClient.executePayment(paymentID);

	const payment = await prisma.$transaction(async (tx) => {
		await tx.fee.update({
			where: { id: fee.id },
			data: { status: FeeStatus.PAID },
		});
		return tx.payment.create({
			data: {
				feeId: fee.id,
				trxId: executeResult.trxID,
				paymentId: paymentID,
				amount: Number(executeResult.amount),
			},
		});
	});

	await redisClient.del([paymentFeeMapKey(paymentID)]);

	return { success: true, message: "Payment successful", payment };
};

const getAllPayments = async () => {
	return prisma.payment.findMany({
		include: {
			fee: {
				include: { student: { include: { user: true } }, semester: true },
			},
		},
		orderBy: { paidAt: "desc" },
	});
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