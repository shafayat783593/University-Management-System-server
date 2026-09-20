

import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { RateLimiterRedis } from "rate-limiter-flexible";
import { AppError } from "../utils/AppError.js";

/**
 * rate-limiter-flexible's `.consume()` rejects with a RateLimiterRes
 * object (has `msBeforeNext`) when the limit is exceeded — that's the
 * only case that should become a 429. A genuine Redis/network error
 * rejects with something else and should surface as a real error
 * instead of silently pretending to be "too many requests".
 */
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