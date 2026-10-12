/*
  Warnings:

  - You are about to drop the column `group` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `hscBoard` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `hscGPA` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `hscPassingYear` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `hscRegistration` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `hscRoll` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `previousInstitute` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `sscBoard` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `sscGPA` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `sscPassingYear` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `sscRegistration` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `sscRoll` on the `student_profiles` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- AlterTable
ALTER TABLE "student_profiles" DROP COLUMN "group",
DROP COLUMN "hscBoard",
DROP COLUMN "hscGPA",
DROP COLUMN "hscPassingYear",
DROP COLUMN "hscRegistration",
DROP COLUMN "hscRoll",
DROP COLUMN "previousInstitute",
DROP COLUMN "sscBoard",
DROP COLUMN "sscGPA",
DROP COLUMN "sscPassingYear",
DROP COLUMN "sscRegistration",
DROP COLUMN "sscRoll";

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "previousInstitution" TEXT NOT NULL,
    "sscBoard" TEXT,
    "sscYear" INTEGER,
    "sscGpa" DOUBLE PRECISION,
    "hscBoard" TEXT,
    "hscYear" INTEGER,
    "hscGpa" DOUBLE PRECISION,
    "guardianOccupation" TEXT,
    "presentAddress" TEXT,
    "permanentAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_studentId_key" ON "admission_applications"("studentId");

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
