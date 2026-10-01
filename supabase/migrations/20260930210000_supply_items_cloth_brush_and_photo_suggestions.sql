-- Two more consumables the crew photograph (Jim, 2026-09-30), and a place for
-- the SMS bot to leave a suggested supply line on a photo that shows a
-- consumable NOT in supply_items. Suggestions never go on the timesheet by
-- themselves: Gear Photos shows them pre-filled on the photo card and Tracy
-- saves or removes them; either way the column is cleared so they don't return.
INSERT INTO "Cores".supply_items (name, identify_by, part_numbers) VALUES
  ('Sanding cloth 150 grit (feet)',
   'A box/roll labelled "abrasive cloth roll", 150 GRIT, 1 1/2" x 50 YDS, aluminum oxide, part number 301560. Quantity is in FEET: use the length in the caption (e.g. "3 feet" = 3); if no length is given use 1.',
   '{301560}'),
  ('Wire cup brush 3" (MSC 13F304)',
   'A wire cup brush, or its shelf label reading "ABRASIVE, WIRE CUP BRUSH, 3" 5/8-11" with MSC number 13F304 (the Walter box may also carry "WAL 13F304").',
   '{13F304}')
ON CONFLICT (name) DO NOTHING;

-- [{ "supply_name": text, "quantity": number, "evidence": text }]
ALTER TABLE "Cores".gear_photos ADD COLUMN suggested_supplies jsonb;
