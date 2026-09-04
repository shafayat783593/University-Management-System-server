import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import path from "path";

import { cloudinary } from "../../lib/cloudinary.js";
import { AppError } from "../../utils/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { redisClient } from "../../lib/redis.js";
import {
	InstructorApplicationStatus,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums.js";
import { transporter } from "../../lib/nodmailer.js";
import config from "../../config/index.js";

import { IQuary } from "../../interface/index.js";
import { InstructorProfileWhereInput } from "../../../generated/prisma/models.js";
import { IApplyAsInstructorPayload, IReviewInstructorPayload, IVerifyInstructorEmailPayload } from "./instructor.interface.js";

const OTP_TTL_SECONDS = 60 * 60;

const uploadToCloudinary = (
	file: Express.Multer.File,
): Promise<UploadApiResponse> => {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{ resource_type: "auto" },
			(error, result) => {
				if (error) return reject(new Error(error.message));
				if (!result)
					return reject(new Error("No result returned from Cloudinary"));
				resolve(result);
			},
		);
		uploadStream.end(file.buffer);
	});
};

const applyAsInstructor = async (
	payload: IApplyAsInstructorPayload,
	resume: Express.Multer.File | undefined,
) => {
	if (!resume) {
		throw new AppError(httpStatus.BAD_REQUEST, "Resume file is required");
	}

	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: {
			email,
		},
	});
	if (existingUser) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	const department = await prisma.department.findUnique({
		where: {
			id: payload.departmentId,
		},
	});
	if (!department) {
		throw new AppError(httpStatus.NOT_FOUND, "Department not found");
	}

	const uploadResult = await uploadToCloudinary(resume);

	const createdUser = await prisma.user.create({
		data: {
			name: payload.name,
			email,
			role: Role.INSTRUCTOR,
			status: UserStatus.ACTIVE,
			instructorProfile: {
				create: {
					departmentId: payload.departmentId,
					qualification: payload.qualification,
					resumeUrl: uploadResult.secure_url,
					resumePublicId: uploadResult.public_id,
				},
			},
		},
		include: { instructorProfile: true },
	});

	const otp = crypto.randomInt(100000, 1000000).toString();
	const otpKey = `instructor-application-otp:${email}`;
	await redisClient.set(otpKey, otp, {
		expiration: { type: "EX", value: OTP_TTL_SECONDS },
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/instructor-application-otp.ejs",
	);
	const html = await ejs.renderFile(templatePath, {
		name: payload.name,
		otp,
		expirationMinutes: OTP_TTL_SECONDS / 60,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Verify your email — Instructor application",
		html,
	});

	return createdUser;
};

const verifyInstructorEmail = async (
	payload: IVerifyInstructorEmailPayload,
) => {
	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: { email, role: Role.INSTRUCTOR },
	});
	if (!existingUser) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Instructor application not found",
		);
	}
	if (existingUser.emailVerified) {
		throw new AppError(httpStatus.CONFLICT, "Email already verified");
	}

	const otpKey = `instructor-application-otp:${email}`;

	const storedOtp = await redisClient.get(otpKey);
	if (!storedOtp) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"OTP expired. Please apply again.",
		);
	}
	if (storedOtp !== payload.otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
	}

	await redisClient.del([otpKey]);

	return prisma.user.update({
		where: {
			id: existingUser.id,
		},
		data: {
			emailVerified: true,
		},
		include: {
			instructorProfile: true,
		},
	});
};

const reviewInstructorApplication = async (
	instructorId: string,
	payload: IReviewInstructorPayload,
	reviewerUserId: string,
) => {
	const instructor = await prisma.instructorProfile.findUnique({
		where: { id: instructorId },
		include: { user: true },
	});
	if (!instructor) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Instructor application not found",
		);
	}
	if (!instructor.user.emailVerified) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Instructor has not verified their email yet",
		);
	}
	if (instructor.verificationStatus !== InstructorApplicationStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Application already ${instructor.verificationStatus.toLowerCase()}`,
		);
	}
	if (
		payload.verificationStatus === InstructorApplicationStatus.REJECTED &&
		!payload.rejectionReason
	) {
		throw new AppError(httpStatus.BAD_REQUEST, "Rejection reason is required");
	}

	const updatedProfile = await prisma.instructorProfile.update({
		where: { id: instructorId },
		data: {
			verificationStatus: payload.verificationStatus,
			rejectionReason:
				payload.verificationStatus === InstructorApplicationStatus.REJECTED
					? payload.rejectionReason
					: null,
			reviewedBy: reviewerUserId,
			reviewedAt: new Date(),
		},
		include: { user: true },
	});

	const isApproved =
		payload.verificationStatus === InstructorApplicationStatus.APPROVED;

	if (isApproved) {
		const tempPassword = crypto.randomBytes(6).toString("hex");
		const hashedPassword = await bcrypt.hash(
			tempPassword,
			Number(config.bcrypt_salt_rounds),
		);

		await prisma.user.update({
			where: {
				id: updatedProfile.userId,
			},
			data: {
				password: hashedPassword,
				needPasswordChange: true,
			},
		});

		await transporter.sendMail({
			from: config.email_sender,
			to: updatedProfile.user.email,
			subject: "Your instructor application has been approved",
			html: `
				<p>Hi ${updatedProfile.user.name},</p>
				<p>Your instructor application has been approved.</p>
				<p><b>Email:</b> ${updatedProfile.user.email}<br/><b>Temporary password:</b> ${tempPassword}</p>
				<p>Log in and change this password immediately (PATCH /auth/change-password) — it will not be shown again.</p>
			`,
		});
	} else {
		await transporter.sendMail({
			from: config.email_sender,
			to: updatedProfile.user.email,
			subject: "Your instructor application has been rejected",
			html: `
				<p>Hi ${updatedProfile.user.name},</p>
				<p>Unfortunately your application was not approved.</p>
				<p>Reason: ${updatedProfile.rejectionReason}</p>
			`,
		});
	}

	return updatedProfile;
};

const getAllInstructorApplications = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andConditions: InstructorProfileWhereInput[] = [];
	// searching........
	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{
					user: {
						name: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
						email: {
							contains: query.searchTerm,
							mode: "insensitive",
						},
					},
					qualification: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}

	// filtering...........
	if (query.departmentId) {
		andConditions.push({
			departmentId: {
				equals: query.specialization,
				mode: "insensitive",
			},
		});
	}

	if (query.email) {
		andConditions.push({
			user: {
				email: {
					equals: query.email,
					mode: "insensitive",
				},
			},
		});
	}
	if (query.verificationStatus) {
		andConditions.push({
			verificationStatus: query.verificationStatus,
		});
	}





	const allInstruction = await prisma.instructorProfile.findMany({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},
		take: limit,
		skip: skip,
		orderBy: {
			[sortBy]: sortOrder,
		},
		include: {
			user: {
				omit: {
					password: true,
				},
			},
            department:true
		},
	});

	const totalDoctorCount = await prisma.instructorProfile.count({
	where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},
	});
	return {
		data: allInstruction,
		meta: {
			page: page,
			limit: limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit),
		},
	};
};

export const InstructorService = {
	applyAsInstructor,
	verifyInstructorEmail,
	reviewInstructorApplication,
	getAllInstructorApplications,
};
