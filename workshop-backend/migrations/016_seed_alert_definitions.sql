-- Sprint 0 / HU-03
-- Seed inicial de definiciones de alerta para los 3 tipos que no requieren
-- un ítem específico del catálogo. overdue_service no se siembra porque
-- depende de configurar manualmente qué ítem del catálogo seguir.
--
-- ON CONFLICT DO NOTHING: si el operador ya creó manualmente una definición
-- del mismo tipo, no la pisamos. La migración es idempotente y segura para
-- correr múltiples veces.

INSERT INTO alert_definitions
  (alert_type,       name,                  enabled, threshold_days, bp_multiplier, bp_min_days, eval_interval_hours, workshop_id)
VALUES
  ('payment_overdue', 'Pagos vencidos',     true,    30,             NULL,          NULL,         4,                  'default'),
  ('lost_customer',   'Clientes perdidos',  true,    180,            NULL,          NULL,        12,                  'default'),
  ('broken_pattern',  'Patrón roto',        true,    NULL,           2.0,           30,          12,                  'default')
ON CONFLICT DO NOTHING;
