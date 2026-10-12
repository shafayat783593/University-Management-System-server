-- CreateEnum
CREATE TYPE "InvoiceItemKind" AS ENUM ('TUITION', 'REGISTRATION', 'LAB', 'EXAM', 'LIBRARY', 'ADMISSION', 'OTHER');

-- AlterEnum
ALTER TYPE "FeeStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "fees" ADD COLUMN     "adjustmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "feeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "InvoiceItemKind" NOT NULL DEFAULT 'OTHER',
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_policies" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "perCreditRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "registrationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "examFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "libraryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherLabel" TEXT,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "firstDueDate" TIMESTAMP(3),
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "lateFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_items_feeId_idx" ON "invoice_items"("feeId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_policies_semesterId_key" ON "fee_policies"("semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "fees_invoiceNo_key" ON "fees"("invoiceNo");

-- CreateIndex
CREATE INDEX "fees_semesterId_idx" ON "fees"("semesterId");

-- CreateIndex
CREATE INDEX "fees_status_idx" ON "fees"("status");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_policies" ADD CONSTRAINT "fee_policies_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
