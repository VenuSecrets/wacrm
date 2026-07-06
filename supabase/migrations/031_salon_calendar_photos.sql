-- =====================================================================
-- Salon (Calendario + Fotos Antes/Después) schema
-- =====================================================================
-- Brings the standalone salon apps (the scheduling calendar and the
-- before/after treatment photos) into the WACRM Supabase project so the
-- CRM, the calendar and the photos all live in a single database.
--
-- Mirrors the original "One Trier" project schema, RLS and storage
-- exactly. Fully additive: no existing WACRM object is touched. The
-- trigger helper is namespaced (`salon_set_updated_at`) to avoid
-- clashing with any WACRM function.
-- =====================================================================

create or replace function public.salon_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- servicios
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  duracion_minutos integer not null default 30,
  color text default '#7C3AED',
  precio numeric,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  categoria text
);

-- ---------------------------------------------------------------- clientes
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  nota_personal text,
  created_at timestamptz not null default now(),
  email text,
  constraint formato_email_valido check (email ~* '^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- ---------------------------------------------------------------- trabajadoras
create table if not exists public.trabajadoras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  hora_inicio time not null default '10:00:00',
  hora_fin time not null default '20:00:00',
  descanso_inicio time,
  descanso_fin time,
  color text default '#7C3AED',
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- citas
create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete restrict,
  servicio_id uuid references public.servicios(id) on delete restrict,
  inicio timestamptz not null,
  fin timestamptz not null,
  notas text,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trabajadora_id uuid references public.trabajadoras(id) on delete set null,
  recordatorios_enviados text[] not null default '{}',
  motivo_cancelacion text,
  cancelada_en timestamptz,
  cancelada_por text,
  constraint estado_valido check (estado = any (array['pendiente','asistio','cancelado'])),
  constraint horario_valido check (fin > inicio)
);

drop trigger if exists trg_citas_updated_at on public.citas;
create trigger trg_citas_updated_at before update on public.citas
  for each row execute function public.salon_set_updated_at();

-- ---------------------------------------------------------------- bloqueos
create table if not exists public.bloqueos (
  id uuid primary key default gen_random_uuid(),
  trabajadora_id uuid references public.trabajadoras(id) on delete cascade,
  inicio timestamptz not null,
  fin timestamptz not null,
  tipo text not null default 'falta',
  motivo text,
  created_at timestamptz not null default now(),
  constraint bloqueos_tipo_check check (tipo = any (array['falta','ausencia']))
);

-- ---------------------------------------------------------------- fotos_tratamiento
create table if not exists public.fotos_tratamiento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null,
  storage_path text not null,
  nombre_archivo text,
  sesion_id uuid,
  nota text,
  subida_por uuid default auth.uid(),
  sincronizado_ghl boolean not null default false,
  created_at timestamptz not null default now(),
  constraint tipo_valido check (tipo = any (array['antes','despues']))
);

-- ---------------------------------------------------------------- indexes
create index if not exists bloqueos_inicio_idx on public.bloqueos using btree (inicio);
create index if not exists idx_citas_inicio on public.citas using btree (inicio);
create index if not exists idx_citas_cliente on public.citas using btree (cliente_id);
create index if not exists idx_citas_servicio on public.citas using btree (servicio_id);
create index if not exists idx_citas_trabajadora on public.citas using btree (trabajadora_id);
create index if not exists idx_citas_estado on public.citas using btree (estado, inicio);
create index if not exists idx_fotos_cliente on public.fotos_tratamiento using btree (cliente_id);
create index if not exists idx_fotos_sesion on public.fotos_tratamiento using btree (sesion_id);
create index if not exists idx_fotos_ghl on public.fotos_tratamiento using btree (sincronizado_ghl);

-- ---------------------------------------------------------------- views
create or replace view public.vista_historial as
 select (c.inicio)::date as fecha,
    to_char(c.inicio, 'HH24:MI'::text) as hora_inicio,
    to_char(c.fin, 'HH24:MI'::text) as hora_fin,
    t.nombre as trabajadora,
    cl.nombre as cliente,
    cl.telefono,
    s.nombre as servicio,
    s.precio,
    c.estado,
    c.notas,
    c.id as cita_id
   from citas c
     left join trabajadoras t on t.id = c.trabajadora_id
     left join clientes cl on cl.id = c.cliente_id
     left join servicios s on s.id = c.servicio_id
  order by c.inicio desc;

create or replace view public.disponibilidad_publica as
 select c.id, t.nombre as trabajadora, c.inicio, c.fin
   from citas c
     join trabajadoras t on t.id = c.trabajadora_id;

-- ---------------------------------------------------------------- RLS
alter table public.servicios enable row level security;
alter table public.clientes enable row level security;
alter table public.trabajadoras enable row level security;
alter table public.citas enable row level security;
alter table public.bloqueos enable row level security;
alter table public.fotos_tratamiento enable row level security;

-- servicios
create policy ver_servicios on public.servicios for select to authenticated using (true);
create policy editar_servicios on public.servicios for all to authenticated
  using (auth.email() = 'info@venusecretsbcn.es') with check (auth.email() = 'info@venusecretsbcn.es');
-- clientes
create policy ver_clientes on public.clientes for select to authenticated using (true);
create policy editar_clientes on public.clientes for all to authenticated
  using (auth.email() = 'info@venusecretsbcn.es') with check (auth.email() = 'info@venusecretsbcn.es');
-- trabajadoras
create policy ver_trabajadoras on public.trabajadoras for select to authenticated using (true);
create policy editar_trabajadoras on public.trabajadoras for all to authenticated
  using (auth.email() = 'info@venusecretsbcn.es') with check (auth.email() = 'info@venusecretsbcn.es');
-- citas
create policy ver_citas on public.citas for select to authenticated using (true);
create policy editar_citas on public.citas for all to authenticated
  using (auth.email() = 'info@venusecretsbcn.es') with check (auth.email() = 'info@venusecretsbcn.es');
-- bloqueos (public role, fully open — mirrors original)
create policy bloqueos_select on public.bloqueos for select using (true);
create policy bloqueos_insert on public.bloqueos for insert with check (true);
create policy bloqueos_update on public.bloqueos for update using (true) with check (true);
create policy bloqueos_delete on public.bloqueos for delete using (true);
-- fotos_tratamiento (any authenticated)
create policy fotos_lectura on public.fotos_tratamiento for select using (auth.role() = 'authenticated');
create policy fotos_escritura on public.fotos_tratamiento for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------- storage bucket
insert into storage.buckets (id, name, public)
values ('fotos-tratamiento', 'fotos-tratamiento', false)
on conflict (id) do nothing;

create policy fotos_bucket_select on storage.objects for select
  using (bucket_id = 'fotos-tratamiento' and auth.role() = 'authenticated');
create policy fotos_bucket_insert on storage.objects for insert
  with check (bucket_id = 'fotos-tratamiento' and auth.role() = 'authenticated');
create policy fotos_bucket_update on storage.objects for update
  using (bucket_id = 'fotos-tratamiento' and auth.role() = 'authenticated');
create policy fotos_bucket_delete on storage.objects for delete
  using (bucket_id = 'fotos-tratamiento' and auth.role() = 'authenticated');
