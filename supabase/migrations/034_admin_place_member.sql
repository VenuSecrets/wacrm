-- ============================================================
-- 034_admin_place_member.sql
--
-- Backs the "add a teammate by email" flow (POST /api/account/
-- members/create). The API creates the auth user with the Supabase
-- service role and a generated password; the signup trigger
-- (handle_new_user, migration 017) gives that user a fresh personal
-- account as 'owner'. This RPC then MOVES them into the inviter's
-- account with the chosen role and deletes the now-orphan personal
-- account.
--
-- Authorization: this function does NOT check the caller — it is
-- SECURITY DEFINER and GRANTed to `service_role` ONLY. The API route
-- is the authorization boundary: it runs `requireRole('admin')` with
-- the caller's own session and derives `p_target_account_id` from the
-- caller's profile, so the account id can't be spoofed. `service_role`
-- is never exposed to browsers.
-- ============================================================

create or replace function public.admin_place_member(
  p_user_id uuid,
  p_target_account_id uuid,
  p_role account_role_enum
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_account uuid;
begin
  if p_role = 'owner' then
    raise exception 'Cannot assign the owner role' using errcode = '22023';
  end if;

  select account_id into v_old_account
  from profiles where user_id = p_user_id;

  if v_old_account is null then
    raise exception 'Target profile not found' using errcode = '22023';
  end if;

  -- Move the profile into the target account with the given role.
  update profiles
    set account_id = p_target_account_id,
        account_role = p_role
    where user_id = p_user_id;

  -- Clean up the freshly-created personal account the signup trigger
  -- made, but only if nothing else now lives in it (defensive — a
  -- brand-new account is always empty). The profiles FK is ON DELETE
  -- CASCADE, but the profile was just moved out, so this deletes an
  -- empty row and cascades to nothing.
  if v_old_account is distinct from p_target_account_id then
    delete from accounts a
    where a.id = v_old_account
      and not exists (
        select 1 from profiles p where p.account_id = a.id
      );
  end if;
end;
$$;

alter function public.admin_place_member(uuid, uuid, account_role_enum) owner to postgres;
revoke all on function public.admin_place_member(uuid, uuid, account_role_enum) from public;
grant execute on function public.admin_place_member(uuid, uuid, account_role_enum) to service_role;
