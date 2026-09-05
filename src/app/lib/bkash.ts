import httpStatus from "http-status";
import { redisClient } from "./redis.js";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";

const ID_TOKEN_KEY = "bkash:id-token";
const REFRESH_TOKEN_KEY = "bkash:refresh-token";

// bKash id_token is valid ~3600s — refresh a bit early.
const ID_TOKEN_TTL_SECONDS = 3300;

const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 23;

interface IBkashGrantResponse {
	id_token: string;
	refresh_token?: string;
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

const cacheTokens = async (data: IBkashGrantResponse) => {
	await redisClient.set(ID_TOKEN_KEY, data.id_token, {
			expiration: { type: "EX", value: ID_TOKEN_TTL_SECONDS },
		})
		.catch(() => null);

	if (data.refresh_token) {
		await redisClient
			.set(REFRESH_TOKEN_KEY, data.refresh_token, {
				expiration: { type: "EX", value: REFRESH_TOKEN_TTL_SECONDS },
			})
			.catch(() => null);
	}
};

// 

const refreshGrantToken = async (refreshToken: string): Promise<string> => {
	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/token/refresh`,
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
				refresh_token: refreshToken,
			}),
		},
	);

	const data = (await response.json()) as IBkashGrantResponse;
	if (!response.ok || !data.id_token) {
		throw new AppError(httpStatus.BAD_GATEWAY, "Failed to refresh bKash grant token");
	}

	await cacheTokens(data);
	return data.id_token;
};

const getGrantToken = async (): Promise<string> => {
	const cachedIdToken = await redisClient.get(ID_TOKEN_KEY).catch(() => null);
	if (cachedIdToken) return cachedIdToken;

	const cachedRefreshToken = await redisClient
		.get(REFRESH_TOKEN_KEY)
		.catch(() => null);

	if (cachedRefreshToken) {
		try {
			return await refreshGrantToken(cachedRefreshToken);
		} catch {
		
		}
	}




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

	await cacheTokens(data);
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

	const createpaymentresponse = {
		paymentID: data.paymentID,
		bkashURL: data.bkashURL,
	};
	console.log("createpaymentresponse", createpaymentresponse);
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
	console.log("executePayment data", data);

	return data;
};

export const bkashClient = {
	getGrantToken,
	createPayment,
	executePayment,
};