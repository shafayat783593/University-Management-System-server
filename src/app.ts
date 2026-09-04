


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
import { AttendanceRoutes } from "./app/module/attendance/attendance.route.js";
import { ExamRoutes } from "./app/module/exam/exam.route.js";
import { ResultRoutes } from "./app/module/result/result.route.js";
import { FeeRoutes } from "./app/module/fee/fee.route.js";
import { PaymentRoutes } from "./app/module/payment/payment.route.js";
import { AuthRoutes } from "./app/module/auth/auth.routes.js";
import { InstructorRoutes } from "./app/module/Instructor/Instructor.route.js";
import { DepartmentRoutes } from "./app/module/department/dpartment.route.js";
import { notFound } from "./app/middleware/notFound.js";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";

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

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to University Management System Backend",
	});
});

// Debug-only route — remove before submission, or gate it behind
// NODE_ENV !== "production" if you want to keep it around for sanity
// checks against the bKash sandbox.
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
app.use("/api/v1/users", UserRoutes);
app.use("/api/v1/instructors", InstructorRoutes);
app.use("/api/v1/departments", DepartmentRoutes);
app.use("/api/v1/courses", CourseRoutes);
app.use("/api/v1/semesters", SemesterRoutes);
app.use("/api/v1/sections", SectionRoutes);
app.use("/api/v1/enrollments", EnrollmentRoutes);
app.use("/api/v1/attendance", AttendanceRoutes);
app.use("/api/v1/exams", ExamRoutes);
app.use("/api/v1/results", ResultRoutes);
app.use("/api/v1/fees", FeeRoutes);
app.use("/api/v1/payments", PaymentRoutes);

// notFound must come after every real route (so unmatched paths reach
// it) and BEFORE globalErrorHandler (so the 404 error it raises has
// somewhere to go). globalErrorHandler must be the very last app.use —
// Express only routes next(err) forward to error middleware registered
// after the point where the error was raised, never backward.
app.use(notFound);
app.use(globalErrorHandler);

export default app;