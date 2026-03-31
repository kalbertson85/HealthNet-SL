-- Audit log for admin changes to staff roles and account status
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  old_role text,
  new_role text,
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is 'Audit log for admin actions on staff accounts (role and status changes).';
comment on column public.admin_audit_logs.actor_user_id is 'Admin user who performed the action.';
comment on column public.admin_audit_logs.target_user_id is 'Staff account that was modified.';
comment on column public.admin_audit_logs.action is 'Type of action, e.g. role_change or status_change.';
