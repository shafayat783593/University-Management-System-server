import { RateLimiterRedis } from "rate-limiter-flexible";
import { redisClient } from "../lib/redis.js";

export const authRateLimiter = new RateLimiterRedis({
	storeClient: redisClient,
	useRedisPackage: true,

	keyPrefix: "rl:auth",
	points: 8,
	duration: 60,
	blockDuration: 60,
});

export const refreshRateLimiter = new RateLimiterRedis({
	storeClient: redisClient,
	useRedisPackage: true,

	keyPrefix: "rl:refresh",
	points: 10,
	duration:   60,
	blockDuration:  60,
});