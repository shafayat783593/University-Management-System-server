/*
  Warnings:

  - Added the required column `group` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hscBoard` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hscGPA` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hscPassingYear` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hscRegistration` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hscRoll` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `previousInstitute` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sscBoard` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sscGPA` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sscPassingYear` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sscRegistration` to the `student_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sscRoll` to the `student_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "description" TEXT,
ADD COLUMN     "tuitionFeePerSemester" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "group" TEXT NOT NULL,
ADD COLUMN     "hscBoard" TEXT NOT NULL,
ADD COLUMN     "hscGPA" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "hscPassingYear" INTEGER NOT NULL,
ADD COLUMN     "hscRegistration" TEXT NOT NULL,
ADD COLUMN     "hscRoll" TEXT NOT NULL,
ADD COLUMN     "previousInstitute" TEXT NOT NULL,
ADD COLUMN     "sscBoard" TEXT NOT NULL,
ADD COLUMN     "sscGPA" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "sscPassingYear" INTEGER NOT NULL,
ADD COLUMN     "sscRegistration" TEXT NOT NULL,
ADD COLUMN     "sscRoll" TEXT NOT NULL;
