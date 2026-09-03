-- CreateEnum
CREATE TYPE "InstructorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "instructor_profiles" ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "resumePublicId" TEXT,
ADD COLUMN     "resumeUrl" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "verificationStatus" "InstructorApplicationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "needPasswordChange" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "instructor_profiles_verificationStatus_idx" ON "instructor_profiles"("verificationStatus");
