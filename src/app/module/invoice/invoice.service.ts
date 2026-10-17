import { addDays } from "date-fns";
import httpStatus from "http-status";
import { Prisma } from "../../../generated/prisma/client.js";
import {
	AdjustmentType,
	EnrollmentStatus,
	InstallmentStatus,
	InvoiceStatus,
	InvoiceType,
	Role,
	TransactionStatus,
} from "../../../generated/prisma/enums.js";
import type { FeeInvoiceWhereInput } from "../../../generated/prisma/models.js";
import { AuditLogLite } from "../../lib/audit.js";
import {
	applyDelta,
	buildInvoiceItems,
	computeLateFee,
	computeWaiverAdjustments,
	fromMinor,
	isInstallmentOverdue,
	storedInstallmentStatus,
	toMinor,
	type IWaiverLike,
} from "../../lib/billing.js";
import {
	advisoryLock,
	asAppError,
	createInvoiceRecord,
	loadPolicies,
	lockInvoice,
	readPlanSnapshot,
	recomputeInvoice,
	resolvePlanSnapshot,
	SINGLE_PAYMENT_PLAN,
} from "../../lib/invoiceCore.js";
import { assertAdmissionConfirmed, getOverdueInstallments } from "../../lib/dues.js";
import { prisma } from "../../lib/prisma.js";
import { IQuary } from "../../interface/index.js";
import { AppError } from "../../utils/AppError.js";
import { serializeInvoice } from "./invoice.serializer.js";

interface IActor {
	userId: string;
	role: Role;
}

const INVOICE_INCLUDE = {
	items: true,
	adjustments: { orderBy: { createdAt: "asc" as const } },
	installments: { orderBy: { number: "asc" as const } },
	semester: { select: { id: true, name: true } },
	student: {
		select: {
			id: true,
			studentIdCode: true,
			department: { select: { id: true, name: true, code: true } },
			user: { select: { name: true, email: true } },
		},
	},
};

const getStudentOrThrow = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({ where: { userId } });
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	return student;
};

// ---------------------------------------------------------------------------
// Application + admission invoices (non-semester)
// ---------------------------------------------------------------------------

/**
 * Student asks to pay the application fee before submitting an application.
 * Idempotent: returns the existing invoice instead of billing twice.
 */
const createApplicationInvoice = async (userId: string) => {
	const student = await getStudentOrThrow(userId);

	if (await prisma.admissionApplication.findUnique({ where: { studentId: student.id } })) {
		throw new AppError(httpStatus.CONFLICT, "Application already submitted — the application fee is not charged again");
	}

	return prisma.$transaction(async (tx) => {
		await advisoryLock(tx, `application-invoice:${student.id}`);

		const existing = await tx.feeInvoice.findFirst({
			where: { studentId: student.id, type: InvoiceType.APPLICATION, status: { not: InvoiceStatus.CANCELLED } },
			include: INVOICE_INCLUDE,
		});
		if (existing) return serializeInvoice(existing);

		const items = buildInvoiceItems(await loadPolicies(tx), {
			invoiceType: InvoiceType.APPLICATION,
			ctx: { departmentId: student.departmentId, semesterId: null, at: new Date() },
		});
		if (items.length === 0) {
			throw new AppError(httpStatus.BAD_REQUEST, "No application fee is configured");
		}

		const invoice = await createInvoiceRecord(tx, {
			type: InvoiceType.APPLICATION,
			studentId: student.id,
			semesterId: null,
			items,
			waivers: [],
			plan: SINGLE_PAYMENT_PLAN,
			billedCredits: 0,
			createdById: userId,
		});
		return serializeInvoice({ ...invoice, installments: invoice.installments });
	});
};

/**
 * ADMISSION invoice: one-time admission charge, ID card fee, refundable
 * caution deposit, etc. The application fee is NEVER repeated here (it is
 * its own invoice type). Called after the application is submitted.
 * Returns null when no admission fees are configured.
 */
const createAdmissionInvoice = async (studentId: string, createdById?: string) => {
	const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

	return prisma.$transaction(async (tx) => {
		await advisoryLock(tx, `admission-invoice:${studentId}`);

		const existing = await tx.feeInvoice.findFirst({
			where: { studentId, type: InvoiceType.ADMISSION, status: { not: InvoiceStatus.CANCELLED } },
			select: { id: true },
		});
		if (existing) return null;

		const items = buildInvoiceItems(await loadPolicies(tx), {
			invoiceType: InvoiceType.ADMISSION,
			ctx: { departmentId: student.departmentId, semesterId: null, at: new Date() },
		});
		if (items.length === 0) return null;

		return createInvoiceRecord(tx, {
			type: InvoiceType.ADMISSION,
			studentId,
			semesterId: null,
			items,
			waivers: [],
			plan: SINGLE_PAYMENT_PLAN,
			billedCredits: 0,
			createdById,
		});
	});
};

// ---------------------------------------------------------------------------
// Semester invoices
// ---------------------------------------------------------------------------

interface IGenerationResult {
	created: { studentId: string; invoiceNumber: string; credits: number; payable: number }[];
	supplementary: { studentId: string; invoiceNumber: string; credits: number; payable: number }[];
	skipped: { studentId: string; reason: string }[];
	failed: { studentId: string; error: string }[];
}

/**
 * Bills every student with ENROLLED courses in the semester (withdrawn and
 * dropped courses are never billable; a course counts once even if the
 * student somehow holds two enrollments).
 *
 * Idempotent and append-only:
 *  - first run for a student   -> full invoice (tuition + fixed fees)
 *  - later run, MORE credits   -> supplementary invoice for the extra credits only (tuition, no repeated fixed fees)
 *  - later run, same/fewer     -> skipped; a reduction is an explicit admin adjustment/cancellation, never silent
 *
 * A per-student advisory lock makes two concurrent runs unable to double-bill.
 */
const generateSemesterInvoices = async (
	actorId: string,
	payload: { semesterId: string; studentId?: string },
): Promise<IGenerationResult> => {
	const semester = await prisma.semester.findUnique({ where: { id: payload.semesterId } });
	if (!semester) throw new AppError(httpStatus.NOT_FOUND, "Semester not found");

	const enrollments = await prisma.enrollment.findMany({
		where: {
			status: EnrollmentStatus.ENROLLED,
			section: { semesterId: payload.semesterId },
			studentId: payload.studentId,
		},
		select: {
			studentId: true,
			student: { select: { departmentId: true } },
			section: { select: { course: { select: { id: true, creditHours: true } } } },
		},
	});

	const byStudent = new Map<string, { departmentId: string; courses: Map<string, number> }>();
	for (const e of enrollments) {
		const entry = byStudent.get(e.studentId) ?? { departmentId: e.student.departmentId, courses: new Map() };
		entry.courses.set(e.section.course.id, e.section.course.creditHours);
		byStudent.set(e.studentId, entry);
	}

	const result: IGenerationResult = { created: [], supplementary: [], skipped: [], failed: [] };

	for (const [studentId, info] of byStudent) {
		try {
			const credits = [...info.courses.values()].reduce((a, b) => a + b, 0);

			await prisma.$transaction(
				async (tx) => {
					await advisoryLock(tx, `semester-invoice:${studentId}:${payload.semesterId}`);

					const prior = await tx.feeInvoice.findMany({
						where: {
							studentId,
							semesterId: payload.semesterId,
							type: InvoiceType.SEMESTER,
							status: { not: InvoiceStatus.CANCELLED },
						},
						select: { billedCredits: true },
					});
					const alreadyBilled = prior.reduce((a, p) => a + p.billedCredits, 0);
					const delta = credits - alreadyBilled;

					if (delta <= 0) {
						result.skipped.push({
							studentId,
							reason: prior.length ? "Already billed for these credits" : "No billable credits",
						});
						return;
					}

					const supplementary = prior.length > 0;
					const now = new Date();
					const items = buildInvoiceItems(await loadPolicies(tx), {
						invoiceType: InvoiceType.SEMESTER,
						ctx: { departmentId: info.departmentId, semesterId: payload.semesterId, at: now },
						credits: delta,
						onlyTuition: supplementary,
					});
					const tuition = items.find((i) => i.itemType === "TUITION");
					if (!tuition) {
						result.skipped.push({ studentId, reason: "No tuition rate configured for this department/semester" });
						return;
					}

					const waiverRows = await tx.studentWaiver.findMany({
						where: {
							studentId,
							isActive: true,
							validFrom: { lte: now },
							AND: [
								{ OR: [{ validTo: null }, { validTo: { gte: now } }] },
								{ OR: [{ semesterId: null }, { semesterId: payload.semesterId }] },
							],
						},
						orderBy: { createdAt: "asc" },
					});
					// Fixed-amount waivers were already given on the first invoice; only percentage waivers follow extra credits.
					const waivers: IWaiverLike[] = waiverRows.map((w) => ({
						type: w.type as IWaiverLike["type"],
						name: w.name,
						percent: w.percent ? Number(w.percent.toString()) : null,
						fixedMinor: supplementary ? null : w.fixedAmount ? toMinor(w.fixedAmount) : null,
					}));
					const adjustments = computeWaiverAdjustments(tuition.amountMinor, waivers);

					const invoice = await createInvoiceRecord(tx, {
						type: InvoiceType.SEMESTER,
						studentId,
						semesterId: payload.semesterId,
						items,
						waivers: adjustments,
						plan: await resolvePlanSnapshot(tx, payload.semesterId),
						billedCredits: delta,
						createdById: actorId,
						extraSnapshot: { semesterName: semester.name, totalCreditsAtBilling: credits, supplementary },
					});

					const row = {
						studentId,
						invoiceNumber: invoice.invoiceNumber,
						credits: delta,
						payable: Number(invoice.payableAmount.toString()),
					};
					(supplementary ? result.supplementary : result.created).push(row);
				},
				{ timeout: 20000 },
			);
		} catch (e) {
			result.failed.push({ studentId, error: e instanceof Error ? e.message : "Unknown error" });
		}
	}

	await AuditLogLite.write(actorId, "SEMESTER_INVOICES_GENERATED", "Semester", payload.semesterId, null, {
		created: result.created.length,
		supplementary: result.supplementary.length,
		skipped: result.skipped.length,
		failed: result.failed.length,
	});
	return result;
};

/**
 * Student-triggered: "I picked my courses, bill me". Bills only the caller,
 * only for courses they are currently ENROLLED in. Running it again after
 * adding courses issues a supplementary invoice for just the extra credits.
 */
const generateMySemesterInvoice = async (userId: string, semesterId: string) => {
	const student = await getStudentOrThrow(userId);
	await assertAdmissionConfirmed(student.id);

	const result = await generateSemesterInvoices(userId, { semesterId, studentId: student.id });
	if (result.failed.length > 0) {
		throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, `Could not generate invoice: ${result.failed[0].error}`);
	}
	if (result.skipped.length > 0) {
		throw new AppError(httpStatus.CONFLICT, result.skipped[0].reason);
	}
	const row = result.created[0] ?? result.supplementary[0];
	if (!row) {
		throw new AppError(httpStatus.BAD_REQUEST, "You have no enrolled courses in this semester to bill");
	}
	const invoice = await prisma.feeInvoice.findUniqueOrThrow({
		where: { invoiceNumber: row.invoiceNumber },
		include: INVOICE_INCLUDE,
	});
	return serializeInvoice(invoice);
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const getMyInvoices = async (userId: string, query: IQuary) => {
	const student = await getStudentOrThrow(userId);
	const where: FeeInvoiceWhereInput = {
		studentId: student.id,
		type: (query.type as InvoiceType) || undefined,
		status: (query.status as InvoiceStatus) || undefined,
		semesterId: query.semesterId || undefined,
	};
	const rows = await prisma.feeInvoice.findMany({
		where,
		include: INVOICE_INCLUDE,
		orderBy: { createdAt: "desc" },
	});
	return rows.map((r) => serializeInvoice(r));
};

/** Dashboard numbers: all computed from invoices/installments on the server. */
const getMySummary = async (userId: string) => {
	const student = await getStudentOrThrow(userId);
	const invoices = await prisma.feeInvoice.findMany({
		where: { studentId: student.id, status: { not: InvoiceStatus.CANCELLED } },
		include: { installments: { orderBy: { number: "asc" } } },
	});

	let totalFees = 0;
	let totalPaid = 0;
	for (const inv of invoices) {
		totalFees += toMinor(inv.payableAmount);
		totalPaid += toMinor(inv.paidAmount);
	}

	const now = new Date();
	const open = invoices
		.flatMap((inv) =>
			inv.installments.map((i) => ({
				invoiceId: inv.id,
				invoiceNumber: inv.invoiceNumber,
				installmentId: i.id,
				number: i.number,
				dueDate: i.dueDate,
				remaining: toMinor(i.amount) - toMinor(i.paidAmount),
				graceDays: readPlanSnapshot(inv.policySnapshot).graceDays,
				amountMinor: toMinor(i.amount),
				paidMinor: toMinor(i.paidAmount),
			})),
		)
		.filter((i) => i.remaining > 0)
		.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

	const overdue = open.filter((i) => isInstallmentOverdue(i, now, i.graceDays));
	const next = open.find((i) => !isInstallmentOverdue(i, now, i.graceDays)) ?? null;
	const fmt = (i: (typeof open)[number]) => ({
		invoiceId: i.invoiceId,
		invoiceNumber: i.invoiceNumber,
		installmentId: i.installmentId,
		number: i.number,
		dueDate: i.dueDate,
		remaining: i.remaining / 100,
	});

	return {
		totalFees: totalFees / 100,
		totalPaid: totalPaid / 100,
		outstandingBalance: Math.max(totalFees - totalPaid, 0) / 100,
		nextInstallment: next ? fmt(next) : null,
		overdueInstallments: overdue.map(fmt),
		invoiceCount: invoices.length,
	};
};

const getInvoiceById = async (id: string, actor: IActor) => {
	const invoice = await prisma.feeInvoice.findUnique({
		where: { id },
		include: {
			...INVOICE_INCLUDE,
			transactions: {
				select: { id: true, amount: true, status: true, receiptNumber: true, completedAt: true, initiatedAt: true, refundedAmount: true },
				orderBy: { initiatedAt: "desc" },
			},
		},
	});
	if (!invoice) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");

	if (actor.role === Role.STUDENT) {
		const student = await getStudentOrThrow(actor.userId);
		// same message as "not found" so ids can't be probed
		if (invoice.studentId !== student.id) throw new AppError(httpStatus.NOT_FOUND, "Invoice not found");
	}
	const serialized = serializeInvoice(invoice);
	return {
		...serialized,
		transactions: invoice.transactions.map((t) => ({
			...t,
			amount: Number(t.amount.toString()),
			refundedAmount: Number(t.refundedAmount.toString()),
		})),
	};
};

const getAllInvoices = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;

	const and: FeeInvoiceWhereInput[] = [];
	if (query.status) and.push({ status: query.status as InvoiceStatus });
	if (query.type) and.push({ type: query.type as InvoiceType });
	if (query.semesterId) and.push({ semesterId: query.semesterId });
	if (query.studentId) and.push({ studentId: query.studentId });
	if (query.departmentId) and.push({ student: { departmentId: query.departmentId } });
	if (query.searchTerm) {
		const contains = { contains: query.searchTerm, mode: "insensitive" as const };
		and.push({
			OR: [
				{ invoiceNumber: contains },
				{ student: { studentIdCode: contains } },
				{ student: { user: { name: contains } } },
			],
		});
	}
	const where: FeeInvoiceWhereInput = { AND: and.length ? and : undefined };

	const [rows, total] = await Promise.all([
		prisma.feeInvoice.findMany({
			where,
			include: INVOICE_INCLUDE,
			orderBy: { createdAt: "desc" },
			take: limit,
			skip: (page - 1) * limit,
		}),
		prisma.feeInvoice.count({ where }),
	]);
	return {
		data: rows.map((r) => serializeInvoice(r)),
		meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
};

// ---------------------------------------------------------------------------
// Corrections: adjustments + cancellation (never a silent edit)
// ---------------------------------------------------------------------------

/**
 * Waiver / scholarship / discount / signed adjustment on an ISSUED invoice.
 * The reduction is taken from the unpaid tail of the schedule and can never
 * cut into money already paid — in that case refund first.
 */
const addAdjustment = async (
	invoiceId: string,
	actor: IActor,
	payload: { type: "WAIVER" | "SCHOLARSHIP" | "DISCOUNT" | "ADJUSTMENT"; amount: number; reason: string },
) => {
	const signedMinor =
		payload.type === "ADJUSTMENT" ? toMinor(payload.amount) : -Math.abs(toMinor(payload.amount));

	return prisma.$transaction(async (tx) => {
		await lockInvoice(tx, invoiceId);
		const invoice = await tx.feeInvoice.findUniqueOrThrow({
			where: { id: invoiceId },
			include: { installments: true },
		});
		if (invoice.status === InvoiceStatus.CANCELLED) {
			throw new AppError(httpStatus.CONFLICT, "Cannot adjust a cancelled invoice");
		}

		let schedule;
		try {
			schedule = applyDelta(
				invoice.installments.map((i) => ({
					number: i.number,
					amountMinor: toMinor(i.amount),
					paidMinor: toMinor(i.paidAmount),
				})),
				signedMinor,
			);
		} catch (e) {
			return asAppError(e);
		}

		for (const s of schedule) {
			const row = invoice.installments.find((i) => i.number === s.number)!;
			await tx.installment.update({
				where: { id: row.id },
				data: { amount: fromMinor(s.amountMinor), status: storedInstallmentStatus(s.amountMinor, s.paidMinor) },
			});
		}
		await tx.invoiceAdjustment.create({
			data: {
				invoiceId,
				type: payload.type as AdjustmentType,
				amount: fromMinor(signedMinor),
				reason: payload.reason,
				createdById: actor.userId,
			},
		});
		const updated = await recomputeInvoice(tx, invoiceId);
		await AuditLogLite.write(
			actor.userId,
			"INVOICE_ADJUSTED",
			"FeeInvoice",
			invoiceId,
			{ payable: Number(invoice.payableAmount.toString()) },
			{ payable: Number(updated.payableAmount.toString()), type: payload.type, amount: signedMinor / 100 },
			payload.reason,
			tx,
		);
		return updated;
	});
};

/**
 * Cancels an invoice that holds no money. If anything was paid, refund it
 * first (POST /payments/:id/refund) — cancelling never makes money vanish.
 * Also the way to "regenerate": cancel, then run generation again.
 */
const cancelInvoice = async (invoiceId: string, actor: IActor, reason: string) => {
	return prisma.$transaction(async (tx) => {
		await lockInvoice(tx, invoiceId);
		const invoice = await tx.feeInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
		if (invoice.status === InvoiceStatus.CANCELLED) {
			throw new AppError(httpStatus.CONFLICT, "Invoice is already cancelled");
		}
		if (toMinor(invoice.paidAmount) > 0) {
			throw new AppError(httpStatus.CONFLICT, "Invoice has payments — refund them before cancelling");
		}
		// any in-flight gateway attempt must not be able to land on a cancelled invoice
		await tx.paymentTransaction.updateMany({
			where: { invoiceId, status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] } },
			data: { status: TransactionStatus.CANCELLED, failureReason: "Invoice cancelled" },
		});
		const updated = await tx.feeInvoice.update({
			where: { id: invoiceId },
			data: { status: InvoiceStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
		});
		await AuditLogLite.write(actor.userId, "INVOICE_CANCELLED", "FeeInvoice", invoiceId, { status: invoice.status }, { status: "CANCELLED" }, reason, tx);
		return updated;
	});
};

// ---------------------------------------------------------------------------
// Dues reports + late fees
// ---------------------------------------------------------------------------

const getOutstandingDues = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 20;
	const page = query.page ? Number(query.page) : 1;

	const invoices = await prisma.feeInvoice.findMany({
		where: {
			status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] },
			semesterId: query.semesterId || undefined,
			student: query.departmentId ? { departmentId: query.departmentId } : undefined,
		},
		select: {
			studentId: true,
			payableAmount: true,
			paidAmount: true,
			student: {
				select: {
					studentIdCode: true,
					department: { select: { name: true, code: true } },
					user: { select: { name: true, email: true } },
				},
			},
		},
	});

	const grouped = new Map<string, { studentId: string; name: string; email: string; studentIdCode: string | null; department: string; invoices: number; outstandingMinor: number }>();
	for (const inv of invoices) {
		const out = toMinor(inv.payableAmount) - toMinor(inv.paidAmount);
		if (out <= 0) continue;
		const g = grouped.get(inv.studentId) ?? {
			studentId: inv.studentId,
			name: inv.student.user.name,
			email: inv.student.user.email,
			studentIdCode: inv.student.studentIdCode,
			department: inv.student.department.name,
			invoices: 0,
			outstandingMinor: 0,
		};
		g.invoices += 1;
		g.outstandingMinor += out;
		grouped.set(inv.studentId, g);
	}

	const all = [...grouped.values()].sort((a, b) => b.outstandingMinor - a.outstandingMinor);
	return {
		data: all.slice((page - 1) * limit, page * limit).map((g) => ({
			...g,
			outstanding: g.outstandingMinor / 100,
		})),
		meta: {
			page,
			limit,
			total: all.length,
			totalPages: Math.ceil(all.length / limit),
			totalOutstanding: all.reduce((a, g) => a + g.outstandingMinor, 0) / 100,
		},
	};
};

const getOverdueReport = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 20;
	const page = query.page ? Number(query.page) : 1;
	const now = new Date();

	const rows = await prisma.installment.findMany({
		where: {
			status: { in: [InstallmentStatus.PENDING, InstallmentStatus.PARTIALLY_PAID] },
			dueDate: { lt: now },
			invoice: {
				status: { not: InvoiceStatus.CANCELLED },
				semesterId: query.semesterId || undefined,
				student: query.departmentId ? { departmentId: query.departmentId } : undefined,
			},
		},
		include: {
			invoice: {
				select: {
					id: true,
					invoiceNumber: true,
					policySnapshot: true,
					semester: { select: { name: true } },
					student: {
						select: {
							id: true,
							studentIdCode: true,
							department: { select: { name: true } },
							user: { select: { name: true, email: true } },
						},
					},
				},
			},
		},
		orderBy: { dueDate: "asc" },
	});

	const overdue = rows
		.filter((r) =>
			isInstallmentOverdue(
				{ amountMinor: toMinor(r.amount), paidMinor: toMinor(r.paidAmount), dueDate: r.dueDate },
				now,
				readPlanSnapshot(r.invoice.policySnapshot).graceDays,
			),
		)
		.map((r) => ({
			installmentId: r.id,
			number: r.number,
			dueDate: r.dueDate,
			daysOverdue: Math.floor((now.getTime() - r.dueDate.getTime()) / 86_400_000),
			remaining: (toMinor(r.amount) - toMinor(r.paidAmount)) / 100,
			invoiceId: r.invoice.id,
			invoiceNumber: r.invoice.invoiceNumber,
			semester: r.invoice.semester?.name ?? null,
			studentId: r.invoice.student.id,
			studentName: r.invoice.student.user.name,
			studentEmail: r.invoice.student.user.email,
			studentIdCode: r.invoice.student.studentIdCode,
			department: r.invoice.student.department.name,
		}));

	return {
		data: overdue.slice((page - 1) * limit, page * limit),
		meta: { page, limit, total: overdue.length, totalPages: Math.ceil(overdue.length / limit) },
	};
};

/**
 * Adds a late fee to every overdue installment whose policy has one.
 * Safe to call repeatedly (manually or from a scheduled job): the
 * unique (installmentId, LATE_FEE) key means each installment is charged
 * at most once, even if two runs overlap.
 */
const applyLateFees = async (actor: IActor) => {
	const now = new Date();
	const candidates = await prisma.installment.findMany({
		where: {
			status: { in: [InstallmentStatus.PENDING, InstallmentStatus.PARTIALLY_PAID] },
			dueDate: { lt: now },
			invoice: { status: { not: InvoiceStatus.CANCELLED }, type: InvoiceType.SEMESTER },
		},
		include: { invoice: { select: { id: true, policySnapshot: true } } },
	});

	let applied = 0;
	let skipped = 0;
	for (const c of candidates) {
		const plan = readPlanSnapshot(c.invoice.policySnapshot);
		const row = { amountMinor: toMinor(c.amount), paidMinor: toMinor(c.paidAmount), dueDate: c.dueDate };
		if (plan.lateFeeType === "NONE" || !isInstallmentOverdue(row, now, plan.graceDays)) continue;

		const fee = computeLateFee(row.amountMinor - row.paidMinor, plan.lateFeeType, plan.lateFeeValue);
		if (fee <= 0) continue;

		try {
			await prisma.$transaction(async (tx) => {
				await lockInvoice(tx, c.invoice.id);
				// creating the adjustment first: a duplicate trips the unique key and aborts this tx
				await tx.invoiceAdjustment.create({
					data: {
						invoiceId: c.invoice.id,
						type: AdjustmentType.LATE_FEE,
						amount: fromMinor(fee),
						reason: `Late fee: installment ${c.number} overdue`,
						installmentId: c.id,
						createdById: actor.userId,
					},
				});
				const fresh = await tx.installment.findUniqueOrThrow({ where: { id: c.id } });
				const newAmount = toMinor(fresh.amount) + fee;
				await tx.installment.update({
					where: { id: c.id },
					data: { amount: fromMinor(newAmount), status: storedInstallmentStatus(newAmount, toMinor(fresh.paidAmount)) },
				});
				await recomputeInvoice(tx, c.invoice.id);
			});
			applied += 1;
		} catch (e) {
			if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") skipped += 1;
			else throw e;
		}
	}

	await AuditLogLite.write(actor.userId, "LATE_FEES_APPLIED", "FeeInvoice", "bulk", null, { applied, skipped });
	return { applied, alreadyCharged: skipped };
};

const getMyOverdue = async (userId: string) => {
	const student = await getStudentOrThrow(userId);
	return getOverdueInstallments(student.id);
};

export const InvoiceService = {
	createApplicationInvoice,
	createAdmissionInvoice,
	generateSemesterInvoices,
	generateMySemesterInvoice,
	getMyInvoices,
	getMySummary,
	getInvoiceById,
	getAllInvoices,
	addAdjustment,
	cancelInvoice,
	getOutstandingDues,
	getOverdueReport,
	applyLateFees,
	getMyOverdue,
};

// keep addDays import used for future due-date helpers without lint noise
void addDays;