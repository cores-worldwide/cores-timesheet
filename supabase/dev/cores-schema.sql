-- Structure of the "Cores" schema, for building a throwaway dev/test database
-- (cores-timesheets-dev in the free BLD DEV org). No data.
-- Generated 2026-10-01 from the live database's catalog (tables, constraints,
-- indexes, functions, triggers, RLS policies). Regenerate it if the live
-- schema has changed since; the migrations folder can't rebuild it on its own
-- because the base tables predate it.
-- Load with: scripts/dev-db.sh setup

CREATE SCHEMA IF NOT EXISTS "Cores";

CREATE SEQUENCE IF NOT EXISTS "Cores".audit_log_id_seq;

CREATE TABLE "Cores".approval_block_log (id bigint GENERATED ALWAYS AS IDENTITY NOT NULL, attempted_at timestamp with time zone DEFAULT now() NOT NULL, attempted_by text, submission_id uuid, employee_id uuid, work_date date, reasons jsonb NOT NULL, snapshot jsonb DEFAULT '{}'::jsonb NOT NULL);
CREATE TABLE "Cores".audit_log (id bigint DEFAULT nextval('"Cores".audit_log_id_seq'::regclass) NOT NULL, table_name text NOT NULL, record_id text NOT NULL, action text NOT NULL, old_data jsonb, new_data jsonb, changed_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".auth_ip_throttle (ip text NOT NULL, fail_count integer DEFAULT 0 NOT NULL, window_started_at timestamp with time zone DEFAULT now() NOT NULL, blocked_until timestamp with time zone, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".backup_log (id bigint GENERATED ALWAYS AS IDENTITY NOT NULL, ran_at timestamp with time zone DEFAULT now() NOT NULL, job text NOT NULL, ok boolean NOT NULL, details jsonb DEFAULT '{}'::jsonb NOT NULL, run_url text);
CREATE TABLE "Cores".component_types (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".customers (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, contact_name text, contact_email text, status text DEFAULT 'active'::text, created_at timestamp with time zone DEFAULT now(), phone text, notes text);
CREATE TABLE "Cores".daily_summary_posted (id uuid DEFAULT gen_random_uuid() NOT NULL, employee_id uuid NOT NULL, work_date date NOT NULL, posted_at timestamp with time zone DEFAULT now() NOT NULL, posted_by text);
CREATE TABLE "Cores".employee_auth (employee_id uuid NOT NULL, pin_hash text, pin_salt text, pin_fail_count integer DEFAULT 0 NOT NULL, pin_locked_until timestamp with time zone, otp_code_hash text, otp_expires_at timestamp with time zone, updated_at timestamp with time zone DEFAULT now(), otp_fail_count integer DEFAULT 0 NOT NULL, otp_locked_until timestamp with time zone);
CREATE TABLE "Cores".employee_phone_backup (employee_id uuid NOT NULL, phone text, backed_up_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".employees (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, email text, phone text, active boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), role text DEFAULT 'technician'::text NOT NULL, whatsapp_phone text, low_stock_alert_recipient boolean DEFAULT false NOT NULL, ot_daily_threshold numeric, ot_friday_threshold numeric, confirmation_exempt boolean DEFAULT false NOT NULL, job_inference_exempt boolean DEFAULT false NOT NULL);
CREATE TABLE "Cores".engine_components (id uuid DEFAULT gen_random_uuid() NOT NULL, engine_id uuid NOT NULL, position_label text NOT NULL, component_type_id uuid NOT NULL, serial_number text, install_date date, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".engine_service_log (id uuid DEFAULT gen_random_uuid() NOT NULL, engine_id uuid NOT NULL, service_date date NOT NULL, description text, hours_at_service numeric, performed_by text, work_order_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".engine_types (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".engines (id uuid DEFAULT gen_random_uuid() NOT NULL, vessel_id uuid NOT NULL, manufacturer text, model text, serial_number text, cylinder_count integer, kw numeric, install_date date, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, arrangement_number text, side text, engine_type_id uuid, terminated_date date);
CREATE TABLE "Cores".gear_photos (id uuid DEFAULT gen_random_uuid() NOT NULL, employee_id uuid, work_date date NOT NULL, from_phone text NOT NULL, storage_path text NOT NULL, file_size_bytes integer, message_text text, ship_or_job text, pending_context boolean DEFAULT false NOT NULL, photo_latitude numeric, photo_longitude numeric, photo_timestamp timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, job_id uuid, note text, photo_type text, thumb_path text, sha256 text, suggested_supplies jsonb);
CREATE TABLE "Cores".job_status_logs (id uuid DEFAULT gen_random_uuid() NOT NULL, job_id uuid NOT NULL, from_status text, to_status text NOT NULL, note text NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE "Cores".job_supplies (id uuid DEFAULT gen_random_uuid() NOT NULL, job_id uuid, sms_submission_id uuid, employee_id uuid, work_date date NOT NULL, supply_name text NOT NULL, quantity numeric(8,2) DEFAULT 1 NOT NULL, description text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), billed_at timestamp with time zone, billed_by text, source_photo_id uuid, applied_at timestamp with time zone, applied_by text);
CREATE TABLE "Cores".job_tasks (id uuid DEFAULT gen_random_uuid() NOT NULL, job_id uuid, name text NOT NULL, description text, status text DEFAULT 'pending'::text, created_at timestamp with time zone DEFAULT now());
CREATE TABLE "Cores".jobs (id uuid DEFAULT gen_random_uuid() NOT NULL, job_number text NOT NULL, customer_id uuid, vessel_id uuid, description text, status text DEFAULT 'open'::text, created_at timestamp with time zone DEFAULT now(), closed_at timestamp with time zone, work_order_number text, work_summary text, work_summary_entry_count integer, work_order_file_path text, work_order_link text, jobnum_pref text);
CREATE TABLE "Cores".payroll_config (key text NOT NULL, value numeric NOT NULL, description text);
CREATE TABLE "Cores".processed_message_sids (message_sid text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".sms_submissions (id uuid DEFAULT gen_random_uuid() NOT NULL, from_phone text NOT NULL, employee_id uuid, work_date date, time_in time without time zone, lunch_minutes integer, per_diem_location text, calculated_time_out time without time zone, stated_time_out time without time zone, delta_minutes integer, entries jsonb DEFAULT '[]'::jsonb NOT NULL, pending_questions jsonb DEFAULT '[]'::jsonb NOT NULL, raw_messages jsonb DEFAULT '[]'::jsonb NOT NULL, status text DEFAULT 'collecting'::text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), supplies jsonb DEFAULT '[]'::jsonb, admin_note text, supplies_note text, asked_questions jsonb DEFAULT '[]'::jsonb NOT NULL, rejection_reason text, is_day_off boolean DEFAULT false NOT NULL, is_stat_grant boolean DEFAULT false NOT NULL, per_diem numeric);
CREATE TABLE "Cores".stat_holidays (id uuid DEFAULT gen_random_uuid() NOT NULL, holiday_date date NOT NULL, name text NOT NULL);
CREATE TABLE "Cores".supply_items (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, identify_by text NOT NULL, part_numbers text[] DEFAULT '{}'::text[] NOT NULL, active boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "Cores".timesheet_entries (id uuid DEFAULT gen_random_uuid() NOT NULL, employee_id uuid, job_id uuid, task_id uuid, work_date date NOT NULL, hours numeric(6,2) NOT NULL, description text, created_at timestamp with time zone DEFAULT now(), per_diem numeric DEFAULT 0 NOT NULL, sort_order integer DEFAULT 1 NOT NULL, ot_hours numeric, time_in time without time zone, stated_time_out time without time zone, lunch_minutes integer, is_stat_pay boolean DEFAULT false NOT NULL, entry_source text DEFAULT 'sms'::text NOT NULL, confirmation_status text DEFAULT 'not_required'::text NOT NULL, confirmation_requested_at timestamp with time zone, confirmed_at timestamp with time zone, confirmation_reply_text text, approved_by_name text, approved_at timestamp with time zone, source_submission_id uuid, is_day_off boolean DEFAULT false NOT NULL);
CREATE TABLE "Cores".vessel_contacts (id uuid DEFAULT gen_random_uuid() NOT NULL, vessel_id uuid NOT NULL, role text NOT NULL, name text, phone text, sort_order integer DEFAULT 0, created_at timestamp with time zone DEFAULT now());
CREATE TABLE "Cores".vessels (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, vessel_type text, customer_id uuid, created_at timestamp with time zone DEFAULT now(), status text DEFAULT 'active'::text NOT NULL, notes text, photo_storage_path text);
CREATE TABLE "Cores".whatsapp_keepalive_state (id boolean DEFAULT true NOT NULL, enabled boolean DEFAULT true NOT NULL, last_sent_at timestamp with time zone);

-- Primary keys, unique and check constraints
ALTER TABLE "Cores".approval_block_log ADD CONSTRAINT approval_block_log_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".audit_log ADD CONSTRAINT audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE "Cores".audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".auth_ip_throttle ADD CONSTRAINT auth_ip_throttle_pkey PRIMARY KEY (ip);
ALTER TABLE "Cores".backup_log ADD CONSTRAINT backup_log_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".component_types ADD CONSTRAINT component_types_name_key UNIQUE (name);
ALTER TABLE "Cores".component_types ADD CONSTRAINT component_types_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".daily_summary_posted ADD CONSTRAINT daily_summary_posted_employee_id_work_date_key UNIQUE (employee_id, work_date);
ALTER TABLE "Cores".daily_summary_posted ADD CONSTRAINT daily_summary_posted_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".employee_auth ADD CONSTRAINT employee_auth_pkey PRIMARY KEY (employee_id);
ALTER TABLE "Cores".employee_phone_backup ADD CONSTRAINT employee_phone_backup_pkey PRIMARY KEY (employee_id);
ALTER TABLE "Cores".employees ADD CONSTRAINT employees_email_key UNIQUE (email);
ALTER TABLE "Cores".employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".employees ADD CONSTRAINT employees_role_check CHECK ((role = ANY (ARRAY['technician'::text, 'office'::text])));
ALTER TABLE "Cores".engine_components ADD CONSTRAINT engine_components_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".engine_service_log ADD CONSTRAINT engine_service_log_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".engine_types ADD CONSTRAINT engine_types_name_key UNIQUE (name);
ALTER TABLE "Cores".engine_types ADD CONSTRAINT engine_types_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".engines ADD CONSTRAINT engines_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".gear_photos ADD CONSTRAINT gear_photos_photo_type_check CHECK (((photo_type IS NULL) OR (photo_type = ANY (ARRAY['supply'::text, 'reference'::text, 'measurement'::text, 'receipt'::text]))));
ALTER TABLE "Cores".gear_photos ADD CONSTRAINT gear_photos_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".job_status_logs ADD CONSTRAINT job_status_logs_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".job_supplies ADD CONSTRAINT job_supplies_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".job_tasks ADD CONSTRAINT job_tasks_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".jobs ADD CONSTRAINT jobnum_pref_format CHECK (((jobnum_pref IS NULL) OR (jobnum_pref ~ '^[0-9]{4}$'::text)));
ALTER TABLE "Cores".jobs ADD CONSTRAINT jobs_job_number_key UNIQUE (job_number);
ALTER TABLE "Cores".jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".payroll_config ADD CONSTRAINT payroll_config_pkey PRIMARY KEY (key);
ALTER TABLE "Cores".processed_message_sids ADD CONSTRAINT processed_message_sids_pkey PRIMARY KEY (message_sid);
ALTER TABLE "Cores".sms_submissions ADD CONSTRAINT sms_submissions_per_diem_allowed CHECK (((per_diem IS NULL) OR (per_diem = ANY (ARRAY[(0)::numeric, 0.25, 0.5, 0.75, (1)::numeric]))));
ALTER TABLE "Cores".sms_submissions ADD CONSTRAINT sms_submissions_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".sms_submissions ADD CONSTRAINT sms_submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'collecting'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE "Cores".stat_holidays ADD CONSTRAINT stat_holidays_holiday_date_key UNIQUE (holiday_date);
ALTER TABLE "Cores".stat_holidays ADD CONSTRAINT stat_holidays_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".supply_items ADD CONSTRAINT supply_items_name_key UNIQUE (name);
ALTER TABLE "Cores".supply_items ADD CONSTRAINT supply_items_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_confirmation_status_check CHECK ((confirmation_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'confirmed'::text])));
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_per_diem_allowed CHECK (((per_diem IS NULL) OR (per_diem = ANY (ARRAY[(0)::numeric, 0.25, 0.5, 0.75, (1)::numeric]))));
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".vessel_contacts ADD CONSTRAINT vessel_contacts_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".vessels ADD CONSTRAINT vessels_pkey PRIMARY KEY (id);
ALTER TABLE "Cores".whatsapp_keepalive_state ADD CONSTRAINT whatsapp_keepalive_state_id_check CHECK (id);
ALTER TABLE "Cores".whatsapp_keepalive_state ADD CONSTRAINT whatsapp_keepalive_state_pkey PRIMARY KEY (id);

-- Foreign keys
ALTER TABLE "Cores".daily_summary_posted ADD CONSTRAINT daily_summary_posted_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES "Cores".employees(id) ON DELETE CASCADE;
ALTER TABLE "Cores".employee_auth ADD CONSTRAINT employee_auth_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES "Cores".employees(id) ON DELETE CASCADE;
ALTER TABLE "Cores".engine_components ADD CONSTRAINT engine_components_component_type_id_fkey FOREIGN KEY (component_type_id) REFERENCES "Cores".component_types(id);
ALTER TABLE "Cores".engine_components ADD CONSTRAINT engine_components_engine_id_fkey FOREIGN KEY (engine_id) REFERENCES "Cores".engines(id) ON DELETE CASCADE;
ALTER TABLE "Cores".engine_service_log ADD CONSTRAINT engine_service_log_engine_id_fkey FOREIGN KEY (engine_id) REFERENCES "Cores".engines(id) ON DELETE CASCADE;
ALTER TABLE "Cores".engine_service_log ADD CONSTRAINT engine_service_log_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES "Cores".jobs(id) ON DELETE SET NULL;
ALTER TABLE "Cores".engines ADD CONSTRAINT engines_engine_type_id_fkey FOREIGN KEY (engine_type_id) REFERENCES "Cores".engine_types(id);
ALTER TABLE "Cores".engines ADD CONSTRAINT engines_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES "Cores".vessels(id) ON DELETE CASCADE;
ALTER TABLE "Cores".gear_photos ADD CONSTRAINT gear_photos_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES "Cores".employees(id) ON DELETE SET NULL;
ALTER TABLE "Cores".gear_photos ADD CONSTRAINT gear_photos_job_id_fkey FOREIGN KEY (job_id) REFERENCES "Cores".jobs(id) ON DELETE SET NULL;
ALTER TABLE "Cores".job_status_logs ADD CONSTRAINT job_status_logs_job_id_fkey FOREIGN KEY (job_id) REFERENCES "Cores".jobs(id) ON DELETE CASCADE;
ALTER TABLE "Cores".job_supplies ADD CONSTRAINT job_supplies_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES "Cores".employees(id) ON DELETE SET NULL;
ALTER TABLE "Cores".job_supplies ADD CONSTRAINT job_supplies_job_id_fkey FOREIGN KEY (job_id) REFERENCES "Cores".jobs(id) ON DELETE CASCADE;
ALTER TABLE "Cores".job_supplies ADD CONSTRAINT job_supplies_sms_submission_id_fkey FOREIGN KEY (sms_submission_id) REFERENCES "Cores".sms_submissions(id) ON DELETE SET NULL;
ALTER TABLE "Cores".job_supplies ADD CONSTRAINT job_supplies_source_photo_id_fkey FOREIGN KEY (source_photo_id) REFERENCES "Cores".gear_photos(id) ON DELETE SET NULL;
ALTER TABLE "Cores".job_tasks ADD CONSTRAINT job_tasks_job_id_fkey FOREIGN KEY (job_id) REFERENCES "Cores".jobs(id);
ALTER TABLE "Cores".jobs ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES "Cores".customers(id);
ALTER TABLE "Cores".jobs ADD CONSTRAINT jobs_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES "Cores".vessels(id);
ALTER TABLE "Cores".sms_submissions ADD CONSTRAINT sms_submissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES "Cores".employees(id);
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES "Cores".employees(id);
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_job_id_fkey FOREIGN KEY (job_id) REFERENCES "Cores".jobs(id);
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_source_submission_id_fkey FOREIGN KEY (source_submission_id) REFERENCES "Cores".sms_submissions(id) ON DELETE SET NULL;
ALTER TABLE "Cores".timesheet_entries ADD CONSTRAINT timesheet_entries_task_id_fkey FOREIGN KEY (task_id) REFERENCES "Cores".job_tasks(id);
ALTER TABLE "Cores".vessel_contacts ADD CONSTRAINT vessel_contacts_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES "Cores".vessels(id) ON DELETE CASCADE;
ALTER TABLE "Cores".vessels ADD CONSTRAINT vessels_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES "Cores".customers(id);

-- Indexes
CREATE INDEX approval_block_log_attempted_at ON "Cores".approval_block_log USING btree (attempted_at DESC);
CREATE INDEX approval_block_log_submission ON "Cores".approval_block_log USING btree (submission_id);
CREATE INDEX audit_log_changed_at_idx ON "Cores".audit_log USING btree (changed_at);
CREATE INDEX audit_log_table_record_idx ON "Cores".audit_log USING btree (table_name, record_id);
CREATE INDEX backup_log_job_ran_at ON "Cores".backup_log USING btree (job, ran_at DESC);
CREATE INDEX idx_daily_summary_posted_date ON "Cores".daily_summary_posted USING btree (work_date);
CREATE INDEX idx_engine_components_engine ON "Cores".engine_components USING btree (engine_id);
CREATE INDEX idx_engine_components_type ON "Cores".engine_components USING btree (component_type_id);
CREATE INDEX idx_engine_service_log_engine ON "Cores".engine_service_log USING btree (engine_id);
CREATE INDEX idx_engine_service_log_work_order ON "Cores".engine_service_log USING btree (work_order_id);
CREATE INDEX idx_engines_vessel ON "Cores".engines USING btree (vessel_id);
CREATE INDEX idx_gear_photos_employee_date ON "Cores".gear_photos USING btree (employee_id, work_date);
CREATE INDEX idx_gear_photos_job_id ON "Cores".gear_photos USING btree (job_id);
CREATE INDEX idx_gear_photos_location ON "Cores".gear_photos USING btree (photo_latitude, photo_longitude) WHERE (photo_latitude IS NOT NULL);
CREATE INDEX idx_gear_photos_phone_date ON "Cores".gear_photos USING btree (from_phone, work_date);
CREATE INDEX idx_job_supplies_applied_at ON "Cores".job_supplies USING btree (applied_at);
CREATE INDEX idx_job_supplies_billed_at ON "Cores".job_supplies USING btree (billed_at);
CREATE INDEX idx_job_supplies_employee_work_date ON "Cores".job_supplies USING btree (employee_id, work_date);
CREATE INDEX idx_job_supplies_job_id ON "Cores".job_supplies USING btree (job_id);
CREATE INDEX idx_job_supplies_work_date ON "Cores".job_supplies USING btree (work_date);
CREATE UNIQUE INDEX sms_submissions_one_open_per_phone_employee_day ON "Cores".sms_submissions USING btree (from_phone, COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), work_date) WHERE ((status = ANY (ARRAY['collecting'::text, 'submitted'::text])) AND (is_stat_grant = false) AND (is_day_off = false) AND (from_phone ~ '^[0-9+]+$'::text));
CREATE UNIQUE INDEX timesheet_entries_one_day_off_per_day ON "Cores".timesheet_entries USING btree (employee_id, work_date) WHERE (is_day_off = true);
CREATE INDEX timesheet_entries_source_submission_id_idx ON "Cores".timesheet_entries USING btree (source_submission_id);

-- Functions (WhatsApp keepalive is left out: it needs vault secrets and pg_net)
CREATE OR REPLACE FUNCTION "Cores".audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
declare
  rec_id text;
  rec_jsonb jsonb;
begin
  rec_jsonb := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);

  if rec_jsonb ? 'id' then
    rec_id := rec_jsonb ->> 'id';
  elsif rec_jsonb ? 'key' then
    rec_id := rec_jsonb ->> 'key';
  else
    raise exception 'audit_trigger_fn: table "%" has no id or key column to use as audit_log.record_id — update audit_trigger_fn to handle its primary key', TG_TABLE_NAME;
  end if;

  if TG_OP = 'DELETE' then
    insert into "Cores".audit_log (table_name, record_id, action, old_data)
    values (TG_TABLE_NAME, rec_id, TG_OP, to_jsonb(OLD));
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into "Cores".audit_log (table_name, record_id, action, old_data, new_data)
    values (TG_TABLE_NAME, rec_id, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    insert into "Cores".audit_log (table_name, record_id, action, new_data)
    values (TG_TABLE_NAME, rec_id, TG_OP, to_jsonb(NEW));
    return NEW;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION "Cores".auto_close_stale_sms_conversations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
declare
  timeout_hours numeric;
begin
  select value into timeout_hours from "Cores".payroll_config where key = 'sms_followup_timeout_hours';
  if timeout_hours is null then timeout_hours := 4; end if;

  update "Cores".sms_submissions
  set status = 'submitted'
  where status = 'collecting'
    and pending_questions is not null
    and jsonb_array_length(pending_questions) > 0
    and updated_at < now() - (timeout_hours || ' hours')::interval;
end;
$function$;

CREATE OR REPLACE FUNCTION "Cores".prune_processed_message_sids()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
begin
  delete from "Cores".processed_message_sids where created_at < now() - interval '30 days';
end;
$function$;

CREATE OR REPLACE FUNCTION "Cores".record_ip_auth_failure(p_ip text, p_window_minutes integer, p_max_attempts integer, p_lockout_minutes integer)
 RETURNS TABLE(new_fail_count integer, new_blocked_until timestamp with time zone, is_new_block boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
DECLARE
  v_row "Cores".auth_ip_throttle;
  v_count integer;
  v_window_start timestamptz;
  v_blocked timestamptz;
  v_was_blocked boolean;
  v_is_new_block boolean := false;
BEGIN
  INSERT INTO "Cores".auth_ip_throttle (ip, fail_count, window_started_at)
  VALUES (p_ip, 0, now())
  ON CONFLICT (ip) DO NOTHING;

  SELECT * INTO v_row FROM "Cores".auth_ip_throttle WHERE ip = p_ip FOR UPDATE;

  v_was_blocked := v_row.blocked_until IS NOT NULL AND v_row.blocked_until > now();

  IF now() - v_row.window_started_at > (p_window_minutes || ' minutes')::interval THEN
    v_window_start := now();
    v_count := 1;
  ELSE
    v_window_start := v_row.window_started_at;
    v_count := v_row.fail_count + 1;
  END IF;

  IF v_count >= p_max_attempts THEN
    v_blocked := now() + (p_lockout_minutes || ' minutes')::interval;
    v_is_new_block := NOT v_was_blocked;
  ELSE
    v_blocked := v_row.blocked_until;
  END IF;

  UPDATE "Cores".auth_ip_throttle
  SET fail_count = v_count, window_started_at = v_window_start, blocked_until = v_blocked, updated_at = now()
  WHERE ip = p_ip;

  RETURN QUERY SELECT v_count, v_blocked, v_is_new_block;
END;
$function$;

CREATE OR REPLACE FUNCTION "Cores".record_otp_failure(p_employee_id uuid, p_max_attempts integer, p_lockout_minutes integer)
 RETURNS TABLE(new_fail_count integer, new_locked_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
DECLARE
  v_count integer;
  v_locked timestamptz;
BEGIN
  UPDATE "Cores".employee_auth
  SET otp_fail_count = otp_fail_count + 1
  WHERE employee_id = p_employee_id
  RETURNING otp_fail_count INTO v_count;

  IF v_count >= p_max_attempts THEN
    v_locked := now() + (p_lockout_minutes || ' minutes')::interval;
    UPDATE "Cores".employee_auth SET otp_fail_count = 0, otp_locked_until = v_locked, updated_at = now() WHERE employee_id = p_employee_id;
    v_count := 0;
  ELSE
    UPDATE "Cores".employee_auth SET updated_at = now() WHERE employee_id = p_employee_id;
  END IF;

  RETURN QUERY SELECT v_count, v_locked;
END;
$function$;

CREATE OR REPLACE FUNCTION "Cores".record_pin_failure(p_employee_id uuid, p_max_attempts integer, p_lockout_minutes integer)
 RETURNS TABLE(new_fail_count integer, new_locked_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Cores', 'pg_catalog'
AS $function$
DECLARE
  v_count integer;
  v_locked timestamptz;
BEGIN
  UPDATE "Cores".employee_auth
  SET pin_fail_count = pin_fail_count + 1
  WHERE employee_id = p_employee_id
  RETURNING pin_fail_count INTO v_count;

  IF v_count >= p_max_attempts THEN
    v_locked := now() + (p_lockout_minutes || ' minutes')::interval;
    UPDATE "Cores".employee_auth SET pin_fail_count = 0, pin_locked_until = v_locked, updated_at = now() WHERE employee_id = p_employee_id;
    v_count := 0;
  ELSE
    UPDATE "Cores".employee_auth SET updated_at = now() WHERE employee_id = p_employee_id;
  END IF;

  RETURN QUERY SELECT v_count, v_locked;
END;
$function$;

CREATE OR REPLACE FUNCTION "Cores".sms_submissions_no_draft()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'draft' THEN
    NEW.status := 'submitted';
  END IF;
  RETURN NEW;
END;
$function$;

-- Triggers
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".engine_components FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".employees FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".customers FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".vessels FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".jobs FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".job_tasks FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".timesheet_entries FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".payroll_config FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".stat_holidays FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".job_status_logs FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".vessel_contacts FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".sms_submissions FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".job_supplies FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".gear_photos FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".daily_summary_posted FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".component_types FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".engines FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".engine_service_log FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER audit_trg AFTER INSERT OR DELETE OR UPDATE ON "Cores".engine_types FOR EACH ROW EXECUTE FUNCTION "Cores".audit_trigger_fn();
CREATE TRIGGER sms_submissions_no_draft BEFORE INSERT OR UPDATE OF status ON "Cores".sms_submissions FOR EACH ROW EXECUTE FUNCTION "Cores".sms_submissions_no_draft();

-- Row level security (same wide-open policies as live; see docs/SECURITY_PLAN.md)
ALTER TABLE "Cores".approval_block_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".auth_ip_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".backup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".component_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".daily_summary_posted ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".employee_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".employee_phone_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".engine_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".engine_service_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".engine_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".gear_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".job_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".job_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".job_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".payroll_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".processed_message_sids ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".sms_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".stat_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".supply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".vessel_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cores".whatsapp_keepalive_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_block_log_insert ON "Cores".approval_block_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY approval_block_log_select ON "Cores".approval_block_log AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY audit_log_select ON "Cores".audit_log AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY backup_log_insert ON "Cores".backup_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY backup_log_select ON "Cores".backup_log AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY component_types_delete ON "Cores".component_types AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY component_types_insert ON "Cores".component_types AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY component_types_select ON "Cores".component_types AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY component_types_update ON "Cores".component_types AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "anon insert customers" ON "Cores".customers AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read" ON "Cores".customers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon update customers" ON "Cores".customers AS PERMISSIVE FOR UPDATE TO anon USING (true);
CREATE POLICY daily_summary_posted_delete ON "Cores".daily_summary_posted AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY daily_summary_posted_insert ON "Cores".daily_summary_posted AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY daily_summary_posted_select ON "Cores".daily_summary_posted AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY daily_summary_posted_update ON "Cores".daily_summary_posted AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "anon read" ON "Cores".employees AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon write" ON "Cores".employees AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY engine_components_delete ON "Cores".engine_components AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY engine_components_insert ON "Cores".engine_components AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY engine_components_select ON "Cores".engine_components AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY engine_components_update ON "Cores".engine_components AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY engine_service_log_delete ON "Cores".engine_service_log AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY engine_service_log_insert ON "Cores".engine_service_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY engine_service_log_select ON "Cores".engine_service_log AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY engine_service_log_update ON "Cores".engine_service_log AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY engine_types_delete ON "Cores".engine_types AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY engine_types_insert ON "Cores".engine_types AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY engine_types_select ON "Cores".engine_types AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY engine_types_update ON "Cores".engine_types AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY engines_delete ON "Cores".engines AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY engines_insert ON "Cores".engines AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY engines_select ON "Cores".engines AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY engines_update ON "Cores".engines AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY gear_photos_delete ON "Cores".gear_photos AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY gear_photos_insert ON "Cores".gear_photos AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY gear_photos_select ON "Cores".gear_photos AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY gear_photos_update ON "Cores".gear_photos AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "anon insert job_status_logs" ON "Cores".job_status_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon read job_status_logs" ON "Cores".job_status_logs AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY job_supplies_delete ON "Cores".job_supplies AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY job_supplies_insert ON "Cores".job_supplies AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY job_supplies_select ON "Cores".job_supplies AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY job_supplies_update ON "Cores".job_supplies AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "anon read" ON "Cores".job_tasks AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon insert jobs" ON "Cores".jobs AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read" ON "Cores".jobs AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon update jobs" ON "Cores".jobs AS PERMISSIVE FOR UPDATE TO anon USING (true);
CREATE POLICY "anon read" ON "Cores".payroll_config AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon delete" ON "Cores".sms_submissions AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY "anon insert" ON "Cores".sms_submissions AS PERMISSIVE FOR INSERT TO public WITH CHECK (((from_phone <> 'mobile-app'::text) OR (EXISTS ( SELECT 1
   FROM "Cores".employees e
  WHERE ((e.id = sms_submissions.employee_id) AND e.active)))));
CREATE POLICY "anon select" ON "Cores".sms_submissions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon update" ON "Cores".sms_submissions AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "anon read" ON "Cores".stat_holidays AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY supply_items_select ON "Cores".supply_items AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon delete" ON "Cores".timesheet_entries AS PERMISSIVE FOR DELETE TO anon USING (true);
CREATE POLICY "anon insert" ON "Cores".timesheet_entries AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read" ON "Cores".timesheet_entries AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon update" ON "Cores".timesheet_entries AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete vessel_contacts" ON "Cores".vessel_contacts AS PERMISSIVE FOR DELETE TO public USING (true);
CREATE POLICY "anon insert vessel_contacts" ON "Cores".vessel_contacts AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "anon read vessel_contacts" ON "Cores".vessel_contacts AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon update vessel_contacts" ON "Cores".vessel_contacts AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "anon insert vessels" ON "Cores".vessels AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon read" ON "Cores".vessels AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "anon update vessels" ON "Cores".vessels AS PERMISSIVE FOR UPDATE TO anon USING (true);

-- API access to the schema (the dev project also needs "Cores" added to its
-- exposed schemas; scripts/dev-db.sh does that)
GRANT USAGE ON SCHEMA "Cores" TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA "Cores" TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA "Cores" TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "Cores" TO anon, authenticated, service_role;
