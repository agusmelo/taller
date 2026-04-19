-- Add source field to jobs table to differentiate manual vs imported jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Add constraint for valid source values
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_source_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_source_check CHECK (source IN ('manual', 'import'));
