

import httpStatus from "http-status";
import { redisClient } from "./redis.js";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";


const GRANT_TOKEN_CACHE_KEY = "bkash:grant-token";
const GRANT_TOKEN_TTL_SECONDS = 3300;

interface IBkashGrantResponse {
	id_token: string;
}

interface IBkashCreatePaymentResponse {
	paymentID: string;
	bkashURL: string;
}

interface IBkashExecutePaymentResponse {
	transactionStatus: string;
	trxID: string;
	paymentID: string;
	amount: string;
}

const getGrantToken = async (): Promise<string> => {
	const cached = await redisClient.get(GRANT_TOKEN_CACHE_KEY).catch(() => null);
	if (cached) return cached;

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/token/grant`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				username: config.bkash_username,
				password: config.bkash_password,
			},
			body: JSON.stringify({
				app_key: config.bkash_app_key,
				app_secret: config.bkash_app_secret,
			}),
		},
	);

	const data = (await response.json()) as IBkashGrantResponse;
	if (!response.ok || !data.id_token) {
		throw new AppError(httpStatus.BAD_GATEWAY, "Failed to get bKash grant token");
	}

	await redisClient.set(GRANT_TOKEN_CACHE_KEY, data.id_token, {
		expiration: { type: "EX", value: GRANT_TOKEN_TTL_SECONDS },
	});

	return data.id_token;
};

const createPayment = async (params: {
	amount: number;
	invoiceNumber: string;
	callbackURL: string;
}): Promise<IBkashCreatePaymentResponse> => {
	const token = await getGrantToken();

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: token,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				payerReference: params.invoiceNumber,
				callbackURL: params.callbackURL,
				amount: params.amount.toString(),
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: params.invoiceNumber,
			}),
		},
	);

	const data = (await response.json()) as IBkashCreatePaymentResponse;
	if (!response.ok || !data.paymentID) {
		throw new AppError(httpStatus.BAD_GATEWAY, "Failed to create bKash payment");
	}

	return data;
};

const executePayment = async (
	paymentID: string,
): Promise<IBkashExecutePaymentResponse> => {
	const token = await getGrantToken();

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/execute`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: token,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({ paymentID }),
		},
	);

	const data = (await response.json()) as IBkashExecutePaymentResponse;
	if (!response.ok || data.transactionStatus !== "Completed") {
		throw new AppError(httpStatus.BAD_GATEWAY, "bKash payment execution failed");
	}

	return data;
};

export const bkashClient = {
	createPayment,
	executePayment,
};