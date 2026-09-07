import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import config from "../config/index.js";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";

export const globalErrorHandler = async (
	err: any,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	if (config.node_env === "development") {
		console.log("Error from Global Error Handler", err);
	}

	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let errorMessage = err.message || "Internal Server Error";
	let errorName = err.name || "Internal Server Error";
	let isSafeToExposeMessage = false;

	if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
		isSafeToExposeMessage = true;
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		isSafeToExposeMessage = true;
		if (err.code === "P2002") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Duplicate Key Error";
		} else if (err.code === "P2003") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Foreign key constraint failed";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage =
				"An operation failed because it depends on one or more records that were required but not found.";
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		isSafeToExposeMessage = true;
		if (err.errorCode === "P1000") {
			statusCode = httpStatus.UNAUTHORIZED;
			errorMessage =
				"Authentication failed against database server. Please Check Your Credentials";
		} else if (err.errorCode === "P1001") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Can't reach database server";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		statusCode = httpStatus.INTERNAL_SERVER_ERROR;
		errorMessage = "Error occurred during query execution";
		isSafeToExposeMessage = true;
	} else if (err.name === "TokenExpiredError") {
		statusCode = httpStatus.UNAUTHORIZED;
		errorMessage = "Your session has expired. Please login again.";
		isSafeToExposeMessage = true;
	} else if (err.name === "JsonWebTokenError") {
		statusCode = httpStatus.UNAUTHORIZED;
		errorMessage = "Invalid token. Please login again.";
		isSafeToExposeMessage = true;
	} else if (err instanceof AppError) {
		errorMessage = err.message;
		statusCode = err.statusCode;
		isSafeToExposeMessage = true;
	} else if (err instanceof Error) {
		errorMessage = err.message;
	}

	const canShowMessage = isSafeToExposeMessage || config.node_env === "development";
	if (!canShowMessage) {
		errorMessage = "Internal Server Error";
		errorName = "Internal Server Error";
	}

	res.status(statusCode).json({
		success: false,
		statusCode,
		name: errorName,
		message: errorMessage,
		error: config.node_env === "development" ? err : undefined,
		stack: config.node_env === "development" ? err.stack : undefined,
	});
};