import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisClient } from "../lib/redis.js";

export const authRateLimiter = new RateLimiterRedis({
	storeClient: redisClient,
	useRedisPackage: true,

	keyPrefix: "rl:auth",
	points: 5,
	duration: 15 * 60,
	blockDuration: 15 * 60,
});

export const refreshRateLimiter = new RateLimiterRedis({
	storeClient: redisClient,
	useRedisPackage: true,

	keyPrefix: "rl:refresh",
	points: 10,
	duration: 15 * 60,
	blockDuration: 15 * 60,
});