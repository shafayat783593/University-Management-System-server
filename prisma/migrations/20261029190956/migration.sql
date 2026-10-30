-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'News',
ADD COLUMN     "imagePublicId" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "section_instructors" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_instructors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "section_instructors_instructorId_idx" ON "section_instructors"("instructorId");

-- CreateIndex
CREATE UNIQUE INDEX "section_instructors_sectionId_instructorId_key" ON "section_instructors"("sectionId", "instructorId");

-- CreateIndex
CREATE INDEX "announcements_category_createdAt_idx" ON "announcements"("category", "createdAt");

-- AddForeignKey
ALTER TABLE "section_instructors" ADD CONSTRAINT "section_instructors_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_instructors" ADD CONSTRAINT "section_instructors_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
