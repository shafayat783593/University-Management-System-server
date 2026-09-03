


import httpStatus from "http-status";
import { ICreateSemesterPayload, IUpdateSemesterStatusPayload } from "./semester.interface.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { SemesterStatus } from "../../../generated/prisma/enums.js";


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

const getAllSemesters = async () => {
	return prisma.semester.findMany({
		orderBy: [
            {
                 year: "desc" }, {
                     term: "asc" }],
	});
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