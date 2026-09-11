-- ============================================================================
-- MAMA CARE v2 — initial schema
-- Target: Supabase (PostgreSQL 15+)
--
-- Conventions:
--   * All rows are created with server-side UUIDs, but clients ALWAYS generate
--     their own UUID (v4) before inserting, so offline upserts are idempotent.
--   * `row_version` is bumped on every UPDATE (trigger) — the sync engine
--     compares it to decide conflicts.
--   * Nothing is hard-deleted from clinical tables; mothers use `deleted_at`.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─────────────────────────── ENUMS ────────────────────────────────────────
create type public.user_role as enum
  ('admin', 'midwife', 'nurse', 'chp', 'supervisor', 'mother');

create type public.pregnancy_status as enum
  ('active', 'delivered', 'postnatal', 'closed', 'lost_to_followup');

create type public.visit_type as enum
  ('routine', 'unscheduled', 'review', 'follow_up');

create type public.appointment_status as enum
  ('scheduled', 'completed', 'missed', 'cancelled');

create type public.urgency_level as enum
  ('emergency', 'urgent', 'routine');

create type public.referral_status as enum
  ('active', 'received', 'assessment_completed', 'treated',
   'admitted', 'discharged', 'referred_onward', 'follow_up_required', 'closed');

create type public.alert_level as enum ('red', 'amber', 'green');

create type public.alert_status as enum
  ('open', 'assessed', 'referred', 'documented', 'resolved');

create type public.multiple_pregnancy as enum
  ('single', 'suspected_multiple', 'confirmed_multiple');

create type public.delivery_mode as enum
  ('spontaneous', 'instrumental_vacuum', 'instrumental_forceps', 'cesarean_section');

-- ─────────────────────────── FACILITIES ───────────────────────────────────
create table public.facilities (
  id            uuid primary key default gen_random_uuid(),
  facility_code text not null unique,
  name          text not null,
  facility_type text not null default 'health_centre',  -- health_post/health_centre/district_hospital/mission
  district      text,
  province      text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────── USERS / ROLES ────────────────────────────────
-- One row per auth.users. Auto-created on sign-up (trigger below).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'chp',
  phone       text,
  facility_id uuid references public.facilities (id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-provision a profile when a user signs up.
-- SECURITY: the role is ALWAYS 'chp' (least privilege) on self-signup.
-- Client-supplied metadata can never set the role — roles and facilities
-- are assigned by an administrator afterwards. (Trusting metadata here
-- would let any user sign up as 'admin'.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Health worker'),
    'chp',
    new.phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────── MOTHERS ──────────────────────────────────────
create sequence if not exists public.mother_code_seq start 1;

create table public.mothers (
  id                     uuid primary key,          -- client-generated (offline-first)
  mother_code            text not null unique,      -- canonical MC-000245 (assigned server-side)
  provisional_code       text,                      -- client's offline code until first sync
  full_name              text not null,
  date_of_birth          date,
  age                    integer,
  phone                  text,
  address                text,
  community              text,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_language     text default 'English',
  registration_facility_id uuid not null references public.facilities (id),
  registered_by          uuid references public.profiles (id),
  deleted_at             timestamptz,               -- soft delete only
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  row_version            bigint not null default 1
);

create index mothers_name_idx   on public.mothers (full_name);
create index mothers_facility_idx on public.mothers (registration_facility_id);
create index mothers_phone_idx  on public.mothers (phone);

-- Canonical mother code, assigned on insert (server is the source of truth).
create or replace function public.assign_mother_code()
returns trigger language plpgsql as $$
begin
  if new.mother_code is null then
    new.mother_code := 'MC-' || lpad(nextval('public.mother_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_assign_mother_code
  before insert on public.mothers
  for each row when (mother_code is null)
  execute function public.assign_mother_code();

-- ─────────────────────────── PREGNANCIES ──────────────────────────────────
create table public.pregnancies (
  id                 uuid primary key,              -- client-generated
  mother_id          uuid not null references public.mothers (id) on delete cascade,
  gravida            integer not null default 1,
  para               integer not null default 0,
  previous_complications text[],
  lmp_date           date not null,                 -- last menstrual period
  edd_date           date not null,                 -- EDD = LMP + 280d (stored at write time)
  confirmed_date     date,
  multiple_pregnancy multiple_pregnancy not null default 'single',
  previous_c_section boolean not null default false,
  risk_factors       text[],
  status             pregnancy_status not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  row_version        bigint not null default 1
);

create index pregnancies_mother_idx   on public.pregnancies (mother_id);
create index pregnancies_edd_idx      on public.pregnancies (edd_date);
create index pregnancies_status_idx   on public.pregnancies (status);

-- ─────────────────────────── ANC VISITS ───────────────────────────────────
create table public.anc_visits (
  id             uuid primary key,                  -- client-generated
  pregnancy_id   uuid not null references public.pregnancies (id) on delete cascade,
  visit_number   integer not null,
  visit_date     date not null,
  ga_weeks       integer not null,
  ga_days        integer not null,
  reason         text,
  visit_type     visit_type not null default 'routine',
  recorded_by    uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  row_version    bigint not null default 1
);

create index visits_pregnancy_idx on public.anc_visits (pregnancy_id, visit_number);
create index visits_date_idx      on public.anc_visits (visit_date);

create table public.vitals (
  id               uuid primary key,
  visit_id         uuid not null references public.anc_visits (id) on delete cascade,
  systolic_bp      integer,
  diastolic_bp     integer,
  pulse            integer,
  temperature_c    numeric(4,1),
  respiratory_rate integer,
  weight_kg        numeric(5,1),
  other_observations text,
  recorded_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  row_version      bigint not null default 1
);

create index vitals_visit_idx on public.vitals (visit_id);

create table public.danger_signs (
  id         uuid primary key,
  visit_id   uuid not null references public.anc_visits (id) on delete cascade,
  sign_key   text not null,        -- e.g. 'severe_headache', 'vaginal_bleeding'
  reported   boolean not null default true,
  note       text,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  unique (visit_id, sign_key)
);

create table public.tests (
  id           uuid primary key,
  visit_id     uuid not null references public.anc_visits (id) on delete cascade,
  test_key     text not null,      -- e.g. 'urine_protein', 'hb', 'hiv', 'syphilis'
  result_value text,
  result_text  text,
  recorded_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  row_version  bigint not null default 1,
  unique (visit_id, test_key)
);

create table public.medications (
  id             uuid primary key,
  visit_id       uuid not null references public.anc_visits (id) on delete cascade,
  medication     text not null,
  dose           text,
  frequency      text,
  administered   boolean not null default false,
  recorded_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  row_version    bigint not null default 1
);

-- ─────────────────────────── APPOINTMENTS ─────────────────────────────────
create table public.appointments (
  id               uuid primary key,
  pregnancy_id     uuid not null references public.pregnancies (id) on delete cascade,
  scheduled_date   date not null,
  reminder_days    integer[] not null default '{7,1}',
  status           appointment_status not null default 'scheduled',
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  row_version      bigint not null default 1
);

create index appointments_date_idx    on public.appointments (scheduled_date);
create index appointments_status_idx  on public.appointments (status);

-- ─────────────────────────── REFERRALS ────────────────────────────────────
create table public.referrals (
  id                    uuid primary key,
  pregnancy_id          uuid not null references public.pregnancies (id) on delete cascade,
  reason                text not null,
  urgency               urgency_level not null default 'urgent',
  referred_from_facility_id uuid not null references public.facilities (id),
  referred_to_facility_id   uuid references public.facilities (id),
  referred_to_name    text,               -- free text when no facility row exists
  referred_at         timestamptz not null default now(),
  transport           text,               -- ambulance / private / other
  clinical_notes      text,
  status              referral_status not null default 'active',
  status_updated_at   timestamptz,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  row_version         bigint not null default 1
);

create index referrals_pregnancy_idx on public.referrals (pregnancy_id);
create index referrals_status_idx    on public.referrals (status);

-- ─────────────────────────── FOLLOW-UPS (missed-visit outreach) ───────────
create table public.follow_ups (
  id               uuid primary key,
  pregnancy_id     uuid not null references public.pregnancies (id) on delete cascade,
  appointment_id   uuid references public.appointments (id) on delete set null,
  phone_contacted  boolean not null default false,
  home_visit       boolean not null default false,
  attended_elsewhere boolean not null default false,
  mother_unavailable boolean not null default false,
  phone_unavailable  boolean not null default false,
  other            boolean not null default false,
  outcome          text,
  recorded_by      uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  row_version      bigint not null default 1
);

-- ─────────────────────────── DELIVERIES ───────────────────────────────────
create table public.deliveries (
  id                 uuid primary key,
  pregnancy_id       uuid not null references public.pregnancies (id) on delete cascade,
  delivery_date      timestamptz not null,
  place_of_delivery  text not null,        -- this_facility / other_facility / home / other
  mode_of_delivery   delivery_mode not null default 'spontaneous',
  outcome            text not null,        -- alive / dead / stillbirth
  maternal_outcome   text,
  baby_outcome       text,
  birth_weight_kg    numeric(4,1),
  complications      text,
  referred_admission boolean not null default false,
  recorded_by        uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  row_version        bigint not null default 1
);

create index deliveries_pregnancy_idx on public.deliveries (pregnancy_id);

-- ─────────────────────────── CLINICAL ALERTS ──────────────────────────────
-- Raised by the alert engine (device-side and/or edge-side) when a rule fires.
create table public.alerts (
  id             uuid primary key,
  pregnancy_id   uuid not null references public.pregnancies (id) on delete cascade,
  visit_id       uuid references public.anc_visits (id) on delete set null,
  rule_key       text not null,
  level          alert_level not null,
  message        text not null,            -- "Potential danger sign — ..."
  status         alert_status not null default 'open',
  assessed_by    uuid references public.profiles (id),
  assessed_at    timestamptz,
  action_taken   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  row_version    bigint not null default 1
);

create index alerts_pregnancy_idx on public.alerts (pregnancy_id);
create index alerts_status_idx    on public.alerts (status, level);

-- ─────────────────────────── CONFIGURABLE ALERT RULES ─────────────────────
-- The clinical rules live in the database so they can be updated when national
-- guidelines change, without shipping an app update. The app downloads them
-- on sync and keeps a local copy for offline evaluation.
create table public.alert_rules (
  id              uuid primary key default gen_random_uuid(),
  rule_key        text not null unique,
  level           alert_level not null,
  title           text not null,
  message         text not null,
  condition_json  jsonb not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.alert_rules
  (rule_key, level, title, message, condition_json, enabled) values
  ('convulsions', 'red', 'Convulsions reported',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"convulsions"}]}', true),
  ('vaginal_bleeding', 'red', 'Vaginal bleeding reported',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"vaginal_bleeding"}]}', true),
  ('reduced_fetal_movement', 'red', 'Reduced or absent fetal movement',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"reduced_fetal_movement"}]}', true),
  ('fluid_leakage', 'red', 'Fluid leakage reported',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"fluid_leakage"}]}', true),
  ('difficulty_breathing', 'red', 'Difficulty breathing reported',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"difficulty_breathing"}]}', true),
  ('severe_pain_and_bleeding', 'red', 'Severe abdominal pain with bleeding',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"all","criteria":[{"field":"danger_sign","key":"severe_abdominal_pain"},{"field":"danger_sign","key":"vaginal_bleeding"}]}', true),
  ('headache_and_vision', 'red', 'Severe headache with visual disturbance',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"all","criteria":[{"field":"danger_sign","key":"severe_headache"},{"field":"danger_sign","key":"blurred_vision"}]}', true),
  ('bp_severe', 'red', 'Severely raised blood pressure (≥160/110)',
   'Potential danger sign — immediate clinical assessment required.',
   '{"logic":"any","criteria":[{"field":"systolic_bp","op":"gte","value":160},{"field":"diastolic_bp","op":"gte","value":110}]}', true),
  ('severe_abdominal_pain', 'amber', 'Severe abdominal pain reported',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"severe_abdominal_pain"}]}', true),
  ('severe_headache', 'amber', 'Severe headache reported',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"severe_headache"}]}', true),
  ('blurred_vision', 'amber', 'Blurred or changed vision reported',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"blurred_vision"}]}', true),
  ('fever', 'amber', 'Fever reported (≥38.0°C)',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"temperature_c","op":"gte","value":38.0}]}', true),
  ('severe_vomiting', 'amber', 'Severe vomiting reported',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"danger_sign","key":"severe_vomiting"}]}', true),
  ('tachycardia', 'amber', 'Pulse elevated (>120 bpm)',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"pulse","op":"gt","value":120}]}', true),
  ('bp_elevated', 'amber', 'Raised blood pressure (140–159 / 90–109)',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"systolic_bp","op":"gte","value":140},{"field":"diastolic_bp","op":"gte","value":90}]}', true),
  ('weight_loss', 'amber', 'Weight loss since previous visit',
   'Concerning finding — clinical review and follow-up required.',
   '{"logic":"any","criteria":[{"field":"weight_loss","op":"eq","value":true}]}', true);

-- ─────────────────────────── NOTIFICATIONS / SMS LOG / AUDIT ──────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,               -- alert / appointment / referral_update
  title       text not null,
  body        text,
  payload     jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, is_read);

create table public.sms_logs (
  id            uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete set null,
  mother_id     uuid references public.mothers (id) on delete set null,
  phone         text,
  provider      text,
  status        text not null,             -- sent / failed / dry_run
  message       text,
  provider_ref  text,
  created_at    timestamptz not null default now()
);

create table public.audit_logs (
  id          bigserial primary key,
  table_name  text not null,
  row_id      uuid,
  action      text not null,               -- UPDATE / DELETE
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid references public.profiles (id),
  changed_at  timestamptz not null default now()
);

create index audit_logs_table_idx on public.audit_logs (table_name, row_id);

-- ─────────────────────────── TRIGGERS ─────────────────────────────────────
-- Bump row_version + updated_at on every update to a syncable table.
create or replace function public.bump_row_version()
returns trigger language plpgsql as $$
begin
  new.updated_at  := now();
  new.row_version := coalesce(old.row_version, 1) + 1;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'mothers','pregnancies','anc_visits','vitals','danger_signs','tests',
    'medications','appointments','referrals','follow_ups','deliveries','alerts'
  ] loop
    execute format(
      'create trigger trg_bump_%I before update on public.%I
       for each row execute function public.bump_row_version();', t, t);
  end loop;
end;
$$;

-- Keep updated_at fresh even on tables without row_version.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['facilities','profiles'] loop
    execute format(
      'create trigger trg_touch_%I before update on public.%I
       for each row execute function public.touch_updated_at();', t, t);
  end loop;
end;
$$;

-- Audit changes to clinical tables.
create or replace function public.audit_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    insert into public.audit_logs
      (table_name, row_id, action, old_data, new_data, changed_by)
    values
      (tg_table_name,
       case when tg_op = 'UPDATE' then new.id else old.id end,
       tg_op,
       to_jsonb(old),
       case when tg_op = 'DELETE' then null else to_jsonb(new) end,
       (select id from public.profiles where id = auth.uid()));
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'mothers','pregnancies','anc_visits','vitals','danger_signs',
    'tests','medications','appointments','referrals','follow_ups',
    'deliveries','alerts'
  ] loop
    execute format(
      'create trigger trg_audit_%I after update or delete on public.%I
       for each row execute function public.audit_change();', t, t);
  end loop;
end;
$$;

-- ─────────────────────────── RLS / ACCESS CONTROL ─────────────────────────
alter table public.facilities        enable row level security;
alter table public.profiles          enable row level security;
alter table public.mothers           enable row level security;
alter table public.pregnancies       enable row level security;
alter table public.anc_visits        enable row level security;
alter table public.vitals            enable row level security;
alter table public.danger_signs      enable row level security;
alter table public.tests             enable row level security;
alter table public.medications       enable row level security;
alter table public.appointments      enable row level security;
alter table public.referrals         enable row level security;
alter table public.follow_ups        enable row level security;
alter table public.deliveries        enable row level security;
alter table public.alerts            enable row level security;
alter table public.alert_rules       enable row level security;
alter table public.notifications     enable row level security;
alter table public.sms_logs          enable row level security;
alter table public.audit_logs        enable row level security;

-- Which facilities can this user touch?
--   admin      → all
--   supervisor → all facilities in their own district
--   midwife/nurse/chp → their own facility
create or replace function public.accessible_facility_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select f.id
  from public.facilities f
  join public.profiles p on p.id = auth.uid()
  where p.is_active
    and (
         p.role = 'admin'
      or f.id = p.facility_id
      or (p.role = 'supervisor'
          and f.district = (select f2.district from public.facilities f2
                            where f2.id = p.facility_id))
    );
$$;

create or replace function public.my_role()
returns user_role language sql stable security definer set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- Facilities: read for any staff; only admins manage.
create policy "facilities_read"  on public.facilities for select
  using (auth.role() = 'authenticated');
create policy "facilities_admin" on public.facilities for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Profiles: a user can see their own row; admins see all (for user management).
create policy "profiles_self" on public.profiles for select
  using (id = auth.uid());
create policy "profiles_admin_read" on public.profiles for select
  using (public.my_role() = 'admin');
create policy "profiles_admin_update" on public.profiles for update
  using (public.my_role() = 'admin');

-- Mothers: scoped to accessible facilities.
create policy "mothers_read" on public.mothers for select
  using (deleted_at is null
         and exists (select 1 from public.accessible_facility_ids() a
                     where a = registration_facility_id));
create policy "mothers_insert" on public.mothers for insert
  with check (exists (select 1 from public.accessible_facility_ids() a
                      where a = registration_facility_id)
              or public.my_role() = 'admin');
create policy "mothers_update" on public.mothers for update
  using (exists (select 1 from public.accessible_facility_ids() a
                 where a = registration_facility_id));

-- Helper: is this pregnancy's mother visible to me?
create or replace function public.pregnancy_visible(p uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.pregnancies pr
    join public.mothers m on m.id = pr.mother_id
    where pr.id = p
      and m.deleted_at is null
      and exists (select 1 from public.accessible_facility_ids() a
                  where a = m.registration_facility_id)
  );
$$;

create policy "pregnancies_read" on public.pregnancies for select
  using (public.pregnancy_visible(id));
create policy "pregnancies_insert" on public.pregnancies for insert
  with check (public.pregnancy_visible(mother_id));
create policy "pregnancies_update" on public.pregnancies for update
  using (public.pregnancy_visible(id));

-- Visits & their children (vitals/signs/tests/meds) follow pregnancy visibility.
create policy "visits_read" on public.anc_visits for select
  using (public.pregnancy_visible(pregnancy_id));
create policy "visits_insert" on public.anc_visits for insert
  with check (public.pregnancy_visible(pregnancy_id));
create policy "visits_update" on public.anc_visits for update
  using (public.pregnancy_visible(pregnancy_id));

-- Child rows are append/update only (never delete). UPDATE policies exist so
-- the idempotent sync engine's upsert (conflict → UPDATE) is allowed.
create policy "vitals_read" on public.vitals for select
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = vitals.visit_id)));
create policy "vitals_insert" on public.vitals for insert
  with check (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = vitals.visit_id)));
create policy "vitals_update" on public.vitals for update
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = vitals.visit_id)));

create policy "danger_signs_read" on public.danger_signs for select
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = danger_signs.visit_id)));
create policy "danger_signs_insert" on public.danger_signs for insert
  with check (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = danger_signs.visit_id)));
create policy "danger_signs_update" on public.danger_signs for update
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = danger_signs.visit_id)));

create policy "tests_read" on public.tests for select
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = tests.visit_id)));
create policy "tests_insert" on public.tests for insert
  with check (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = tests.visit_id)));
create policy "tests_update" on public.tests for update
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = tests.visit_id)));

create policy "medications_read" on public.medications for select
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = medications.visit_id)));
create policy "medications_insert" on public.medications for insert
  with check (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = medications.visit_id)));
create policy "medications_update" on public.medications for update
  using (public.pregnancy_visible(
           (select pr.id from public.anc_visits v
            join public.pregnancies pr on pr.id = v.pregnancy_id
            where v.id = medications.visit_id)));

create policy "appointments_read" on public.appointments for select
  using (public.pregnancy_visible(pregnancy_id));
create policy "appointments_insert" on public.appointments for insert
  with check (public.pregnancy_visible(pregnancy_id));
create policy "appointments_update" on public.appointments for update
  using (public.pregnancy_visible(pregnancy_id));

-- Referrals: both the sending and receiving facilities manage their end.
create policy "referrals_read" on public.referrals for select
  using (public.pregnancy_visible(pregnancy_id)
         or exists (select 1 from public.accessible_facility_ids() a
                    where a = referred_to_facility_id));
create policy "referrals_insert" on public.referrals for insert
  with check (public.pregnancy_visible(pregnancy_id));
create policy "referrals_update" on public.referrals for update
  using (exists (select 1 from public.accessible_facility_ids() a
                 where a = referred_from_facility_id)
         or exists (select 1 from public.accessible_facility_ids() a
                    where a = referred_to_facility_id));

create policy "follow_ups_read" on public.follow_ups for select
  using (public.pregnancy_visible(pregnancy_id));
create policy "follow_ups_insert" on public.follow_ups for insert
  with check (public.pregnancy_visible(pregnancy_id));

create policy "deliveries_read" on public.deliveries for select
  using (public.pregnancy_visible(pregnancy_id));
create policy "deliveries_insert" on public.deliveries for insert
  with check (public.pregnancy_visible(pregnancy_id));

create policy "alerts_read" on public.alerts for select
  using (public.pregnancy_visible(pregnancy_id));
create policy "alerts_insert" on public.alerts for insert
  with check (public.pregnancy_visible(pregnancy_id));
create policy "alerts_update" on public.alerts for update
  using (public.pregnancy_visible(pregnancy_id));

-- Alert rules: staff read, only admins (or superuser-maintained) write.
create policy "alert_rules_read" on public.alert_rules for select
  using (auth.role() = 'authenticated');
create policy "alert_rules_write" on public.alert_rules for all
  using (public.my_role() = 'admin');

-- Notifications: only the addressed user (admins can read all for support).
create policy "notifications_read" on public.notifications for select
  using (user_id = auth.uid() or public.my_role() = 'admin');
create policy "notifications_update" on public.notifications for update
  using (user_id = auth.uid());

-- sms_logs & audit_logs: no client access at all (service-role only).
-- (No policies = deny all for authenticated users.)
grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.mothers, public.pregnancies,
      public.anc_visits, public.vitals, public.danger_signs, public.tests,
      public.medications, public.appointments, public.referrals,
      public.follow_ups, public.deliveries, public.alerts to authenticated;
grant select on public.facilities, public.profiles, public.alert_rules,
      public.notifications to authenticated;
grant update on public.notifications to authenticated;
