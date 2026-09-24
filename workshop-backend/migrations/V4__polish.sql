-- ============================================================
-- FASE 4: Incremental job number + cheque payment method
-- ============================================================

-- 1. Replace date-based job number with simple incremental
DROP FUNCTION IF EXISTS generate_job_number(date);
DROP TABLE IF EXISTS job_number_sequences;

CREATE TABLE IF NOT EXISTS job_global_sequence (
  id       INT PRIMARY KEY DEFAULT 1,
  last_seq INT NOT NULL DEFAULT 0,
  CHECK (id = 1)
);

-- Seed sequence from existing max job count
DO $$
DECLARE
  v_max INT;
BEGIN
  SELECT COUNT(*) INTO v_max FROM jobs;
  INSERT INTO job_global_sequence (id, last_seq)
  VALUES (1, COALESCE(v_max, 0))
  ON CONFLICT (id) DO UPDATE SET last_seq = GREATEST(job_global_sequence.last_seq, COALESCE(v_max, 0));
END $$;

CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE v_seq INT;
BEGIN
  UPDATE job_global_sequence SET last_seq = last_seq + 1
  WHERE id = 1
  RETURNING last_seq INTO v_seq;
  RETURN LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. Add 'cheque' to payment methods
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('efectivo', 'transferencia', 'credito', 'cheque'));
