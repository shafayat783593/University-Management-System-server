/*
  Warnings:

  - Made the column `departmentId` on table `student_profiles` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "student_profiles" DROP CONSTRAINT "student_profiles_departmentId_fkey";

-- AlterTable
ALTER TABLE "student_profiles" ALTER COLUMN "departmentId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
