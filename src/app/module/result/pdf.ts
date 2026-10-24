import { format } from "date-fns";
import PDFDocument from "pdfkit";
import { generateStudentIdCardPdf } from "../../lib/pdf.js";

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

/**
 * The ID card lives in lib/pdf.ts together with the other PDFs — this module
 * used to keep a second, drifting copy. Re-exported so existing imports
 * (auth.service.ts) keep working.
 */
export { generateStudentIdCardPdf };

export const pdfGenerator = {
	generateResultSheetPdf,
	generateTranscriptPdf,
	generateStudentIdCardPdf,
};