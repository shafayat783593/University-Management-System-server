import { prisma } from "../../lib/prisma.js";
import type { AuditLogWhereInput } from "../../../generated/prisma/models.js";
import { IAuditLogFilters } from "./auditlog.interface.js";

const getAuditLogs = async (filters: IAuditLogFilters) => {
	const limit = filters.limit ?? 20;
	const page = filters.page ?? 1;
	const skip = (page - 1) * limit;

	const where: AuditLogWhereInput = {};
	if (filters.actorId) where.actorId = filters.actorId;
	if (filters.targetType) where.targetType = filters.targetType;
	if (filters.action) where.action = filters.action;
	if (filters.from || filters.to) {
		where.createdAt = {
			gte: filters.from ? new Date(filters.from) : undefined,
			lte: filters.to ? new Date(filters.to) : undefined,
		};
	}

	const [logs, total] = await Promise.all([
		prisma.auditLog.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: limit,
			skip,
		}),
		prisma.auditLog.count({ where }),
	]);

	// actorId is a plain string, not a Prisma relation (same pattern as
	// the rest of this table) — enrich with actor name/email manually
	// instead of a `include`, otherwise the viewer just shows raw UUIDs.
	const actorIds = [...new Set(logs.map((log) => log.actorId))];
	const actors = await prisma.user.findMany({
		where: { id: { in: actorIds } },
		select: { id: true, name: true, email: true, role: true },
	});
	const actorById = new Map(actors.map((a) => [a.id, a]));

	const data = logs.map((log) => ({
		...log,
		actor: actorById.get(log.actorId) ?? null,
	}));

	return {
		data,
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

export const AuditLogService = {
	getAuditLogs,
};