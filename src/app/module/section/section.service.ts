import httpStatus from "http-status";
import { ICreateSectionPayload, ISectionFilters, IUpdateSectionPayload } from "./section.interface.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { InstructorApplicationStatus } from "../../../generated/prisma/enums.js";


const createSection = async (payload: ICreateSectionPayload) => {
	const [course, semester, instructor] = await Promise.all([
		prisma.course.findUnique({ where: { id: payload.courseId } }),
		prisma.semester.findUnique({ where: { id: payload.semesterId } }),
		prisma.instructorProfile.findUnique({
			where: { id: payload.instructorId },
		}),
	]);

	if (!course) throw new AppError(httpStatus.NOT_FOUND, "Course not found");
	if (!semester)
		throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	if (!instructor)
		throw new AppError(httpStatus.NOT_FOUND, "Instructor not found");
	if (instructor.verificationStatus !== InstructorApplicationStatus.APPROVED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Instructor's application has not been approved yet",
		);
	}

	if (payload.capacity <= 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Capacity must be greater than zero",
		);
	}

	return prisma.section.create({
		data: {
			courseId: payload.courseId,
			semesterId: payload.semesterId,
			instructorId: payload.instructorId,
			capacity: payload.capacity,
			schedule: payload.schedule,
		},
	});
};

const getAllSections = async (filters: ISectionFilters) => {
	return prisma.section.findMany({
		where: {
			semesterId: filters.semesterId,
			courseId: filters.courseId,
		},
		include: {
			course: true,
			semester: true,
			instructor: { include: { user: true } },
		},
		orderBy: { createdAt: "desc" },
	});
};

const getSectionById = async (id: string) => {
	const section = await prisma.section.findUnique({
		where: { id },
		include: {
			course: true,
			semester: true,
			instructor: { include: { user: true } },
		},
	});
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}
	return section;
};

const updateSection = async (id: string, payload: IUpdateSectionPayload) => {
	const section = await getSectionById(id);

	// Don't let capacity drop below people already seated — that would
	// leave enrolledCount > capacity, breaking the invariant the
	// enrollment service's atomic seat check depends on.
	if (
		payload.capacity !== undefined &&
		payload.capacity < section.enrolledCount
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Capacity cannot be lower than current enrollment (${section.enrolledCount})`,
		);
	}

	if (payload.instructorId) {
		const instructor = await prisma.instructorProfile.findUnique({
			where: { id: payload.instructorId },
		});
		if (!instructor) {
			throw new AppError(httpStatus.NOT_FOUND, "Instructor not found");
		}
	}

	return prisma.section.update({ where: { id }, data: payload });
};

const deleteSection = async (id: string) => {
	const section = await getSectionById(id);
	if (section.enrolledCount > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Cannot delete a section with active enrollments",
		);
	}
	return prisma.section.delete({ where: { id } });
};

export const SectionService = {
	createSection,
	getAllSections,
	getSectionById,
	updateSection,
	deleteSection,
};