-- Job Files (Jim, 2026-10-30): one place per job for the office's files,
-- shown on the job's page in Job Reports (office only, not the techs' app).
--   kind 'report' — a measurement report filed from Admin → Scan to Report
--                   once Niki has filled in the blanks (template_id set)
--   kind 'scan'   — the original scan that report was read from (source_id
--                   points to the report row); stored as uploaded, never
--                   re-encoded, so any number can be checked against the paper
--   kind 'file'   — anything else uploaded to the job, e.g. the external
--                   report Niki writes from the measurements
CREATE TABLE IF NOT EXISTS "Cores".job_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES "Cores".jobs(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('report', 'scan', 'file')),
  file_name text NOT NULL,
  storage_path text NOT NULL,           -- in the job-files bucket
  content_type text,
  size_bytes bigint,
  template_id text,                     -- kind 'report': which report template
  source_id uuid REFERENCES "Cores".job_files(id) ON DELETE RESTRICT, -- kind 'scan': its report
  filed_by_name text,                   -- office name from the login (getAdminName)
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,  -- "Remove" in the app hides the file; the file is kept
  deleted_by_name text
);

CREATE INDEX IF NOT EXISTS idx_job_files_job ON "Cores".job_files(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_files_source ON "Cores".job_files(source_id) WHERE source_id IS NOT NULL;

ALTER TABLE "Cores".job_files ENABLE ROW LEVEL SECURITY;

-- Same posture as the rest of the app until office logins land: the app talks
-- to the database as anon. Jim: the office must be able to fix a file filed
-- on the wrong job, so it can move a file (job_id) or remove it (deleted_at).
-- Only those columns can change, and nothing is ever deleted: the anon key is
-- public, so a real delete would let anyone wipe the files. Every change is in
-- the Audit Log, and a removed file can be brought back.
-- Default privileges give new tables full access; start from nothing.
REVOKE ALL ON "Cores".job_files FROM anon, authenticated;
GRANT SELECT, INSERT ON "Cores".job_files TO anon, authenticated;
GRANT UPDATE (job_id, deleted_at, deleted_by_name) ON "Cores".job_files TO anon, authenticated;
CREATE POLICY "job_files_select" ON "Cores".job_files FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "job_files_insert" ON "Cores".job_files FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "job_files_update" ON "Cores".job_files FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON "Cores".job_files
  FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();

-- Private bucket (unlike gear-photos / work-order-docs): customer reports and
-- measurement data, and the repo and site are public. The app opens files
-- with short-lived signed URLs. Any file type, up to 50 MB. Insert + select
-- only: files are never deleted or overwritten from the app (see above). Both policies are scoped to this bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('job-files', 'job-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "job_files_bucket_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'job-files');

CREATE POLICY "job_files_bucket_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'job-files');
