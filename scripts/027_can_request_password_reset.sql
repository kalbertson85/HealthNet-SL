-- Server-side rate limiting helper for password reset requests
create or replace function public.can_request_password_reset(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.password_reset_events
    where email = lower(p_email)
      and created_at > now() - interval '5 minutes'
  );
$$;

comment on function public.can_request_password_reset(p_email text) is 'Returns true if the given email is allowed to request a new password reset (no recent reset within 5 minutes).';
