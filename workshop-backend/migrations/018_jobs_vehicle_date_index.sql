-- Sprint 1 / HU-07: índice compuesto para broken_pattern
--
-- La query del evaluador de broken_pattern lee jobs por client_id ordenando
-- por job_date. El índice compuesto en (vehicle_id, job_date DESC) acelera
-- también queries de overdue_service y reportes futuros que filtran jobs
-- terminados/pagados de un vehículo.
--
-- El partial index reduce el tamaño excluyendo soft-deleted y jobs no
-- finalizados, que son los únicos que cuentan para alertas de retención.

CREATE INDEX IF NOT EXISTS idx_jobs_vehicle_date
  ON jobs(vehicle_id, job_date DESC)
  WHERE deleted_at IS NULL AND status IN ('terminado', 'pagado');
