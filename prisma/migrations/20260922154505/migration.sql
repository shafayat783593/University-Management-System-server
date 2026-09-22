-- AlterTable
ALTER TABLE "semesters" ADD COLUMN     "examWeekEnd" TIMESTAMP(3),
ADD COLUMN     "examWeekStart" TIMESTAMP(3),
ADD COLUMN     "feeAmount" DOUBLE PRECISION,
ADD COLUMN     "resultPublishDate" TIMESTAMP(3);
