CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(200) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'recepcionista'
                CHECK (role IN ('admin', 'recepcionista', 'mecanico')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          VARCHAR(20) NOT NULL DEFAULT 'individual'
                CHECK (type IN ('individual', 'empresa')),
  full_name     VARCHAR(200) NOT NULL,
  rut           VARCHAR(20),
  phone         VARCHAR(50),
  email         VARCHAR(200),
  address       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_rut
  ON clients(rut)
  WHERE rut IS NOT NULL AND deleted_at IS NULL;

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plate_number  VARCHAR(20) UNIQUE NOT NULL,
  client_id     UUID NOT NULL REFERENCES clients(id),
  make          VARCHAR(100) NOT NULL,
  model         VARCHAR(100) NOT NULL,
  year          SMALLINT,
  color         VARCHAR(50),
  mileage       INTEGER,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vehicles_client_id
  ON vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate
  ON vehicles(plate_number) WHERE deleted_at IS NULL;

-- ============================================================
-- VEHICLE OWNERSHIP HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_ownership_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  client_id       UUID NOT NULL REFERENCES clients(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  transfer_notes  TEXT,
  transferred_by  UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_voh_vehicle_id
  ON vehicle_ownership_history(vehicle_id);

-- ============================================================
-- JOB NUMBER SEQUENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS job_number_sequences (
  year_month  CHAR(7) PRIMARY KEY,
  last_seq    INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number          VARCHAR(20) UNIQUE NOT NULL,
  client_id           UUID NOT NULL REFERENCES clients(id),
  vehicle_id          UUID NOT NULL REFERENCES vehicles(id),
  mileage_at_service  INTEGER,
  status              VARCHAR(20) NOT NULL DEFAULT 'abierto'
                      CHECK (status IN ('abierto', 'terminado', 'pagado')),
  tax_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate            NUMERIC(5,4) NOT NULL DEFAULT 0.22,
  discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type       VARCHAR(20) NOT NULL DEFAULT 'fixed'
                      CHECK (discount_type IN ('fixed', 'percentage')),
  notes               TEXT,
  internal_notes      TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id  ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_vehicle_id ON jobs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- ============================================================
-- JOB ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS job_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description   VARCHAR(500) NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_type     VARCHAR(20) NOT NULL DEFAULT 'mano_de_obra'
                CHECK (item_type IN ('mano_de_obra', 'repuesto', 'otro')),
  supplier      VARCHAR(200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        VARCHAR(20) NOT NULL DEFAULT 'efectivo'
                CHECK (method IN ('efectivo', 'transferencia', 'credito')),
  reference     VARCHAR(200),
  notes         TEXT,
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_job_id  ON payments(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC);

-- ============================================================
-- AUTO updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
      BEFORE UPDATE ON users FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_updated_at') THEN
    CREATE TRIGGER trg_clients_updated_at
      BEFORE UPDATE ON clients FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vehicles_updated_at') THEN
    CREATE TRIGGER trg_vehicles_updated_at
      BEFORE UPDATE ON vehicles FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_jobs_updated_at') THEN
    CREATE TRIGGER trg_jobs_updated_at
      BEFORE UPDATE ON jobs FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_job_items_updated_at') THEN
    CREATE TRIGGER trg_job_items_updated_at
      BEFORE UPDATE ON job_items FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- JOB NUMBER GENERATOR: YYYY-MM-NNNNN (resets monthly)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  v_year_month CHAR(7);
  v_seq        INTEGER;
BEGIN
  v_year_month := TO_CHAR(NOW(), 'YYYY-MM');
  INSERT INTO job_number_sequences (year_month, last_seq)
  VALUES (v_year_month, 1)
  ON CONFLICT (year_month) DO UPDATE
    SET last_seq = job_number_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN v_year_month || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;
