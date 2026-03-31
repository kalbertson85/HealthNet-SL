-- 037_ward_request_utilities.sql
-- Helper functions for ward medication requests.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_ward_request_dispensed_quantities(p_request_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.ward_medication_request_items
  SET quantity_dispensed = quantity_approved
  WHERE request_id = p_request_id
    AND quantity_approved IS NOT NULL
    AND (quantity_dispensed IS NULL OR quantity_dispensed = 0);
END;
$$ LANGUAGE plpgsql;

COMMIT;
