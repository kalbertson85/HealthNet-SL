-- 043_invoice_item_type_for_fhc.sql
-- Add an item_type column to invoice_items so we can mark which items are covered by Free Health Care.

BEGIN;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS item_type TEXT;

COMMIT;
