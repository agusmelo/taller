-- Sprint 0 / HU-03
-- Seed inicial de definiciones de alerta para los 3 tipos que no requieren
-- un ítem específico del catálogo. overdue_service no se siembra porque
-- depende de configurar manualmente qué ítem del catálogo seguir.
--
-- Idempotencia: usamos WHERE NOT EXISTS en vez de ON CONFLICT DO NOTHING
-- porque el nuevo índice único es PARCIAL (`WHERE enabled = true`) y no
-- cubre filas con enabled = false. Si el operador desactivó previamente
-- una definición y re-corremos la migración, ON CONFLICT no dispararía y
-- terminaríamos con dos filas del mismo tipo. NOT EXISTS chequea cualquier
-- estado y nunca duplica.

INSERT INTO alert_definitions
  (alert_type,       name,                  enabled, threshold_days, bp_multiplier, bp_min_days, eval_interval_hours, workshop_id)
SELECT v.*
FROM (VALUES
  ('payment_overdue', 'Pagos vencidos',     true,    30,             NULL::numeric, NULL::int,    4,                  'default'),
  ('lost_customer',   'Clientes perdidos',  true,    180,            NULL::numeric, NULL::int,   12,                  'default'),
  ('broken_pattern',  'Patrón roto',        true,    NULL::int,      2.0,           30,          12,                  'default')
) AS v(alert_type, name, enabled, threshold_days, bp_multiplier, bp_min_days, eval_interval_hours, workshop_id)
WHERE NOT EXISTS (
  SELECT 1 FROM alert_definitions d
  WHERE d.alert_type = v.alert_type
    AND d.catalog_item_id IS NULL
);
