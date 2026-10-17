import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "./prisma.js";

/** Best-effort audit trail. Pass `db` to write inside the caller's transaction. */
const write = async (
	actorId: string,
	action: string,
	targetType: string,
	targetId: string,
	oldValue: unknown,
	newValue: unknown,
	reason?: string,
	db: Prisma.TransactionClient = prisma,
) => {
	await db.auditLog.create({
		data: {
			actorId,
			action,
			targetType,
			targetId,
			oldValue: (oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
			newValue: (newValue ?? undefined) as Prisma.InputJsonValue | undefined,
			reason,
		},
	});
};

export const AuditLogLite = { write };