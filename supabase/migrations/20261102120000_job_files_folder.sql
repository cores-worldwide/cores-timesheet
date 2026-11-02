-- Job Files folders (Jim, 2026-11-02): files on a job can sit in a folder
-- (one level, e.g. "valve-train", "con-rods"), so a job with dozens of
-- reports and scans shows a few folders the office opens with a click.
-- Uploading a folder from the computer keeps its sub-folder names.
-- NULL = not in a folder. A report filed from Scan to Report without a
-- folder is shown in its template's folder (see src/components/JobFiles.jsx).
ALTER TABLE "Cores".job_files ADD COLUMN IF NOT EXISTS folder text
  CHECK (folder IS NULL OR (length(btrim(folder)) BETWEEN 1 AND 100));

-- The office can move a file to another folder on the same job, like it can
-- move it to another job. Still column-level only; every change is audited.
GRANT UPDATE (folder) ON "Cores".job_files TO anon, authenticated;
