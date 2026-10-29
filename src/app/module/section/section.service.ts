import httpStatus from "http-status";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { InstructorApplicationStatus } from "../../../generated/prisma/enums.js";
import { IQuary } from "../../interface/index.js";
import { SectionWhereInput } from "../../../generated/prisma/models.js";
import { ICreateSectionPayload, IUpdateSectionPayload } from "./section.interface.js";


const USER_NO_PASSWORD = { omit: { password: true } } as const;

const INSTRUCTORS_INCLUDE = {
	instructor: { include: { user: USER_NO_PASSWORD } },
	coInstructors: { include: { instructor: { include: { user: USER_NO_PASSWORD } } } },
} as const;

/** Adds `instructors: [lead, ...co]` (lead flagged) while keeping the original `instructor` field. */
const withInstructors = <T extends {instructor: object;coInstructors: { instructor: object }[]}   > (section: T) => ({
	...section,
	instructors: [
		{ ...section.instructor, isPrimary: true },
		...section.coInstructors.map((c) => ({ ...c.instructor, isPrimary: false })),
	],
});

/** Every id must be an APPROVED instructor; the lead is removed from the co list; duplicates dropped. */
const resolveCoInstructors = async (instructorId: string, coInstructorIds: string[] | undefined): Promise<string[]> => {

	const unique = [...new Set(coInstructorIds ?? [])].filter((id) => id !== instructorId);

	if (unique.length === 0) return [];
	const found = await prisma.instructorProfile.findMany({ where: { id: { in: unique } } });
	if (found.length !== unique.length) {
		throw new AppError(httpStatus.NOT_FOUND, "One of the co-instructors was not found");
	}
	if (found.some((i) => i.verificationStatus !== InstructorApplicationStatus.APPROVED)) {
		throw new AppError(httpStatus.BAD_REQUEST, "Every co-instructor must have an approved application");
	}
	return unique;
};

const createSection = async (payload: ICreateSectionPayload) => {
	const [course, semester, instructor] = await Promise.all([
		prisma.course.findUnique({
			where: {
				id: payload.courseId
			}
		}),
		prisma.semester.findUnique({
			where: {
				id: payload.semesterId
			}
		}),
		prisma.instructorProfile.findUnique({
			where:
				{ id: payload.instructorId }
		}),
	]);

	if (!course) throw new AppError(httpStatus.NOT_FOUND, "Course not found");
	if (!semester) throw new AppError(httpStatus.NOT_FOUND, "Semester not found");
	if (!instructor) throw new AppError(httpStatus.NOT_FOUND, "Instructor not found");
	
	if (instructor.verificationStatus !== InstructorApplicationStatus.APPROVED) {
		throw new AppError(httpStatus.BAD_REQUEST, "Instructor's application has not been approved yet");
	}
	if (payload.capacity <= 0) {
		throw new AppError(httpStatus.BAD_REQUEST, "Capacity must be greater than zero");
	}

	const coIds = await resolveCoInstructors(payload.instructorId, payload.coInstructorIds);

	const created = await prisma.section.create({
		data: {
			courseId: payload.courseId,
			semesterId: payload.semesterId,
			instructorId: payload.instructorId,
			capacity: payload.capacity,
			schedule: payload.schedule,
			coInstructors: { create: coIds.map((instructorId) => ({ instructorId })) },
		},
		include: INSTRUCTORS_INCLUDE,
	});
	return withInstructors(created);
};

const getAllSections = async (query:IQuary) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;

	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const andConditions: SectionWhereInput[] = [];

	
	if (query.semesterId) {
		andConditions.push({
			semesterId: query.semesterId,
		});
	}

	
	if (query.courseId) {
		andConditions.push({
			courseId: query.courseId,
		});
	}

	
	if (query.instructorId) {
		andConditions.push(teachesSectionWhere(query.instructorId as string));
	}
	if(	query.title){
		andConditions.push({
			course:{
				title:{
					contains: query.title,
					mode:"insensitive"
				}
			}
		})
	}
	if(query.status){
		andConditions.push({
			semester:{
				status: query.status,
				
			}
		})
	}
	if(query.name){
		andConditions.push({
		semester:{
			name:{
				contains: query.name,
				mode:"insensitive"
			}
		}
		})
	}


	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{
					schedule: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					course: {
						OR: [
							{
								code: {
									contains: query.searchTerm,
									mode: "insensitive",
								},
							},
							{
								title: {
									contains: query.searchTerm,
									mode: "insensitive",
								},
							},
						],
					},
				},
			],
		});
	}

	
	const sections = await prisma.section.findMany({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},

		take: limit,
		skip,

		orderBy: {
			[sortBy]: sortOrder,
		},

		include: {
			course: true,
			semester: true,
			...INSTRUCTORS_INCLUDE,

			_count: {
				select: {
					enrollments: true,
					attendanceSessions: true,
					exams: true,
				},
			},
		},
	});

	
	const totalSectionCount = await prisma.section.count({
		where: {
			AND: andConditions.length > 0 ? andConditions : undefined,
		},
	});

	return {
		data: sections.map(withInstructors),

		meta: {
			page,
			limit,
			total: totalSectionCount,
			totalPages: Math.ceil(totalSectionCount / limit),
		},
	};
};

const getSectionById = async (id: string) => {
	const section = await prisma.section.findUnique({
		where: { id },
		include: {
			course: true,
			semester: true,
			...INSTRUCTORS_INCLUDE,
		},
	});
	if (!section) {
		throw new AppError(httpStatus.NOT_FOUND, "Section not found");
	}
	return withInstructors(section);
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
		if (instructor.verificationStatus !== InstructorApplicationStatus.APPROVED) {
			throw new AppError(httpStatus.BAD_REQUEST, "Instructor's application has not been approved yet");
		}
	}

	const { coInstructorIds, ...fields } = payload;
	const leadId = payload.instructorId ?? section.instructorId;

	// co list: replace when sent; otherwise just make sure the (possibly new) lead isn't also a co-instructor
	const coIds =
		coInstructorIds !== undefined
			? await resolveCoInstructors(leadId, coInstructorIds)
			: undefined;

	const updated = await prisma.$transaction(async (tx) => {
		if (coIds !== undefined) {
			await tx.sectionInstructor.deleteMany({ where: { sectionId: id } });
			if (coIds.length > 0) {
				await tx.sectionInstructor.createMany({
					data: coIds.map((instructorId) => ({ sectionId: id, instructorId })),
				});
			}
		} else if (payload.instructorId) {
			await tx.sectionInstructor.deleteMany({ where: { sectionId: id, instructorId: payload.instructorId } });
		}
		return tx.section.update({ where: { id }, data: fields, include: INSTRUCTORS_INCLUDE });
	});
	return withInstructors(updated);
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