/*
  Warnings:

  - You are about to drop the column `feeId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the `admission_applications` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[installmentId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `installmentId` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "FeeStatus" ADD VALUE 'PARTIALLY_PAID';

-- DropForeignKey
ALTER TABLE "admission_applications" DROP CONSTRAINT "admission_applications_studentId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_feeId_fkey";

-- DropIndex
DROP INDEX "payments_feeId_key";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "feeId",
ADD COLUMN     "installmentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "semesters" ADD COLUMN     "firstInstallmentDue" TIMESTAMP(3),
ADD COLUMN     "installmentCount" INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE "admission_applications";

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "feeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installments_feeId_idx" ON "installments"("feeId");

-- CreateIndex
CREATE INDEX "installments_status_dueDate_idx" ON "installments"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "installments_feeId_number_key" ON "installments"("feeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_installmentId_key" ON "payments"("installmentId");

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
