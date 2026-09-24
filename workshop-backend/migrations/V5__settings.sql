-- ============================================================
-- FASE 5: Settings table + payments page support
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('debt_alert_threshold', '5000'),
  ('unpaid_days_threshold', '30')
ON CONFLICT (key) DO NOTHING;
