-- MÓDULO: solicitudes que todavía no tienen número de carga.
-- Requisitos: 001_panel.sql y 002_load_operations.sql ya aplicados.
-- La migración es aditiva y repetible. No borra cargas ni registros anteriores.
begin;

-- 1. Solicitud original, responsable y resultado de su seguimiento.
-- Las cancelaciones se conservan para mantener el historial.
create table if not exists public.pending_loads (
  id uuid primary key default gen_random_uuid(),
  customer text not null check (length(trim(customer)) between 1 and 200),
  origin text not null default '' check (length(origin) <= 250),
  destination text not null default '' check (length(destination) <= 250),
  estimated_date date,
  note text not null default '' check (length(note) <= 9500),
  state text not null default 'pending' check (state in ('pending', 'linked', 'cancelled')),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  linked_load text references public.loads(load) on delete restrict,
  linked_by uuid references public.profiles(id),
  linked_at timestamptz,
  check (
    (state = 'linked' and linked_load is not null and linked_by is not null and linked_at is not null)
    or (state <> 'linked' and linked_load is null and linked_by is null and linked_at is null)
  )
);
create index if not exists pending_loads_owner_idx on public.pending_loads(created_by, state, created_at);

-- 2. Comentarios previos a la confirmación de una carga.
-- Al vincular se copian a comments, conservando el autor y la fecha originales.
create table if not exists public.pending_load_comments (
  id uuid primary key default gen_random_uuid(),
  pending_id uuid not null references public.pending_loads(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 10000),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists pending_comments_record_idx on public.pending_load_comments(pending_id, created_at);

-- 3. Historial automático de altas, modificaciones, vínculos y cancelaciones.
create table if not exists public.pending_load_history (
  id uuid primary key default gen_random_uuid(),
  pending_id uuid not null references public.pending_loads(id) on delete restrict,
  actor uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
create index if not exists pending_history_record_idx on public.pending_load_history(pending_id, changed_at);

-- Actualizar una solicitud no debe cambiar quién la creó ni cuándo.
create or replace function public.stamp_pending_load()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if TG_OP = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_pending_load on public.pending_loads;
create trigger stamp_pending_load before insert or update on public.pending_loads
for each row execute function public.stamp_pending_load();

-- Solo este activador escribe el historial; el navegador tiene acceso de lectura.
create or replace function public.audit_pending_load()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pending_load_history(pending_id, actor, before_data, after_data)
  values (
    new.id, auth.uid(),
    case when TG_OP = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;
drop trigger if exists audit_pending_load on public.pending_loads;
create trigger audit_pending_load after insert or update on public.pending_loads
for each row execute function public.audit_pending_load();

-- 4. Permisos: cada CSR consulta y modifica sus solicitudes.
-- Administración consulta/modifica todas; gerencia consulta todas sin escribir.
alter table public.pending_loads enable row level security;
alter table public.pending_load_comments enable row level security;
alter table public.pending_load_history enable row level security;

drop policy if exists pending_loads_read on public.pending_loads;
create policy pending_loads_read on public.pending_loads for select to authenticated
using (
  public.panel_role() in ('admin', 'manager')
  or (public.panel_role() = 'csr' and created_by = auth.uid())
);
drop policy if exists pending_loads_create on public.pending_loads;
create policy pending_loads_create on public.pending_loads for insert to authenticated
with check (
  public.panel_role() in ('admin', 'csr') and created_by = auth.uid()
  and state = 'pending' and linked_load is null
);
drop policy if exists pending_loads_edit on public.pending_loads;
create policy pending_loads_edit on public.pending_loads for update to authenticated
using (
  state = 'pending'
  and (public.panel_role() = 'admin' or (public.panel_role() = 'csr' and created_by = auth.uid()))
)
with check (
  state = 'pending'
  and (public.panel_role() = 'admin' or (public.panel_role() = 'csr' and created_by = auth.uid()))
);

drop policy if exists pending_comments_read on public.pending_load_comments;
create policy pending_comments_read on public.pending_load_comments for select to authenticated
using (exists (select 1 from public.pending_loads where id = pending_id));
drop policy if exists pending_comments_create on public.pending_load_comments;
create policy pending_comments_create on public.pending_load_comments for insert to authenticated
with check (
  created_by = auth.uid() and public.panel_role() in ('admin', 'csr')
  and exists (
    select 1 from public.pending_loads
    where id = pending_id and state = 'pending'
      and (created_by = auth.uid() or public.panel_role() = 'admin')
  )
);
drop policy if exists pending_history_read on public.pending_load_history;
create policy pending_history_read on public.pending_load_history for select to authenticated
using (exists (select 1 from public.pending_loads where id = pending_id));

-- Actualizaciones directas solo para los campos de la solicitud.
-- El estado y el vínculo cambian exclusivamente mediante las funciones de abajo.
revoke all on public.pending_loads, public.pending_load_comments, public.pending_load_history from anon, authenticated;
grant select, insert on public.pending_loads to authenticated;
grant update (customer, origin, destination, estimated_date, note) on public.pending_loads to authenticated;
grant select, insert on public.pending_load_comments to authenticated;
grant select on public.pending_load_history to authenticated;

-- Los comentarios y la vinculación bloquean la misma solicitud.
-- Así, un comentario que llega al mismo tiempo se incluye en la transferencia
-- o se rechaza por solicitud cerrada, en vez de quedar fuera de la carga.
create or replace function public.guard_pending_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  request_record public.pending_loads;
  caller_id uuid := auth.uid();
  caller_role text := public.panel_role();
begin
  if caller_id is null or coalesce(caller_role, '') not in ('admin', 'csr') then
    raise exception 'No tienes permiso para comentar solicitudes';
  end if;
  select * into request_record from public.pending_loads where id = new.pending_id for update;
  if not found or (caller_role <> 'admin' and request_record.created_by <> caller_id) then
    raise exception 'Solicitud no encontrada o sin permiso';
  end if;
  if request_record.state <> 'pending' then
    raise exception 'Esta solicitud ya está cerrada';
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists guard_pending_comment on public.pending_load_comments;
create trigger guard_pending_comment before insert on public.pending_load_comments
for each row execute function public.guard_pending_comment();

-- 5. Cancelar conserva el registro y verifica su versión para evitar cambios simultáneos.
create or replace function public.cancel_pending_load(p_id uuid, p_version timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_record public.pending_loads;
  caller_id uuid := auth.uid();
  caller_role text := public.panel_role();
begin
  if caller_id is null or coalesce(caller_role, '') not in ('admin', 'csr') then
    raise exception 'No tienes permiso para cancelar solicitudes';
  end if;
  select * into request_record from public.pending_loads where id = p_id for update;
  if not found or (caller_role <> 'admin' and request_record.created_by <> caller_id) then
    raise exception 'Solicitud no encontrada o sin permiso';
  end if;
  if request_record.state <> 'pending' or request_record.updated_at is distinct from p_version then
    raise exception 'La solicitud cambió. Actualiza antes de cancelarla';
  end if;
  update public.pending_loads set state = 'cancelled' where id = p_id;
end;
$$;

-- 6. Vincular es una transacción: conserva nota/comentarios y cierra la solicitud.
-- Si cualquier paso falla, PostgreSQL revierte todos los cambios de esta función.
create or replace function public.link_pending_load(p_id uuid, p_load text, p_version timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_record public.pending_loads;
  load_record public.loads;
  caller_id uuid := auth.uid();
  caller_role text := public.panel_role();
  request_customer text;
  load_customer text;
begin
  if caller_id is null or coalesce(caller_role, '') not in ('admin', 'csr') then
    raise exception 'No tienes permiso para vincular solicitudes';
  end if;
  select * into request_record from public.pending_loads where id = p_id for update;
  if not found or (caller_role <> 'admin' and request_record.created_by <> caller_id) then
    raise exception 'Solicitud no encontrada o sin permiso';
  end if;
  if request_record.state <> 'pending' or request_record.updated_at is distinct from p_version then
    raise exception 'La solicitud cambió. Actualiza antes de vincularla';
  end if;
  select * into load_record from public.loads where load = trim(p_load) and not archived for update;
  if not found then
    raise exception 'Selecciona una carga activa que ya exista';
  end if;
  request_customer := lower(regexp_replace(trim(request_record.customer), '\s+', ' ', 'g'));
  load_customer := lower(regexp_replace(trim(load_record.customer), '\s+', ' ', 'g'));
  if request_customer <> load_customer then
    raise exception 'La carga y la solicitud deben pertenecer al mismo cliente';
  end if;

  if trim(request_record.note) <> '' then
    insert into public.comments(load, body, created_by, created_at)
    values (load_record.load, 'Nota del pendiente: ' || request_record.note, request_record.created_by, request_record.created_at);
  end if;
  insert into public.comments(load, body, created_by, created_at)
  select load_record.load, body, created_by, created_at
  from public.pending_load_comments where pending_id = p_id;
  insert into public.comments(load, body, created_by)
  values (load_record.load, 'Vinculado desde una solicitud pendiente de ' || request_record.customer || '.', caller_id);

  update public.pending_loads
  set state = 'linked', linked_load = load_record.load, linked_by = caller_id, linked_at = now()
  where id = p_id;
end;
$$;

-- Supabase puede conceder permisos por defecto: se retiran expresamente antes de dar acceso.
revoke execute on function public.stamp_pending_load(), public.audit_pending_load(), public.guard_pending_comment(),
  public.cancel_pending_load(uuid, timestamptz), public.link_pending_load(uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.cancel_pending_load(uuid, timestamptz), public.link_pending_load(uuid, text, timestamptz)
to authenticated;
commit;
