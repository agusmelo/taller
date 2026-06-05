-- Persistent alert definitions (workshop-wide), each with its own runner cadence.
-- Dismissals snooze a (definition, entity) pair until snooze_until.

CREATE TABLE alert_definitions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type           TEXT NOT NULL
    CHECK (alert_type IN ('overdue_service','payment_overdue','lost_customer','broken_pattern')),
  name                 TEXT NOT NULL,
  enabled              BOOLEAN NOT NULL DEFAULT true,

  -- params (only the relevant ones per alert_type; rest are NULL)
  catalog_item_id      UUID REFERENCES item_catalog(id) ON DELETE CASCADE,
  threshold_days       INT,
  bp_multiplier        NUMERIC(4,2),
  bp_min_days          INT,

  -- runner metadata
  eval_interval_hours  INT NOT NULL DEFAULT 4 CHECK (eval_interval_hours >= 1),
  last_evaluated_at    TIMESTAMPTZ,
  last_result_count    INT NOT NULL DEFAULT 0,
  last_run_error       TEXT,

  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uniqueness:
--   * overdue_service → one per (type, catalog_item_id)
--   * other types     → one per type (catalog_item_id always NULL)
CREATE UNIQUE INDEX uq_alert_def_with_item
  ON alert_definitions (alert_type, catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

CREATE UNIQUE INDEX uq_alert_def_no_item
  ON alert_definitions (alert_type)
  WHERE catalog_item_id IS NULL;

-- Index to find definitions that are due for re-evaluation
CREATE INDEX idx_alert_def_eval_due
  ON alert_definitions (last_evaluated_at)
  WHERE enabled = true;


CREATE TABLE alert_dismissals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_definition_id  UUID NOT NULL REFERENCES alert_definitions(id) ON DELETE CASCADE,
  entity_id            UUID NOT NULL,
  dismissed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snooze_until         TIMESTAMPTZ NOT NULL,
  UNIQUE (alert_definition_id, entity_id)
);

CREATE INDEX idx_alert_dismissals_active
  ON alert_dismissals (alert_definition_id, snooze_until);
