/*
  Warnings:

  - You are about to drop the column `description` on the `departments` table. All the data in the column will be lost.
  - You are about to drop the column `tuitionFeePerSemester` on the `departments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "departments" DROP COLUMN "description",
DROP COLUMN "tuitionFeePerSemester";

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "examDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "class_routines" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_routines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_routines_sectionId_idx" ON "class_routines"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "class_routines_sectionId_dayOfWeek_startTime_key" ON "class_routines"("sectionId", "dayOfWeek", "startTime");

-- AddForeignKey
ALTER TABLE "class_routines" ADD CONSTRAINT "class_routines_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
