-- =====================================================================
-- ShuleHub · core schema
-- Multi-school (multi-tenant) school management for Kenyan schools.
-- Every school-owned row carries school_id; Row Level Security in the
-- next migration makes sure people only ever see their own school,
-- and only what their role allows.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- roles ----------------------------------------------------
do $$ begin
  create type app_role as enum (
    'super_admin',        -- ShuleHub platform owner
    'director','principal','deputy_principal','head_teacher','bursar',  -- school leadership
    'teacher','student','parent');
exception when duplicate_object then null; end $$;

-- ---------- platform -------------------------------------------------
create table if not exists plans (
  id             text primary key,               -- 'basic' | 'standard' | 'premium'
  name           text not null,
  price_per_term integer not null check (price_per_term >= 0),   -- KSh
  max_learners   integer,                        -- null = unlimited
  features       text[] not null default '{}',   -- e.g. {'ai','video','sms'}
  sort           integer not null default 0
);

insert into plans (id,name,price_per_term,max_learners,features,sort) values
  ('basic','Basic',15000,300,'{fees,marks,attendance,sms}',1),
  ('standard','Standard',35000,800,'{fees,marks,attendance,sms,portals,chat,quiz}',2),
  ('premium','Premium',60000,null,'{fees,marks,attendance,sms,portals,chat,quiz,ai,video}',3)
on conflict (id) do nothing;

create table if not exists schools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text not null unique check (code ~ '^[A-Z0-9]{2,8}$'),  -- used in learner logins
  county         text,
  phone          text,
  email          text,
  plan_id        text not null default 'standard' references plans(id),
  status         text not null default 'trial' check (status in ('trial','active','suspended')),
  trial_ends     date default (current_date + 30),
  curriculum     text not null default 'CBE',
  motto          text,
  paybill        text,          -- shown to parents ("Business number")
  learner_chat   boolean not null default false,  -- learners may use Messages (school switch; parents must also allow)
  learner_ai     boolean not null default false,  -- learners may use Mwalimu AI (school switch; parents must also allow)
  terms_version  text,          -- ShuleHub terms accepted on behalf of the school
  terms_accepted_at timestamptz,
  terms_accepted_by uuid,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz
);

create table if not exists platform_invoices (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  term_label text not null,                       -- e.g. 'Term 3 2026'
  amount     integer not null check (amount >= 0),
  due_date   date not null default (current_date + 14),
  created_at timestamptz not null default now(),
  unique (school_id, term_label)
);

create table if not exists platform_payments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  amount      integer not null check (amount > 0),
  term_label  text,
  method      text not null default 'M-Pesa',
  reference   text,
  paid_at     date not null default current_date,
  recorded_by uuid,
  created_at  timestamptz not null default now()
);

-- ---------- people ---------------------------------------------------
create table if not exists profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  school_id            uuid references schools(id) on delete cascade,   -- null only for super_admin
  role                 app_role not null,
  full_name            text not null,
  phone                text,
  email                text,
  login_id             text,            -- what the person types to sign in (email, phone or admission no.)
  must_change_password boolean not null default true,
  active               boolean not null default true,
  terms_version        text,            -- version of the terms / privacy notice this person accepted
  terms_accepted_at    timestamptz,
  created_at           timestamptz not null default now(),
  constraint school_required check (role = 'super_admin' or school_id is not null)
);
create index if not exists profiles_school_idx on profiles(school_id);

create table if not exists role_permissions (
  school_id uuid not null references schools(id) on delete cascade,
  role      app_role not null,
  perm      text not null check (perm in ('dashboard','learners','staff','fees','payments','results','announce','calendar','settings','welfare')),
  primary key (school_id, role, perm)
);

-- ---------- academic structure --------------------------------------
create table if not exists terms (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  name       text not null,              -- 'Term 3 2026'
  starts     date,
  ends       date,
  is_current boolean not null default false,
  unique (school_id, name)
);
create unique index if not exists one_current_term on terms(school_id) where is_current;

create table if not exists classes (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  name          text not null,           -- 'Grade 8 Acacia'
  grade         integer,                 -- 7, 8, 9 …
  class_teacher uuid references profiles(id) on delete set null,
  unique (school_id, name)
);

create table if not exists subjects (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name      text not null,
  short     text not null,
  sort      integer not null default 0,
  unique (school_id, name)
);

create table if not exists teaching_assignments (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  unique (teacher_id, class_id, subject_id)
);

create table if not exists students (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  class_id   uuid references classes(id) on delete set null,
  user_id    uuid unique references profiles(id) on delete set null,   -- the learner's own login, if any
  full_name  text not null,
  adm_no     text not null,
  active     boolean not null default true,
  -- Parent/guardian consent (Data Protection Act s.33). Recorded by the school at admission.
  consent_recorded_at timestamptz,
  consent_recorded_by uuid references profiles(id) on delete set null,
  consent_method      text,               -- e.g. 'Signed admission form', 'Parent confirmed in ShuleHub'
  -- Optional features, off until BOTH the school and a parent switch them on.
  allow_chat boolean not null default false,
  allow_ai   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, adm_no)
);
create index if not exists students_class_idx on students(class_id);

create table if not exists guardians (
  student_id   uuid not null references students(id) on delete cascade,
  parent_id    uuid not null references profiles(id) on delete cascade,
  relationship text default 'Parent',
  school_id    uuid not null references schools(id) on delete cascade,
  primary key (student_id, parent_id)
);
create index if not exists guardians_parent_idx on guardians(parent_id);

-- ---------- assessment ----------------------------------------------
create table if not exists exams (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  term_id    uuid references terms(id) on delete set null,
  name       text not null,              -- 'T3 End-Term'
  status     text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists marks (
  exam_id    uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  score      numeric(5,1) check (score between 0 and 100),
  entered_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (exam_id, student_id, subject_id)
);

create table if not exists mark_submissions (
  exam_id      uuid not null references exams(id) on delete cascade,
  class_id     uuid not null references classes(id) on delete cascade,
  subject_id   uuid not null references subjects(id) on delete cascade,
  school_id    uuid not null references schools(id) on delete cascade,
  submitted_by uuid references profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  primary key (exam_id, class_id, subject_id)
);

create table if not exists attendance (
  student_id uuid not null references students(id) on delete cascade,
  day        date not null,
  status     char(1) not null check (status in ('P','L','A')),
  school_id  uuid not null references schools(id) on delete cascade,
  marked_by  uuid references profiles(id) on delete set null,
  primary key (student_id, day)
);

create table if not exists exam_papers (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  class_id   uuid references classes(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  title      text not null,
  topic      text,
  questions  jsonb not null default '[]',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists homework (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  class_id   uuid not null references classes(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  title      text not null,
  details    text,
  due        date not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- fees (a simple ledger: charges minus payments) ----------
create table if not exists fee_items (
  id        uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  term_id   uuid not null references terms(id) on delete cascade,
  class_id  uuid references classes(id) on delete cascade,   -- null = every class
  name      text not null,
  amount    integer not null check (amount >= 0)
);

create table if not exists fee_charges (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  term_id     uuid references terms(id) on delete set null,
  description text not null,
  amount      integer not null,           -- negative = bursary / waiver
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (student_id, term_id, description)
);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  amount        integer not null check (amount > 0),
  method        text not null default 'M-Pesa' check (method in ('M-Pesa','Bank','Cash','Cheque')),
  reference     text,
  mpesa_receipt text unique,
  paid_at       timestamptz not null default now(),
  recorded_by   uuid references profiles(id) on delete set null
);
create index if not exists payments_student_idx on payments(student_id);

create table if not exists mpesa_requests (
  checkout_request_id text primary key,
  school_id    uuid not null references schools(id) on delete cascade,
  student_id   uuid not null references students(id) on delete cascade,
  phone        text not null,
  amount       integer not null,
  status       text not null default 'pending' check (status in ('pending','paid','failed')),
  result_desc  text,
  receipt      text,
  requested_by uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Paybill payments whose account number did not match a learner; the bursar assigns them.
create table if not exists mpesa_unmatched (
  trans_id   text primary key,
  school_id  uuid not null references schools(id) on delete cascade,
  amount     integer not null,
  bill_ref   text,
  msisdn     text,
  payer_name text,
  created_at timestamptz not null default now()
);

-- Daraja credentials per school. Never readable from the browser.
create table if not exists mpesa_settings (
  school_id       uuid primary key references schools(id) on delete cascade,
  environment     text not null default 'sandbox' check (environment in ('sandbox','production')),
  shortcode       text not null,
  shortcode_type  text not null default 'paybill' check (shortcode_type in ('paybill','till')),
  passkey         text not null,
  consumer_key    text not null,
  consumer_secret text not null,
  updated_at      timestamptz not null default now()
);

-- ---------- communication -------------------------------------------
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  title      text not null,
  body       text not null,
  audience   text not null default 'everyone' check (audience in ('everyone','parents','learners','staff')),
  sms        boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  day        date not null,
  title      text not null,
  kind       text not null default 'Event',
  created_by uuid references profiles(id) on delete set null
);

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  sender     uuid not null references profiles(id) on delete cascade,
  recipient  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_pair_idx on messages(sender, recipient, created_at);
create index if not exists messages_recipient_idx on messages(recipient, created_at);

create table if not exists message_reports (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  reporter      uuid not null references profiles(id) on delete cascade,
  reported_user uuid not null references profiles(id) on delete cascade,
  note          text,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists meetings (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  parent_id  uuid not null references profiles(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  starts_at  timestamptz not null,
  mode       text not null default 'video' check (mode in ('video','audio')),
  topic      text not null,
  status     text not null default 'requested' check (status in ('requested','confirmed','cancelled','done')),
  room       text not null default encode(gen_random_bytes(10),'hex'),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists sms_log (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools(id) on delete cascade,
  to_phone    text not null,
  body        text not null,
  status      text,
  provider_id text,
  created_at  timestamptz not null default now()
);

-- ---------- learning ------------------------------------------------
create table if not exists quizzes (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id) on delete cascade,
  class_id   uuid references classes(id) on delete cascade,      -- null = whole school
  subject_id uuid references subjects(id) on delete set null,
  title      text not null,
  questions  jsonb not null,             -- [{q, options:[4], answer:index}]
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint quiz_has_questions check (jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 2 and 40)
);

create table if not exists quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references quizzes(id) on delete cascade,
  school_id  uuid not null references schools(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  score      integer not null check (score >= 0 and score <= 10000),
  correct    integer not null,
  total      integer not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_usage (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid references schools(id) on delete cascade,
  user_id    uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on ai_usage(user_id, created_at);

-- =====================================================================
-- Helper functions used by the security rules
-- (security definer so they can read profiles without recursion)
-- =====================================================================
create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function is_super() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'super_admin' from profiles where id = auth.uid() and active), false) $$;

-- The caller's school, or null if the school is suspended (which locks everyone out)
create or replace function my_school() returns uuid
language sql stable security definer set search_path = public as
$$ select p.school_id from profiles p join schools s on s.id = p.school_id
   where p.id = auth.uid() and p.active and s.status <> 'suspended' $$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role() in ('director','principal','deputy_principal','head_teacher','bursar','teacher') and my_school() is not null, false) $$;

create or replace function is_leader() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role() in ('director','principal','deputy_principal','head_teacher','bursar') and my_school() is not null, false) $$;

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as
$$ select is_super()
       or (my_school() is not null and (
             my_role() = 'director'
          or exists (select 1 from role_permissions rp
                     where rp.school_id = my_school() and rp.role = my_role() and rp.perm = p))) $$;

-- Learners the caller may see as a learner (themselves) or a parent (their children)
create or replace function my_student_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select s.id from students s where s.user_id = auth.uid() and s.school_id = my_school()
   union
   select g.student_id from guardians g where g.parent_id = auth.uid() and g.school_id = my_school() $$;

create or replace function my_class_ids() returns setof uuid
language sql stable security definer set search_path = public as
$$ select distinct s.class_id from students s where s.id in (select my_student_ids()) and s.class_id is not null $$;

-- Does the caller teach this class (any subject, or as class teacher)?
create or replace function teaches_class(c uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from teaching_assignments where teacher_id = auth.uid() and class_id = c)
       or exists (select 1 from classes where id = c and class_teacher = auth.uid()) $$;

create or replace function teaches(c uuid, sub uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from teaching_assignments where teacher_id = auth.uid() and class_id = c and subject_id = sub) $$;

-- May the caller enter a mark for this learner, exam and subject?
create or replace function can_enter_mark(p_exam uuid, p_student uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from exams e join students s on s.id = p_student
     where e.id = p_exam and e.status = 'draft'
       and e.school_id = my_school() and s.school_id = my_school()
       and (teaches(s.class_id, p_subject) or has_perm('results'))) $$;

-- Is this learner allowed to use chat? (school switch AND parent's choice)
create or replace function learner_chat_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select s.allow_chat and sc.learner_chat from students s join schools sc on sc.id = s.school_id
                    where s.user_id = p_user and s.active), false) $$;

-- Who may message whom
create or replace function can_message(target uuid) returns boolean
language sql stable security definer set search_path = public as
$$ with me as (select role, school_id from profiles where id = auth.uid() and active),
        them as (select role, school_id from profiles where id = target and active)
   select coalesce((
     select case
       when me.school_id is distinct from them.school_id or my_school() is null then false
       -- any learner in the conversation must have chat switched on by the school and a parent
       when me.role = 'student' and not learner_chat_ok(auth.uid()) then false
       when them.role = 'student' and not learner_chat_ok(target) then false
       when me.role in ('director','principal','deputy_principal','head_teacher','bursar','teacher') then true
       when me.role = 'parent'  then them.role not in ('student','parent')
       when me.role = 'student' then them.role in ('director','principal','deputy_principal','head_teacher','teacher')
                                  or (them.role = 'student' and exists (
                                       select 1 from students a, students b
                                       where a.user_id = auth.uid() and b.user_id = target and a.class_id = b.class_id))
       else false end
     from me, them), false) $$;

-- =====================================================================
-- Views
-- =====================================================================

-- Names everyone in a school can see (no phone numbers or emails)
create or replace view directory as
  select p.id, p.full_name, p.role, p.school_id, s.class_id as learner_class_id
  from profiles p left join students s on s.user_id = p.id
  where p.active and (p.school_id = my_school() or is_super());

-- Fee balance per learner. security_invoker: the caller's own access rules apply,
-- so parents only ever get their own children's rows.
create or replace view student_balances with (security_invoker = on) as
  select s.id as student_id, s.school_id, s.full_name, s.adm_no, s.class_id,
         coalesce(c.charged, 0) as charged,
         coalesce(c.this_term, 0) as this_term,
         coalesce(p.paid, 0)    as paid,
         coalesce(c.charged, 0) - coalesce(p.paid, 0) as balance
  from students s
  left join (select fc.student_id, sum(fc.amount) as charged,
                    sum(fc.amount) filter (where t.is_current) as this_term
             from fee_charges fc left join terms t on t.id = fc.term_id
             group by fc.student_id) c on c.student_id = s.id
  left join (select student_id, sum(amount) as paid from payments group by student_id) p on p.student_id = s.id
  where s.active;

-- What each school owes ShuleHub
create or replace view school_billing with (security_invoker = on) as
  select sc.id as school_id, sc.name,
         coalesce((select sum(amount) from platform_invoices i where i.school_id = sc.id), 0) as invoiced,
         coalesce((select sum(amount) from platform_payments p where p.school_id = sc.id), 0) as paid,
         coalesce((select sum(amount) from platform_invoices i where i.school_id = sc.id), 0)
       - coalesce((select sum(amount) from platform_payments p where p.school_id = sc.id), 0) as balance
  from schools sc;

-- =====================================================================
-- RPCs (functions the app calls)
-- =====================================================================

-- Default subjects, roles, permissions and term for a new school
create or replace function setup_school_defaults(p_school uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions (school_id, role, perm)
  select p_school, r::app_role, p from (values
    ('principal','dashboard'),('principal','learners'),('principal','staff'),('principal','fees'),('principal','payments'),
    ('principal','results'),('principal','announce'),('principal','calendar'),('principal','settings'),('principal','welfare'),
    ('deputy_principal','dashboard'),('deputy_principal','learners'),('deputy_principal','fees'),('deputy_principal','results'),
    ('deputy_principal','announce'),('deputy_principal','calendar'),('deputy_principal','welfare'),
    ('head_teacher','dashboard'),('head_teacher','learners'),('head_teacher','results'),('head_teacher','announce'),
    ('bursar','dashboard'),('bursar','fees'),('bursar','payments')) v(r, p)
  on conflict do nothing;

  insert into subjects (school_id, name, short, sort) values
    (p_school,'Mathematics','Maths',1),(p_school,'English','Eng',2),(p_school,'Kiswahili','Kisw',3),
    (p_school,'Integrated Science','Sci',4),(p_school,'Social Studies','SST',5),(p_school,'Pre-Technical Studies','Pre-Tech',6),
    (p_school,'Agriculture & Nutrition','Agric',7),(p_school,'Religious Education','RE',8),(p_school,'Creative Arts & Sports','CAS',9)
  on conflict do nothing;
end $$;

-- Bill every active learner for a term from the fee structure (safe to run again)
create or replace function bill_term(p_term uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not has_perm('fees') then raise exception 'You do not have permission to bill fees'; end if;
  insert into fee_charges (school_id, student_id, term_id, description, amount, created_by)
  select s.school_id, s.id, fi.term_id, fi.name, fi.amount, auth.uid()
  from fee_items fi
  join students s on s.school_id = fi.school_id and s.active and (fi.class_id is null or fi.class_id = s.class_id)
  where fi.term_id = p_term and fi.school_id = my_school()
  on conflict (student_id, term_id, description) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Class mean per subject for an exam. Learners/parents only once published.
create or replace function class_subject_means(p_exam uuid, p_class uuid)
returns table (subject_id uuid, mean numeric, entered integer)
language sql stable security definer set search_path = public as $$
  select m.subject_id, round(avg(m.score), 1), count(*)::int
  from marks m join students s on s.id = m.student_id
  join exams e on e.id = m.exam_id
  where m.exam_id = p_exam and s.class_id = p_class and e.school_id = my_school()
    and (is_staff() or (e.status = 'published' and p_class in (select my_class_ids())))
  group by m.subject_id $$;

-- Mean score per class for an exam (school-wide results for parents)
create or replace function school_exam_summary(p_exam uuid)
returns table (class_id uuid, class_name text, mean numeric, learners integer)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, round(avg(m.score), 1), count(distinct m.student_id)::int
  from marks m join students s on s.id = m.student_id join classes c on c.id = s.class_id
  join exams e on e.id = m.exam_id
  where e.id = p_exam and e.school_id = my_school() and (is_staff() or e.status = 'published')
  group by c.id, c.name order by c.name $$;

-- Attendance rate over the last N recorded days for learners the caller may see
create or replace function attendance_rates(p_days integer default 20)
returns table (student_id uuid, present integer, total integer, rate numeric)
language sql stable security definer set search_path = public as $$
  with mine as (
    select s.id from students s where s.school_id = my_school()
      and (is_staff() or s.id in (select my_student_ids())))
  select a.student_id, count(*) filter (where a.status <> 'A')::int, count(*)::int,
         round(100.0 * count(*) filter (where a.status <> 'A') / nullif(count(*), 0), 0)
  from attendance a
  where a.student_id in (select id from mine)
    and a.day >= current_date - p_days
  group by a.student_id $$;

-- Mark the caller's first-login password change as done
create or replace function password_changed() returns void
language sql security definer set search_path = public as
$$ update profiles set must_change_password = false where id = auth.uid() $$;

-- Leaders save their school's own settings (only safe columns)
create or replace function update_school_settings(p_phone text, p_email text, p_paybill text, p_motto text,
                                                  p_learner_chat boolean, p_learner_ai boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('settings') then raise exception 'You do not have permission to change school settings'; end if;
  update schools set phone = p_phone, email = p_email, paybill = p_paybill, motto = p_motto,
                     learner_chat = p_learner_chat, learner_ai = p_learner_ai
  where id = my_school();
end $$;

-- A parent switches optional features on or off for their own child (consent can be withdrawn the same way)
create or replace function set_child_options(p_student uuid, p_chat boolean, p_ai boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from guardians where student_id = p_student and parent_id = auth.uid() and school_id = my_school()) then
    raise exception 'You can only change settings for your own child';
  end if;
  update students set allow_chat = p_chat, allow_ai = p_ai where id = p_student;
end $$;

-- Record that the signed-in person accepted the current terms and privacy notice
create or replace function accept_terms(p_version text) returns void
language sql security definer set search_path = public as
$$ update profiles set terms_version = p_version, terms_accepted_at = now() where id = auth.uid() $$;

-- A director or principal accepts the ShuleHub terms on behalf of the school
create or replace function accept_school_terms(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('director','principal') then raise exception 'Only a director or principal can accept on behalf of the school'; end if;
  update schools set terms_version = p_version, terms_accepted_at = now(), terms_accepted_by = auth.uid() where id = my_school();
end $$;

-- Delete records past their retention period. Schedule daily with pg_cron (see README).
create or replace function purge_expired_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from messages        where created_at < now() - interval '12 months';
  delete from message_reports where resolved and created_at < now() - interval '24 months';
  delete from ai_usage        where created_at < now() - interval '90 days';
  delete from sms_log         where created_at < now() - interval '12 months';
  delete from mpesa_requests  where created_at < now() - interval '12 months';
  delete from meetings        where starts_at  < now() - interval '24 months';
  delete from quiz_attempts   where created_at < now() - interval '24 months';
end $$;

-- Save Daraja (M-Pesa) credentials. Write-only from the browser.
create or replace function save_mpesa_settings(p_env text, p_shortcode text, p_type text, p_passkey text, p_key text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('settings') then raise exception 'You do not have permission to change M-Pesa settings'; end if;
  insert into mpesa_settings (school_id, environment, shortcode, shortcode_type, passkey, consumer_key, consumer_secret, updated_at)
  values (my_school(), p_env, p_shortcode, p_type, p_passkey, p_key, p_secret, now())
  on conflict (school_id) do update set environment = excluded.environment, shortcode = excluded.shortcode,
    shortcode_type = excluded.shortcode_type, passkey = excluded.passkey, consumer_key = excluded.consumer_key,
    consumer_secret = excluded.consumer_secret, updated_at = now();
  update schools set paybill = coalesce(paybill, p_shortcode) where id = my_school();
end $$;

create or replace function mpesa_configured() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from mpesa_settings where school_id = my_school()) $$;

-- A reported chat thread, for the school welfare team only
create or replace function reported_thread(p_report uuid)
returns table (sender uuid, recipient uuid, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.sender, m.recipient, m.body, m.created_at
  from message_reports r join messages m
    on ((m.sender = r.reporter and m.recipient = r.reported_user) or (m.sender = r.reported_user and m.recipient = r.reporter))
  where r.id = p_report and r.school_id = my_school() and has_perm('welfare')
  order by m.created_at $$;

-- Platform owner dashboard numbers
create or replace function platform_stats()
returns table (schools integer, active integer, trial integer, suspended integer, learners integer, invoiced bigint, paid bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from schools)::int,
         (select count(*) from schools where status='active')::int,
         (select count(*) from schools where status='trial')::int,
         (select count(*) from schools where status='suspended')::int,
         (select count(*) from students where active)::int,
         (select coalesce(sum(amount),0) from platform_invoices),
         (select coalesce(sum(amount),0) from platform_payments)
  where is_super() $$;

create or replace function learner_counts()
returns table (school_id uuid, learners integer)
language sql stable security definer set search_path = public as
$$ select school_id, count(*)::int from students where active and is_super() group by school_id $$;

-- Invoice every non-suspended, non-trial school for a term at its plan price
create or replace function bill_schools(p_term_label text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not is_super() then raise exception 'Only the platform owner can bill schools'; end if;
  insert into platform_invoices (school_id, term_label, amount)
  select s.id, p_term_label, pl.price_per_term from schools s join plans pl on pl.id = s.plan_id
  where s.status = 'active'
  on conflict (school_id, term_label) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Record that someone from a school was active (shown to the platform owner)
create or replace function touch_school() returns void
language sql security definer set search_path = public as
$$ update schools set last_active_at = now() where id = my_school() $$;

-- One-time bootstrap: promote an existing auth user to platform owner.
-- Run from the Supabase SQL editor only (execute is revoked from app users below).
create or replace function make_super_admin(p_email text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'No user with email %. Create it first under Authentication > Users.', p_email; end if;
  insert into profiles (id, school_id, role, full_name, email, login_id, must_change_password)
  values (uid, null, 'super_admin', p_name, lower(p_email), lower(p_email), false)
  on conflict (id) do update set role = 'super_admin', school_id = null, full_name = excluded.full_name;
  return 'Done: ' || p_email || ' is now the ShuleHub platform owner.';
end $$;

revoke execute on function make_super_admin(text, text) from public, anon, authenticated;
revoke execute on function setup_school_defaults(uuid) from public, anon, authenticated;
revoke execute on function purge_expired_data() from public, anon, authenticated;

-- Only a parent/guardian can switch chat or Mwalimu AI ON for a learner (anyone with access may switch them off).
create or replace function guard_child_options() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if ((new.allow_chat and not old.allow_chat) or (new.allow_ai and not old.allow_ai))
     and auth.uid() is not null
     and not exists (select 1 from guardians where student_id = new.id and parent_id = auth.uid()) then
    raise exception 'Only a parent or guardian can switch on chat or Mwalimu AI for a learner';
  end if;
  return new;
end $$;
drop trigger if exists students_guard_options on students;
create trigger students_guard_options before update on students
  for each row execute function guard_child_options();
