import httpStatus from "http-status";
import {
	ApplicationStatus,
	InvoiceStatus,
	InvoiceType,
} from "../../../generated/prisma/enums.js";
import type { AdmissionApplicationWhereInput } from "../../../generated/prisma/models.js";
import { confirmAdmission, sendAdmissionConfirmedEmail } from "../../lib/admission.js";
import { AuditLogLite } from "../../lib/audit.js";
import { getFeeSchedule } from "../../lib/invoiceCore.js";
import { outstandingMinor, toMinor } from "../../lib/billing.js";
import { prisma } from "../../lib/prisma.js";
import { IQuary } from "../../interface/index.js";
import { AppError } from "../../utils/AppError.js";
import { InvoiceService } from "../invoice/invoice.service.js";
import type {
	IReviewApplicationPayload,
	ISubmitAdmissionApplicationPayload,
} from "./admission.interface.js";

const getStudent = async (userId: string) => {
	const student = await prisma.studentProfile.findUnique({ where: { userId } });
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");
	return student;
};

/**
 * Submit is allowed only once the application fee is verified as PAID when
 * the admission policy requires it (SystemSetting.applicationFeeRequired).
 * The student gets the application invoice from POST /invoices/application.
 */
const submitApplication = async (
	userId: string,
	payload: ISubmitAdmissionApplicationPayload,
) => {
	const student = await getStudent(userId);

	const existing = await prisma.admissionApplication.findUnique({
		where: { studentId: student.id },
	});
	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Admission application already submitted — use the update endpoint to change it",
		);
	}

	const setting = await prisma.systemSetting.findFirst();
	const configuredFee = setting?.applicationFeeRequired
		? (await getFeeSchedule(prisma, InvoiceType.APPLICATION, student.departmentId, null)).reduce(
				(sum, l) => sum + l.amount,
				0,
			)
		: 0;
	// A fee is only enforced when one is really configured (otherwise students would be stuck).
	if (setting?.applicationFeeRequired && configuredFee > 0) {
		const paid = await prisma.feeInvoice.findFirst({
			where: {
				studentId: student.id,
				type: InvoiceType.APPLICATION,
				status: InvoiceStatus.PAID,
			},
			select: { id: true },
		});
		if (!paid) {
			throw new AppError(
				httpStatus.PAYMENT_REQUIRED,
				"Pay the application fee before submitting your application",
			);
		}
	}

	return prisma.admissionApplication.create({
		data: { studentId: student.id, ...payload },
	});
};

/** Editable while SUBMITTED, or to re-submit after a rejection. Never after approval. */
const updateApplication = async (
	userId: string,
	payload: ISubmitAdmissionApplicationPayload,
) => {
	const student = await getStudent(userId);
	const existing = await prisma.admissionApplication.findUnique({
		where: { studentId: student.id },
	});
	if (!existing) {
		throw new AppError(httpStatus.NOT_FOUND, "No admission application to update — submit one first");
	}
	if (existing.status === ApplicationStatus.APPROVED) {
		throw new AppError(httpStatus.CONFLICT, "An approved application can no longer be edited");
	}

	return prisma.admissionApplication.update({
		where: { studentId: student.id },
		data: { ...payload, status: ApplicationStatus.SUBMITTED, rejectionReason: null },
	});
};

/** Application + the student's admission state in one response for the "Admission" page. */
const getMyApplication = async (userId: string) => {
	const student = await getStudent(userId);
	const [application, admissionInvoice, applicationInvoice] = await Promise.all([
		prisma.admissionApplication.findUnique({ where: { studentId: student.id } }),
		prisma.feeInvoice.findFirst({
			where: {
				studentId: student.id,
				type: InvoiceType.ADMISSION,
				status: { not: InvoiceStatus.CANCELLED },
			},
			select: { id: true, invoiceNumber: true, status: true, payableAmount: true, paidAmount: true, refundedAmount: true },
		}),
		prisma.feeInvoice.findFirst({
			where: {
				studentId: student.id,
				type: InvoiceType.APPLICATION,
				status: { not: InvoiceStatus.CANCELLED },
			},
			select: { id: true, invoiceNumber: true, status: true, payableAmount: true, paidAmount: true, refundedAmount: true },
		}),
	]);

	const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : 0);
	// outstandingBalance is derived server-side (same helper the invoice
	// serializer uses) so the client never computes money.
	const show = (i: typeof admissionInvoice) =>
		i
			? {
					...i,
					payableAmount: num(i.payableAmount),
					paidAmount: num(i.paidAmount),
					outstandingBalance:
						outstandingMinor(toMinor(i.payableAmount), toMinor(i.paidAmount)) / 100,
				}
			: null;

	// What the student must pay to apply — shown BEFORE they pay, so it comes from
	// the active fee policies (or the invoice itself once it exists).
	const setting = await prisma.systemSetting.findFirst();
	let feeAmount = 0;
	if (applicationInvoice) {
		feeAmount = num(applicationInvoice.payableAmount);
	} else {
		const lines = await getFeeSchedule(prisma, InvoiceType.APPLICATION, student.departmentId, null);
		feeAmount = lines.reduce((sum, l) => sum + l.amount, 0);
	}

	const required = !!setting?.applicationFeeRequired && !application && feeAmount > 0;

	return {
		application, // null = not submitted yet
		applicationFee: {
			required, // true = must be PAID before the form can be submitted
			amount: feeAmount, // BDT
			isPaid: applicationInvoice?.status === InvoiceStatus.PAID,
		},
		applicationInvoice: show(applicationInvoice),
		admissionInvoice: show(admissionInvoice),
		admissionConfirmed: !!student.admissionConfirmedAt,
		studentIdCode: student.studentIdCode,
	};
};

const listApplications = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;

	const and: AdmissionApplicationWhereInput[] = [];
	if (query.status) and.push({ status: query.status as ApplicationStatus });
	if (query.departmentId) and.push({ student: { departmentId: query.departmentId } });
	if (query.searchTerm) {
		const contains = { contains: query.searchTerm, mode: "insensitive" as const };
		and.push({
			OR: [
				{ student: { user: { name: contains } } },
				{ student: { user: { email: contains } } },
				{ previousInstitution: contains },
			],
		});
	}
	const where: AdmissionApplicationWhereInput = { AND: and.length ? and : undefined };

	const [rows, total] = await Promise.all([
		prisma.admissionApplication.findMany({
			where,
			include: {
				student: {
					select: {
						id: true,
						studentIdCode: true,
						admissionConfirmedAt: true,
						department: { select: { name: true, code: true } },
						user: { select: { name: true, email: true } },
					},
				},
			},
			orderBy: { createdAt: "desc" },
			take: limit,
			skip: (page - 1) * limit,
		}),
		prisma.admissionApplication.count({ where }),
	]);
	return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

/**
 * Admin decision. APPROVED issues the ADMISSION invoice (admission charge,
 * ID card fee, refundable caution deposit — whatever the active fee policies
 * define; the application fee is never re-charged). Admission is confirmed
 * immediately when there is nothing to pay or the policy doesn't require
 * payment first; otherwise confirmation happens when the invoice is verified PAID.
 */
const reviewApplication = async (
	actorId: string,
	applicationId: string,
	payload: IReviewApplicationPayload,
) => {
	const application = await prisma.admissionApplication.findUnique({
		where: { id: applicationId },
	});
	if (!application) throw new AppError(httpStatus.NOT_FOUND, "Application not found");
	if (application.status !== ApplicationStatus.SUBMITTED) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Application was already ${application.status.toLowerCase()}`,
		);
	}

	// status flip is conditional so two admins can't both review the same application
	const flipped = await prisma.admissionApplication.updateMany({
		where: { id: applicationId, status: ApplicationStatus.SUBMITTED },
		data: {
			status: payload.status as ApplicationStatus,
			reviewedById: actorId,
			reviewedAt: new Date(),
			rejectionReason: payload.status === "REJECTED" ? (payload.rejectionReason ?? null) : null,
		},
	});
	if (flipped.count === 0) {
		throw new AppError(httpStatus.CONFLICT, "Application was just reviewed by someone else");
	}

	let admissionInvoice = null;
	let confirmed = false;

	if (payload.status === "APPROVED") {
		admissionInvoice = await InvoiceService.createAdmissionInvoice(application.studentId, actorId);
		const setting = await prisma.systemSetting.findFirst();
		const paymentRequired = setting ? setting.admissionPaymentRequiredToEnroll : true;

		if (!admissionInvoice || !paymentRequired) {
			const res = await prisma.$transaction((tx) => confirmAdmission(tx, application.studentId));
			confirmed = res.newlyConfirmed;
			if (confirmed) void sendAdmissionConfirmedEmail(application.studentId);
		}
	}

	await AuditLogLite.write(
		actorId,
		payload.status === "APPROVED" ? "APPLICATION_APPROVED" : "APPLICATION_REJECTED",
		"AdmissionApplication",
		applicationId,
		{ status: ApplicationStatus.SUBMITTED },
		{ status: payload.status },
		payload.rejectionReason,
	);

	return {
		applicationId,
		status: payload.status,
		admissionInvoiceId: admissionInvoice?.id ?? null,
		admissionConfirmed: confirmed,
	};
};

export const AdmissionService = {
	submitApplication,
	updateApplication,
	getMyApplication,
	listApplications,
	reviewApplication,
};