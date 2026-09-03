import httpStatus from "http-status";
import {
	ICreateDepartmentPayload,
	IUpdateDepartmentPayload,
} from "./dpartment.interface.js";
import { AppError } from "../../utils/AppError.js";
import { prisma } from "../../lib/prisma.js";

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

const getAllDepartments = async () => {
	return prisma.department.findMany({
		orderBy: {
			name: "asc",
		},
	});
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
