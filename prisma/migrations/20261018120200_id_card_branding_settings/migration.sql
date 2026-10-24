-- Branding + validity for the student ID card.
ALTER TABLE "system_settings"
ADD COLUMN "universityName" TEXT NOT NULL DEFAULT 'University Management System',
ADD COLUMN "idCardValidityYears" INTEGER NOT NULL DEFAULT 1;
