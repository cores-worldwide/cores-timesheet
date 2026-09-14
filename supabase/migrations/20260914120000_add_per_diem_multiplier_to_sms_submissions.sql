-- Per diem multiplier Niki can set during SMS Review, separate from
-- per_diem_location (which is just where they stayed). Nullable on purpose:
-- null means "not explicitly set", so every submission created before this
-- column existed keeps approving with the original "a location means x1"
-- behaviour instead of silently becoming 0.
alter table "Cores".sms_submissions
  add column per_diem numeric
  constraint sms_submissions_per_diem_nonneg check (per_diem is null or per_diem >= 0);
