CREATE INDEX idx_jobs_job_date ON jobs(job_date) WHERE deleted_at IS NULL;
