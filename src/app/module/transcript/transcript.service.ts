import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import { EnrollmentStatus, ResultStatus } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	CourseResultSummary,
	SemesterTranscript,
	TranscriptData,
} from "./transcript.interface.js";

// Standard Bangladesh public-university 4.00-scale letter grade bands.
// Must stay in sync with the GPA bands used by the result module so the
// transcript PDF and the transcript JSON never disagree.
const PERCENTAGE_TO_GRADE: { min: number; grade: { letter: string; point: number } }[] = [
	{ min: 80, grade: { letter: "A+", point: 4.0 } },
	{ min: 75, grade: { letter: "A", point: 3.75 } },
	{ min: 70, grade: { letter: "A-", point: 3.5 } },
	{ min: 65, grade: { letter: "B+", point: 3.25 } },
	{ min: 60, grade: { letter: "B", point: 3.0 } },
	{ min: 55, grade: { letter: "B-", point: 2.75 } },
	{ min: 50, grade: { letter: "C+", point: 2.5 } },
	{ min: 45, grade: { letter: "C", point: 2.25 } },
	{ min: 40, grade: { letter: "D", point: 2.0 } },
	{ min: 0, grade: { letter: "F", point: 0.0 } },
];

const gradeForPercentage = (percentage: number) => {
	const band = PERCENTAGE_TO_GRADE.find((b) => percentage >= b.min);
	return band ? band.grade : { letter: "F", point: 0.0 };
};

/**
 * Builds the transcript / mark-sheet data for a student.
 *
 * A course only counts once EVERY exam of its section has a PUBLISHED
 * result for this student (same rule as the result module's GPA), so an
 * in-progress semester never inflates the cumulative figures.
 * Pass `semesterId` to restrict the output to a single semester.
 */
const buildTranscriptData = async (
	studentId: string,
	semesterId?: string
): Promise<TranscriptData> => {
	const student = await prisma.studentProfile.findUnique({
		where: { id: studentId },
		include: { user: true, department: true },
	});
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student not found.");

	const enrollments = await prisma.enrollment.findMany({
		where: {
			studentId,
			status: EnrollmentStatus.ENROLLED,
			...(semesterId ? { section: { semesterId } } : {}),
		},
		include: {
			section: {
				include: {
					course: true,
					semester: true,
					exams: { include: { results: { where: { studentId } } } },
				},
			},
		},
		orderBy: { section: { semester: { year: "asc" } } },
	});
	if (enrollments.length === 0) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"No enrollment found for this student.",
		);
	}

	const semesterMap = new Map<string, { name: string; courses: CourseResultSummary[] }>();
	const orderedSemesterIds: string[] = [];

	for (const enrollment of enrollments) {
		const exams = enrollment.section.exams;
		if (exams.length === 0) continue;

		const allPublished = exams.every(
			(exam) =>
				exam.results.length > 0 &&
				exam.results.every((r) => r.status === ResultStatus.PUBLISHED),
		);
		if (!allPublished) continue;

		const totalMarks = exams.reduce((sum, exam) => sum + exam.totalMarks, 0);
		const obtainedMarks = exams.reduce(
			(sum, exam) => sum + (exam.results[0]?.marksObtained ?? 0),
			0,
		);
		const percentage =
			totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
		const { letter, point } = gradeForPercentage(percentage);

		const courseSummary: CourseResultSummary = {
			courseCode: enrollment.section.course.code,
			courseTitle: enrollment.section.course.title,
			credits: enrollment.section.course.creditHours,
			percentage: Math.round(percentage * 100) / 100,
			letterGrade: letter,
			gradePoint: point,
		};

		const semKey = enrollment.section.semester.id;
		if (!semesterMap.has(semKey)) {
			semesterMap.set(semKey, {
				name: enrollment.section.semester.name,
				courses: [],
			});
			orderedSemesterIds.push(semKey);
		}
		semesterMap.get(semKey)?.courses.push(courseSummary);
	}

	const semesters: SemesterTranscript[] = [];
	let cumulativePoints = 0;
	let cumulativeCredits = 0;

	for (const semKey of orderedSemesterIds) {
		const entry = semesterMap.get(semKey);
		if (!entry) continue;
		const { name, courses } = entry;
		const semesterCredits = courses.reduce((sum, c) => sum + c.credits, 0);
		const semesterPoints = courses.reduce(
			(sum, c) => sum + c.gradePoint * c.credits,
			0,
		);
		const semesterGpa =
			semesterCredits > 0 ? semesterPoints / semesterCredits : 0;

		semesters.push({
			semesterName: name,
			courses,
			semesterGpa: Math.round(semesterGpa * 100) / 100,
			semesterCredits,
		});

		cumulativeCredits += semesterCredits;
		cumulativePoints += semesterPoints;
	}

	return {
		studentName: student.user.name,
		studentId: student.studentIdCode,
		programName: student.department.name,
		semesters,
		cumulativeGpa:
			cumulativeCredits > 0
				? Math.round((cumulativePoints / cumulativeCredits) * 100) / 100
				: 0,
		totalCreditsEarned: cumulativeCredits,
	};
};

/**
 * Renders TranscriptData into a PDF and resolves with the finished Buffer.
 * Kept as an in-memory buffer (no temp file) so it can go straight into
 * an HTTP download response or a mail attachment without touching disk.
 */
const generateTranscriptPdf = (
	data: TranscriptData,
	title = "Official Transcript"
): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 50, size: "A4" });
		const chunks: Buffer[] = [];

		doc.on("data", (chunk) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		doc.fontSize(18).font("Helvetica-Bold").text(title, { align: "center" });
		doc.moveDown(0.5);
		doc.fontSize(11).font("Helvetica");
		doc.text(`Student Name: ${data.studentName}`);
		doc.text(`Student ID: ${data.studentId}`);
		doc.text(`Program: ${data.programName}`);
		doc.moveDown();

		for (const sem of data.semesters) {
			doc.fontSize(13).font("Helvetica-Bold").text(sem.semesterName);
			doc.moveDown(0.3);

			const startX = doc.x;
			let y = doc.y;
			const colWidths = [70, 180, 60, 60, 60];
			const headers = ["Code", "Title", "Credits", "Grade", "Marks %"];

			doc.fontSize(10).font("Helvetica-Bold");
			headers.forEach((h, i) => {
				doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
					width: colWidths[i],
				});
			});
			y += 16;

			doc.font("Helvetica");
			for (const c of sem.courses) {
				const row = [c.courseCode, c.courseTitle, String(c.credits), c.letterGrade, `${c.percentage}%`];
				row.forEach((val, i) => {
					doc.text(val, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
						width: colWidths[i],
					});
				});
				y += 16;
			}

			doc.y = y + 4;
			doc.fontSize(11).font("Helvetica-Bold").text(`Semester GPA: ${sem.semesterGpa}   |   Credits: ${sem.semesterCredits}`);
			doc.moveDown();
		}

		doc.moveDown();
		doc.fontSize(13).font("Helvetica-Bold").text(`Cumulative GPA: ${data.cumulativeGpa}`);
		doc.fontSize(11).font("Helvetica").text(`Total Credits Earned: ${data.totalCreditsEarned}`);
		doc.moveDown(2);
		doc.fontSize(9).fillColor("gray").text(`Generated on ${new Date().toLocaleString()}`, { align: "right" });

		doc.end();
	});
};

export const TranscriptService = {
	buildTranscriptData,
	generateTranscriptPdf,
};