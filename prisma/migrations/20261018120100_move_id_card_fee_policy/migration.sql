-- The ID card fee now lives on its own ID_CARD invoice instead of riding
-- along on the ADMISSION invoice. Re-point the existing policy so the
-- admission fee preview (and the admission invoice) no longer shows an
-- "id card" line that is never actually billed there.
UPDATE "fee_policies"
SET "invoiceType" = 'ID_CARD'
WHERE "itemType" = 'ID_CARD' AND "invoiceType" <> 'ID_CARD';
