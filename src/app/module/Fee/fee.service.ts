import httpStatus from "http-status";
import { addDays } from "date-fns";
import { prisma } from "../../lib/prisma.js";
import { IGenerateFeesPayload } from "./free.interface.js";
import { AppError } from "../../utils/AppError.js";
import { UserStatus } from "../../../generated/prisma/enums.js";
import { tuitionFeeCreateData } from "../../lib/Installments.js";

const CHUNK_SIZE = 100;

/**
 * Admin sets the tuition total AND the installment count for a semester.
 * Students never choose the count. The settings are saved on the Semester
 * so latecomers get the same plan automatically (see enrollment.service).
 *
 * Once set, the plan is locked: existing students already have installment
 * rows built from it, so changing it silently would leave students on
 * different plans. Re-running with the SAME values is allowed and just
 * bills any students who don't have a Fee yet.
 */
const generateFeesForSemester = async (payload: IGenerateFeesPayload) => {
	const semester = await prisma.semester.findUnique({
		where: { id: payload.semesterId },
	});
	if (!semester) {
		throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	}

	const installmentCount = payload.installmentCount ?? 1;
	const firstDue = payload.firstDueDate
		? new Date(payload.firstDueDate)
		: (semester.firstInstallmentDue ?? addDays(new Date(), 14));

	if (semester.feeAmount !== null) {
		const same =
			semester.feeAmount === payload.amount &&
			semester.installmentCount === installmentCount &&
			(!payload.firstDueDate ||
				semester.firstInstallmentDue?.getTime() === firstDue.getTime());
		if (!same) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Fees for this semester were already generated with different settings. The plan is locked — re-run with the same amount/installments to bill new students only.",
			);
		}
	}

	const updatedSemester = await prisma.semester.update({
		where: { id: payload.semesterId },
		data: {
			feeAmount: payload.amount,
			installmentCount,
			firstInstallmentDue: firstDue,
		},
	});

	const activeStudents = await prisma.studentProfile.findMany({
		where: { user: { status: UserStatus.ACTIVE, isDeleted: false } },
		select: { id: true },
	});
	if (activeStudents.length === 0) {
		return { generatedCount: 0, totalActiveStudents: 0, installmentCount };
	}

	const billed = await prisma.fee.findMany({
		where: { semesterId: payload.semesterId },
		select: { studentId: true },
	});
	const billedIds = new Set(billed.map((f) => f.studentId));
	const toBill = activeStudents.filter((s) => !billedIds.has(s.id));

	// createMany can't write nested installments, so create Fee + installments
	// per student, batched into transactions. Re-running is safe: the
	// @@unique([studentId, semesterId]) constraint rejects duplicates.
	let generatedCount = 0;
	for (let i = 0; i < toBill.length; i += CHUNK_SIZE) {
		const chunk = toBill.slice(i, i + CHUNK_SIZE);
		await prisma.$transaction(
			chunk.map((s) =>
				prisma.fee.create({ data: tuitionFeeCreateData(s.id, updatedSemester) }),
			),
		);
		generatedCount += chunk.length;
	}

	return {
		generatedCount,
		totalActiveStudents: activeStudents.length,
		installmentCount,
	};
};

export const FeeService = {
	generateFeesForSemester,
};