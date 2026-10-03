-- Guest book for the retired addresses (Jim, 2026-10-02). The Netlify copy and
-- the old jimjardine.github.io address are now signposts that forward to the
-- app with ?via=netlify / ?via=old-github. The app records each tagged arrival
-- here with whoever is logged in, so we can see whose shortcut is out of date
-- before an old address is ever retired. The Supabase logs can't show this:
-- a forwarded visitor's requests look like any other current-app traffic.
--
-- One row when the visitor lands (stage 'arrived', identity if the device was
-- already logged in). If it wasn't, a second row with the same visit_key once
-- they log in (stage 'logged_in'). Written from the browser with the anon key
-- like every other Cores table. Append-only, same as approval_block_log.
-- employee_id is deliberately not a foreign key.
CREATE TABLE "Cores".shortcut_visits (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visited_at    timestamptz NOT NULL DEFAULT now(),
  visit_key     uuid NOT NULL,              -- ties an 'arrived' row to its later 'logged_in' row
  via           text NOT NULL CHECK (via IN ('netlify', 'old-github')),
  stage         text NOT NULL CHECK (stage IN ('arrived', 'logged_in')),
  employee_id   uuid,                       -- crew member on the mobile page (#/my)
  employee_name text,
  admin_name    text,                       -- name typed at the office password gate
  page          text,                       -- hash route they landed on, e.g. #/my
  user_agent    text                        -- to tell two devices of one person apart
);
CREATE INDEX shortcut_visits_visited_at ON "Cores".shortcut_visits (visited_at DESC);
ALTER TABLE "Cores".shortcut_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Cores".shortcut_visits FROM anon, authenticated;
GRANT INSERT ON "Cores".shortcut_visits TO anon, authenticated;
CREATE POLICY "shortcut_visits_insert" ON "Cores".shortcut_visits FOR INSERT WITH CHECK (true);
