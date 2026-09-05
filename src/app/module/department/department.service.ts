import httpStatus from "http-status";
import {
	ICreateDepartmentPayload,
	IUpdateDepartmentPayload,
} from "./department.interface.js";
import { AppError } from "../../utils/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { IQuary } from "../../interface/index.js";
import { DepartmentWhereInput } from "../../../generated/prisma/models.js";

const createDepartment = async (payload: ICreateDepartmentPayload) => {
	const existing = await prisma.department.findFirst({
		where: {
			OR: [
				{
					name: payload.name,
				},
				{
					code: payload.code,
				},
			],
		},
	});
	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Department with this name or code already exists",
		);
	}
	return prisma.department.create({
		data: payload,
	});
};

const getAllDepartments = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;

	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const andConditions: DepartmentWhereInput[] = [];

	
	if (query.searchTerm) {
	andConditions.push({
		OR: [
			{
				name: {
					contains: query.searchTerm,
					mode: "insensitive",
				},
			},
			{
				code: {
					contains: query.searchTerm,
					mode: "insensitive",
				},
			},
		],
	});
}



	if (query.code) {
	andConditions.push({
		code: {
			equals: query.code,
			mode: "insensitive",
		},
	});
}
	const departments = await prisma.department.findMany({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},

		take: limit,
		skip: skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		include: {
			_count: {
				select: {
					courses: true,
					students: true,
					instructors: true,
				},
			},
		},
	});

	const totalDepartmentCount = await prisma.department.count({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},
	});

	return {
		data: departments,

		meta: {
			page,
			limit,
			total: totalDepartmentCount,
			totalPages: Math.ceil(totalDepartmentCount / limit),
		},
	};
};

const getDepartmentById = async (id: string) => {
	const department = await prisma.department.findUnique({
		where: { id },
	});
	if (!department) {
		throw new AppError(httpStatus.NOT_FOUND, "Department not found");
	}
	return department;
};

const updateDepartment = async (
	id: string,
	payload: IUpdateDepartmentPayload,
) => {
	const department = await prisma.department.findUnique({
		where: { id },
	});
	if (!department) {
		throw new AppError(httpStatus.NOT_FOUND, "Department not found");
	}
	return prisma.department.update({ where: { id }, data: payload });
};

const deleteDepartment = async (id: string) => {
	const department = await prisma.department.findUnique({
		where: {
			 id 
			}
	});
	if (!department) {
		throw new AppError(httpStatus.NOT_FOUND, "Department not found");
	}

	const courseCount = await prisma.course.count({
		where: { 
			departmentId: id
		 },
	});
	if (courseCount > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Cannot delete a department that still has courses",
		);
	}
	return prisma.department.delete({ 
		where: { id }
	 });
};

export const DepartmentService = {
	createDepartment,
	getAllDepartments,
	getDepartmentById,
	updateDepartment,
	deleteDepartment,
};
