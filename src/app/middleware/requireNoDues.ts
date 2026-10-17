import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { assertNoOverdueDues } from "../lib/dues.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

/**
 * Put AFTER auth(Role.STUDENT) on routes that must be withheld while a
 * student has overdue, access-restricting installments (results,
 * transcript, ID card). Never use it on payment/drop/withdraw routes.
 */
export const requireNoDues = async (req: Request, _res: Response, next: NextFunction) => {
	try {
		const userId = req.user?.userId;
		if (!userId) throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized");
		const student = await prisma.studentProfile.findUnique({
			where: { userId },
			select: { id: true },
		});
		if (student) await assertNoOverdueDues(student.id);
		next();
	} catch (e) {
		next(e);
	}
};