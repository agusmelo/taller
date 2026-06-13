-- Sprint 2 / HU-11: Plantillas editables de mensajes de WhatsApp por tipo de alerta.
--
-- Una plantilla por tipo. Las variables soportadas se interpolan en el frontend:
--   {client_name}, {entity_label}, {days}, {service_name}
-- Si no existe plantilla para un tipo, el frontend usa el texto hardcodeado actual.

CREATE TABLE IF NOT EXISTS alert_wa_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type  TEXT NOT NULL UNIQUE,
  template    TEXT NOT NULL,
  workshop_id TEXT NOT NULL DEFAULT 'default',
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_wa_templates_workshop
  ON alert_wa_templates (workshop_id, alert_type);
