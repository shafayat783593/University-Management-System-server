import { prisma } from "./prisma.js";

/**
 * A section has one LEAD instructor (always set) and any number of co-instructors.
 * All of them have the same teaching rights.
 */


/** Check if an instructor teaches a specific section. */
export const canTeachSection = async (sectionId: string, instructorId: string): Promise<boolean> => {
    const section = await prisma.section.findFirst({
        where: {
            id: sectionId,
            OR: [
                {
                    instructorId
                },
                {
                    coInstructors: { some: { instructorId } }
                }
            ],
        },
        select: { id: true }, 
    });
    return !!section;
};

/** True only if the instructor teaches EVERY one of these sections. */
export const canTeachAllSections = async (sectionIds: string[], instructorId: string): Promise<boolean> => {
    if (sectionIds.length === 0) return true;

    const uniqueIds = Array.from(new Set(sectionIds));

    const count = await prisma.section.count({
        where: {
            id: { in: uniqueIds },
            OR: [
                { instructorId },
                { coInstructors: { some: { instructorId } } }
            ],
        },
    });

    return count === uniqueIds.length;
};

/** Returns instructor IDs: Lead first, then co-instructors. */
export const getSectionInstructorIds = async (sectionId: string): Promise<string[]> => {
    const section = await prisma.section.findUnique({
        where: { id: sectionId },
        select: {
            instructorId: true,
            coInstructors: { select: { instructorId: true } },
        },
    });

    if (!section) return [];

    return [
        section.instructorId,
        ...section.coInstructors.map((c) => c.instructorId)
    ];
};