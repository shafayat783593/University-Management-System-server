-- CreateTable
CREATE TABLE "admission_applications" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "previousInstitution" TEXT NOT NULL,
    "sscBoard" TEXT,
    "sscYear" INTEGER,
    "sscGpa" DOUBLE PRECISION,
    "hscBoard" TEXT,
    "hscYear" INTEGER,
    "hscGpa" DOUBLE PRECISION,
    "guardianOccupation" TEXT,
    "presentAddress" TEXT,
    "permanentAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_studentId_key" ON "admission_applications"("studentId");

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
