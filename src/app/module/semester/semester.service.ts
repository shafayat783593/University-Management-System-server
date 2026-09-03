


import httpStatus from "http-status";
import { ICreateSemesterPayload, IUpdateSemesterStatusPayload } from "./semester.interface.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { SemesterStatus } from "../../../generated/prisma/enums.js";
import { IQuary } from "../../interface/index.js";
import { SemesterWhereInput } from "../../../generated/prisma/models.js";


const createSemester = async (payload: ICreateSemesterPayload) => {
	const existing = await prisma.semester.findUnique({
		where:{
            year_term:{
                term:payload.term,
                year:payload.year
            }
        }
	});
	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Semester already exists for this year and term",
		);
	}

	return prisma.semester.create({
		data: {
			name: payload.name,
			year: payload.year,
			term: payload.term,
			enrollmentStart: payload.enrollmentStart ? new Date(payload.enrollmentStart)
				: undefined,
			enrollmentEnd: payload.enrollmentEnd ? new Date(payload.enrollmentEnd)
				: undefined,
		},
	});
};

const getAllSemesters = async (query: IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;

	const sortBy = query.sortBy || "year";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const andConditions: SemesterWhereInput[] = [];

	
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
					term: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}


	if (query.year) {
		andConditions.push({
			year: Number(query.year),
		});
	}

	
	if (query.term) {
		andConditions.push({
			term: {
				equals: query.term,
				mode: "insensitive",
			},
		});
	}


	if (query.status) {
		andConditions.push({
			status: query.status,
		});
	}


	const semesters = await prisma.semester.findMany({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		include: {
			_count: {
				select: {
					sections: true,
					fees: true,
				},
			},
		},
	});


	const totalSemesterCount = await prisma.semester.count({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},
	});

	return {
		data: semesters,

		meta: {
			page,
			limit,
			total: totalSemesterCount,
			totalPages: Math.ceil(totalSemesterCount / limit),
		},
	};
};
const getSemesterById = async (id: string) => {
	const semester = await prisma.semester.findUnique({
         where: {
             id 
            }
         });
	if (!semester) {
		throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	}
	return semester;
};

const updateSemesterStatus = async (
	id: string,
	payload: IUpdateSemesterStatusPayload,
) => {
	
    
    const semester = await prisma.semester.findUnique({
         where: {
             id 
            }
         });
	if (!semester) {
		throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	}

	if (
		semester.status === SemesterStatus.CLOSED &&
		payload.status !== SemesterStatus.CLOSED
	) {
		throw new AppError(httpStatus.CONFLICT, "Cannot reopen a closed semester");
	}

	return prisma.semester.update({
		where: {
             id 
            },
		data: { status: payload.status },
	});
};

export const SemesterService = {
	createSemester,
	getAllSemesters,
	getSemesterById,
	updateSemesterStatus,
};