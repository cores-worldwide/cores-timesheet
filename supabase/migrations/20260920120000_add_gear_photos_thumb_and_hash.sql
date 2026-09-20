-- Photos may be evidence years later (Jim, 2026-09-20), so the stored original
-- must never be modified: no re-encoding, no resizing, EXIF left intact. The
-- egress cost of showing full originals in grids is instead handled by a
-- separate small derivative at thumb_path (thumbs/<same path>.jpg) that grids
-- use; the lightbox still opens the original. sha256 is the hash of the
-- original bytes as uploaded, so an untouched file can be proven untouched.
-- Both nullable: texted-in (MMS) photos get their thumbnail from the nightly
-- scripts/backfill-thumbs.mjs run, and a video has no thumbnail at all.
ALTER TABLE "Cores".gear_photos
  ADD COLUMN IF NOT EXISTS thumb_path text,
  ADD COLUMN IF NOT EXISTS sha256 text;

COMMENT ON COLUMN "Cores".gear_photos.thumb_path IS 'Storage path of the small grid thumbnail (thumbs/...). Null = not generated yet (or video). Grids fall back to storage_path.';
COMMENT ON COLUMN "Cores".gear_photos.sha256 IS 'SHA-256 hex of the original file bytes at upload, for later integrity proof. Originals are never modified.';
