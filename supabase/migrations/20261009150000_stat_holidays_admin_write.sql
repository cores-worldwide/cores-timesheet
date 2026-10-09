-- Stat Holidays tab in the Admin Panel (Jim, 2026-10-09): the office keeps
-- the holiday list themselves instead of asking for database edits. Until
-- office logins (Phase 2) the app talks to the database as anon, same as the
-- Employees/Customers tabs, so writes are opened to the same roles. Every
-- change is already recorded by audit_trg (Audit Log tab).
CREATE POLICY "anon insert stat_holidays" ON "Cores".stat_holidays
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon update stat_holidays" ON "Cores".stat_holidays
  AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "anon delete stat_holidays" ON "Cores".stat_holidays
  AS PERMISSIVE FOR DELETE TO public USING (true);
