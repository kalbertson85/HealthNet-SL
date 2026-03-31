-- 017_add_lab_sample_timestamps.sql
-- Adds sample collection and receipt timestamps to lab_tests.

BEGIN;

ALTER TABLE lab_tests
	ADD sample_collected_at TIMESTAMP;

ALTER TABLE lab_tests
	ADD sample_received_at TIMESTAMP;

COMMIT;
