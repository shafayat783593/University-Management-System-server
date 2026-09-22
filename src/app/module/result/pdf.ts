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
				`  ${course.courseCode}  —  ${course.creditHours} credit hour(s)  —  ${status}`,
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

interface IStudentIdCardData {
	studentName: string;
	studentIdCode: string;
	departmentName: string;
	imageUrl?: string | null;
	issuedDate: string;
}


const generateStudentIdCardPdf = async (
	data: IStudentIdCardData,
): Promise<Buffer> => {
	const doc = new PDFDocument({ size: [243, 153], margin: 0 });
	const bufferPromise = streamToBuffer(doc);

	doc.rect(0, 0, 243, 153).fill("#0f172a");
	doc.rect(0, 0, 243, 28).fill("#4338CA");
	doc
		.fillColor("white")
		.font("Helvetica-Bold")
		.fontSize(10)
		.text("UNIVERSITY MANAGEMENT SYSTEM", 10, 10, { width: 223 });

	let photoBuffer: Buffer | null = null;
	if (data.imageUrl) {
		try {
			const response = await fetch(data.imageUrl);
			photoBuffer = Buffer.from(await response.arrayBuffer());
		} catch {
			photoBuffer = null; // fall through to the placeholder box below
		}
	}

	if (photoBuffer) {
		doc.image(photoBuffer, 10, 38, { width: 60, height: 70, fit: [60, 70] });
	} else {
		doc.rect(10, 38, 60, 70).fill("#334155");
		doc
			.fillColor("#94a3b8")
			.fontSize(8)
			.text("No Photo", 10, 69, { width: 60, align: "center" });
	}

	doc
		.fillColor("white")
		.font("Helvetica-Bold")
		.fontSize(10)
		.text(data.studentName, 78, 40, { width: 155 });
	doc.font("Helvetica").fontSize(8).fillColor("#cbd5e1");
	doc.text(`ID: ${data.studentIdCode}`, 78, 58, { width: 155 });
	doc.text(`Dept: ${data.departmentName}`, 78, 71, { width: 155 });
	doc.text(`Issued: ${data.issuedDate}`, 78, 84, { width: 155 });

	const qrDataUrl = await QRCode.toDataURL(data.studentIdCode, {
		margin: 0,
		width: 90,
	});
	const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
	doc.image(qrBuffer, 175, 98, { width: 48, height: 48 });

	doc
		.fontSize(6)
		.fillColor("#64748b")
		.text("This card is the property of the university.", 10, 138, {
			width: 223,
		});

	doc.end();
	return bufferPromise;
};

export const pdfGenerator = {
	generateResultSheetPdf,
	generateTranscriptPdf,
	generateStudentIdCardPdf,
};