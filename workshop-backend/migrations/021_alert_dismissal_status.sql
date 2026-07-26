-- Sprint 2 / HU-10 + HU-13: Estado de dismissal (snoozed/contacted/resolved)
-- y timestamp de contacto.
--
-- HU-10: al clickear el botón WhatsApp, el alert queda auto-pospuesto.
-- HU-13: además, se registra el contacto sin que la alerta desaparezca: el
-- ítem sigue visible hasta que venza el snooze, con un pill "Contactado".
--
-- status='snoozed'   → ítem oculto del feed hasta snooze_until
-- status='contacted' → ítem visible hasta snooze_until, con pill "Contactado"
-- status='resolved'  → ítem oculto permanentemente (reservado, no usado aún)

ALTER TABLE alert_dismissals
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'snoozed'
    CHECK (status IN ('snoozed', 'contacted', 'resolved'));

ALTER TABLE alert_dismissals
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

-- Índice para filtrar dismissals activas por estado en feed/badge.
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_status
  ON alert_dismissals (alert_definition_id, status, snooze_until);
