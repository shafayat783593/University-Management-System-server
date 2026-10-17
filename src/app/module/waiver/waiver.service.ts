import httpStatus from "http-status";
import { AuditLogLite } from "../../lib/audit.js";
import { fromMinor, toMinor } from "../../lib/billing.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

const show = <T extends { percent: unknown; fixedAmount: unknown }>(w: T) => ({
	...w,
	percent: w.percent === null ? null : Number(String(w.percent)),
	fixedAmount: w.fixedAmount === null ? null : Number(String(w.fixedAmount)),
});

/**
 * A waiver is applied automatically to TUITION when the student's next
 * semester invoice is generated. It does NOT touch invoices already issued
 * — for those, use POST /invoices/:id/adjustments (audited).
 */
const createWaiver = async (
	actorId: string,
	p: {
		studentId: string;
		semesterId?: string;
		type: "WAIVER" | "SCHOLARSHIP" | "DISCOUNT";
		name: string;
		percent?: number;
		fixedAmount?: number;
		validFrom?: string;
		validTo?: string;
		reason?: string;
	},
) => {
	const student = await prisma.studentProfile.findUnique({ where: { id: p.studentId } });
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student not found");

	const row = await prisma.studentWaiver.create({
		data: {
			studentId: p.studentId,
			semesterId: p.semesterId ?? null,
			type: p.type,
			name: p.name,
			percent: p.percent === undefined ? null : p.percent.toFixed(2),
			fixedAmount: p.fixedAmount === undefined ? null : fromMinor(toMinor(p.fixedAmount)),
			validFrom: p.validFrom ? new Date(p.validFrom) : undefined,
			validTo: p.validTo ? new Date(p.validTo) : null,
			reason: p.reason,
			createdById: actorId,
		},
	});
	await AuditLogLite.write(actorId, "WAIVER_CREATED", "StudentWaiver", row.id, null, show(row), p.reason);
	return show(row);
};

const listWaivers = async (q: { studentId?: string; semesterId?: string }) => {
	const rows = await prisma.studentWaiver.findMany({
		where: { studentId: q.studentId, semesterId: q.semesterId },
		include: {
			student: { select: { studentIdCode: true, user: { select: { name: true } } } },
			semester: { select: { name: true } },
		},
		orderBy: { createdAt: "desc" },
	});
	return rows.map(show);
};

const updateWaiver = async (actorId: string, id: string, p: { isActive?: boolean; validTo?: string | null }) => {
	const old = await prisma.studentWaiver.findUnique({ where: { id } });
	if (!old) throw new AppError(httpStatus.NOT_FOUND, "Waiver not found");
	const row = await prisma.studentWaiver.update({
		where: { id },
		data: {
			isActive: p.isActive,
			validTo: p.validTo === undefined ? undefined : p.validTo ? new Date(p.validTo) : null,
		},
	});
	await AuditLogLite.write(actorId, "WAIVER_UPDATED", "StudentWaiver", id, show(old), show(row));
	return show(row);
};

export const WaiverService = { createWaiver, listWaivers, updateWaiver };