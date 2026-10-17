import { format } from "date-fns";
import ejs from "ejs";
import path from "path";
import config from "../config/index.js";
import { advisoryLock, type Db } from "./invoiceCore.js";
import { transporter } from "./nodmailer.js";
import { prisma } from "./prisma.js";

/**
 * Next student ID for a department: <DEPT>-<yy>-<0001>. The advisory lock
 * serialises concurrent confirmations so two students can never be handed
 * the same sequence number (the unique column is the second line of defence).
 */
const nextStudentIdCode = async (db: Db, departmentId: string): Promise<string> => {
	const dept = await db.department.findUniqueOrThrow({ where: { id: departmentId } });
	const yy = String(new Date().getFullYear()).slice(-2);
	const prefix = `${dept.code}-${yy}-`;
	await advisoryLock(db, `student-id:${prefix}`);

	const last = await db.studentProfile.findFirst({
		where: { studentIdCode: { startsWith: prefix } },
		orderBy: { studentIdCode: "desc" },
		select: { studentIdCode: true },
	});
	const lastSeq = last?.studentIdCode ? Number(last.studentIdCode.slice(prefix.length)) : 0;
	return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
};

/**
 * Confirms admission: sets admissionConfirmedAt and generates the student ID.
 * Idempotent — a second call (duplicate callback, admin retry) changes nothing.
 * Returns the profile and whether this call was the one that confirmed it.
 */
export const confirmAdmission = async (db: Db, studentId: string) => {
	const student = await db.studentProfile.findUniqueOrThrow({ where: { id: studentId } });
	if (student.admissionConfirmedAt && student.studentIdCode) {
		return { student, newlyConfirmed: false };
	}
	const studentIdCode = student.studentIdCode ?? (await nextStudentIdCode(db, student.departmentId));
	const updated = await db.studentProfile.update({
		where: { id: studentId },
		data: { admissionConfirmedAt: new Date(), studentIdCode },
	});
	return { student: updated, newlyConfirmed: true };
};

/** Best-effort email; never fails the payment/approval that triggered it. */
export const sendAdmissionConfirmedEmail = async (studentId: string) => {
	try {
		const s = await prisma.studentProfile.findUnique({
			where: { id: studentId },
			include: { user: true, department: true },
		});
		if (!s?.studentIdCode) return;
		const html = await ejs.renderFile(
			path.join(process.cwd(), "src/app/templates/admission-confirmed.ejs"),
			{
				name: s.user.name,
				studentIdCode: s.studentIdCode,
				departmentName: s.department.name,
				confirmedAt: format(s.admissionConfirmedAt ?? new Date(), "dd MMM yyyy"),
			},
		);
		await transporter.sendMail({
			from: config.email_sender,
			to: s.user.email,
			subject: "Admission Confirmed — Welcome!",
			html,
		});
	} catch {
		// ignore: the confirmation itself is already committed
	}
};