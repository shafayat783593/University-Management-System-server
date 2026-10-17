import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type NextFunction,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config/index.js";
import { bkashClient } from "./app/lib/bkash.js";

import { CourseRoutes } from "./app/module/course/course.route.js";
import { SemesterRoutes } from "./app/module/semester/semester.route.js";
import { SectionRoutes } from "./app/module/section/section.route.js";
import { EnrollmentRoutes } from "./app/module/enrollment/enrollment.route.js";

import { PaymentRoutes } from "./app/module/payment/payment.route.js";
import { AuthRoutes } from "./app/module/auth/auth.route.js";
import { DepartmentRoutes } from "./app/module/department/department.route.js";
import { notFound } from "./app/middleware/notFound.js";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";
import { ExamRoutes } from "./app/module/exam/exam.route.js";
import { ResultRoutes } from "./app/module/result/result.route.js";
import { TranscriptRoutes } from "./app/module/transcript/transcript.route.js";
import { AttendanceRoutes } from "./app/module/attendance/attendance.route.js";
import { FeePolicyRoutes } from "./app/module/feePolicy/feePolicy.route.js";
import { InvoiceRoutes } from "./app/module/invoice/invoice.route.js";
import { WaiverRoutes } from "./app/module/waiver/waiver.route.js";
import { SettingRoutes } from "./app/module/setting/setting.route.js";
import { InstructorRoutes } from "./app/module/Instructor/Instructor.route.js";
import { AnnouncementRoutes } from "./app/module/announcement/announcement.route.js";
import { PublicRoutes } from "./app/module/public/public.route.js";
import { AdmissionRoutes } from "./app/module/admission/admission.route.js";
import { RoutineRoutes } from "./app/module/routine/routine.route.js";
import { DashboardRoutes } from "./app/module/dashboard/dashboard.route.js";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());


app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to University Management System Backend",
	});
});


app.get("/test/bkash-token", async (req: Request, res: Response, next: NextFunction) => {
	try {
		const grantIdToken = await bkashClient.getGrantToken();
		res.status(httpStatus.OK).json({
			success: true,
			message: "bKash grant token retrieved",
			data: { grantIdToken },
		});
	} catch (error) {
		next(error);
	}
});

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/instructors", InstructorRoutes);
app.use("/api/v1/departments", DepartmentRoutes);
app.use("/api/v1/courses", CourseRoutes);
app.use("/api/v1/semesters", SemesterRoutes);
app.use("/api/v1/sections", SectionRoutes);
app.use("/api/v1/enrollments", EnrollmentRoutes);
app.use("/api/v1/attendance", AttendanceRoutes);
app.use("/api/v1/exams", ExamRoutes);
app.use("/api/v1/results", ResultRoutes);
app.use("/api/v1/fee-policies", FeePolicyRoutes);
app.use("/api/v1/waiversbe", WaiverRoutes);
app.use("/api/v1/invoices", InvoiceRoutes);
app.use("/api/v1/settings", SettingRoutes);
app.use("/api/v1/payments", PaymentRoutes);
app.use("/api/v1/transcript", TranscriptRoutes);
app.use("/api/v1/announcements", AnnouncementRoutes);
app.use("/api/v1/public", PublicRoutes);
app.use("/api/v1/admission-applications", AdmissionRoutes);
app.use("/api/v1/routines", RoutineRoutes);
app.use("/api/v1/dashboard", DashboardRoutes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;