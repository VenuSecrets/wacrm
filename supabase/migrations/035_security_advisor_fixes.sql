-- Fixes for Supabase security advisor findings (2026-07-20):
--   1. RLS Disabled in Public   -> public.import_clientes_staging
--   2. Security Definer View    -> public.vista_historial
--   3. Security Definer View    -> public.disponibilidad_publica

-- ---------------------------------------------------------------- 1. import_clientes_staging
-- One-off CSV import staging table, not referenced by app code. Only
-- service_role (which bypasses RLS) needs to touch it, so enabling RLS
-- with no policies denies anon/authenticated entirely.
alter table public.import_clientes_staging enable row level security;

-- ---------------------------------------------------------------- 2. vista_historial
-- Full client history (name, phone, notes). No legitimate anon use case,
-- so switch off the SECURITY DEFINER bypass and revoke the anon grant
-- outright; authenticated access is unchanged (ver_* policies already
-- allow any authenticated user to see every row).
alter view public.vista_historial set (security_invoker = on);
revoke all on public.vista_historial from anon;

-- ---------------------------------------------------------------- 3. disponibilidad_publica
-- Deliberately public: src/app/(dashboard)/calendario/ical/route.ts polls
-- it unauthenticated (anon key) for a per-worker busy-slots iCal feed and
-- only ever reads id/inicio/fin/trabajadora. Switching off SECURITY
-- DEFINER means anon now needs its own RLS + column grants scoped to
-- exactly those columns, instead of relying on an implicit RLS bypass
-- that also exposed every other column on the underlying tables.
alter view public.disponibilidad_publica set (security_invoker = on);

revoke all on public.citas from anon;
grant select (id, inicio, fin, trabajadora_id) on public.citas to anon;
create policy ver_citas_publico on public.citas for select to anon using (true);

revoke all on public.trabajadoras from anon;
grant select (id, nombre) on public.trabajadoras to anon;
create policy ver_trabajadoras_publico on public.trabajadoras for select to anon using (true);
