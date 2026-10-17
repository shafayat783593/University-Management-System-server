/*
  Warnings:

  - You are about to drop the column `applicationFeeAmount` on the `admission_applications` table. All the data in the column will be lost.
  - You are about to drop the column `applicationFeeTrxId` on the `admission_applications` table. All the data in the column will be lost.
  - You are about to drop the column `reviewNote` on the `admission_applications` table. All the data in the column will be lost.
  - You are about to drop the column `reviewedBy` on the `admission_applications` table. All the data in the column will be lost.
  - You are about to drop the column `testDate` on the `admission_applications` table. All the data in the column will be lost.
  - You are about to drop the column `testScore` on the `admission_applications` table. All the data in the column will be lost.
  - The `status` column on the `admission_applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `examFee` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `firstDueDate` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `graceDays` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `installmentCount` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `labFee` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `lateFeeAmount` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `libraryFee` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `otherFee` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `otherLabel` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `perCreditRate` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `registrationFee` on the `fee_policies` table. All the data in the column will be lost.
  - You are about to drop the column `feeId` on the `installments` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `installments` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `status` column on the `installments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `feeId` on the `invoice_items` table. All the data in the column will be lost.
  - You are about to drop the column `kind` on the `invoice_items` table. All the data in the column will be lost.
  - You are about to drop the column `label` on the `invoice_items` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `invoice_items` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `feeAmount` on the `semesters` table. All the data in the column will be lost.
  - You are about to drop the column `firstInstallmentDue` on the `semesters` table. All the data in the column will be lost.
  - You are about to drop the column `installmentCount` on the `semesters` table. All the data in the column will be lost.
  - You are about to drop the column `admissionFeeAmount` on the `system_settings` table. All the data in the column will be lost.
  - You are about to drop the column `admissionInstallmentCount` on the `system_settings` table. All the data in the column will be lost.
  - You are about to drop the column `applicationFeeAmount` on the `system_settings` table. All the data in the column will be lost.
  - You are about to drop the `fees` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payments` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[invoiceId,number]` on the table `installments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `amount` to the `fee_policies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `invoiceType` to the `fee_policies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemType` to the `fee_policies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `fee_policies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `invoiceId` to the `installments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `invoice_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `invoiceId` to the `invoice_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemType` to the `invoice_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitAmount` to the `invoice_items` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FeeItemType" AS ENUM ('APPLICATION', 'ADMISSION', 'ID_CARD', 'CAUTION_DEPOSIT', 'TUITION', 'REGISTRATION', 'LABORATORY', 'EXAMINATION', 'LIBRARY', 'LATE_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeCalcMethod" AS ENUM ('FLAT', 'PER_CREDIT');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('APPLICATION', 'ADMISSION', 'SEMESTER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "LateFeeType" AS ENUM ('NONE', 'FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('WAIVER', 'SCHOLARSHIP', 'DISCOUNT', 'ADJUSTMENT', 'LATE_FEE');

-- CreateEnum
CREATE TYPE "AdvanceType" AS ENUM ('NONE', 'PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "fee_policies" DROP CONSTRAINT "fee_policies_semesterId_fkey";

-- DropForeignKey
ALTER TABLE "fees" DROP CONSTRAINT "fees_semesterId_fkey";

-- DropForeignKey
ALTER TABLE "fees" DROP CONSTRAINT "fees_studentId_fkey";

-- DropForeignKey
ALTER TABLE "installments" DROP CONSTRAINT "installments_feeId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_feeId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_installmentId_fkey";

-- DropIndex
DROP INDEX "fee_policies_semesterId_key";

-- DropIndex
DROP INDEX "installments_feeId_idx";

-- DropIndex
DROP INDEX "installments_feeId_number_key";

-- DropIndex
DROP INDEX "invoice_items_feeId_idx";

-- AlterTable
ALTER TABLE "admission_applications" DROP COLUMN "applicationFeeAmount",
DROP COLUMN "applicationFeeTrxId",
DROP COLUMN "reviewNote",
DROP COLUMN "reviewedBy",
DROP COLUMN "testDate",
DROP COLUMN "testScore",
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedById" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED';

-- AlterTable
ALTER TABLE "fee_policies" DROP COLUMN "examFee",
DROP COLUMN "firstDueDate",
DROP COLUMN "graceDays",
DROP COLUMN "installmentCount",
DROP COLUMN "labFee",
DROP COLUMN "lateFeeAmount",
DROP COLUMN "libraryFee",
DROP COLUMN "otherFee",
DROP COLUMN "otherLabel",
DROP COLUMN "perCreditRate",
DROP COLUMN "registrationFee",
ADD COLUMN     "amount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "calcMethod" "FeeCalcMethod" NOT NULL DEFAULT 'FLAT',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "effectiveTo" TIMESTAMP(3),
ADD COLUMN     "invoiceType" "InvoiceType" NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isRefundable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "itemType" "FeeItemType" NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ALTER COLUMN "semesterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "installments" DROP COLUMN "feeId",
ADD COLUMN     "invoiceId" TEXT NOT NULL,
ADD COLUMN     "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "status",
ADD COLUMN     "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "invoice_items" DROP COLUMN "feeId",
DROP COLUMN "kind",
DROP COLUMN "label",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "invoiceId" TEXT NOT NULL,
ADD COLUMN     "isRefundable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "itemType" "FeeItemType" NOT NULL,
ADD COLUMN     "policyId" TEXT,
ADD COLUMN     "quantity" DECIMAL(8,2) NOT NULL DEFAULT 1,
ADD COLUMN     "unitAmount" DECIMAL(12,2) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "semesters" DROP COLUMN "feeAmount",
DROP COLUMN "firstInstallmentDue",
DROP COLUMN "installmentCount";

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "admissionConfirmedAt" TIMESTAMP(3),
ALTER COLUMN "studentIdCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "system_settings" DROP COLUMN "admissionFeeAmount",
DROP COLUMN "admissionInstallmentCount",
DROP COLUMN "applicationFeeAmount",
ADD COLUMN     "admissionPaymentRequiredToEnroll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "applicationFeeRequired" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "fees";

-- DropTable
DROP TABLE "payments";

-- DropEnum
DROP TYPE "AdmissionStatus";

-- DropEnum
DROP TYPE "FeeStatus";

-- DropEnum
DROP TYPE "FeeType";

-- DropEnum
DROP TYPE "InvoiceItemKind";

-- DropEnum
DROP TYPE "PaymentStatus";

-- CreateTable
CREATE TABLE "installment_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "semesterId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "advanceType" "AdvanceType" NOT NULL DEFAULT 'NONE',
    "advanceValue" DECIMAL(12,2),
    "customPercents" JSONB,
    "intervalMonths" INTEGER NOT NULL DEFAULT 1,
    "firstDueDate" TIMESTAMP(3),
    "firstDueOffsetDays" INTEGER NOT NULL DEFAULT 7,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "lateFeeType" "LateFeeType" NOT NULL DEFAULT 'NONE',
    "lateFeeValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowPartialPayment" BOOLEAN NOT NULL DEFAULT false,
    "restrictOnOverdue" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installment_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_waivers" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "semesterId" TEXT,
    "type" "AdjustmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_waivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "studentId" TEXT NOT NULL,
    "semesterId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payableAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billedCredits" INTEGER NOT NULL DEFAULT 0,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_adjustments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "installmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'BKASH',
    "gatewayPaymentId" TEXT NOT NULL,
    "gatewayTrxId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "excessAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receiptNumber" TEXT,
    "gatewayResponse" JSONB,
    "failureReason" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT true,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayRefundTrxId" TEXT,
    "gatewayResponse" JSONB,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installment_policies_semesterId_key" ON "installment_policies"("semesterId");

-- CreateIndex
CREATE INDEX "installment_policies_isDefault_isActive_idx" ON "installment_policies"("isDefault", "isActive");

-- CreateIndex
CREATE INDEX "student_waivers_studentId_isActive_idx" ON "student_waivers"("studentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_invoiceNumber_key" ON "fee_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "fee_invoices_studentId_idx" ON "fee_invoices"("studentId");

-- CreateIndex
CREATE INDEX "fee_invoices_semesterId_idx" ON "fee_invoices"("semesterId");

-- CreateIndex
CREATE INDEX "fee_invoices_status_idx" ON "fee_invoices"("status");

-- CreateIndex
CREATE INDEX "fee_invoices_dueDate_idx" ON "fee_invoices"("dueDate");

-- CreateIndex
CREATE INDEX "fee_invoices_type_studentId_idx" ON "fee_invoices"("type", "studentId");

-- CreateIndex
CREATE INDEX "invoice_adjustments_invoiceId_idx" ON "invoice_adjustments"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_adjustments_installmentId_type_key" ON "invoice_adjustments"("installmentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gatewayPaymentId_key" ON "payment_transactions"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gatewayTrxId_key" ON "payment_transactions"("gatewayTrxId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_receiptNumber_key" ON "payment_transactions"("receiptNumber");

-- CreateIndex
CREATE INDEX "payment_transactions_invoiceId_idx" ON "payment_transactions"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_transactions_studentId_idx" ON "payment_transactions"("studentId");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_allocations_installmentId_idx" ON "payment_allocations"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_transactionId_installmentId_key" ON "payment_allocations"("transactionId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_gatewayRefundTrxId_key" ON "refunds"("gatewayRefundTrxId");

-- CreateIndex
CREATE INDEX "refunds_transactionId_idx" ON "refunds"("transactionId");

-- CreateIndex
CREATE INDEX "admission_applications_status_idx" ON "admission_applications"("status");

-- CreateIndex
CREATE INDEX "fee_policies_invoiceType_itemType_isActive_idx" ON "fee_policies"("invoiceType", "itemType", "isActive");

-- CreateIndex
CREATE INDEX "fee_policies_departmentId_idx" ON "fee_policies"("departmentId");

-- CreateIndex
CREATE INDEX "fee_policies_semesterId_idx" ON "fee_policies"("semesterId");

-- CreateIndex
CREATE INDEX "installments_invoiceId_idx" ON "installments"("invoiceId");

-- CreateIndex
CREATE INDEX "installments_status_dueDate_idx" ON "installments"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "installments_invoiceId_number_key" ON "installments"("invoiceId", "number");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- AddForeignKey
ALTER TABLE "fee_policies" ADD CONSTRAINT "fee_policies_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_policies" ADD CONSTRAINT "fee_policies_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_policies" ADD CONSTRAINT "installment_policies_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_waivers" ADD CONSTRAINT "student_waivers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_waivers" ADD CONSTRAINT "student_waivers_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
