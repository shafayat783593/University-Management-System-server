import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisClient } from "../lib/redis.js";

// Login + register (register sends an OTP — this is what stops someone
// from spamming OTP emails to one address, and stops brute-force login
// attempts). 5 attempts per 15 minutes per IP, then blocked for another
// 15 minutes.
export const authRateLimiter = new RateLimiterRedis({
	storeClient: redisClient,
	keyPrefix: "rl:auth",
	points: 5,
	duration: 15 * 60,
	blockDuration: 15 * 60,
});