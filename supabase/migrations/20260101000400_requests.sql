-- =============================================================================
-- 0400 — Requests and approvals.
--
-- All five request types share the same status vocabulary and the same
-- approval_actions history table, so the Approval Centre is one screen over one
-- union view rather than five near-duplicate implementations.
--
-- The two financial request types (leave encashment, cash advance) are held in
-- their own tables specifically so RLS can guard them with `finance.view` /
-- `finance.approve` instead of the general `requests.view_all`. A Roster Manager
-- who reviews shift swaps does not thereby gain sight of anyone's salary advance.
-- =============================================================================

create table if not exists public.leave_types (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  description           text,
  is_paid               boolean not null default true,
  -- counts against an annual entitlement, and so is encashable
  affects_entitlement   boolean not null default true,
  requires_attachment   boolean not null default false,
  colour                text,
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

alter table public.roster_assignments
  drop constraint if exists roster_assignments_leave_type_fk;
alter table public.roster_assignments
  add constraint roster_assignments_leave_type_fk
  foreign key (leave_type_id) references public.leave_types(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Leave
-- -----------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  leave_type_id     uuid not null references public.leave_types(id) on delete restrict,
  from_date         date not null,
  to_date           date not null,
  total_days        numeric(5,2) not null check (total_days > 0),
  reason            text,
  attachment_url    text,
  employee_comment  text,
  manager_comment   text,
  admin_comment     text,
  status            app.request_status not null default 'DRAFT',
  -- recorded at submission: was this inside the configured advance-notice
  -- window? Kept as data so the policy can change later without rewriting history.
  notice_days       integer,
  short_notice      boolean not null default false,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  decided_at        timestamptz,
  decided_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint leave_requests_dates_ordered check (to_date >= from_date)
);
create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id, from_date desc);
create index if not exists leave_requests_status_idx on public.leave_requests (status);
create index if not exists leave_requests_range_idx on public.leave_requests (from_date, to_date);

alter table public.roster_assignments
  drop constraint if exists roster_assignments_leave_request_fk;
alter table public.roster_assignments
  add constraint roster_assignments_leave_request_fk
  foreign key (leave_request_id) references public.leave_requests(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Shift change
-- -----------------------------------------------------------------------------
create table if not exists public.shift_change_requests (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  employee_id           uuid not null references public.employees(id) on delete cascade,
  work_date             date not null,
  current_assignment_id uuid references public.roster_assignments(id) on delete set null,
  -- snapshot of what the roster said when the request was raised
  current_summary       text,
  requested_shift_id    uuid references public.shift_templates(id) on delete set null,
  requested_status      app.assignment_status not null default 'WORK',
  requested_start       time,
  requested_end         time,
  requested_crosses     boolean not null default false,
  reason                text,
  employee_comment      text,
  manager_comment       text,
  admin_comment         text,
  status                app.request_status not null default 'DRAFT',
  submitted_at          timestamptz,
  reviewed_at           timestamptz,
  reviewed_by           uuid references public.profiles(id) on delete set null,
  decided_at            timestamptz,
  decided_by            uuid references public.profiles(id) on delete set null,
  applied_at            timestamptz,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
create index if not exists shift_change_employee_idx on public.shift_change_requests (employee_id, work_date desc);
create index if not exists shift_change_status_idx on public.shift_change_requests (status);

-- -----------------------------------------------------------------------------
-- Shift swap — two-stage: the colleague accepts first, then management decides.
-- -----------------------------------------------------------------------------
create table if not exists public.shift_swap_requests (
  id                        uuid primary key default gen_random_uuid(),
  reference                 text not null unique,
  requester_employee_id     uuid not null references public.employees(id) on delete cascade,
  requester_assignment_id   uuid references public.roster_assignments(id) on delete set null,
  requester_date            date not null,
  requester_summary         text,
  counterparty_employee_id  uuid not null references public.employees(id) on delete cascade,
  counterparty_assignment_id uuid references public.roster_assignments(id) on delete set null,
  counterparty_date         date not null,
  counterparty_summary      text,
  reason                    text,
  counterparty_response     text not null default 'PENDING'
                            check (counterparty_response in ('PENDING', 'ACCEPTED', 'DECLINED')),
  counterparty_responded_at timestamptz,
  counterparty_comment      text,
  manager_comment           text,
  admin_comment             text,
  status                    app.request_status not null default 'DRAFT',
  submitted_at              timestamptz,
  reviewed_at               timestamptz,
  reviewed_by               uuid references public.profiles(id) on delete set null,
  decided_at                timestamptz,
  decided_by                uuid references public.profiles(id) on delete set null,
  applied_at                timestamptz,
  created_at                timestamptz not null default now(),
  created_by                uuid,
  updated_at                timestamptz not null default now(),
  updated_by                uuid,
  constraint shift_swap_not_self check (requester_employee_id <> counterparty_employee_id)
);
create index if not exists shift_swap_requester_idx on public.shift_swap_requests (requester_employee_id);
create index if not exists shift_swap_counterparty_idx on public.shift_swap_requests (counterparty_employee_id);
create index if not exists shift_swap_status_idx on public.shift_swap_requests (status);

-- -----------------------------------------------------------------------------
-- FINANCIAL — leave encashment / cash alternative
-- Nothing here promises payment. The application always displays:
-- "Subject to company policy, eligibility verification and final management
--  approval." Eligibility and maximums are settings, not code.
-- -----------------------------------------------------------------------------
create table if not exists public.leave_encashment_requests (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  employee_id           uuid not null references public.employees(id) on delete cascade,
  leave_year            integer not null,
  requested_days        numeric(5,2) not null check (requested_days > 0),
  approved_days         numeric(5,2) check (approved_days >= 0),
  reason                text,
  requested_date        date,
  employee_comment      text,
  manager_comment       text,
  admin_comment         text,
  -- the acknowledgement text shown and accepted at submission time, stored so
  -- the record shows exactly what the employee agreed to
  policy_acknowledged   boolean not null default false,
  policy_text           text,
  status                app.request_status not null default 'DRAFT',
  submitted_at          timestamptz,
  reviewed_at           timestamptz,
  reviewed_by           uuid references public.profiles(id) on delete set null,
  decided_at            timestamptz,
  decided_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
create index if not exists encashment_employee_idx on public.leave_encashment_requests (employee_id);
create index if not exists encashment_status_idx on public.leave_encashment_requests (status);

-- -----------------------------------------------------------------------------
-- FINANCIAL — cash / salary advance
-- -----------------------------------------------------------------------------
create table if not exists public.cash_advance_requests (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  employee_id             uuid not null references public.employees(id) on delete cascade,
  amount                  numeric(12,2) not null check (amount > 0),
  currency                text not null default 'AED',
  approved_amount         numeric(12,2) check (approved_amount >= 0),
  request_date            date not null default current_date,
  requested_payment_date  date,
  reason                  text,
  repayment_arrangement   text,
  attachment_url          text,
  employee_comment        text,
  manager_comment         text,
  admin_comment           text,
  employee_acknowledged   boolean not null default false,
  acknowledgement_text    text,
  status                  app.request_status not null default 'DRAFT',
  submitted_at            timestamptz,
  reviewed_at             timestamptz,
  reviewed_by             uuid references public.profiles(id) on delete set null,
  decided_at              timestamptz,
  decided_by              uuid references public.profiles(id) on delete set null,
  paid_at                 timestamptz,
  paid_by                 uuid references public.profiles(id) on delete set null,
  closed_at               timestamptz,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid
);
create index if not exists cash_advance_employee_idx on public.cash_advance_requests (employee_id);
create index if not exists cash_advance_status_idx on public.cash_advance_requests (status);

-- -----------------------------------------------------------------------------
-- approval_actions — one row per decision, for every request type.
-- -----------------------------------------------------------------------------
create table if not exists public.approval_actions (
  id            uuid primary key default gen_random_uuid(),
  request_type  text not null check (request_type in
                  ('LEAVE', 'SHIFT_CHANGE', 'SHIFT_SWAP', 'LEAVE_ENCASHMENT', 'CASH_ADVANCE')),
  request_id    uuid not null,
  employee_id   uuid references public.employees(id) on delete set null,
  action        text not null check (action in
                  ('SUBMIT', 'REVIEW', 'RECOMMEND', 'APPROVE', 'REJECT', 'RETURN',
                   'CANCEL', 'ACCEPT', 'DECLINE', 'PAY', 'CLOSE')),
  from_status   app.request_status,
  to_status     app.request_status,
  comment       text,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text,
  actor_role    text,
  created_at    timestamptz not null default now()
);
create index if not exists approval_actions_request_idx on public.approval_actions (request_type, request_id, created_at);
create index if not exists approval_actions_actor_idx on public.approval_actions (actor_id);
