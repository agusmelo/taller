-- ============================================================
-- FASE 3: job_date, payment_date, is_locked
-- ============================================================

-- Fecha del trabajo (ingreso del vehiculo)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Bloqueo de edicion para trabajos terminados/pagados
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Fecha real del pago (seleccionable por el usuario, distinto de paid_at que es timestamp de auditoria)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill: set job_date from created_at for existing jobs
UPDATE jobs SET job_date = created_at::date WHERE job_date = CURRENT_DATE AND created_at::date != CURRENT_DATE;

-- Backfill: set payment_date from paid_at for existing payments
UPDATE payments SET payment_date = paid_at::date WHERE payment_date = CURRENT_DATE AND paid_at::date != CURRENT_DATE;

-- Lock already-terminated/paid jobs
UPDATE jobs SET is_locked = TRUE WHERE status IN ('terminado', 'pagado') AND is_locked = FALSE;
