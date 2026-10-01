-- Fake data for the dev/test database. Made-up people, numbers and jobs only;
-- never load real crew data here. Settings and stat holidays match live.

INSERT INTO "Cores".payroll_config (key, value, description) VALUES
  ('weekly_ot_threshold', 40, 'Regular hours per week before weekly OT kicks in'),
  ('ot_multiplier', 1.5, 'Overtime pay multiplier'),
  ('stat_multiplier', 1.5, 'Additional pay multiplier for working a stat holiday (added to regular rate)'),
  ('per_diem_rate', 0, 'Per diem dollar amount per unit — set this to the actual daily rate'),
  ('daily_ot_threshold', 8, 'Regular hours per day before daily OT kicks in'),
  ('sms_followup_timeout_hours', 4, 'Hours of silence after an unanswered SMS follow-up question before it auto-closes for review'),
  ('auto_supply_from_photos', 0, 'Off in dev');

INSERT INTO "Cores".stat_holidays (holiday_date, name) VALUES
  ('2026-01-01', 'New Year''s Day'), ('2026-04-03', 'Good Friday'), ('2026-05-18', 'Victoria Day'),
  ('2026-07-01', 'Canada Day'), ('2026-09-07', 'Labour Day'), ('2026-10-12', 'Thanksgiving'),
  ('2026-11-11', 'Remembrance Day'), ('2026-12-25', 'Christmas Day'), ('2026-12-26', 'Boxing Day');

INSERT INTO "Cores".employees (id, name, phone, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Dev Tech One', '9025550101', 'technician'),
  ('00000000-0000-0000-0000-0000000000a2', 'Dev Tech Two', '9025550102', 'technician'),
  ('00000000-0000-0000-0000-0000000000a3', 'Dev Office', '9025550103', 'office');

INSERT INTO "Cores".customers (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'Cores'),
  ('00000000-0000-0000-0000-0000000000c2', 'Dev Shipping Co');

INSERT INTO "Cores".vessels (id, name, customer_id) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'MV Test Harbour', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000d2', 'MV Test Narrows', '00000000-0000-0000-0000-0000000000c2');

INSERT INTO "Cores".jobs (job_number, customer_id, vessel_id, description) VALUES
  ('SHOP', '00000000-0000-0000-0000-0000000000c1', NULL, 'This is for work that does not get charged to a customer.'),
  ('Unknown', NULL, NULL, 'This is for work that there is no job# yet.'),
  ('9001', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d1', 'Port main engine top end'),
  ('9002', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d2', 'Stbd generator coolant pump'),
  ('9003', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d1', 'Fuel system inspection'),
  ('9004', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d2', 'Exhaust elbow');

-- Submissions waiting in SMS Review
INSERT INTO "Cores".sms_submissions (from_phone, employee_id, work_date, time_in, stated_time_out, lunch_minutes, per_diem_location, status, entries) VALUES
  -- Two ships in St. John's: the per diem split case
  ('9025550101', '00000000-0000-0000-0000-0000000000a1', '2026-09-29', '07:00', '17:30', 30, 'St. John''s', 'submitted',
   '[{"job_number":"9001","hours":4,"reg_hours":4,"ot_hours":0,"description":"Morning on MV Test Harbour, valve lash"},
     {"job_number":"9002","hours":6,"reg_hours":4,"ot_hours":2,"description":"Afternoon on MV Test Narrows, coolant pump"}]'),
  -- Four jobs in one day: .25 splits
  ('9025550102', '00000000-0000-0000-0000-0000000000a2', '2026-09-29', '07:00', '15:30', 30, 'St. John''s', 'submitted',
   '[{"job_number":"9001","hours":2,"reg_hours":2,"ot_hours":0,"description":"Check-in on Harbour"},
     {"job_number":"9002","hours":2,"reg_hours":2,"ot_hours":0,"description":"Narrows pump parts"},
     {"job_number":"9003","hours":2,"reg_hours":2,"ot_hours":0,"description":"Fuel lines"},
     {"job_number":"9004","hours":2,"reg_hours":2,"ot_hours":0,"description":"Exhaust elbow fit-up"}]'),
  -- Single job, no split: must approve exactly as before
  ('9025550101', '00000000-0000-0000-0000-0000000000a1', '2026-09-30', '07:00', '15:30', 30, 'St. John''s', 'submitted',
   '[{"job_number":"9003","hours":8,"reg_hours":8,"ot_hours":0,"description":"Fuel system inspection all day"}]'),
  -- No per diem at all
  ('9025550102', '00000000-0000-0000-0000-0000000000a2', '2026-09-30', '07:00', '15:30', 30, 'none', 'submitted',
   '[{"job_number":"SHOP","hours":4,"reg_hours":4,"ot_hours":0,"description":"Shop cleanup"},
     {"job_number":"9004","hours":4,"reg_hours":4,"ot_hours":0,"description":"Exhaust elbow"}]');
