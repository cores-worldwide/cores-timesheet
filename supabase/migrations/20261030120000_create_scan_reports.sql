-- Scan to Report (Jim, 2026-10-30): once Niki has filled in the blanks in
-- Excel she drops the finished report back into the app, confirms the job,
-- and it's filed on that job together with the original scan, so any number
-- can be checked against the paper later. Shown on the job's Job Reports page.
CREATE TABLE IF NOT EXISTS "Cores".scan_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES "Cores".jobs(id) ON DELETE RESTRICT,
  template_id text NOT NULL,
  report_path text NOT NULL,          -- finished .xlsx in the scan-reports bucket
  report_name text NOT NULL,
  scan_path text,                     -- original scan, stored as uploaded (never re-encoded)
  scan_name text,
  filed_by_name text,                 -- office name from the login (getAdminName)
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_reports_job ON "Cores".scan_reports(job_id, created_at);

ALTER TABLE "Cores".scan_reports ENABLE ROW LEVEL SECURITY;

-- Same posture as the rest of the app until office logins land: the app talks
-- to the database as anon. No UPDATE or DELETE: filed reports are a record;
-- a wrong filing is corrected by Jim, and every insert is in the Audit Log.
GRANT SELECT, INSERT ON "Cores".scan_reports TO anon, authenticated;
CREATE POLICY "scan_reports_select" ON "Cores".scan_reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "scan_reports_insert" ON "Cores".scan_reports FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON "Cores".scan_reports
  FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();

-- Private bucket (unlike gear-photos / work-order-docs): customer measurement
-- data, and the repo and site are public. The app opens files with short-lived
-- signed URLs. Insert + select only, same reason as the table.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scan-reports', 'scan-reports', false, 26214400,
        ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "scan_reports_bucket_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'scan-reports');

CREATE POLICY "scan_reports_bucket_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scan-reports');
