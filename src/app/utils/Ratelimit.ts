

import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { RateLimiterRedis } from "rate-limiter-flexible";
import { AppError } from "../utils/AppError.js";


export const rateLimit = (limiter: RateLimiterRedis) => {
	return async (req: Request, _res: Response, next: NextFunction) => {
		const key = req.ip ?? "unknown";

		try {
			await limiter.consume(key);
			next();
		} catch (rejection) {
			if (
				rejection &&
				typeof rejection === "object" &&
				"msBeforeNext" in rejection
			) {
				const secondsLeft = Math.ceil(
					(rejection as { msBeforeNext: number }).msBeforeNext / 1000,
				);
				next(
					new AppError(
						httpStatus.TOO_MANY_REQUESTS,
						`Too many attempts. Try again in ${secondsLeft} seconds.`,
					),
				);
				return;
			}
			next(rejection as Error);
		}
	};
};