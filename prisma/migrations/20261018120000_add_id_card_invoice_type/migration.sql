-- Add a dedicated invoice type for the one-off ID card charge.
-- The ID card fee is billed on its own invoice so it is never bundled with
-- the admission invoice (no double charge) and so a student can pay for
-- and download the card independently of admission.
ALTER TYPE "InvoiceType" ADD VALUE 'ID_CARD';
