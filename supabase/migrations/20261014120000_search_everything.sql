-- Search tab (Jim, 2026-10-14): one box that searches everything in the
-- timesheets. Andrew asked about "a barge he worked on" with no job # or
-- vessel name, and nothing in the app could find it.
--
-- Every word typed must appear somewhere in the row OR in the job/vessel/
-- customer/person it belongs to, so "andrew barge" finds Andrew's entries on
-- any job whose description, vessel or customer mentions a barge. Case-
-- insensitive substring match; small tables, so a plain scan is fine.
--
-- SECURITY INVOKER: runs with the caller's own rights, so it can only return
-- rows the app could already read table by table (all these tables are
-- readable by the app today). It reads nothing it doesn't already expose.
CREATE OR REPLACE FUNCTION "Cores".search_everything(q text, max_rows integer DEFAULT 300)
 RETURNS TABLE(kind text, id uuid, work_date date, employee text, job_id uuid,
               job_number text, vessel text, customer text, title text, body text, extra jsonb)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
with words as (
  -- escape LIKE wildcards so "50%" or "a_b" match literally
  select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  from regexp_split_to_table(lower(trim(coalesce(q, ''))), '\s+') w
  where w <> ''
),
jx as (
  select j.id, j.job_number, j.description, j.work_summary, j.work_order_number, j.status,
         v.name as vessel, c.name as customer,
         concat_ws(' ', j.job_number, j.description, j.work_order_number, v.name, v.vessel_type, c.name) as hay
  from jobs j left join vessels v on v.id = j.vessel_id left join customers c on c.id = j.customer_id
),
rows as (
  -- Timesheet entries (approved hours)
  select 'entry'::text as kind, t.id, t.work_date, e.name as employee, t.job_id, jx.job_number, jx.vessel, jx.customer,
         concat_ws(' · ', nullif(t.hours, 0)::text || ' h', nullif(t.ot_hours, 0)::text || ' OT') as title,
         t.description as body,
         jsonb_build_object('day_off', t.is_day_off, 'stat', t.is_stat_pay) as extra,
         concat_ws(' ', t.description, e.name, jx.hay, to_char(t.work_date, 'YYYY-MM-DD FMMonth Mon YYYY')) as hay
  from timesheet_entries t left join employees e on e.id = t.employee_id left join jx on jx.id = t.job_id

  union all
  -- Texts and app submissions (SMS Review), every message both ways
  select 'text', s.id, s.work_date, e.name, null, sj.job_numbers, null, null,
         s.status,
         msgs.txt,
         jsonb_build_object('status', s.status, 'admin_note', s.admin_note, 'rejection_reason', s.rejection_reason),
         concat_ws(' ', msgs.txt, s.admin_note, s.supplies_note, s.rejection_reason, s.per_diem_location,
                   sj.descs, e.name, sj.hay, to_char(s.work_date, 'YYYY-MM-DD FMMonth Mon YYYY'))
  from sms_submissions s
  left join employees e on e.id = s.employee_id
  left join lateral (
    select string_agg(case when m->>'direction' = 'out' then 'Bot: ' else '' end || (m->>'text'), E'\n' order by ord) as txt
    from jsonb_array_elements(case when jsonb_typeof(s.raw_messages) = 'array' then s.raw_messages else '[]'::jsonb end)
         with ordinality as r(m, ord)
  ) msgs on true
  left join lateral (
    select string_agg(distinct coalesce(jx.job_number, en->>'job_number'), ', ') as job_numbers,
           string_agg(jx.hay, ' ') as hay, string_agg(en->>'description', ' ') as descs
    from jsonb_array_elements(case when jsonb_typeof(s.entries) = 'array' then s.entries else '[]'::jsonb end) en
    left join jx on jx.job_number = en->>'job_number'
  ) sj on true

  union all
  -- Gear photos / videos
  select 'photo', p.id, p.work_date, e.name, p.job_id, jx.job_number, jx.vessel, jx.customer,
         p.photo_type,
         concat_ws(E'\n', nullif(p.message_text, ''), nullif(p.note, '')),
         jsonb_build_object('ship_or_job', p.ship_or_job, 'thumb_path', p.thumb_path, 'storage_path', p.storage_path),
         concat_ws(' ', p.message_text, p.note, p.ship_or_job, p.photo_type, e.name, jx.hay,
                   to_char(p.work_date, 'YYYY-MM-DD FMMonth Mon YYYY'))
  from gear_photos p left join employees e on e.id = p.employee_id left join jx on jx.id = p.job_id

  union all
  -- Supplies used
  select 'supply', s.id, s.work_date, e.name, s.job_id, jx.job_number, jx.vessel, jx.customer,
         concat_ws(' × ', nullif(s.quantity, 0)::text, s.supply_name),
         s.description,
         jsonb_build_object('billed', s.billed_at is not null),
         concat_ws(' ', s.supply_name, s.description, e.name, jx.hay, to_char(s.work_date, 'YYYY-MM-DD FMMonth Mon YYYY'))
  from job_supplies s left join employees e on e.id = s.employee_id left join jx on jx.id = s.job_id

  union all
  -- Jobs
  select 'job', jx.id, j.created_at::date, null, jx.id, jx.job_number, jx.vessel, jx.customer,
         jx.description,
         jx.work_summary,
         jsonb_build_object('status', jx.status),
         concat_ws(' ', jx.hay, jx.work_summary)
  from jx join jobs j on j.id = jx.id

  union all
  -- Job close/reopen notes
  select 'job_note', l.id, l.created_at::date, null, l.job_id, jx.job_number, jx.vessel, jx.customer,
         concat_ws(' → ', l.from_status, l.to_status),
         l.note, null,
         concat_ws(' ', l.note, jx.hay)
  from job_status_logs l left join jx on jx.id = l.job_id

  union all
  -- Vessels
  select 'vessel', v.id, null, null, null, null, v.name, c.name,
         v.vessel_type, v.notes, jsonb_build_object('status', v.status),
         concat_ws(' ', v.name, v.vessel_type, v.notes, c.name)
  from vessels v left join customers c on c.id = v.customer_id

  union all
  -- Customers
  select 'customer', c.id, null, null, null, null, null, c.name,
         c.contact_name, c.notes, jsonb_build_object('status', c.status),
         concat_ws(' ', c.name, c.contact_name, c.contact_email, c.phone, c.notes)
  from customers c

  union all
  -- Engines
  select 'engine', en.id, en.install_date, null, null, null, v.name, null,
         concat_ws(' ', en.side, en.manufacturer, en.model),
         concat_ws(E'\n', nullif('Serial ' || en.serial_number, 'Serial '), nullif('Arrangement ' || en.arrangement_number, 'Arrangement '), en.notes),
         null,
         concat_ws(' ', en.manufacturer, en.model, en.serial_number, en.arrangement_number, en.side, en.notes, v.name)
  from engines en left join vessels v on v.id = en.vessel_id

  union all
  -- Vessel contacts
  select 'contact', vc.id, null, null, null, null, v.name, null,
         concat_ws(' · ', vc.name, vc.role), vc.phone, null,
         concat_ws(' ', vc.name, vc.role, vc.phone, v.name)
  from vessel_contacts vc left join vessels v on v.id = vc.vessel_id
)
select r.kind, r.id, r.work_date, r.employee, r.job_id, r.job_number, r.vessel, r.customer, r.title, r.body, r.extra
from rows r
where exists (select 1 from words)
  and not exists (select 1 from words w where lower(r.hay) not like w.pat)
order by r.work_date desc nulls last, r.kind
limit greatest(1, least(coalesce(max_rows, 300), 1000));
$function$;

GRANT EXECUTE ON FUNCTION "Cores".search_everything(text, integer) TO anon, authenticated, service_role;
