import { format } from "date-fns";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const streamToBuffer = (doc: PDFKit.PDFDocument): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		doc.on("data", (chunk) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);
	});
};

interface IResultSheetPdfData {
	studentName: string;
	studentIdCode: string;
	courseCode: string;
	courseTitle: string;
	semesterName: string;
	exams: {
		title: string;
		examType: string;
		totalMarks: number;
		marksObtained: number;
		status: string;
	}[];
}

const generateResultSheetPdf = async (
	data: IResultSheetPdfData,
): Promise<Buffer> => {
	const doc = new PDFDocument({ margin: 50 });
	const bufferPromise = streamToBuffer(doc);

	doc.fontSize(18).text("Result Sheet", { align: "center" });
	doc.moveDown(0.5);
	doc
		.fontSize(9)
		.fillColor("gray")
		.text(`Generated on ${format(new Date(), "dd MMM yyyy")}`, { align: "center" });
	doc.fillColor("black");
	doc.moveDown(1.5);

	doc.fontSize(11);
	doc.text(`Student: ${data.studentName} (${data.studentIdCode})`);
	doc.text(`Course: ${data.courseCode} - ${data.courseTitle}`);
	doc.text(`Semester: ${data.semesterName}`);
	doc.moveDown();

	const colX = { exam: 50, type: 260, marks: 370, status: 460 };

	doc.font("Helvetica-Bold");
	doc.text("Exam", colX.exam, doc.y, { continued: true });
	doc.text("Type", colX.type, doc.y, { continued: true });
	doc.text("Marks", colX.marks, doc.y, { continued: true });
	doc.text("Status", colX.status, doc.y);
	doc.moveDown(0.3);
	doc
		.moveTo(50, doc.y)
		.lineTo(545, doc.y)
		.strokeColor("#cccccc")
		.stroke();
	doc.moveDown(0.3);
	doc.font("Helvetica");

	let totalObtained = 0;
	let totalMax = 0;
	for (const exam of data.exams) {
		const rowY = doc.y;
		doc.text(exam.title, colX.exam, rowY, { continued: true, width: 200 });
		doc.text(exam.examType, colX.type, rowY, { continued: true, width: 100 });
		doc.text(`${exam.marksObtained} / ${exam.totalMarks}`, colX.marks, rowY, {
			continued: true,
			width: 80,
		});
		doc.text(exam.status, colX.status, rowY);
		doc.moveDown(0.5);
		totalObtained += exam.marksObtained;
		totalMax += exam.totalMarks;
	}

	doc.moveDown();
	doc
		.moveTo(50, doc.y)
		.lineTo(545, doc.y)
		.strokeColor("#cccccc")
		.stroke();
	doc.moveDown(0.3);
	doc.font("Helvetica-Bold").text(`Total: ${totalObtained} / ${totalMax}`);

	doc.end();
	return bufferPromise;
};

interface ITranscriptPdfData {
	studentName: string;
	studentIdCode: string;
	semesters: {
		semesterName: string;
		gpa: number | null;
		courses: {
			courseCode: string;
			creditHours: number;
			gradePoint: number | null;
			withdrawn?: boolean;
		}[];
	}[];
	cgpa: number | null;
}

const generateTranscriptPdf = async (data: ITranscriptPdfData): Promise<Buffer> => {
	const doc = new PDFDocument({ margin: 50 });
	const bufferPromise = streamToBuffer(doc);

	doc.fontSize(18).text("Academic Transcript", { align: "center" });
	doc.moveDown(0.5);
	doc
		.fontSize(9)
		.fillColor("gray")
		.text(`Generated on ${format(new Date(), "dd MMM yyyy")}`, { align: "center" });
	doc.fillColor("black");
	doc.moveDown(1.5);

	doc.fontSize(11);
	doc.text(`Student: ${data.studentName} (${data.studentIdCode})`);
	doc.moveDown();

	for (const semester of data.semesters) {
		doc.font("Helvetica-Bold").fontSize(12).text(semester.semesterName);
		doc.font("Helvetica").fontSize(10);
		doc.moveDown(0.3);

		for (const course of semester.courses) {
			const status = course.withdrawn
				? "W (Withdrawn)"
				: course.gradePoint !== null
					? `Grade point ${course.gradePoint.toFixed(2)}`
					: "Pending (unpublished result)";
			doc.text(
				`  ${course.courseCode}  -  ${course.creditHours} credit hour(s)  -  ${status}`,
			);
		}

		doc.moveDown(0.2);
		doc
			.font("Helvetica-Bold")
			.text(`  Semester GPA: ${semester.gpa !== null ? semester.gpa.toFixed(2) : "N/A"}`);
		doc.font("Helvetica");
		doc.moveDown();
	}

	doc
		.moveTo(50, doc.y)
		.lineTo(545, doc.y)
		.strokeColor("#cccccc")
		.stroke();
	doc.moveDown(0.5);
	doc
		.fontSize(13)
		.font("Helvetica-Bold")
		.text(`Cumulative GPA (CGPA): ${data.cgpa !== null ? data.cgpa.toFixed(2) : "N/A"}`);

	doc.end();
	return bufferPromise;
};

export interface IStudentIdCardData {
	studentName: string;
	studentIdCode: string;
	departmentName: string;
	departmentCode?: string | null;
	imageUrl?: string | null;
	issuedDate: string;
	validUntil: string;
	session?: string | null;
	dateOfBirth?: string | null;
	bloodGroup?: string | null;
	guardianName?: string | null;
	address?: string | null;
	universityName?: string | null;
}

/** Colour-coded blood group badge - instantly readable at a glance. */
const BLOOD_COLORS: Record<string, string> = {
	A: "#DC2626",
	B: "#2563EB",
	AB: "#7C3AED",
	O: "#059669",
};

const bloodColor = (bloodGroup?: string | null): string => {
	const key = (bloodGroup ?? "").trim().toUpperCase().replace(/[+\-]/g, "");
	return BLOOD_COLORS[key] ?? "#475569";
};

/**
 * pdfkit's built-in fonts (Helvetica) are WinAnsi (cp1252) only. Anything
 * outside that range is written out as raw UTF-8 bytes and comes back as
 * mojibake ("—" renders as "aEUR""). Map the common typographic characters
 * to ASCII so user-supplied names and addresses stay readable.
 */
const toWinAnsi = (text: string): string =>
	text
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u2013\u2014]/g, "-")
		.replace(/\u2022/g, "-")
		.replace(/\u2026/g, "...");

const CARD_W = 330;
const CARD_H = 228;
const INDIGO = "#4338CA";
const INK = "#0F172A";
const MUTED = "#64748B";

/**
 * Student ID card.
 *
 * ID-card proportions (330 x 228 pt) - slightly larger than a CR80 so every
 * field stays legible: photo, name, student ID, department, session, date of
 * birth, blood group (colour-coded), guardian, address, issue/expiry dates
 * and a QR code encoding the student ID.
 *
 * Long values use a label above the value (not "Label: value" on one line) -
 * a department name like "Computer Science & Engineering" would otherwise
 * wrap and collide with the row below it.
 */
export const generateStudentIdCardPdf = async (
	data: IStudentIdCardData,
): Promise<Buffer> => {
	const doc = new PDFDocument({ size: [CARD_W, CARD_H], margin: 0 });
	const bufferPromise = streamToBuffer(doc);

	/* ---------------- background + header band ---------------- */
	doc.roundedRect(0, 0, CARD_W, CARD_H, 10).fill("#FFFFFF");
	// Rounded top corners for the band, squared off at the bottom.
	doc.roundedRect(0, 0, CARD_W, 44, 10).fill(INDIGO);
	doc.rect(0, 30, CARD_W, 14).fill(INDIGO);
	doc.rect(0, 44, CARD_W, 2.5).fill("#F59E0B");

	doc
		.fillColor("#FFFFFF")
		.font("Helvetica-Bold")
		.fontSize(10)
		.text(toWinAnsi(data.universityName ?? "University Management System"), 14, 10, {
			width: 210,
		});
	doc
		.font("Helvetica-Bold")
		.fontSize(7.5)
		.fillColor("#C7D2FE")
		.text("STUDENT ID CARD", 200, 12, { width: 116, align: "right" });
	doc
		.font("Helvetica")
		.fontSize(6.5)
		.fillColor("#A5B4FC")
		.text("Identity Document - Non-transferable", 14, 23, { width: 210 });

	/* ---------------- shared field helpers ---------------- */
	const label = (text: string, x: number, y: number, w: number) => {
		doc
			.fillColor(MUTED)
			.font("Helvetica")
			.fontSize(5.8)
			.text(text, x, y, { width: w, characterSpacing: 0.6 });
	};
	const value = (text: string, x: number, y: number, w: number) => {
		doc
			.fillColor(INK)
			.font("Helvetica-Bold")
			.fontSize(8.5)
			.text(toWinAnsi(text), x, y, { width: w, height: 11, ellipsis: true });
	};

	/* ---------------- photo ---------------- */
	const photoX = 14;
	const photoY = 54;
	const photoW = 66;
	const photoH = 88;

	let photoBuffer: Buffer | null = null;
	if (data.imageUrl) {
		try {
			const response = await fetch(data.imageUrl);
			photoBuffer = Buffer.from(await response.arrayBuffer());
		} catch {
			photoBuffer = null; // fall through to the placeholder below
		}
	}

	doc.roundedRect(photoX - 1, photoY - 1, photoW + 2, photoH + 2, 4).fill("#E2E8F0");
	if (photoBuffer) {
		doc.image(photoBuffer, photoX, photoY, {
			width: photoW,
			height: photoH,
			fit: [photoW, photoH],
			align: "center",
			valign: "center",
		});
	} else {
		doc
			.fillColor("#94A3B8")
			.font("Helvetica-Bold")
			.fontSize(8)
			.text("NO PHOTO", photoX, photoY + photoH / 2 - 4, {
				width: photoW,
				align: "center",
			});
	}

	/* ---------------- left column: date of birth + guardian ---------------- */
	label("DATE OF BIRTH", photoX, 150, 76);
	value(data.dateOfBirth ?? "-", photoX, 158, 76);
	label("GUARDIAN", photoX, 174, 76);
	value(data.guardianName ?? "-", photoX, 182, 76);

	/* ---------------- middle column: name, id, department, session, address ---------------- */
	const infoX = 98;
	const infoW = 150;

	doc
		.fillColor(INK)
		.font("Helvetica-Bold")
		.fontSize(13)
		.text(toWinAnsi(data.studentName), infoX, 54, {
			width: infoW,
			height: 32,
			ellipsis: true,
		});

	doc
		.fillColor(INDIGO)
		.font("Helvetica-Bold")
		.fontSize(9.5)
		.text(`ID: ${data.studentIdCode}`, infoX, 88, { width: infoW });

	label("DEPARTMENT", infoX, 106, infoW);
	value(data.departmentName ?? "-", infoX, 114, infoW);

	label("SESSION", infoX, 132, infoW);
	value(data.session ?? "-", infoX, 140, infoW);

	label("ADDRESS", infoX, 158, infoW);
	value(data.address ?? "-", infoX, 166, infoW);

	/* ---------------- blood group badge ---------------- */
	const badgeX = 250;
	const badgeY = 54;
	const badgeW = 66;
	const badgeH = 32;
	const accent = bloodColor(data.bloodGroup);

	doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 6).fill("#FFFFFF");
	doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 6).lineWidth(1.5).stroke(accent);
	doc
		.fillColor(MUTED)
		.font("Helvetica")
		.fontSize(6)
		.text("BLOOD GROUP", badgeX + 7, badgeY + 6, { width: badgeW - 14 });
	doc
		.fillColor(accent)
		.font("Helvetica-Bold")
		.fontSize(15)
		.text(toWinAnsi((data.bloodGroup ?? "-").toUpperCase()), badgeX + 7, badgeY + 14, {
			width: badgeW - 14,
		});

	/* ---------------- QR code ---------------- */
	const qrDataUrl = await QRCode.toDataURL(data.studentIdCode, {
		margin: 0,
		width: 160,
	});
	const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
	doc.image(qrBuffer, 252, 100, { width: 62, height: 62 });
	doc
		.fillColor(MUTED)
		.font("Helvetica")
		.fontSize(5.8)
		.text("SCAN TO VERIFY", 246, 164, { width: 74, align: "center" });

	/* ---------------- footer ---------------- */
	const footY = 206;
	doc.rect(14, 200, CARD_W - 28, 0.8).fill("#E2E8F0");
	doc
		.fillColor(MUTED)
		.font("Helvetica")
		.fontSize(6.2)
		.text(
			"This card is the property of the University. Loss must be reported immediately.",
			14,
			footY,
			{ width: 180 },
		);
	doc
		.fillColor(MUTED)
		.font("Helvetica")
		.fontSize(6.2)
		.text(`ISSUED ${data.issuedDate}`, 200, footY, { width: 116, align: "right" });
	doc
		.fillColor(INK)
		.font("Helvetica-Bold")
		.fontSize(6.2)
		.text(`VALID UNTIL ${data.validUntil}`, 200, footY + 8, {
			width: 116,
			align: "right",
		});

	/* ---------------- outer border ---------------- */
	doc.roundedRect(0.75, 0.75, CARD_W - 1.5, CARD_H - 1.5, 10).lineWidth(1.5).stroke("#C7D2FE");

	doc.end();
	return bufferPromise;
};

interface IReceiptPdfData {
	receiptNumber: string;
	invoiceNumber: string;
	invoiceType: string;
	semesterName: string | null;
	studentName: string;
	studentIdCode: string | null;
	departmentName: string;
	gatewayTrxId: string;
	paidAt: string;
	amount: number;
	refundedAmount: number;
	excessAmount: number;
	invoiceTotal: number;
	invoicePaid: number;
	allocations: { installment: number; amount: number }[];
	items: { description: string; amount: number }[];
}

const money = (n: number) => `BDT ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const generateReceiptPdf = async (data: IReceiptPdfData): Promise<Buffer> => {
	const doc = new PDFDocument({ margin: 50 });
	const bufferPromise = streamToBuffer(doc);

	doc.fontSize(18).font("Helvetica-Bold").text("PAYMENT RECEIPT", { align: "center" });
	doc.moveDown(0.3);
	doc
		.fontSize(9)
		.font("Helvetica")
		.fillColor("gray")
		.text("University Management System", { align: "center" });
	doc.fillColor("black").moveDown(1.2);

	const row = (label: string, value: string) => {
		doc.font("Helvetica-Bold").fontSize(10).text(label, 50, doc.y, { continued: true, width: 150 });
		doc.font("Helvetica").text(`  ${value}`);
	};
	row("Receipt No:", data.receiptNumber);
	row("Invoice No:", data.invoiceNumber);
	row("Date:", data.paidAt);
	row("Student:", `${data.studentName}${data.studentIdCode ? ` (${data.studentIdCode})` : ""}`);
	row("Department:", data.departmentName);
	if (data.semesterName) row("Semester:", data.semesterName);
	row("Method:", "bKash");
	row("Transaction ID:", data.gatewayTrxId);

	doc.moveDown();
	doc.font("Helvetica-Bold").fontSize(11).text("Invoice items");
	doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
	doc.moveDown(0.4).font("Helvetica").fontSize(10);
	for (const i of data.items) {
		doc.text(i.description, 50, doc.y, { continued: true, width: 380 });
		doc.text(money(i.amount), { align: "right" });
	}

	doc.moveDown();
	doc.font("Helvetica-Bold").fontSize(11).text("Applied to");
	doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
	doc.moveDown(0.4).font("Helvetica").fontSize(10);
	for (const a of data.allocations) {
		doc.text(`Installment ${a.installment}`, 50, doc.y, { continued: true, width: 380 });
		doc.text(money(a.amount), { align: "right" });
	}
	if (data.excessAmount > 0) {
		doc.text("Unallocated (pending refund)", 50, doc.y, { continued: true, width: 380 });
		doc.text(money(data.excessAmount), { align: "right" });
	}

	doc.moveDown();
	doc.font("Helvetica-Bold").fontSize(12).text(`Amount paid: ${money(data.amount)}`);
	if (data.refundedAmount > 0) {
		doc.font("Helvetica").fontSize(10).text(`Refunded: ${money(data.refundedAmount)}`);
	}
	doc
		.font("Helvetica")
		.fontSize(10)
		.text(`Invoice total: ${money(data.invoiceTotal)}   Paid to date: ${money(data.invoicePaid)}   Balance: ${money(Math.max(data.invoiceTotal - data.invoicePaid, 0))}`);

	doc.moveDown(2);
	doc.fontSize(8).fillColor("gray").text("This is a computer-generated receipt and does not require a signature.", { align: "center" });

	doc.end();
	return bufferPromise;
};

export const pdfGenerator = {
	generateReceiptPdf,
	generateResultSheetPdf,
	generateTranscriptPdf,
	generateStudentIdCardPdf,
};
