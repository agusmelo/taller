-- Migration 003: Job number uses job_date instead of NOW()
-- This allows job numbers to reflect the selected date, not creation time

CREATE OR REPLACE FUNCTION generate_job_number(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT AS $$
DECLARE
  v_year_month CHAR(7);
  v_seq        INTEGER;
BEGIN
  v_year_month := TO_CHAR(p_date, 'YYYY-MM');
  INSERT INTO job_number_sequences (year_month, last_seq)
  VALUES (v_year_month, 1)
  ON CONFLICT (year_month) DO UPDATE
    SET last_seq = job_number_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN v_year_month || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
