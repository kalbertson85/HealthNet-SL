-- Audit log for appointment lifecycle events (create, status changes, cancellation)
create table if not exists public.appointment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  doctor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);

comment on table public.appointment_audit_logs is 'Audit log for appointment lifecycle events (created, status changes, cancellation).';
comment on column public.appointment_audit_logs.actor_user_id is 'User who performed the appointment action.';
comment on column public.appointment_audit_logs.action is 'Action type, e.g. created, status_updated, cancelled.';
