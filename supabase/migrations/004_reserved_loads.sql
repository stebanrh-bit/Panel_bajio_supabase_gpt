-- APARTADOS PARA REGRESO CARGADO.
-- Ejecutar este archivo completo después de las migraciones 001, 002 y 003.
-- Es una actualización aditiva y repetible: conserva los registros existentes.
begin;

-- 1. El viaje apartado puede pertenecer a otro operador y aún no estar en Cargas.
-- Por eso load y own_load son referencias de texto, sin exigir una carga local.
create table if not exists public.reserved_loads (
  id uuid primary key default gen_random_uuid(),
  load text not null check (length(trim(load)) between 1 and 200),
  csr_owner text not null default '' check (length(csr_owner) <= 500),
  origin text not null default '' check (length(origin) <= 500),
  destination text not null default '' check (length(destination) <= 500),
  crossing_at timestamptz,
  delivery_at timestamptz,
  own_load text not null default '' check (length(own_load) <= 500),
  own_load_at timestamptz,
  review_hours numeric not null default 3 check (review_hours between 0.5 and 48),
  state text not null default 'cruce'
    check (state in ('cruce', 'transito', 'entregado', 'broker', 'usado', 'liberado')),
  next_review_at timestamptz,
  note text not null default '' check (length(note) <= 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check ((state in ('usado', 'liberado') and next_review_at is null)
    or (state not in ('usado', 'liberado') and next_review_at is not null))
);
create index if not exists reserved_loads_owner_idx on public.reserved_loads(created_by, state);
create index if not exists reserved_loads_review_idx on public.reserved_loads(next_review_at);

-- 2. Cada operación de la aplicación guarda el antes/después, su autor y la nota.
-- Liberar o usar cierra el apartado; su expediente e historial permanecen.
create table if not exists public.reserved_load_history (
  id uuid primary key default gen_random_uuid(),
  reserved_id uuid not null references public.reserved_loads(id) on delete restrict,
  event text not null check (event in ('created', 'edited', 'state_changed', 'reviewed')),
  note text not null default '' check (length(note) <= 500),
  actor uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
create index if not exists reserved_history_record_idx on public.reserved_load_history(reserved_id, changed_at);

-- 3. Un CSR consulta los apartados que creó; administración y gerencia ven todos.
-- El navegador solo lee tablas. Las escrituras usan las funciones con permisos de abajo.
alter table public.reserved_loads enable row level security;
alter table public.reserved_load_history enable row level security;
drop policy if exists reserved_loads_read on public.reserved_loads;
create policy reserved_loads_read on public.reserved_loads for select to authenticated
using (public.panel_role() in ('admin', 'manager')
  or (public.panel_role() = 'csr' and created_by = auth.uid()));
drop policy if exists reserved_history_read on public.reserved_load_history;
create policy reserved_history_read on public.reserved_load_history for select to authenticated
using (exists (select 1 from public.reserved_loads where id = reserved_id));
revoke all on public.reserved_loads, public.reserved_load_history from anon, authenticated;
grant select on public.reserved_loads, public.reserved_load_history to authenticated;

-- 4. Calendario original: fecha futura de cruce/entrega; si ya pasó, cada X horas.
-- Los apartados usados o liberados dejan de generar revisión.
create or replace function public.next_reserved_review(
  p_state text, p_crossing timestamptz, p_delivery timestamptz, p_hours numeric, p_now timestamptz
) returns timestamptz language plpgsql immutable set search_path = '' as $$
declare target_date timestamptz;
begin
  if p_state in ('usado', 'liberado') then return null; end if;
  target_date := case when p_state = 'cruce' then p_crossing
    when p_state = 'transito' then p_delivery else null end;
  if target_date > p_now then return target_date; end if;
  return p_now + (p_hours::double precision * interval '1 hour');
end;
$$;

-- Esta función privada reúne autenticación, propiedad, bloqueo y versión.
-- Las operaciones bloquean el mismo registro para evitar que se sobrescriban entre sí.
create or replace function public.lock_reserved_load(p_id uuid, p_version timestamptz)
returns public.reserved_loads language plpgsql security definer set search_path = '' as $$
declare record public.reserved_loads; caller_role text := public.panel_role();
begin
  if auth.uid() is null or coalesce(caller_role, '') not in ('admin', 'csr') then
    raise exception 'No tienes permiso para modificar apartados';
  end if;
  select * into record from public.reserved_loads where id = p_id for update;
  if not found or (caller_role <> 'admin' and record.created_by <> auth.uid()) then
    raise exception 'Apartado no encontrado o sin permiso';
  end if;
  if record.updated_at is distinct from p_version then
    raise exception 'El apartado cambió. Actualiza antes de guardar';
  end if;
  return record;
end;
$$;

-- 5. Alta/edición: solo se aceptan los campos del formulario, nunca autor ni estado.
-- Las fechas entrantes deben incluir zona horaria; PostgreSQL conserva su instante.
create or replace function public.save_reserved_load(
  p_values jsonb, p_id uuid default null, p_version timestamptz default null
) returns public.reserved_loads language plpgsql security definer set search_path = '' as $$
declare
  previous public.reserved_loads;
  saved public.reserved_loads;
  next_values public.reserved_loads;
  field_name text;
  caller_id uuid := auth.uid();
  action_time timestamptz := now();
begin
  if caller_id is null or coalesce(public.panel_role(), '') not in ('admin', 'csr') then
    raise exception 'No tienes permiso para guardar apartados';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Los datos del apartado no son válidos';
  end if;
  if p_id is not null then
    previous := public.lock_reserved_load(p_id, p_version);
    if previous.state in ('usado', 'liberado') then
      raise exception 'Reabre el apartado antes de editarlo';
    end if;
  end if;
  foreach field_name in array array['crossing_at', 'delivery_at', 'own_load_at'] loop
    if nullif(p_values ->> field_name, '') is not null
      and (p_values ->> field_name) !~* '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'La fecha % debe incluir zona horaria', field_name;
    end if;
  end loop;
  next_values.load := trim(coalesce(p_values ->> 'load', ''));
  next_values.csr_owner := trim(coalesce(p_values ->> 'csr_owner', ''));
  next_values.origin := trim(coalesce(p_values ->> 'origin', ''));
  next_values.destination := trim(coalesce(p_values ->> 'destination', ''));
  next_values.own_load := trim(coalesce(p_values ->> 'own_load', ''));
  next_values.note := trim(coalesce(p_values ->> 'note', ''));
  next_values.crossing_at := nullif(p_values ->> 'crossing_at', '')::timestamptz;
  next_values.delivery_at := nullif(p_values ->> 'delivery_at', '')::timestamptz;
  next_values.own_load_at := nullif(p_values ->> 'own_load_at', '')::timestamptz;
  next_values.review_hours := coalesce((p_values ->> 'review_hours')::numeric, 3);
  next_values.state := coalesce(previous.state, 'cruce');
  next_values.next_review_at := public.next_reserved_review(next_values.state,
    next_values.crossing_at, next_values.delivery_at, next_values.review_hours, action_time);

  if p_id is null then
    insert into public.reserved_loads(load, csr_owner, origin, destination, crossing_at, delivery_at,
      own_load, own_load_at, review_hours, state, next_review_at, note, created_by, updated_by)
    values (next_values.load, next_values.csr_owner, next_values.origin, next_values.destination,
      next_values.crossing_at, next_values.delivery_at, next_values.own_load, next_values.own_load_at,
      next_values.review_hours, next_values.state, next_values.next_review_at, next_values.note, caller_id, caller_id)
    returning * into saved;
  else
    update public.reserved_loads set load = next_values.load, csr_owner = next_values.csr_owner,
      origin = next_values.origin, destination = next_values.destination, crossing_at = next_values.crossing_at,
      delivery_at = next_values.delivery_at, own_load = next_values.own_load, own_load_at = next_values.own_load_at,
      review_hours = next_values.review_hours, next_review_at = next_values.next_review_at, note = next_values.note,
      updated_at = action_time, updated_by = caller_id
    where id = p_id returning * into saved;
  end if;
  insert into public.reserved_load_history(reserved_id, event, actor, before_data, after_data)
  values (saved.id, case when p_id is null then 'created' else 'edited' end, caller_id,
    case when p_id is null then null else to_jsonb(previous) end, to_jsonb(saved));
  return saved;
end;
$$;

-- 6. Cambio de etapa con nota opcional; los pasos coinciden con los botones de la pantalla.
create or replace function public.change_reserved_load_state(
  p_id uuid, p_version timestamptz, p_state text, p_note text default ''
) returns public.reserved_loads language plpgsql security definer set search_path = '' as $$
declare previous public.reserved_loads; saved public.reserved_loads; allowed text[];
begin
  previous := public.lock_reserved_load(p_id, p_version);
  allowed := case previous.state
    when 'cruce' then array['transito', 'broker', 'liberado']
    when 'transito' then array['cruce', 'entregado', 'broker', 'liberado']
    when 'entregado' then array['transito', 'usado', 'broker', 'liberado']
    when 'broker' then array['entregado', 'usado', 'liberado']
    else array['cruce'] end;
  if p_state is null or not (p_state = any(allowed)) then
    raise exception 'Ese cambio de etapa no está permitido';
  end if;
  update public.reserved_loads set state = p_state,
    next_review_at = public.next_reserved_review(p_state, crossing_at, delivery_at, review_hours, now()),
    updated_at = now(), updated_by = auth.uid()
  where id = p_id returning * into saved;
  insert into public.reserved_load_history(reserved_id, event, note, actor, before_data, after_data)
  values (p_id, 'state_changed', trim(coalesce(p_note, '')), auth.uid(), to_jsonb(previous), to_jsonb(saved));
  return saved;
end;
$$;

-- 7. Ya revisé mantiene el estado y programa otra revisión según la regla original.
create or replace function public.review_reserved_load(p_id uuid, p_version timestamptz, p_note text default '')
returns public.reserved_loads language plpgsql security definer set search_path = '' as $$
declare previous public.reserved_loads; saved public.reserved_loads;
begin
  previous := public.lock_reserved_load(p_id, p_version);
  if previous.state in ('usado', 'liberado') then raise exception 'El apartado ya está cerrado'; end if;
  update public.reserved_loads
  set next_review_at = public.next_reserved_review(state, crossing_at, delivery_at, review_hours, now()),
    updated_at = now(), updated_by = auth.uid()
  where id = p_id returning * into saved;
  insert into public.reserved_load_history(reserved_id, event, note, actor, before_data, after_data)
  values (p_id, 'reviewed', trim(coalesce(p_note, '')), auth.uid(), to_jsonb(previous), to_jsonb(saved));
  return saved;
end;
$$;

-- Se retiran también los permisos por defecto de Supabase antes de dar acceso.
-- Las funciones privadas solo las usan las operaciones anteriores.
revoke execute on function public.next_reserved_review(text, timestamptz, timestamptz, numeric, timestamptz),
  public.lock_reserved_load(uuid, timestamptz), public.save_reserved_load(jsonb, uuid, timestamptz),
  public.change_reserved_load_state(uuid, timestamptz, text, text), public.review_reserved_load(uuid, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.save_reserved_load(jsonb, uuid, timestamptz),
  public.change_reserved_load_state(uuid, timestamptz, text, text), public.review_reserved_load(uuid, timestamptz, text)
to authenticated;
commit;
