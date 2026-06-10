-- Sprint 1 / HU-08: entity_type en alert_dismissals
--
-- Hoy el dismissal se identifica por (alert_definition_id, entity_id), pero
-- entity_id es UUID y puede chocar entre tipos (un vehicle.id y un client.id
-- distintos no chocan en práctica pero el contrato es frágil cuando se
-- agregan tipos como quote_pending donde entity es un job).
--
-- Agregamos entity_type como discriminador. Default 'vehicle' para backfill
-- de filas existentes (la mayoría son overdue_service → vehicles).
-- El UNIQUE pasa a (alert_definition_id, entity_id, entity_type).

ALTER TABLE alert_dismissals
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'vehicle'
    CHECK (entity_type IN ('vehicle', 'client', 'job'));

-- Reemplazar el UNIQUE viejo por uno que incluya entity_type.
-- DO block para encontrar el nombre real del constraint (puede variar).
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'alert_dismissals'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ~ 'alert_definition_id, entity_id\)$';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE alert_dismissals DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE alert_dismissals
  DROP CONSTRAINT IF EXISTS alert_dismissals_definition_entity_type_key;

ALTER TABLE alert_dismissals
  ADD CONSTRAINT alert_dismissals_definition_entity_type_key
    UNIQUE (alert_definition_id, entity_id, entity_type);
