-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('ADMISSION', 'TUITION');

-- DropForeignKey
ALTER TABLE "fees" DROP CONSTRAINT "fees_semesterId_fkey";

-- AlterTable
ALTER TABLE "fees" ADD COLUMN     "type" "FeeType" NOT NULL DEFAULT 'TUITION',
ALTER COLUMN "semesterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "admissionFeeAmount" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fees_type_idx" ON "fees"("type");

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
