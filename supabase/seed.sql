-- MAMA CARE v2 — development seed data
-- Apply with:  supabase db seed
--
-- NOTE: This is DEMO data for local development only. Dates are generated
-- relative to `now()` so gestational ages and EDDs stay realistic at any
-- point in time.

insert into public.facilities (facility_code, name, facility_type, district, province) values
  ('CHC-CHONGWE', 'Chongwe Urban Health Centre', 'health_centre', 'Chongwe', 'Eastern'),
  ('DH-KAFUE',    'Kafue District Hospital',     'district_hospital', 'Kafue', 'Central'),
  ('HP-CHADIZA',  'Chadiza Health Post',         'health_post', 'Goryea', 'Eastern'),
  ('DH-LUNDAZI',  'Lundazi District Hospital',   'district_hospital', 'Lundazi', 'Eastern'),
  ('RS-SINAZONGWE', 'Sinazongwe Rural Hospital', 'district_hospital', 'Sinazongwe', 'Eastern'),
  ('MH-CHIRUNDU', 'Chirundu Mission Hospital',   'district_hospital', 'Chirundu', 'Eastern');

-- A few demo pregnancies with realistic LMP → EDD (LMP + 280 days).
insert into public.mothers (id, mother_code, full_name, age, phone, community,
                            registration_facility_id)
values
  (gen_random_uuid(), 'MC-000245', 'Mary Phiri', 29, '+260977000001', 'Chongwe Town',
   (select id from public.facilities where facility_code = 'CHC-CHONGWE')),
  (gen_random_uuid(), 'MC-000246', 'Ruth Banda', 34, '+260977000002', 'Mkwaba',
   (select id from public.facilities where facility_code = 'CHC-CHONGWE')),
  (gen_random_uuid(), 'MC-000247', 'Chipo Tembo', 22, '+260977000003', 'Chadiza',
   (select id from public.facilities where facility_code = 'HP-CHADIZA')),
  (gen_random_uuid(), 'MC-000248', 'Mutinta Mwale', 31, '+260977000004', 'Lundazi Town',
   (select id from public.facilities where facility_code = 'DH-LUNDAZI')),
  (gen_random_uuid(), 'MC-000249', 'Neema Zulu', 38, '+260977000005', 'Sinazongwe',
   (select id from public.facilities where facility_code = 'RS-SINAZONGWE'));

insert into public.pregnancies
  (id, mother_id, gravida, para, lmp_date, edd_date, confirmed_date,
   previous_c_section, risk_factors, status)
select gen_random_uuid(), m.id, g.g, g.p,
       (now() - (g.weeks || ' weeks')::interval)::date,
       ((now() - (g.weeks || ' weeks')::interval) + interval '280 days')::date,
       ((now() - (g.weeks || ' weeks')::interval) + interval '14 days')::date,
       g.cs, g.rf, 'active'
from public.mothers m
join (values
  ('Mary Phiri',    1, 0, 24, false, ARRAY[]::text[]),                -- 24 weeks
  ('Ruth Banda',    3, 2, 12, false, ARRAY['hypertension']),          -- 12 weeks
  ('Chipo Tembo',   1, 0, 33, false, ARRAY['young_age']),             -- 33 weeks
  ('Mutinta Mwale', 2, 1,  8, false, ARRAY['previous_cs']),           -- 8 weeks, prev C-section
  ('Neema Zulu',    5, 4, 40, true,  ARRAY['grand_multi','age_gt_35'])-- 40 weeks
) as g(full_name, g, p, weeks, cs, rf)
  on g.full_name = m.full_name;

-- Appointments: a mix of today, overdue, and upcoming.
insert into public.appointments (id, pregnancy_id, scheduled_date, status)
select gen_random_uuid(), pr.id,
       case when mod(abs(hash(pr.id)), 4) = 0 then (now() - 4 * interval '1 day')::date
            when mod(abs(hash(pr.id)), 4) = 1 then (now() - 2 * interval '1 day')::date
            when mod(abs(hash(pr.id)), 4) = 2 then (now())::date
            else (now() + 7 * interval '1 day')::date end,
       'scheduled'
from public.pregnancies pr
where pr.status = 'active';
