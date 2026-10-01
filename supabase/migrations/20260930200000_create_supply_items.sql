-- Consumables the SMS bot can recognise in a supply photo and log to the job
-- automatically, so Tracy no longer has to open each photo and type the line
-- (Jim, 2026-09-30). name is exactly what lands in job_supplies.supply_name.
-- identify_by tells Claude what to look for; part_numbers are shelf-label
-- codes (techs photograph the bin label for pads, since grits look alike).
-- Brake clean covers any brake/MAF cleaner can (same product for billing);
-- Würth Film is a different product and is only matched when its name is
-- readable on the can. Written by the edge function (service role); the app
-- only reads it for now.
CREATE TABLE "Cores".supply_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  identify_by   text NOT NULL,
  part_numbers  text[] NOT NULL DEFAULT '{}',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "Cores".supply_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Cores".supply_items FROM anon, authenticated;
GRANT SELECT ON "Cores".supply_items TO anon, authenticated;
CREATE POLICY "supply_items_select" ON "Cores".supply_items FOR SELECT USING (true);

INSERT INTO "Cores".supply_items (name, identify_by, part_numbers) VALUES
  ('Brake clean',
   'An aerosol can of brake cleaner or mass air flow (MAF) sensor cleaner, e.g. Würth "Mass Air Flow Sensor Cleaner" 354 g (white/red label) or Kleen-Flo "MAF Kleen". Any brake cleaner or MAF cleaner counts as this item. NOT Würth Film.',
   '{}'),
  ('Würth film',
   'An aerosol can whose label reads "WÜRTH FILM" (Heavy Duty, 369 g, lubricating). Only choose this when the words "Würth Film" are readable — the Würth logo and red band alone also appear on the MAF cleaner.',
   '{}'),
  ('Scrubby pad N74000',
   'A shelf/bin label showing part number N74000 (hand pads).',
   '{N74000}'),
  ('Scrubby pad N85100',
   'A shelf/bin label showing part number N85100 (hand pads).',
   '{N85100}'),
  ('Scrubby pad maroon VF (MSC 66261074700)',
   'A shelf/bin label reading "NON-WOVEN HAND PAD, 6X9, MAROON, VF" with MSC number 66261074700.',
   '{66261074700}');

-- Kill switch for the automatic logging (0 = off, 1 = on). Starts off; turned
-- on once a dry run against real photos checks out.
INSERT INTO "Cores".payroll_config (key, value, description)
VALUES ('auto_supply_from_photos', 0, '1 = the SMS bot adds recognised supply photos (supply_items) to the job automatically; 0 = off')
ON CONFLICT (key) DO NOTHING;
