-- ============================================================
-- 033_member_section_permissions.sql
--
-- Per-member interface permissions: which parts of the app a
-- teammate can open (Calendar, Photos, Contacts, Inbox, Dashboard,
-- …). Complements the existing role system — roles decide what you
-- can DO (read/write), this decides which SECTIONS you can SEE.
--
--   profiles.allowed_sections text[]:
--     NULL  -> no restriction: access to every section (default,
--              so existing members are unaffected).
--     array -> allowlist of section keys the member may open.
--
-- Owners and admins always have full access regardless of this
-- column (enforced in the app layer); it's meant for agents/viewers.
-- ============================================================

alter table public.profiles
  add column if not exists allowed_sections text[];

-- ============================================================
-- set_member_sections(p_user_id, p_sections)
--
-- Admin+ sets another member's allowed sections within the caller's
-- account. Pass NULL to clear the restriction (full access). Mirrors
-- set_member_role's authorization exactly. Cannot target self or the
-- owner. SECURITY DEFINER to bypass the "own row only" RLS on
-- profiles, but self-checks the caller's authority first.
-- ============================================================
create or replace function public.set_member_sections(
  p_user_id uuid,
  p_sections text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_account_id uuid;
  v_caller_role account_role_enum;
  v_target_account_id uuid;
  v_target_role account_role_enum;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select account_id, account_role
    into v_caller_account_id, v_caller_role
    from profiles where user_id = auth.uid();

  if v_caller_account_id is null then
    raise exception 'Caller has no account' using errcode = '42501';
  end if;

  if v_caller_role not in ('owner', 'admin') then
    raise exception 'This action requires the admin role or higher'
      using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Cannot change your own permissions'
      using errcode = '22023';
  end if;

  select account_id, account_role
    into v_target_account_id, v_target_role
    from profiles where user_id = p_user_id;

  if v_target_account_id is null then
    raise exception 'Target user not found' using errcode = '22023';
  end if;

  if v_target_account_id <> v_caller_account_id then
    raise exception 'Target user is not a member of your account'
      using errcode = '42501';
  end if;

  if v_target_role = 'owner' then
    raise exception 'The owner always has full access'
      using errcode = '22023';
  end if;

  update profiles
    set allowed_sections = p_sections
    where user_id = p_user_id;
end;
$$;

alter function public.set_member_sections(uuid, text[]) owner to postgres;
revoke all on function public.set_member_sections(uuid, text[]) from public;
grant execute on function public.set_member_sections(uuid, text[]) to authenticated;
