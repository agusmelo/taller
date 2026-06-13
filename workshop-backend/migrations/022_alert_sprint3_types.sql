-- Sprint 3: tres nuevos tipos de alerta (quote_pending, upcoming_service,
-- high_value_lost) y los parámetros que requieren.
--
-- HU-14 quote_pending  → status='presupuesto' en jobs (debemos agregarlo al CHECK).
-- HU-15 upcoming_service → due_after_days (cuando se considera "por vencer").
-- HU-16 high_value_lost  → min_lifetime_value (gasto histórico mínimo).

-- ─── jobs.status: agregar 'presupuesto' ─────────────────────────────────────
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'jobs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ~ 'status.*IN.*''abierto''';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('abierto', 'terminado', 'pagado', 'presupuesto'));

-- ─── alert_definitions.alert_type: expandir CHECK ───────────────────────────
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'alert_definitions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ~ 'alert_type.*IN';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE alert_definitions DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE alert_definitions
  ADD CONSTRAINT alert_definitions_alert_type_check
  CHECK (alert_type IN (
    'overdue_service', 'payment_overdue', 'lost_customer', 'broken_pattern',
    'quote_pending', 'upcoming_service', 'high_value_lost'
  ));

-- ─── Nuevos parámetros ──────────────────────────────────────────────────────
ALTER TABLE alert_definitions
  ADD COLUMN IF NOT EXISTS due_after_days     INT;

ALTER TABLE alert_definitions
  ADD COLUMN IF NOT EXISTS min_lifetime_value NUMERIC(12, 2);

-- ─── Nuevo entity_type permitido en dismissals ──────────────────────────────
-- HU-14 usa job_id como entity. Ya estaba permitido en migración 019
-- (entity_type IN ('vehicle', 'client', 'job')), no hay que tocar.

-- ─── Índice para quote_pending ──────────────────────────────────────────────
-- Acelera la query "presupuestos con job_date < NOW() - threshold".
CREATE INDEX IF NOT EXISTS idx_jobs_presupuesto_date
  ON jobs(job_date DESC)
  WHERE deleted_at IS NULL AND status = 'presupuesto';
