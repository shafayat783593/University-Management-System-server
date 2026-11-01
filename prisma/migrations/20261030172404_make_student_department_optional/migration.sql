-- DropForeignKey
ALTER TABLE "student_profiles" DROP CONSTRAINT "student_profiles_departmentId_fkey";

-- AlterTable
ALTER TABLE "student_profiles" ALTER COLUMN "departmentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
