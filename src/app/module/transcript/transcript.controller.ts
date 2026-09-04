import type { Request, Response } from "express";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums.js";
import config from "../../config/index.js";
import { transporter } from "../../lib/nodmailer.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { TranscriptService } from "./transcript.service.js";


// A STUDENT can only ever act on their own record. ADMIN / INSTRUCTOR may
// target any student by passing studentId explicitly. This is the one
// place that decides "whose transcript is this", so every handler below
// calls it. It returns the StudentProfile id.
const resolveTargetStudentId = async (
	requester: { userId: string; role: string },
	requestedStudentId?: string
): Promise<string> => {
	if (requester.role === Role.STUDENT) {
		const own = await prisma.studentProfile.findUnique({
			where: { userId: requester.userId },
		});
		if (!own)
			throw new AppError(httpStatus.NOT_FOUND, "Student profile not found for this account.");
		return own.id;
	}

	if (!requestedStudentId) {
		throw new AppError(httpStatus.BAD_REQUEST, "studentId is required for this role.");
	}
	return requestedStudentId;
};

// GET /api/v1/transcript/download?studentId=&semesterId=
// Streams a PDF straight to the response so the browser/Postman treats it as a file download.
const downloadTranscript = catchAsync(async (req: Request, res: Response) => {
	const requester = req.user;
	if (!requester) throw new AppError(httpStatus.UNAUTHORIZED, "Not authenticated.");
	const studentId = await resolveTargetStudentId(
		requester,
		req.query.studentId as string | undefined,
	);
	const semesterId = req.query.semesterId as string | undefined;

	const data = await TranscriptService.buildTranscriptData(studentId, semesterId);
	const pdfBuffer = await TranscriptService.generateTranscriptPdf(
		data,
		semesterId ? "Semester Mark Sheet" : "Official Transcript",
	);

	res.setHeader("Content-Type", "application/pdf");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="${semesterId ? "mark-sheet" : "transcript"}-${data.studentId}${semesterId ? `-${semesterId}` : ""}.pdf"`,
	);
	res.setHeader("Content-Length", pdfBuffer.length.toString());
	res.send(pdfBuffer);
});

// POST /api/v1/transcript/email  body: { studentId?, semesterId? }
// Generates the same PDF and emails it to the student as an attachment.
const emailTranscript = catchAsync(async (req: Request, res: Response) => {
	const { studentId: bodyStudentId, semesterId } = req.body as {
		studentId?: string;
		semesterId?: string;
	};
	const requester = req.user;
	if (!requester) throw new AppError(httpStatus.UNAUTHORIZED, "Not authenticated.");
	const studentId = await resolveTargetStudentId(requester, bodyStudentId);

	const student = await prisma.studentProfile.findUnique({
		where: { id: studentId },
		include: { user: true },
	});
	if (!student) throw new AppError(httpStatus.NOT_FOUND, "Student not found.");

	const data = await TranscriptService.buildTranscriptData(studentId, semesterId);
	const pdfBuffer = await TranscriptService.generateTranscriptPdf(
		data,
		semesterId ? "Semester Mark Sheet" : "Official Transcript"
	);

	const isMarkSheet = Boolean(semesterId);
	const filename = `${isMarkSheet ? "mark-sheet" : "transcript"}-${data.studentId}${semesterId ? `-${semesterId}` : ""}.pdf`;

	await transporter.sendMail({
		from: config.email_sender,
		to: student.user.email,
		subject: isMarkSheet ? "Your Semester Mark Sheet" : "Your Official Transcript",
		html: `
      <p>Dear ${data.studentName},</p>
      <p>Please find your ${isMarkSheet ? "semester mark sheet" : "official transcript"} attached.</p>
      <p>Cumulative GPA on record: <b>${data.cumulativeGpa}</b></p>
      <p>Regards,<br/>University Registrar Office</p>
    `,
		attachments: [
			{
				filename,
				content: pdfBuffer,
				contentType: "application/pdf",
			},
		],
	});

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: isMarkSheet
			? "Semester mark sheet sent to your email."
			: "Transcript sent to your email.",
		data: { to: student.user.email, filename },
	});
});

export const TranscriptController = {
	downloadTranscript,
	emailTranscript,
};