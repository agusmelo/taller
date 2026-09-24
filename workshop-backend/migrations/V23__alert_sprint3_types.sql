-- Sprint 3: tres nuevos tipos de alerta (quote_pending, upcoming_service,
-- high_value_lost) y los parámetros que requieren.
--
-- HU-14 quote_pending  → status='presupuesto' en jobs (debemos agregarlo al CHECK).
-- HU-15 upcoming_service → due_after_days (cuando se considera "por vencer").
-- HU-16 high_value_lost  → min_lifetime_value (gasto histórico mínimo).

-- ─── jobs.status: agregar 'presupuesto' ─────────────────────────────────────
-- El CHECK original es inline (CREATE TABLE) → PG auto-genera el nombre
-- jobs_status_check y normaliza la expresión a `= ANY (ARRAY[...])`, por lo
-- que un regex contra `IN` no matchea. Recorremos todos los CHECK aplicados
-- a la columna status y los dropeamos por nombre real antes de re-crear uno.
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT DISTINCT con.conname
    FROM pg_constraint con
    JOIN pg_class     c ON c.oid = con.conrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE c.relname = 'jobs'
      AND con.contype = 'c'
      AND a.attname  = 'status'
  LOOP
    EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('abierto', 'terminado', 'pagado', 'presupuesto'));

-- ─── alert_definitions.alert_type: expandir CHECK ───────────────────────────
-- Mismo problema de naming/normalización que jobs.status: el CHECK inline de
-- la migración 014 quedó como `alert_definitions_alert_type_check` con la
-- forma `= ANY (ARRAY[...])`.
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT DISTINCT con.conname
    FROM pg_constraint con
    JOIN pg_class     c ON c.oid = con.conrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE c.relname = 'alert_definitions'
      AND con.contype = 'c'
      AND a.attname  = 'alert_type'
  LOOP
    EXECUTE format('ALTER TABLE alert_definitions DROP CONSTRAINT %I', cname);
  END LOOP;
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
