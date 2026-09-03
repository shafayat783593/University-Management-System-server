import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { UserStatus } from "../../../generated/prisma/enums.js";




interface IGenerateFeesPayload {
	semesterId: string;
	amount: number;
	dueDate?: string;
}
 
const generateFeesForSemester = async (payload: IGenerateFeesPayload) => {
	const semester = await prisma.semester.findUnique({
		where: { id: payload.semesterId },
	});
	if (!semester) {
		throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	}

	const activeStudents = await prisma.studentProfile.findMany({
		where: { user:
             { 
                status: UserStatus.ACTIVE,
                 isDeleted: false 
                }
             },
		select: {
             id: true },
	});

	if (activeStudents.length === 0) {
		throw new AppError(httpStatus.BAD_REQUEST, "No active students found");
	}

	
	const result = await prisma.fee.createMany({
		data: activeStudents.map((s) => ({
			studentId: s.id,
			semesterId: payload.semesterId,
			amount: payload.amount,
			dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
		})),
		skipDuplicates: true,
	});

	return {
		generatedCount: result.count,
		totalActiveStudents: activeStudents.length,
	};
};

export const FeeService = {
	generateFeesForSemester,
};