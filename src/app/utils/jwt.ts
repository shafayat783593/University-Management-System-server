import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

const createToken = (
	payload: JwtPayload,
	secret: string,
	expiresIn: SignOptions,
) => {
	const token = jwt.sign(payload, secret, {
		expiresIn,
	} as SignOptions);

	return token;
};

const verifyToken = (token: string, secret: string) => {
	try {
		const verifiedToken = jwt.verify(token, secret);
		return {
			success: true,
			data: verifiedToken,
		};
	} catch (error: any) {
		console.log("Token verification failed:", error.name, error.message);
		return {
			success: false,
			error: error.message,
			name: error.name as "TokenExpiredError" | "JsonWebTokenError" | string,
		};
	}
};

export const jwtUtils = {
	createToken,
	verifyToken,
};