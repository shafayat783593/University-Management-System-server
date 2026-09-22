/*
  Warnings:

  - A unique constraint covering the columns `[studentId,sectionId]` on the table `enrollments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'WITHDRAWN';

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_studentId_sectionId_key" ON "enrollments"("studentId", "sectionId");
