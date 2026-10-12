-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "admission_applications" ADD COLUMN     "applicationFeeAmount" DOUBLE PRECISION,
ADD COLUMN     "applicationFeeTrxId" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "status" "AdmissionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "testDate" TIMESTAMP(3),
ADD COLUMN     "testScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "admissionInstallmentCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "applicationFeeAmount" DOUBLE PRECISION;
