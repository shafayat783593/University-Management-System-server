import httpStatus from "http-status";
import { ICreateCoursePayload, IUpdateCoursePayload } from "./course.interface.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";


const createCourse = async (payload: ICreateCoursePayload) => {
	const existing = await prisma.course.findUnique({
		where: {
			 code:payload.code
			 },
	});
	if (existing) {
		throw new AppError(httpStatus.CONFLICT, "Course code already exists");
	}

	const department = await prisma.department.findUnique({
		where: {
			 id: payload.departmentId
			 },
	});
	if (!department) {
		throw new AppError(httpStatus.NOT_FOUND, "Department not found");
	}

	if (payload.prerequisiteCourseIds?.length) {
		const foundCount = await prisma.course.count({
			where: { 
				id: {
					 in: payload.prerequisiteCourseIds 
					} 
				},
		});
		if (foundCount !== payload.prerequisiteCourseIds.length) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"One or more prerequisite course IDs are invalid",
			);
		}
	}

	return prisma.course.create({
		data: {
			code: payload.code,
			title: payload.title,
			creditHours: payload.creditHours,
			departmentId: payload.departmentId,
			prerequisites: payload.prerequisiteCourseIds
				? { connect: payload.prerequisiteCourseIds.map((id) => ({ id })) }
				: undefined,
		},
		include: { prerequisites: true },
	});
};

const getAllCourses = async (departmentId?: string) => {
	return prisma.course.findMany({
		where: departmentId ? { departmentId } : undefined,
		include: { prerequisites: true, department: true },
		orderBy: { code: "asc" },
	});
};

const getCourseById = async (id: string) => {
	const course = await prisma.course.findUnique({
		where: { id },
		include: { prerequisites: true, requiredFor: true },
	});
	if (!course) {
		throw new AppError(httpStatus.NOT_FOUND, "Course not found");
	}
	return course;
};

const updateCourse = async (id: string, payload: IUpdateCoursePayload) => {
	await getCourseById(id);

	return prisma.course.update({
		where: { id },
		data: {
			title: payload.title,
			creditHours: payload.creditHours,
			// `set` replaces the whole prerequisite list — send the full
			// desired list from the client, not just the ones being added.
			prerequisites: payload.prerequisiteCourseIds
				? { set: payload.prerequisiteCourseIds.map((pid) => ({ id: pid })) }
				: undefined,
		},
		include: { prerequisites: true },
	});
};

const deleteCourse = async (id: string) => {
	await getCourseById(id);
	const sectionCount = await prisma.section.count({
		where: { courseId: id },
	});
	if (sectionCount > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Cannot delete a course that has sections",
		);
	}
	return prisma.course.delete({ where: { id } });
};

export const CourseService = {
	createCourse,
	getAllCourses,
	getCourseById,
	updateCourse,
	deleteCourse,
};