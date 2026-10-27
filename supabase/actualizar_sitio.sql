-- PANEL BAJÍO: ACTUALIZACIÓN CONJUNTA 004–021.
-- Copiar TODO a SQL Editor > New query > Run. Requiere 001, 002 y 003.
-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.
begin;


-- Archivo: 004_reserved_loads.sql
-- APARTADOS PARA REGRESO CARGADO.
-- Ejecutar este archivo completo después de las migraciones 001, 002 y 003.
-- Es una actualización aditiva y repetible: conserva los registros existentes.

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


-- Archivo: 005_team_and_shifts.sql
-- EQUIPO, CLIENTES, SEGUIMIENTO, TURNOS, PLANTILLAS Y PORTAL.
-- Ejecutar completo después de 004. Los cambios son aditivos y repetibles.

-- 1. El cliente usa Supabase Auth, pero nunca recibe los datos internos del panel.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('pending', 'admin', 'csr', 'manager', 'client'));
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists contact_email text not null default '';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
create or replace function public.panel_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and active
$$;

-- Las comparaciones de cliente ignoran mayúsculas y espacios adicionales.
create or replace function public.ops_customer_key(p_value text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'))
$$;
create table if not exists public.customer_assignments (
  customer text not null check (length(trim(customer)) between 1 and 500),
  customer_key text generated always as (public.ops_customer_key(customer)) stored primary key,
  owner_id uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.load_followers (
  load text not null references public.loads(load) on delete restrict,
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (load, user_id)
);
create table if not exists public.user_following (
  user_id uuid not null references public.profiles(id),
  followed_user uuid not null references public.profiles(id),
  primary key (user_id, followed_user)
);
create table if not exists public.admin_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details jsonb not null default '{}',
  actor uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.portal_access (
  user_id uuid primary key references public.profiles(id),
  customer text not null check (length(trim(customer)) between 1 and 500),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 2. Los turnos usan la zona horaria operativa de México, incluso si el navegador está lejos.
create or replace function public.ops_shift(p_time timestamptz) returns text
language sql stable set search_path = '' as $$
  select case
    when extract(hour from p_time at time zone 'America/Mexico_City') < 7 then '00:00–07:00'
    when extract(hour from p_time at time zone 'America/Mexico_City') < 16 then '07:00–16:00'
    else '16:00–00:00' end
$$;
create table if not exists public.shift_tasks (
  id uuid primary key default gen_random_uuid(),
  load text references public.loads(load) on delete restrict,
  note text not null check (length(trim(note)) between 1 and 9500),
  assigned_to uuid references public.profiles(id),
  assigned_csr uuid references public.profiles(id),
  color text not null default '' check (color in ('', 'critical', 'warn', 'good', 'info', 'purple', 'teal', 'pink', 'brown', 'slate')),
  follow_up_at timestamptz,
  shift text not null,
  state text not null default 'open' check (state in ('open', 'resolved', 'cancelled')),
  resolved_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assigned_to is not null or assigned_csr is not null),
  check ((state = 'resolved') = (resolved_at is not null))
);
create index if not exists shift_tasks_assignee_idx on public.shift_tasks(assigned_to, state, created_at);
create table if not exists public.shift_task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.shift_tasks(id) on delete restrict,
  event text not null,
  actor uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
create table if not exists public.shift_closures (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(trim(body)) between 1 and 20000),
  shift text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  title text not null check (length(trim(title)) between 1 and 100),
  body text not null check (length(trim(body)) between 1 and 10000),
  updated_at timestamptz not null default now()
);

-- 3. Autorización común. Los RPC vuelven a comprobar el rol aunque la interfaz oculte botones.
create or replace function public.ops_require_staff(p_admin boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.panel_role(), '') not in ('admin', 'csr')
    or (p_admin and public.panel_role() <> 'admin') then
    raise exception 'No tienes permiso para esta operación';
  end if;
end;
$$;
create or replace function public.ops_log_admin(p_action text, p_details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_events(action, details, actor) values (p_action, p_details, auth.uid());
end;
$$;
create or replace function public.ops_task_access(p_creator uuid, p_assigned uuid, p_csr uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.panel_role() in ('admin', 'manager')
    or (public.panel_role() = 'csr' and (
      auth.uid() in (p_creator, p_assigned, p_csr)
      or exists (select 1 from public.user_following where user_id = auth.uid() and followed_user = p_csr)
    ))
$$;

-- Todas las escrituras de estas tablas pasan por RPC para proteger autores y metadatos.
alter table public.customer_assignments enable row level security;
alter table public.load_followers enable row level security;
alter table public.user_following enable row level security;
alter table public.admin_events enable row level security;
alter table public.portal_access enable row level security;
alter table public.shift_tasks enable row level security;
alter table public.shift_task_history enable row level security;
alter table public.shift_closures enable row level security;
alter table public.message_templates enable row level security;
drop policy if exists assignments_read on public.customer_assignments;
create policy assignments_read on public.customer_assignments for select to authenticated
using (public.panel_role() in ('admin', 'csr', 'manager'));
drop policy if exists load_followers_read on public.load_followers;
create policy load_followers_read on public.load_followers for select to authenticated
using (public.panel_role() in ('admin', 'csr', 'manager'));
drop policy if exists user_following_read on public.user_following;
create policy user_following_read on public.user_following for select to authenticated
using (public.panel_role() in ('admin', 'manager') or (public.panel_role() = 'csr' and user_id = auth.uid()));
drop policy if exists admin_events_read on public.admin_events;
create policy admin_events_read on public.admin_events for select to authenticated using (public.panel_role() = 'admin');
drop policy if exists portal_access_read on public.portal_access;
create policy portal_access_read on public.portal_access for select to authenticated using (public.panel_role() = 'admin');
drop policy if exists shift_tasks_read on public.shift_tasks;
create policy shift_tasks_read on public.shift_tasks for select to authenticated
using (public.ops_task_access(created_by, assigned_to, assigned_csr));
drop policy if exists shift_history_read on public.shift_task_history;
create policy shift_history_read on public.shift_task_history for select to authenticated
using (exists (select 1 from public.shift_tasks where id = task_id));
drop policy if exists closures_read on public.shift_closures;
create policy closures_read on public.shift_closures for select to authenticated
using (public.panel_role() in ('admin', 'manager') or (public.panel_role() = 'csr' and (
  created_by = auth.uid() or exists (select 1 from public.user_following where user_id = auth.uid() and followed_user = created_by)
)));
drop policy if exists templates_read on public.message_templates;
create policy templates_read on public.message_templates for select to authenticated
using (public.panel_role() in ('admin', 'csr', 'manager') and owner_id = auth.uid());
revoke all on public.customer_assignments, public.load_followers, public.user_following, public.admin_events,
  public.portal_access, public.shift_tasks, public.shift_task_history, public.shift_closures, public.message_templates
from anon, authenticated;
grant select on public.customer_assignments, public.load_followers, public.user_following, public.admin_events,
  public.portal_access, public.shift_tasks, public.shift_task_history, public.shift_closures, public.message_templates to authenticated;

-- 4. Administración de perfiles sin manejar contraseñas ni claves privadas en el navegador.
create or replace function public.ops_save_profile(p_id uuid, p_version timestamptz, p_name text, p_role text, p_active boolean, p_email text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare previous public.profiles; saved public.profiles;
begin
  perform public.ops_require_staff(true);
  -- Bloquear los administradores en orden evita que dos cambios eliminen al último administrador.
  perform id from public.profiles where role = 'admin' and active order by id for update;
  select * into previous from public.profiles where id = p_id for update;
  if not found or previous.updated_at is distinct from p_version then raise exception 'La cuenta cambió. Actualiza antes de guardar'; end if;
  if p_id = auth.uid() and (not p_active or p_role <> 'admin') then raise exception 'Conserva tu cuenta como administrador activo'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 or length(coalesce(p_email, '')) > 320 then raise exception 'Nombre o correo no válido'; end if;
  if p_role is null or p_role not in ('pending', 'admin', 'csr', 'manager', 'client') or p_active is null then raise exception 'Rol o acceso no válido'; end if;
  if previous.role = 'admin' and previous.active and (p_role <> 'admin' or not p_active)
    and (select count(*) from public.profiles where role = 'admin' and active) < 2 then
    raise exception 'Debe permanecer al menos un administrador activo';
  end if;
  update public.profiles set display_name = trim(p_name), role = p_role, active = p_active,
    contact_email = trim(coalesce(p_email, '')), updated_at = now() where id = p_id returning * into saved;
  perform public.ops_log_admin('profile_saved', jsonb_build_object('before', to_jsonb(previous), 'after', to_jsonb(saved)));
  return saved;
end;
$$;
create or replace function public.ops_assign_customer(p_customer text, p_owner uuid, p_version timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.customer_assignments;
begin
  perform public.ops_require_staff(true);
  if length(trim(coalesce(p_customer, ''))) not between 1 and 500 then raise exception 'Indica un cliente válido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(public.ops_customer_key(p_customer), 0));
  select * into previous from public.customer_assignments where customer_key = public.ops_customer_key(p_customer) for update;
  if previous.updated_at is distinct from p_version then raise exception 'La asignación cambió. Actualiza antes de guardar'; end if;
  if p_owner is null then
    delete from public.customer_assignments where customer_key = public.ops_customer_key(p_customer);
  else
    if not exists (select 1 from public.profiles where id = p_owner and active and role in ('admin', 'csr')) then raise exception 'Selecciona un operador activo'; end if;
    insert into public.customer_assignments(customer, owner_id, updated_by) values (trim(p_customer), p_owner, auth.uid())
    on conflict (customer_key) do update set owner_id = excluded.owner_id, updated_by = auth.uid(), updated_at = now();
  end if;
  perform public.ops_log_admin('customer_assigned', jsonb_build_object('customer', p_customer, 'owner_id', p_owner));
end;
$$;
create or replace function public.ops_set_following(p_users uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ops_require_staff();
  if cardinality(p_users) > 200 then raise exception 'Demasiados operadores seleccionados'; end if;
  if exists (select 1 from unnest(p_users) selected(id)
    where not exists (select 1 from public.profiles where id = selected.id and active and role in ('csr', 'admin'))) then
    raise exception 'Selecciona operadores activos';
  end if;
  -- El perfil actúa como bloqueo común al reemplazar toda la selección.
  perform id from public.profiles where id = auth.uid() for update;
  delete from public.user_following where user_id = auth.uid();
  insert into public.user_following(user_id, followed_user) select auth.uid(), id from unnest(p_users) selected(id) group by id;
end;
$$;
create or replace function public.ops_follow_load(p_load text, p_follow boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ops_require_staff();
  if not exists (select 1 from public.loads where load = p_load) then raise exception 'Carga no encontrada'; end if;
  if p_follow then insert into public.load_followers(load, user_id) values(p_load, auth.uid()) on conflict do nothing;
  else delete from public.load_followers where load = p_load and user_id = auth.uid(); end if;
end;
$$;

-- 5. Bitácora: una nota general o una fila por carga; también deja comentario en cada carga.
create or replace function public.ops_lock_task(p_id uuid, p_version timestamptz)
returns public.shift_tasks language plpgsql security definer set search_path = '' as $$
declare record public.shift_tasks;
begin
  perform public.ops_require_staff();
  select * into record from public.shift_tasks where id = p_id for update;
  if not found or not coalesce(public.ops_task_access(record.created_by, record.assigned_to, record.assigned_csr), false) then
    raise exception 'Pendiente de turno no encontrado o sin permiso';
  end if;
  if record.updated_at is distinct from p_version then raise exception 'El pendiente cambió. Actualiza antes de guardar'; end if;
  return record;
end;
$$;
create or replace function public.ops_save_tasks(p_values jsonb, p_id uuid default null, p_version timestamptz default null)
returns setof public.shift_tasks language plpgsql security definer set search_path = '' as $$
declare
  previous public.shift_tasks; saved public.shift_tasks;
  assigned uuid; target_csr uuid; follow_date timestamptz; load_numbers jsonb; load_number text;
begin
  perform public.ops_require_staff();
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception 'Datos del pendiente no válidos'; end if;
  assigned := nullif(p_values ->> 'assigned_to', '')::uuid;
  target_csr := nullif(p_values ->> 'assigned_csr', '')::uuid;
  if assigned is null and target_csr is null then raise exception 'Selecciona a quién asignar el pendiente'; end if;
  if exists (select 1 from unnest(array[assigned, target_csr]) selected(id) where id is not null
    and not exists (select 1 from public.profiles where profiles.id = selected.id and active and role in ('admin', 'csr'))) then
    raise exception 'La persona asignada debe ser un operador activo';
  end if;
  if nullif(p_values ->> 'follow_up_at', '') is not null and (p_values ->> 'follow_up_at') !~* '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'La fecha de seguimiento debe incluir zona horaria';
  end if;
  follow_date := nullif(p_values ->> 'follow_up_at', '')::timestamptz;
  if p_id is not null then
    previous := public.ops_lock_task(p_id, p_version);
    if previous.state <> 'open' then raise exception 'Reabre el pendiente antes de editarlo'; end if;
    load_numbers := jsonb_build_array(nullif(p_values ->> 'load', ''));
  else
    load_numbers := coalesce(p_values -> 'loads', '[]');
    if jsonb_typeof(load_numbers) <> 'array' or jsonb_array_length(load_numbers) > 100 then raise exception 'Selecciona hasta 100 cargas'; end if;
    if jsonb_array_length(load_numbers) = 0 then load_numbers := '[null]'; end if;
  end if;
  for load_number in select distinct nullif(trim(value), '') from jsonb_array_elements_text(load_numbers) elements(value) loop
    if load_number is not null and not exists (select 1 from public.loads where load = load_number) then raise exception 'La carga % no existe', load_number; end if;
    if p_id is null then
      insert into public.shift_tasks(load, note, assigned_to, assigned_csr, color, follow_up_at, shift, created_by)
      values(load_number, trim(coalesce(p_values ->> 'note', '')), assigned, target_csr,
        coalesce(p_values ->> 'color', ''), follow_date, public.ops_shift(now()), auth.uid()) returning * into saved;
      if load_number is not null then
        insert into public.comments(load, body, created_by)
        values(load_number, 'Bitácora de turno: ' || saved.note, auth.uid());
      end if;
    else
      update public.shift_tasks set load = load_number, note = trim(coalesce(p_values ->> 'note', '')),
        assigned_to = assigned, assigned_csr = target_csr, color = coalesce(p_values ->> 'color', ''),
        follow_up_at = follow_date, updated_at = now()
      where id = p_id returning * into saved;
    end if;
    insert into public.shift_task_history(task_id, event, actor, before_data, after_data)
    values(saved.id, case when p_id is null then 'created' else 'edited' end, auth.uid(),
      case when p_id is null then null else to_jsonb(previous) end, to_jsonb(saved));
    return next saved;
  end loop;
end;
$$;
create or replace function public.ops_set_task_state(p_id uuid, p_version timestamptz, p_state text)
returns public.shift_tasks language plpgsql security definer set search_path = '' as $$
declare previous public.shift_tasks; saved public.shift_tasks;
begin
  previous := public.ops_lock_task(p_id, p_version);
  if p_state is null or p_state not in ('open', 'resolved', 'cancelled') or previous.state = 'cancelled' then
    raise exception 'Ese cambio no está permitido';
  end if;
  if previous.state = p_state then raise exception 'El pendiente ya tiene ese estado'; end if;
  update public.shift_tasks set state = p_state, updated_at = now(),
    resolved_at = case when p_state = 'resolved' then now() else null end
  where id = p_id returning * into saved;
  insert into public.shift_task_history(task_id, event, actor, before_data, after_data)
  values(p_id, p_state, auth.uid(), to_jsonb(previous), to_jsonb(saved));
  return saved;
end;
$$;
create or replace function public.ops_save_closure(p_body text) returns public.shift_closures
language plpgsql security definer set search_path = '' as $$
declare saved public.shift_closures;
begin
  perform public.ops_require_staff();
  insert into public.shift_closures(body, shift, created_by)
  values(trim(coalesce(p_body, '')), public.ops_shift(now()), auth.uid()) returning * into saved;
  return saved;
end;
$$;

-- 6. Plantillas personales. Solo su propietario puede modificarlas.
create or replace function public.ops_save_template(p_title text, p_body text, p_id uuid default null, p_version timestamptz default null)
returns public.message_templates language plpgsql security definer set search_path = '' as $$
declare previous public.message_templates; saved public.message_templates;
begin
  perform public.ops_require_staff();
  if p_id is null then
    insert into public.message_templates(owner_id, title, body) values(auth.uid(), trim(coalesce(p_title, '')), coalesce(p_body, '')) returning * into saved;
  else
    select * into previous from public.message_templates where id = p_id and owner_id = auth.uid() for update;
    if not found or previous.updated_at is distinct from p_version then raise exception 'La plantilla cambió o no tienes permiso'; end if;
    update public.message_templates set title = trim(coalesce(p_title, '')), body = coalesce(p_body, ''), updated_at = now() where id = p_id returning * into saved;
  end if;
  return saved;
end;
$$;
create or replace function public.ops_delete_template(p_id uuid, p_version timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare previous public.message_templates;
begin
  perform public.ops_require_staff();
  select * into previous from public.message_templates where id = p_id and owner_id = auth.uid() for update;
  if not found or previous.updated_at is distinct from p_version then raise exception 'La plantilla cambió o no tienes permiso'; end if;
  delete from public.message_templates where id = p_id;
end;
$$;

-- 7. Acceso al portal. El cliente se obtiene de la cuenta, nunca del texto del navegador.
create or replace function public.ops_set_portal_access(p_user uuid, p_customer text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.ops_require_staff(true);
  perform id from public.profiles where id = p_user and role = 'client' for update;
  if not found then raise exception 'Primero asigna el rol Cliente a esa cuenta'; end if;
  if length(trim(coalesce(p_customer, ''))) not between 1 and 500 or p_active is null then raise exception 'Cliente o acceso no válido'; end if;
  insert into public.portal_access(user_id, customer, active) values(p_user, trim(p_customer), p_active)
  on conflict(user_id) do update set customer = excluded.customer, active = excluded.active, updated_at = now();
  perform public.ops_log_admin('portal_access_saved', jsonb_build_object('user', p_user, 'customer', p_customer, 'active', p_active));
end;
$$;

-- Lista explícita de columnas: agregar un campo interno a Loads no lo expone al cliente.
create or replace view public.portal_load_snapshot as
select load, customer, origin_city, origin_state, dest_city, dest_state, truck, trailer,
  pickup_appt, pickup_actual, delivery_appt, delivery_actual, status, salida_mexico_fecha,
  cruce_usa_fecha, bol, doda, entry, sobre_listo, pod_sent
from public.loads where not archived;
revoke all on public.portal_load_snapshot from public, anon, authenticated;
create or replace function public.ops_portal_loads(p_offset integer default 0, p_limit integer default 100)
returns setof public.portal_load_snapshot language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.panel_role(), '') <> 'client' then raise exception 'Acceso al portal no autorizado'; end if;
  if p_offset < 0 or p_offset is null or p_limit is null or p_limit not between 1 and 500 then raise exception 'Página no válida'; end if;
  return query select snapshot.* from public.portal_load_snapshot snapshot
  join public.portal_access access on public.ops_customer_key(access.customer) = public.ops_customer_key(snapshot.customer)
  where access.user_id = auth.uid() and access.active order by snapshot.load offset p_offset limit p_limit;
end;
$$;
alter table public.communications add column if not exists public_message text not null default '';
create or replace function public.ops_portal_detail(p_load text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare snapshot public.portal_load_snapshot;
begin
  if coalesce(public.panel_role(), '') <> 'client' then raise exception 'Acceso al portal no autorizado'; end if;
  select visible.* into snapshot from public.portal_load_snapshot visible
  join public.portal_access access on public.ops_customer_key(access.customer) = public.ops_customer_key(visible.customer)
  where access.user_id = auth.uid() and access.active and visible.load = p_load;
  if not found then raise exception 'Carga no encontrada o sin acceso'; end if;
  return to_jsonb(snapshot) || jsonb_build_object(
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'severity', severity,
      'description', description, 'action_taken', action_taken, 'created_at', created_at) order by created_at desc)
      from public.incidents where load = p_load), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('message', public_message, 'created_at', created_at) order by created_at desc)
      from public.communications where load = p_load and public_message <> ''), '[]'::jsonb)
  );
end;
$$;

-- 8. Retirar concesiones por defecto de todas las funciones nuevas, incluidas las privadas.
do $$
declare function_signature regprocedure;
begin
  for function_signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'ops\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon, authenticated', function_signature);
  end loop;
end;
$$;
grant execute on function public.ops_task_access(uuid, uuid, uuid) to authenticated;
grant execute on function public.ops_save_profile(uuid, timestamptz, text, text, boolean, text),
  public.ops_assign_customer(text, uuid, timestamptz), public.ops_set_following(uuid[]), public.ops_follow_load(text, boolean),
  public.ops_save_tasks(jsonb, uuid, timestamptz), public.ops_set_task_state(uuid, timestamptz, text),
  public.ops_save_closure(text), public.ops_save_template(text, text, uuid, timestamptz),
  public.ops_delete_template(uuid, timestamptz), public.ops_set_portal_access(uuid, text, boolean),
  public.ops_portal_loads(integer, integer), public.ops_portal_detail(text)
to authenticated;


-- Archivo: 006_import_archive_and_messages.sql
-- IMPORTACIÓN CON VISTA PREVIA, DESHACER, ARCHIVO Y MENSAJES DEL PORTAL.
-- Ejecutar completo después de 005. No elimina cargas ni su historial.
alter table public.loads add column if not exists archive_reason text not null default '';
alter table public.loads add column if not exists archived_at timestamptz;
alter table public.loads add column if not exists archived_by uuid references public.profiles(id);
alter table public.loads add column if not exists portal_message text not null default '';
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(file_name) between 1 and 200),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  state text not null default 'applied' check (state in ('applied', 'undone')),
  undone_by uuid references public.profiles(id),
  undone_at timestamptz
);
create table if not exists public.import_rows (
  batch_id uuid not null references public.import_batches(id),
  load text not null,
  before_data jsonb,
  after_data jsonb not null,
  primary key(batch_id, load)
);
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
drop policy if exists import_batches_read on public.import_batches;
create policy import_batches_read on public.import_batches for select to authenticated using (public.panel_role() = 'admin');
drop policy if exists import_rows_read on public.import_rows;
create policy import_rows_read on public.import_rows for select to authenticated using (public.panel_role() = 'admin');
revoke all on public.import_batches, public.import_rows from anon, authenticated;
grant select on public.import_batches, public.import_rows to authenticated;

-- El navegador no puede cambiar los metadatos de archivo o suplantar procedencias.
revoke update, insert on public.loads from authenticated;
do $$
declare columns_list text;
begin
  select string_agg(quote_ident(attname), ',') into columns_list from pg_attribute
  where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
    and attname not in ('load','created_at','updated_at','updated_by','archived','archive_reason','archived_at','archived_by','portal_message',
      'client_notify_pending','client_notify_reason','client_notify_since','client_notified_at','client_notified_by',
      'last_communication_channel','last_communication_type','next_review_by','ultima_revision_csr_by')
    and attname !~ '(_source|_manual_by|_manual_at)$';
  execute 'grant update (' || columns_list || ') on public.loads to authenticated';
  execute 'grant insert (load,' || columns_list || ') on public.loads to authenticated';
end;
$$;
drop policy if exists loads_update on public.loads;
create policy loads_update on public.loads for update to authenticated
using (public.panel_role() = 'admin' or (public.panel_role() = 'csr' and not archived))
with check (public.panel_role() = 'admin' or (public.panel_role() = 'csr' and not archived));
revoke insert on public.comments,public.incidents from authenticated;
grant insert(load,body) on public.comments to authenticated;
grant insert(load,category,severity,description,action_taken) on public.incidents to authenticated;
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check(
  public.panel_role() in ('admin','csr') and created_by=auth.uid()
  and exists(select 1 from public.loads where loads.load=comments.load and not archived));
drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on public.incidents for insert to authenticated with check(
  public.panel_role() in ('admin','csr') and created_by=auth.uid()
  and exists(select 1 from public.loads where loads.load=incidents.load and not archived));

-- 1. Combinar un archivo con el registro actual conserva los campos operativos manuales.
create or replace function public.ops_merge_import(p_values jsonb, p_previous jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare merged jsonb := coalesce(p_previous, '{}'); field_name text; incoming text; source_prefix text;
begin
  merged := merged || jsonb_build_object('load', trim(coalesce(p_values ->> 'load', '')));
  foreach field_name in array array[
    'customer','origin_city','origin_state','origin_address','dest_city','dest_state','dest_address',
    'pickup_appt','pickup_actual','pickup_delta_min','delivery_appt','delivery_actual','delivery_delta_min',
    'truck','trailer','work_order','bol','doc_status','doda','entry','exportacion','importacion','pedimentos','regresos',
    'sobre_listo','loaded_miles','empty_miles','rpm','charges','tracking_link','eta_note','salida_mexico_fecha','cruce_usa_fecha'
  ] loop
    if not (p_values ? field_name) then continue; end if;
    incoming := trim(coalesce(p_values ->> field_name, ''));
    if length(incoming) > 5000 then raise exception 'El campo % supera 5000 caracteres', field_name; end if;
    -- Un dato vacío de Excel no borra un valor existente; status/POD/color nunca vienen del archivo.
    if incoming = '' and p_previous is not null then continue; end if;
    if field_name in ('bol','doda','entry','sobre_listo') and lower(incoming) in ('false','0','no','null')
      and coalesce(p_previous ->> field_name, '') not in ('','false','0','no','null') then continue; end if;
    merged := merged || jsonb_build_object(field_name, incoming);
    if field_name in ('truck','trailer','bol','doda','entry','sobre_listo') and incoming <> '' then
      source_prefix := field_name;
      merged := merged || jsonb_build_object(source_prefix || '_source', 'IMPORT', source_prefix || '_manual_by', '', source_prefix || '_manual_at', '');
      if field_name in ('truck','trailer') then merged := merged || jsonb_build_object(field_name || '_vg_value', incoming); end if;
    end if;
  end loop;
  if p_previous is null then merged := merged || jsonb_build_object('status', 'Cargando'); end if;
  return merged;
end;
$$;

-- Solo estas funciones privadas escriben instantáneas; los nombres de columnas salen del esquema.
create or replace function public.ops_write_load_snapshot(p_values jsonb, p_insert boolean) returns public.loads
language plpgsql security definer set search_path = '' as $$
declare columns_list text; expressions text; saved public.loads; metadata_columns text;
begin
  select string_agg(quote_ident(attname), ','),
    string_agg(format('(jsonb_populate_record(null::public.loads,$1)).%I', attname), ',')
  into columns_list, expressions from pg_attribute where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
    and p_values ? attname and attname not in ('created_at','updated_at','updated_by');
  if p_insert then
    execute format('insert into public.loads(%s) select %s returning *', columns_list, expressions) using p_values into saved;
  else
    select string_agg(format('%I = (jsonb_populate_record(null::public.loads,$1)).%I', attname, attname), ',')
    into expressions from pg_attribute where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
      and p_values ? attname and attname not in ('load','created_at','updated_at','updated_by');
    execute format('update public.loads set %s where load=$2 returning *', expressions) using p_values, p_values ->> 'load' into saved;
  end if;
  -- Las reglas normales marcaron procedencia manual; se restablece la procedencia del archivo.
  -- Esta segunda escritura no vuelve a cambiar fechas ni valores operativos.
  select string_agg(format('%I = (jsonb_populate_record(null::public.loads,$1)).%I', attname, attname), ',')
  into metadata_columns from pg_attribute where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
    and p_values ? attname and attname ~ '(_source|_manual_by|_manual_at)$';
  if metadata_columns is not null then
    execute format('update public.loads set %s where load=$2 returning *', metadata_columns) using p_values, saved.load into saved;
  end if;
  return saved;
end;
$$;
create or replace function public.ops_check_import(p_records jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) not between 1 and 1000 then
    raise exception 'La importación admite entre 1 y 1000 cargas por archivo';
  end if;
  if exists (select 1 from jsonb_array_elements(p_records) record where jsonb_typeof(record) <> 'object'
    or length(trim(coalesce(record ->> 'load', ''))) not between 1 and 200) then raise exception 'Todos los registros requieren un número de carga válido'; end if;
  if exists (select trim(value ->> 'load') from jsonb_array_elements(p_records) group by trim(value ->> 'load') having count(*) > 1) then
    raise exception 'El archivo contiene números de carga duplicados';
  end if;
end;
$$;
create or replace function public.ops_preview_import(p_records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare input jsonb; previous public.loads; merged jsonb; result jsonb := '[]'; changed text[];
begin
  perform public.ops_require_staff(true); perform public.ops_check_import(p_records);
  for input in select value from jsonb_array_elements(p_records) loop
    select * into previous from public.loads where load = trim(input ->> 'load');
    if previous.archived then raise exception 'La carga % está archivada. Restáurala antes de importar', previous.load; end if;
    merged := public.ops_merge_import(input, case when previous.load is null then null else to_jsonb(previous) end);
    select array_agg(key order by key) into changed from jsonb_each(merged) item(key, value)
      where key not in ('updated_at','updated_by','created_at') and value is distinct from to_jsonb(previous) -> key;
    result := result || jsonb_build_array(jsonb_build_object('load', merged ->> 'load', 'new', previous.load is null,
      'version', previous.updated_at, 'changes', coalesce(changed, array[]::text[])));
  end loop;
  return result;
end;
$$;
create or replace function public.ops_apply_import(p_records jsonb, p_preview jsonb, p_file_name text) returns public.import_batches
language plpgsql security definer set search_path = '' as $$
declare input jsonb; previous public.loads; saved public.loads; batch public.import_batches; expected jsonb; merged jsonb;
begin
  perform public.ops_require_staff(true); perform public.ops_check_import(p_records);
  if p_preview is null or jsonb_typeof(p_preview) <> 'array' or jsonb_array_length(p_preview) <> jsonb_array_length(p_records) then raise exception 'Primero genera la vista previa'; end if;
  -- Todas las importaciones se serializan; cada carga se bloquea para detectar cambios desde la vista previa.
  perform pg_advisory_xact_lock(607031);
  insert into public.import_batches(file_name, created_by) values(p_file_name, auth.uid()) returning * into batch;
  for input in select value from jsonb_array_elements(p_records) order by trim(value ->> 'load') loop
    select * into previous from public.loads where load = trim(input ->> 'load') for update;
    select value into expected from jsonb_array_elements(p_preview) where value ->> 'load' = trim(input ->> 'load');
    if expected is null or previous.updated_at is distinct from (expected ->> 'version')::timestamptz then raise exception 'La carga % cambió. Genera otra vista previa', input ->> 'load'; end if;
    if previous.archived then raise exception 'La carga % está archivada', previous.load; end if;
    merged := public.ops_merge_import(input, case when previous.load is null then null else to_jsonb(previous) end);
    if previous.load is not null and merged = to_jsonb(previous) then continue; end if;
    saved := public.ops_write_load_snapshot(merged, previous.load is null);
    insert into public.import_rows(batch_id, load, before_data, after_data)
    values(batch.id, saved.load, case when previous.load is null then null else to_jsonb(previous) end, to_jsonb(saved));
  end loop;
  perform public.ops_log_admin('import_applied', jsonb_build_object('batch', batch.id, 'file', p_file_name));
  return batch;
end;
$$;

-- Deshacer comprueba versiones y conserva la auditoría. Las cargas nuevas pasan al archivo.
create or replace function public.ops_undo_import(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare batch public.import_batches; item public.import_rows; current_load public.loads;
begin
  perform public.ops_require_staff(true); perform pg_advisory_xact_lock(607031);
  select * into batch from public.import_batches where id = p_batch for update;
  if not found or batch.state <> 'applied' then raise exception 'La importación no existe o ya fue deshecha'; end if;
  for item in select * from public.import_rows where batch_id = p_batch order by load loop
    select * into current_load from public.loads where load = item.load for update;
    if not found or current_load.updated_at is distinct from (item.after_data ->> 'updated_at')::timestamptz then
      raise exception 'La carga % cambió después de importar. No se sobrescribirá', item.load;
    end if;
    if item.before_data is null then
      if exists (select 1 from public.comments where load = item.load and created_at > batch.created_at)
        or exists (select 1 from public.incidents where load = item.load and created_at > batch.created_at) then
        raise exception 'La carga % tiene actividad posterior. Revisa antes de deshacer', item.load;
      end if;
      update public.loads set archived = true, archive_reason = 'import_undo', archived_at = now(), archived_by = auth.uid() where load = item.load;
    else
      perform public.ops_write_load_snapshot(item.before_data, false);
    end if;
  end loop;
  update public.import_batches set state = 'undone', undone_by = auth.uid(), undone_at = now() where id = p_batch;
  perform public.ops_log_admin('import_undone', jsonb_build_object('batch', p_batch));
end;
$$;

-- 2. Archivo reversible. Las cargas conservan comentarios, incidencias y vínculos.
create or replace function public.ops_archive_load(p_load text, p_version timestamptz, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare record public.loads;
begin
  perform public.ops_require_staff(true);
  if p_archive is null then raise exception 'Indica la acción de archivo'; end if;
  select * into record from public.loads where load = p_load for update;
  if not found or record.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de archivar'; end if;
  update public.loads set archived = p_archive, archive_reason = case when p_archive then 'manual' else '' end,
    archived_at = case when p_archive then now() else null end, archived_by = case when p_archive then auth.uid() else null end
  where load = p_load;
  perform public.ops_log_admin('load_archive_changed', jsonb_build_object('load', p_load, 'archived', p_archive));
end;
$$;
create or replace function public.ops_archive_finished() returns integer
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  perform public.ops_require_staff(true);
  update public.loads set archived = true, archive_reason = 'finished_60_days', archived_at = now(), archived_by = auth.uid()
  where not archived and updated_at < now() - interval '60 days' and (
    (lower(status) in ('delivered','completed','entregado','completado') and lower(pod_sent) not in ('','false','0','no','null'))
    or lower(trim(status, '. ')) = 'cancelado'
    or (status = 'TONU' and lower(recargos_vg) not in ('','false','0','no','null'))
  );
  get diagnostics total = row_count;
  perform public.ops_log_admin('finished_loads_archived', jsonb_build_object('count', total));
  return total;
end;
$$;

-- 3. El texto publicado en el portal se registra por separado de notas y motivos internos.
-- Conserva el registro de avisos de SQL 002 al proteger sus columnas de escritura directa.
create or replace function public.confirm_client_notice(p_load text,p_version timestamptz,p_channel text,p_notice_type text)
returns setof public.loads language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_staff();
  if p_channel is null or p_channel not in ('WhatsApp','Correo','Teléfono','Otro') then raise exception 'Elige un canal válido'; end if;
  if length(trim(coalesce(p_notice_type,''))) not between 1 and 200 then raise exception 'Indica el tipo de aviso (hasta 200 caracteres)'; end if;
  return query update public.loads set client_notify_pending='false',client_notified_at=now()::text,
    last_communication_channel=p_channel,last_communication_type=trim(p_notice_type)
    where load=p_load and updated_at=p_version and not archived returning *;
  if not found then raise exception 'La carga cambió, está archivada o no existe. Actualiza antes de registrar el aviso'; end if;
end;
$$;
create or replace function public.review_load(p_load text,p_version timestamptz)
returns setof public.loads language plpgsql set search_path='' as $$
begin
  if coalesce(public.panel_role(),'') not in ('admin','csr') then raise exception 'Sin permiso'; end if;
  return query update public.loads set next_review_at='',next_review_note='',
    recordatorio_fecha=case when status='En transito' then (now()+interval '3 hours')::text else recordatorio_fecha end
    where load=p_load and updated_at=p_version and not archived returning *;
  if not found then raise exception 'La carga cambió, está archivada o no existe. Actualiza antes de marcar la revisión'; end if;
end;
$$;
revoke execute on function public.confirm_client_notice(text,timestamptz,text,text),public.review_load(text,timestamptz) from public,anon;
grant execute on function public.confirm_client_notice(text,timestamptz,text,text),public.review_load(text,timestamptz) to authenticated;
create or replace function public.log_load_communication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_notify_pending = 'true' and new.client_notify_since is distinct from old.client_notify_since then
    insert into public.communications(load,event_type,reason,actor) values(new.load,'PENDIENTE',new.client_notify_reason,auth.uid());
  elsif new.client_notified_at <> '' and new.client_notified_at is distinct from old.client_notified_at then
    insert into public.communications(load,event_type,reason,actor,channel,notice_type,public_message)
    values(new.load,'NOTIFICADO',old.client_notify_reason,auth.uid(),new.last_communication_channel,new.last_communication_type,
      case when new.last_communication_channel = 'Portal' then new.portal_message else '' end);
  end if;
  return new;
end;
$$;
create or replace function public.ops_publish_portal_message(p_load text, p_version timestamptz, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare record public.loads;
begin
  perform public.ops_require_staff();
  if length(trim(coalesce(p_message, ''))) not between 1 and 10000 then raise exception 'Escribe un mensaje de hasta 10000 caracteres'; end if;
  select * into record from public.loads where load = p_load and not archived for update;
  if not found or record.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de publicar'; end if;
  update public.loads set client_notify_pending = 'false', client_notified_at = now()::text,
    last_communication_channel = 'Portal', last_communication_type = 'Mensaje en portal', portal_message = trim(p_message)
  where load = p_load;
end;
$$;

-- 4. Cambios masivos: todas las versiones deben coincidir o no se guarda ninguna fila.
create or replace function public.ops_bulk_loads(p_items jsonb, p_values jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare item jsonb; record public.loads; assignments text; field_name text; total integer := 0;
begin
  perform public.ops_require_staff();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 cargas'; end if;
  if exists (select value ->> 'load' from jsonb_array_elements(p_items) group by value ->> 'load' having count(*) > 1) then raise exception 'La selección contiene cargas duplicadas'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}' then raise exception 'Elige los cambios'; end if;
  for field_name in select jsonb_object_keys(p_values) loop
    if field_name not in ('status','recordatorio_fecha','pod_sent','recargos_vg','color','bol','doda','entry','sobre_listo') then raise exception 'Campo masivo no permitido'; end if;
  end loop;
  select string_agg(format('%I=(jsonb_populate_record(null::public.loads,$1)).%I', key, key), ',') into assignments from jsonb_object_keys(p_values) keys(key);
  for item in select value from jsonb_array_elements(p_items) order by value ->> 'load' loop
    select * into record from public.loads where load = item ->> 'load' and not archived for update;
    if not found or record.updated_at is distinct from (item ->> 'updated_at')::timestamptz then raise exception 'Una carga cambió. Actualiza la selección'; end if;
    execute format('update public.loads set %s where load=$2', assignments) using p_values, record.load;
    total := total + 1;
  end loop;
  return total;
end;
$$;

-- Funciones privadas sin permiso de ejecución; solo se exponen los RPC autorizados.
do $$ declare signature regprocedure; begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'ops\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', signature);
  end loop;
end; $$;
revoke execute on function public.ops_merge_import(jsonb,jsonb), public.ops_write_load_snapshot(jsonb,boolean), public.ops_check_import(jsonb) from authenticated;
grant execute on function public.ops_preview_import(jsonb), public.ops_apply_import(jsonb,jsonb,text), public.ops_undo_import(uuid),
  public.ops_archive_load(text,timestamptz,boolean), public.ops_archive_finished(), public.ops_publish_portal_message(text,timestamptz,text),
  public.ops_bulk_loads(jsonb,jsonb) to authenticated;
revoke execute on function public.log_load_communication() from public, anon, authenticated;


-- Archivo: 007_radar_and_places.sql
-- RADAR COMPARTIDO Y UBICACIONES. Ejecutar completo después de 006.
create table if not exists public.geo_places (
  place_key text primary key,
  label text not null check(length(label) between 1 and 300),
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.radar_sources (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check(length(file_name) between 1 and 200),
  records jsonb not null check(jsonb_typeof(records)='array' and jsonb_array_length(records) between 1 and 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.geo_places enable row level security;
alter table public.radar_sources enable row level security;
drop policy if exists places_read on public.geo_places;
create policy places_read on public.geo_places for select to authenticated using(public.panel_role() in ('admin','csr','manager'));
drop policy if exists radar_read on public.radar_sources;
create policy radar_read on public.radar_sources for select to authenticated using(public.panel_role() in ('admin','csr','manager'));
revoke all on public.geo_places,public.radar_sources from anon,authenticated;
grant select on public.geo_places,public.radar_sources to authenticated;

create or replace function public.ops_save_place(p_label text,p_latitude double precision,p_longitude double precision)
returns public.geo_places language plpgsql security definer set search_path='' as $$
declare saved public.geo_places; normalized text := public.ops_customer_key(p_label);
begin
  perform public.ops_require_staff();
  if length(normalized) not between 1 and 300 or p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Ubicación inválida'; end if;
  insert into public.geo_places(place_key,label,latitude,longitude,updated_by)
  values(normalized,trim(p_label),p_latitude,p_longitude,auth.uid())
  on conflict(place_key) do update set label=excluded.label,latitude=excluded.latitude,longitude=excluded.longitude,
    updated_by=auth.uid(),updated_at=now() returning * into saved;
  return saved;
end;
$$;
create or replace function public.ops_save_radar_source(p_file_name text,p_records jsonb) returns public.radar_sources
language plpgsql security definer set search_path='' as $$
declare input jsonb; normalized jsonb:='[]'; saved public.radar_sources;
begin
  perform public.ops_require_staff(); perform public.ops_check_import(p_records);
  -- Solo datos útiles al radar; no admite claves, contraseñas o metadatos de autor.
  for input in select value from jsonb_array_elements(p_records) loop
    if length(coalesce(input->>'origin_city',''))>300 or length(coalesce(input->>'origin_state',''))>100 then raise exception 'La ubicación supera el límite'; end if;
    normalized:=normalized || jsonb_build_array(jsonb_build_object('load',trim(input->>'load'),'customer',left(coalesce(input->>'customer',''),300),
      'origin_city',coalesce(input->>'origin_city',''),'origin_state',coalesce(input->>'origin_state',''),
      'dest_city',left(coalesce(input->>'dest_city',''),300),'dest_state',left(coalesce(input->>'dest_state',''),100),
      'pickup_appt',left(coalesce(input->>'pickup_appt',''),100),'delivery_appt',left(coalesce(input->>'delivery_appt',''),100)));
  end loop;
  insert into public.radar_sources(file_name,records,created_by) values(p_file_name,normalized,auth.uid()) returning * into saved;
  return saved;
end;
$$;
revoke execute on function public.ops_save_place(text,double precision,double precision),public.ops_save_radar_source(text,jsonb) from public,anon,authenticated;
grant execute on function public.ops_save_place(text,double precision,double precision),public.ops_save_radar_source(text,jsonb) to authenticated;

/** Exportación administrativa paginada, incluso de tablas que tienen privacidad por autor. */
create or replace function public.ops_backup_page(p_table text,p_offset integer default 0,p_limit integer default 500)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare ordering text;
begin
  perform public.ops_require_staff(true);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'Página de respaldo inválida'; end if;
  if p_table is null or p_table not in ('profiles','loads','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history',
    'reserved_loads','reserved_load_history','customer_assignments','load_followers','user_following','shift_tasks','shift_task_history',
    'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places') then raise exception 'Tabla de respaldo no permitida'; end if;
  ordering:=case p_table when 'loads' then 'load' when 'customer_assignments' then 'customer_key'
    when 'load_followers' then 'load,user_id' when 'user_following' then 'user_id,followed_user'
    when 'portal_access' then 'user_id' when 'import_rows' then 'batch_id,load' when 'geo_places' then 'place_key' else 'id' end;
  -- La tabla y el orden proceden de listas cerradas; no se interpola SQL del usuario.
  return query execute format('select to_jsonb(record) from public.%I record order by %s offset $1 limit $2',p_table,ordering)
    using p_offset,p_limit;
end;
$$;
revoke execute on function public.ops_backup_page(text,integer,integer) from public,anon,authenticated;
grant execute on function public.ops_backup_page(text,integer,integer) to authenticated;


-- Archivo: 008_incident_category_validation.sql
-- INCIDENCIAS: CATEGORÍA OBLIGATORIA TAMBIÉN EN SUPABASE.
-- Copiar y ejecutar TODO. Funciona con la tabla incidents de la primera entrega.
-- Conserva incidencias anteriores: NOT VALID controla registros nuevos sin borrarlas.
alter table public.incidents drop constraint if exists incidents_category_required_check;
alter table public.incidents add constraint incidents_category_required_check check (
  category is not null
  and char_length(btrim(category, E' \t\n\r\f' || chr(11) || chr(160))) between 1 and 100
) not valid;


-- Archivo: 009_original_interface.sql
-- Compatibilidad con las tres interfaces originales. Aplicar después de 001–008.
-- Agrega datos y funciones; conserva todas las cargas, usuarios e historiales existentes.

-- 1. Identificadores de acceso y bajas lógicas: conservar quién registró cada cambio.
alter table public.profiles add column if not exists login_name text;
alter table public.profiles add column if not exists password_ready boolean not null default true;
alter table public.profiles add column if not exists original_removed boolean not null default false;
create unique index if not exists profiles_login_name_unique on public.profiles(lower(login_name)) where login_name is not null;
alter table public.incidents add column if not exists deleted_at timestamptz;
alter table public.incidents add column if not exists deleted_by uuid references public.profiles(id);
alter table public.reserved_loads add column if not exists hidden boolean not null default false;

create or replace function public.ops_remove_incident(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare incident public.incidents;
begin
  perform public.ops_require_staff();
  select * into incident from public.incidents where id=p_id and deleted_at is null for update;
  if not found then raise exception 'La incidencia ya no existe'; end if;
  if public.panel_role()<>'admin' and incident.created_by<>auth.uid() then raise exception 'Solo el autor o administración pueden eliminarla'; end if;
  update public.incidents set deleted_at=now(),deleted_by=auth.uid() where id=p_id;
  insert into public.load_history(load,actor,before_data,after_data)
    values(incident.load,auth.uid(),jsonb_build_object('Incidencia eliminada',incident.category||': '||incident.description),jsonb_build_object('Incidencia eliminada',''));
  perform public.ops_log_admin('incident_removed',jsonb_build_object('id',p_id,'load',incident.load));
end $$;
create or replace function public.ops_hide_reserved(p_id uuid,p_version timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- La función existente verifica propiedad y versión y deja el historial del cierre.
  perform public.change_reserved_load_state(p_id,p_version,'liberado','Eliminado de la lista');
  update public.reserved_loads set hidden=true where id=p_id;
end $$;

-- El portal usa una lista explícita de campos y excluye las incidencias retiradas.
create or replace function public.ops_portal_detail(p_load text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare snapshot public.portal_load_snapshot;
begin
  if coalesce(public.panel_role(),'')<>'client' then raise exception 'Acceso al portal no autorizado'; end if;
  select visible.* into snapshot from public.portal_load_snapshot visible
  join public.portal_access access on public.ops_customer_key(access.customer)=public.ops_customer_key(visible.customer)
  where access.user_id=auth.uid() and access.active and visible.load=p_load;
  if not found then raise exception 'Carga no encontrada o sin acceso'; end if;
  return to_jsonb(snapshot)||jsonb_build_object(
    'incidents',coalesce((select jsonb_agg(jsonb_build_object('category',category,'severity',severity,
      'description',description,'action_taken',action_taken,'created_at',created_at) order by created_at desc)
      from public.incidents where load=p_load and deleted_at is null),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('message',public_message,'channel',channel,'created_at',created_at) order by created_at desc)
      from public.communications where load=p_load and public_message<>''),'[]'::jsonb));
end $$;

-- 2. Plantillas del centro de mensajes: llaves originales y preferencias privadas por cuenta.
create table if not exists public.original_preferences (
  user_id uuid primary key references public.profiles(id),
  templates jsonb not null default '{}', labels jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.original_preferences enable row level security;
drop policy if exists original_preferences_read on public.original_preferences;
create policy original_preferences_read on public.original_preferences for select to authenticated
using (user_id=auth.uid() and public.panel_role() in ('admin','csr','manager'));
create or replace function public.ops_save_original_templates(p_templates jsonb,p_labels jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item record;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_templates) is distinct from 'object' or jsonb_typeof(p_labels) is distinct from 'object'
    or pg_column_size(p_templates)>400000 or pg_column_size(p_labels)>20000 then raise exception 'Plantillas no válidas'; end if;
  for item in select * from jsonb_each_text(p_templates) loop
    if length(item.key)>100 or length(item.value)>10000 then raise exception 'Plantilla demasiado larga'; end if;
  end loop;
  for item in select * from jsonb_each_text(p_labels) loop
    if length(item.key)>100 or length(item.value)>100 then raise exception 'Etiqueta demasiado larga'; end if;
  end loop;
  insert into public.original_preferences(user_id,templates,labels) values(auth.uid(),p_templates,p_labels)
  on conflict(user_id) do update set templates=excluded.templates,labels=excluded.labels,updated_at=now();
end $$;

-- 3. Radar: preservar ciudades, direcciones exactas y millas compartidas del equipo.
create table if not exists public.original_places (
  place_key text primary key check(length(place_key) between 2 and 250),
  kind text not null check(kind in ('city','address')),
  searched_text text not null check(length(searched_text)<=250),
  formatted_address text not null default '' check(length(formatted_address)<=400),
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check ((kind='city' and position('|' in place_key)>0) or (kind='address' and place_key like 'dir:%'))
);
create table if not exists public.original_routes (
  route_key text primary key,
  origin_key text not null check(length(origin_key) between 2 and 250),
  destination_key text not null check(length(destination_key) between 2 and 250),
  miles numeric not null check(miles between 0 and 6000), hours numeric not null check(hours between 0 and 200),
  straight_miles numeric not null default 0 check(straight_miles between 0 and 6000),
  google_miles numeric check(google_miles between 0 and 6000), google_hours numeric check(google_hours between 0 and 200),
  google_at timestamptz, google_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(route_key=origin_key||'>'||destination_key)
);
create table if not exists public.original_radar (
  singleton boolean primary key default true check(singleton), file_name text not null check(length(file_name)<=120),
  records jsonb not null check(jsonb_typeof(records)='array' and jsonb_array_length(records)<=5000),
  visible boolean not null default true, updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);
do $$ declare table_name text; begin
  foreach table_name in array array['original_places','original_routes','original_radar'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('drop policy if exists original_staff_read on public.%I',table_name);
    execute format('create policy original_staff_read on public.%I for select to authenticated using (public.panel_role() in (''admin'',''csr'',''manager''))',table_name);
  end loop;
end $$;
create or replace function public.ops_original_places(p_places jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare item jsonb; count_saved integer:=0; affected integer;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_places) is distinct from 'array' or jsonb_array_length(p_places)>200 then raise exception 'Hasta 200 ubicaciones por solicitud'; end if;
  for item in select value from jsonb_array_elements(p_places) loop
    insert into public.original_places(place_key,kind,searched_text,formatted_address,latitude,longitude,created_by)
    values(item->>'key',item->>'kind',coalesce(item->>'text',''),coalesce(item->>'formatted',''),
      (item->>'lat')::double precision,(item->>'lon')::double precision,auth.uid()) on conflict do nothing;
    get diagnostics affected=row_count; count_saved:=count_saved+affected;
  end loop;
  return count_saved;
end $$;
create or replace function public.ops_original_routes(p_routes jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare item jsonb; count_saved integer:=0; affected integer;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes)>300 then raise exception 'Hasta 300 rutas por solicitud'; end if;
  perform pg_advisory_xact_lock(607032);
  for item in select value from jsonb_array_elements(p_routes) loop
    if exists(select 1 from public.original_routes where route_key=(item->>'destino')||'>'||(item->>'origen')) then continue; end if;
    insert into public.original_routes(route_key,origin_key,destination_key,miles,hours,straight_miles,created_by)
    values((item->>'origen')||'>'||(item->>'destino'),item->>'origen',item->>'destino',
      round((item->>'millas')::numeric,1),round(coalesce((item->>'horas')::numeric,0),1),round(coalesce((item->>'recta')::numeric,0),1),auth.uid()) on conflict do nothing;
    get diagnostics affected=row_count; count_saved:=count_saved+affected;
  end loop;
  return count_saved;
end $$;
create or replace function public.ops_original_google_route(p_key text,p_miles numeric,p_hours numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ops_require_staff(true);
  update public.original_routes set google_miles=round(p_miles,1),google_hours=round(p_hours,1),google_at=now(),google_by=auth.uid() where route_key=p_key;
  if not found then raise exception 'Trayecto no encontrado'; end if;
end $$;
create or replace function public.ops_original_radar(p_name text,p_records jsonb,p_visible boolean) returns public.original_radar
language plpgsql security definer set search_path = '' as $$
declare item jsonb; saved public.original_radar;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>5000 or pg_column_size(p_records)>9000000 then raise exception 'Radar: máximo 5000 cargas'; end if;
  if p_visible is null or (p_visible and jsonb_array_length(p_records)=0) then raise exception 'El archivo no trae cargas'; end if;
  for item in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(item)<>'object' or length(trim(coalesce(item->>'ciudad',''))) not between 1 and 80
      or length(coalesce(item->>'load',''))>40 or length(coalesce(item->>'estado',''))>40
      or length(coalesce(item->>'regresos',''))>80 or length(coalesce(item->>'entrega',''))>40 then raise exception 'Fila de Radar no válida'; end if;
  end loop;
  insert into public.original_radar(singleton,file_name,records,visible,updated_by)
  values(true,p_name,p_records,p_visible,auth.uid()) on conflict(singleton) do update set
    file_name=excluded.file_name,records=excluded.records,visible=excluded.visible,updated_at=now(),updated_by=auth.uid() returning * into saved;
  perform public.ops_log_admin('radar_original_saved',jsonb_build_object('file',p_name,'visible',p_visible,'rows',jsonb_array_length(p_records)));
  return saved;
end $$;
create or replace function public.ops_original_import_info() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare batch public.import_batches;
begin
  if coalesce(public.panel_role(),'') not in ('admin','csr','manager') then raise exception 'Sin acceso'; end if;
  select * into batch from public.import_batches order by created_at desc,id limit 1;
  return jsonb_build_object('lastImportAt',coalesce(batch.created_at::text,''),
    'deshacerDisponibleDesde',case when public.panel_role()='admin' and batch.undone_at is null then coalesce(batch.created_at::text,'') else '' end);
end $$;

-- Marcas ligeras de cambios: no descargar toda la operación cada minuto sin novedades.
create or replace function public.ops_original_marks() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.panel_role(),'') not in ('admin','csr','manager') then
    return jsonb_build_object('ok',false,'error','Tu acceso venció. Vuelve a iniciar sesión');
  end if;
  return jsonb_build_object('ok',true,'marcas',jsonb_build_object(
    'loads',(select count(*)::text||'|'||coalesce(max(updated_at)::text,'') from public.loads)
      ||(select count(*)::text||'|'||coalesce(max(created_at)::text,'')||'|'||coalesce(max(deleted_at)::text,'') from public.incidents),
    'personas',(select count(*)::text||'|'||coalesce(max(updated_at)::text,'') from public.profiles)
      ||(select count(*)::text||'|'||coalesce(max(updated_at)::text,'') from public.customer_assignments)
      ||(select count(*)::text||'|'||coalesce(max(created_at)::text,'') from public.load_followers)
      ||(select coalesce(md5(string_agg(user_id::text||':'||followed_user::text,',' order by user_id,followed_user)),'') from public.user_following),
    'comentarios',(select count(*)::text||'|'||coalesce(max(created_at)::text,'') from public.comments),
    'pendientes',(select count(*)::text||'|'||coalesce(max(updated_at)::text,'') from public.pending_loads),
    'bitacora',(select count(*)::text||'|'||coalesce(max(updated_at)::text,'') from public.shift_tasks),
    'apartados',(select count(*)::text||'|'||coalesce(max(updated_at)::text,'') from public.reserved_loads),
    'cierres',(select count(*)::text||'|'||coalesce(max(created_at)::text,'') from public.shift_closures)));
end $$;

-- 4. Fallos de acceso: solo la función de cuentas puede escribir o leer este registro.
create table if not exists public.original_login_attempts (
  account_key text primary key, failures integer not null default 0 check(failures>=0),
  blocked_until timestamptz, updated_at timestamptz not null default now()
);
alter table public.original_login_attempts enable row level security;
create or replace function public.ops_record_login_failure(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.original_login_attempts(account_key,failures) values(p_key,1)
  on conflict(account_key) do update set
    failures=case when original_login_attempts.updated_at<now()-interval '15 minutes' then 1 else original_login_attempts.failures+1 end,
    blocked_until=case when original_login_attempts.updated_at>=now()-interval '15 minutes' and original_login_attempts.failures>=4 then now()+interval '15 minutes' else original_login_attempts.blocked_until end,
    updated_at=now();
end $$;

-- 5. Permisos mínimos; revocar también concesiones automáticas del proyecto.
revoke all on public.original_preferences,public.original_places,public.original_routes,public.original_radar,public.original_login_attempts from public,anon,authenticated;
grant select on public.original_preferences,public.original_places,public.original_routes,public.original_radar to authenticated;
do $$ declare signature regprocedure; begin
  for signature in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
    ('ops_remove_incident','ops_hide_reserved','ops_save_original_templates','ops_original_places','ops_original_routes',
     'ops_original_google_route','ops_original_radar','ops_original_import_info','ops_original_marks','ops_record_login_failure') loop
    execute format('revoke execute on function %s from public,anon,authenticated',signature);
  end loop;
  -- service_role existe en Supabase; la condición permite las pruebas con PostgreSQL local.
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant all on public.original_login_attempts to service_role;
    grant execute on function public.ops_record_login_failure(text) to service_role;
    grant select,update on public.profiles to service_role;
    grant select,insert,update on public.portal_access to service_role;
    grant insert on public.admin_events to service_role;
  end if;
end $$;
grant execute on function public.ops_remove_incident(uuid),public.ops_hide_reserved(uuid,timestamptz),
  public.ops_save_original_templates(jsonb,jsonb),public.ops_original_places(jsonb),public.ops_original_routes(jsonb),
  public.ops_original_google_route(text,numeric,numeric),public.ops_original_radar(text,jsonb,boolean),public.ops_original_import_info(),public.ops_original_marks() to authenticated;
notify pgrst,'reload schema';


-- Archivo: 010_google_miles_worker.sql
-- MILLAS DE GOOGLE EN SEGUNDO PLANO. Requiere las migraciones 001–009.
-- Conserva las millas OSM y los resultados Google existentes. Se puede repetir.

alter table public.original_routes
  add column if not exists google_state text not null default 'pending'
    check (google_state in ('pending','processing','retry','ok','no_route')),
  add column if not exists google_attempts integer not null default 0 check (google_attempts>=0),
  add column if not exists google_next_attempt_at timestamptz not null default now(),
  add column if not exists google_claim_id uuid,
  add column if not exists google_lease_until timestamptz,
  add column if not exists google_last_error text not null default '';

update public.original_routes set google_state='ok',google_claim_id=null,google_lease_until=null,
  google_last_error='' where google_miles is not null and google_state<>'ok';
create index if not exists original_routes_google_pending
  on public.original_routes(google_next_attempt_at,created_at,route_key)
  where google_miles is null and google_state<>'no_route';

-- Solo SQL Editor administra este vínculo. El secreto real permanece en propiedades de Google.
create table if not exists public.original_google_worker_config (
  singleton boolean primary key default true check(singleton),
  token_hash text check(token_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default false,
  paused_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.original_google_worker_config(singleton) values(true) on conflict do nothing;
alter table public.original_google_worker_config enable row level security;
revoke all on public.original_google_worker_config from public,anon,authenticated;

-- Es privada: ninguna sesión web puede leer la configuración ni ejecutar esta comprobación sola.
create or replace function public.ops_require_google_worker(p_token text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_token is null or length(p_token) not between 64 and 128 or not exists (
    select 1 from public.original_google_worker_config
    where singleton and enabled and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
  ) then raise exception 'Proceso de millas no autorizado' using errcode='42501'; end if;
end $$;
revoke all on function public.ops_require_google_worker(text) from public,anon,authenticated;

-- Reserva trabajos por diez minutos. Otra ejecución no puede tomar los mismos mientras siga el plazo.
create or replace function public.ops_google_worker_claim(p_token text,p_limit integer default 20)
returns table(route_key text,claim_id uuid,origin_lat double precision,origin_lon double precision,
  destination_lat double precision,destination_lon double precision)
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_google_worker(p_token);
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'Lote inválido'; end if;
  perform 1 from public.original_google_worker_config where singleton for update;
  if exists(select 1 from public.original_google_worker_config where paused_until>now()) then return; end if;
  return query
    with candidates as (
      select r.route_key from public.original_routes r
      join public.original_places o on o.place_key=r.origin_key
      join public.original_places d on d.place_key=r.destination_key
      where r.google_miles is null and r.google_state<>'no_route'
        and r.google_next_attempt_at<=now()
        and (r.google_lease_until is null or r.google_lease_until<=now())
      order by r.google_next_attempt_at,r.created_at,r.route_key
      limit p_limit for update of r skip locked
    ), claimed as (
      update public.original_routes r set google_state='processing',google_claim_id=gen_random_uuid(),
        google_lease_until=now()+interval '10 minutes',google_attempts=r.google_attempts+1
      from candidates c where r.route_key=c.route_key
      returning r.route_key,r.google_claim_id,r.origin_key,r.destination_key
    )
    select c.route_key,c.google_claim_id,o.latitude,o.longitude,d.latitude,d.longitude
    from claimed c join public.original_places o on o.place_key=c.origin_key
      join public.original_places d on d.place_key=c.destination_key;
end $$;

-- Solo acepta el resultado de la reserva vigente. Una corrección manual tiene prioridad.
create or replace function public.ops_google_worker_complete(p_token text,p_key text,p_claim uuid,
  p_outcome text,p_miles numeric default null,p_hours numeric default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare attempts integer;
begin
  perform public.ops_require_google_worker(p_token);
  if p_outcome is null or p_outcome not in ('ok','no_route','retry','quota') then raise exception 'Resultado inválido'; end if;
  if p_outcome='ok' and (p_miles is null or p_hours is null
    or p_miles not between 0 and 6000 or p_hours not between 0 and 200) then raise exception 'Distancia inválida'; end if;
  perform 1 from public.original_google_worker_config where singleton for update;
  select r.google_attempts into attempts from public.original_routes r
    where r.route_key=p_key and r.google_claim_id=p_claim and r.google_miles is null
      and r.google_lease_until>now() for update;
  if not found then return false; end if;
  update public.original_routes set
    google_state=case when p_outcome='quota' then 'retry' else p_outcome end,
    google_miles=case when p_outcome='ok' then round(p_miles,1) else google_miles end,
    google_hours=case when p_outcome='ok' then round(p_hours,1) else google_hours end,
    google_at=case when p_outcome in ('ok','no_route') then now() else google_at end,
    google_by=null,
    google_last_error=case when p_outcome='ok' then '' else p_outcome end,
    google_next_attempt_at=now()+make_interval(hours=>case when p_outcome='quota' then 1
      else least(24,power(2,least(attempts-1,5))::integer) end),
    google_claim_id=null,google_lease_until=null
    where route_key=p_key;
  -- Un límite de cuota detiene también a otra ejecución que llegue durante los próximos 55 min.
  if p_outcome='quota' then
    update public.original_google_worker_config set paused_until=now()+interval '55 minutes',updated_at=now() where singleton;
  end if;
  return true;
end $$;

create or replace function public.ops_google_worker_status(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_google_worker(p_token);
  return jsonb_build_object(
    'pending',(select count(*) from public.original_routes where google_miles is null and google_state<>'no_route'),
    'missing_coordinates',(select count(*) from public.original_routes r where r.google_miles is null and r.google_state<>'no_route'
      and (not exists(select 1 from public.original_places where place_key=r.origin_key)
        or not exists(select 1 from public.original_places where place_key=r.destination_key))),
    'completed',(select count(*) from public.original_routes where google_miles is not null),
    'no_route',(select count(*) from public.original_routes where google_state='no_route' and google_miles is null),
    'paused_until',(select paused_until from public.original_google_worker_config where singleton));
end $$;

-- El recálculo explícito de Admin conserva su función y cancela cualquier reserva anterior.
create or replace function public.ops_original_google_route(p_key text,p_miles numeric,p_hours numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_staff(true);
  if p_miles is null or p_hours is null or p_miles not between 0 and 6000 or p_hours not between 0 and 200
    then raise exception 'Distancia inválida'; end if;
  update public.original_routes set google_miles=round(p_miles,1),google_hours=round(p_hours,1),google_at=now(),
    google_by=auth.uid(),google_state='ok',google_last_error='',google_claim_id=null,google_lease_until=null where route_key=p_key;
  if not found then raise exception 'Trayecto no encontrado'; end if;
end $$;

-- La clave pública de Supabase no basta: las tres RPC exigen además el secreto privado del proceso.
revoke all on function public.ops_google_worker_claim(text,integer),
  public.ops_google_worker_complete(text,text,uuid,text,numeric,numeric),public.ops_google_worker_status(text)
  from public,anon,authenticated;
grant execute on function public.ops_google_worker_claim(text,integer),
  public.ops_google_worker_complete(text,text,uuid,text,numeric,numeric),public.ops_google_worker_status(text) to anon;



-- Archivo: 011_queries_and_revisions.sql
-- CONSULTAS ACOTADAS, REVISIONES E INTEGRIDAD DE RESPALDOS.
-- Aplicar completo después de 010. No elimina ni reescribe datos operativos.
-- Gerencia puede consultar; las escrituras siguen exigiendo ops_require_staff.
create or replace function public.ops_require_reader() returns void
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or coalesce(public.panel_role(),'') not in ('admin','csr','manager') then raise exception 'No tienes permiso para consultar el panel'; end if;
end $$;
revoke all on function public.ops_require_reader() from public,anon;
grant execute on function public.ops_require_reader() to authenticated;

-- Se redefine en la política operativa posterior. Nunca se autoriza por un filtro de pantalla.
create or replace function public.ops_can_read_load(p_load text,p_customer text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.panel_role() in ('admin','csr','manager'),false)
$$;
revoke all on function public.ops_can_read_load(text,text) from public,anon;
grant execute on function public.ops_can_read_load(text,text) to authenticated;

create sequence if not exists public.panel_revision_seq;
create table if not exists public.panel_revisions (
  area text primary key, revision bigint not null default 0
);
create table if not exists public.panel_load_versions (
  load text primary key, revision bigint not null, changed_at timestamptz not null default now()
);
create index if not exists panel_load_versions_revision on public.panel_load_versions(revision,load);
alter table public.panel_revisions enable row level security;
alter table public.panel_load_versions enable row level security;
revoke all on public.panel_revisions,public.panel_load_versions from public,anon,authenticated;
revoke all on sequence public.panel_revision_seq from public,anon,authenticated;

-- Serializar las marcas antes de escribir evita publicar una revisión que otra transacción aún no confirmó.
create or replace function public.ops_bump_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(607034);
  insert into public.panel_revisions(area,revision) values(TG_ARGV[0],nextval('public.panel_revision_seq'))
    on conflict(area) do update set revision=excluded.revision;
  return null;
end $$;
create or replace function public.ops_track_load_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare number text; stamp bigint;
begin
  select revision into stamp from public.panel_revisions where area='loads';
  number:=case when TG_OP='DELETE' then old.load else new.load end;
  insert into public.panel_load_versions(load,revision) values(number,stamp)
    on conflict(load) do update set revision=excluded.revision,changed_at=now();
  if TG_OP='UPDATE' and old.load is distinct from new.load then
    insert into public.panel_load_versions(load,revision) values(old.load,stamp)
      on conflict(load) do update set revision=excluded.revision,changed_at=now();
  end if;
  return null;
end $$;
do $$ declare item record; begin
  for item in select * from (values
    ('loads','loads'),('incidents','loads'),('profiles','personas'),('customer_assignments','personas'),
    ('load_followers','personas'),('user_following','personas'),('comments','comentarios'),
    ('pending_loads','pendientes'),('pending_load_comments','comentarios'),('shift_tasks','bitacora'),
    ('reserved_loads','apartados'),('reserved_load_history','apartados'),('shift_closures','cierres'),
    ('original_places','radar'),('original_routes','radar'),('original_radar','radar'),
    ('original_preferences','preferencias'),('import_batches','importaciones'),('import_rows','importaciones'),
    ('communications','comunicaciones'),('message_templates','preferencias'),('portal_access','personas'),
    ('admin_events','administracion'),('geo_places','radar'),('radar_sources','radar'),
    ('load_history','historial'),('shift_task_history','historial'),('pending_load_history','historial')
  ) as revisions(table_name,area) loop
    insert into public.panel_revisions(area,revision) values(item.area,nextval('public.panel_revision_seq')) on conflict do nothing;
    execute format('drop trigger if exists panel_revision on public.%I',item.table_name);
    execute format('create trigger panel_revision before insert or update or delete on public.%I for each statement execute function public.ops_bump_revision(%L)',item.table_name,item.area);
  end loop;
end $$;
drop trigger if exists panel_load_version on public.loads;
create trigger panel_load_version after insert or update or delete on public.loads for each row execute function public.ops_track_load_version();
drop trigger if exists panel_incident_version on public.incidents;
create trigger panel_incident_version after insert or update or delete on public.incidents for each row execute function public.ops_track_load_version();
insert into public.panel_load_versions(load,revision)
select load,(select revision from public.panel_revisions where area='loads') from public.loads on conflict do nothing;

create or replace function public.ops_original_marks() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_reader();
  return jsonb_build_object('ok',true,'marcas',(select coalesce(jsonb_object_agg(area,revision::text),'{}') from public.panel_revisions));
end $$;

-- Resumen explícito: no transferir procedencias y autores auxiliares de cada casilla en cada refresco.
create or replace function public.ops_load_summary(p public.loads) returns jsonb
language sql immutable set search_path='' as $$
  select to_jsonb(p) - array['bol_source','bol_manual_by','bol_manual_at','doda_source','doda_manual_by','doda_manual_at',
    'entry_source','entry_manual_by','entry_manual_at','sobre_listo_source','sobre_listo_manual_by','sobre_listo_manual_at',
    'archive_reason','archived_at','archived_by']
$$;

-- Paginación con marca superior fija. Las bajas se calculan a partir de identificadores ya conocidos por el cliente.
create or replace function public.ops_loads_delta(p_after bigint default 0,p_known text[] default '{}',
  p_cursor text default '',p_until bigint default null,p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path='' as $$
declare watermark bigint; result jsonb; next_cursor text; total integer; removed jsonb;
begin
  perform public.ops_require_reader();
  if p_after is null or p_after<0 or p_limit is null or p_limit not between 1 and 500 or cardinality(p_known)>20000 then raise exception 'Página de cargas no válida'; end if;
  select revision into watermark from public.panel_revisions where area='loads';
  watermark:=least(coalesce(p_until,watermark),watermark);
  select coalesce(jsonb_agg(item order by load),'[]'),max(load),count(*) into result,next_cursor,total from (
    select l.load,public.ops_load_summary(l)||jsonb_build_object('incidenciasCount',
      (select count(*) from public.incidents i where i.load=l.load and i.deleted_at is null)) as item
    from public.loads l join public.panel_load_versions v on v.load=l.load
    where not l.archived and public.ops_can_read_load(l.load,l.customer) and l.load>coalesce(p_cursor,'')
      and (p_after=0 or (v.revision>p_after and v.revision<=watermark))
    order by l.load limit p_limit
  ) page;
  select coalesce(jsonb_agg(number),'[]') into removed from unnest(p_known) number where not exists (
    select 1 from public.loads l where l.load=number and not l.archived and public.ops_can_read_load(l.load,l.customer)
  );
  return jsonb_build_object('ok',true,'full',p_after=0,'revision',watermark,'items',result,
    'removed',removed,'next',case when total=p_limit then next_cursor else null end);
end $$;

create or replace function public.ops_latest_comments() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_reader();
  return (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (
    (select distinct on(c.load) c.id,c.load,c.body,c.created_by,c.created_at from public.comments c
    join public.loads l on l.load=c.load where not l.archived and public.ops_can_read_load(l.load,l.customer)
    order by c.load,c.created_at desc,c.id desc)
    union all
    (select distinct on(c.pending_id) c.id,c.pending_id::text as load,c.body,c.created_by,c.created_at from public.pending_load_comments c
      join public.pending_loads p on p.id=c.pending_id where p.state='pending' order by c.pending_id,c.created_at desc,c.id desc)
  ) c);
end $$;
create or replace function public.ops_customer_communications(p_customer text,p_offset integer default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_reader();
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'Página no válida'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (
    select c.id,c.load,c.event_type,c.reason,c.actor,c.channel,c.notice_type,c.public_message,c.created_at
    from public.communications c join public.loads l on l.load=c.load
    where public.ops_customer_key(l.customer)=public.ops_customer_key(p_customer) and public.ops_can_read_load(l.load,l.customer)
    order by c.created_at desc,c.id desc offset p_offset limit p_limit
  ) c);
end $$;

-- POST con llaves evita URLs enormes y la descarga de todo el catálogo de ubicaciones.
create or replace function public.ops_places_by_keys(p_keys text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_reader();
  if p_keys is null or cardinality(p_keys)>200 then raise exception 'Hasta 200 ubicaciones por consulta'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.original_places p where place_key=any(p_keys));
end $$;
revoke all on function public.ops_places_by_keys(text[]) from public,anon;
grant execute on function public.ops_places_by_keys(text[]) to authenticated;

-- Resolver una sola cuenta sin recorrer el directorio. Solo la función Edge usa esta consulta.
create or replace function public.ops_find_account(p_identifier text,p_client boolean default false) returns setof public.profiles
language sql stable security definer set search_path='' as $$
  select * from public.profiles where (role='client')=p_client
    and (lower(trim(login_name))=lower(trim(p_identifier)) or lower(trim(display_name))=lower(trim(p_identifier)))
  order by id limit 2
$$;
revoke all on function public.ops_find_account(text,boolean) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.ops_find_account(text,boolean) to service_role;
  end if;
end $$;

-- Cada sentido conserva su medición: nunca se descarta A→B porque ya existe B→A.
create or replace function public.ops_original_routes(p_routes jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare item jsonb; saved integer:=0; affected integer;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes)>300 then raise exception 'Hasta 300 rutas por solicitud'; end if;
  perform pg_advisory_xact_lock(607032);
  for item in select value from jsonb_array_elements(p_routes) loop
    insert into public.original_routes(route_key,origin_key,destination_key,miles,hours,straight_miles,created_by)
    values((item->>'origen')||'>'||(item->>'destino'),item->>'origen',item->>'destino',
      round((item->>'millas')::numeric,1),round(coalesce((item->>'horas')::numeric,0),1),round(coalesce((item->>'recta')::numeric,0),1),auth.uid()) on conflict do nothing;
    get diagnostics affected=row_count; saved:=saved+affected;
  end loop;
  return saved;
end $$;

-- Índices asociados a consultas concretas. El ensayo EXPLAIN queda documentado con datos locales.
create index if not exists load_history_load_page on public.load_history(load,changed_at desc,id desc);
create index if not exists reserved_history_page on public.reserved_load_history(reserved_id,changed_at desc,id desc);
create index if not exists pending_comments_latest on public.pending_load_comments(pending_id,created_at desc,id desc);
create index if not exists comments_latest on public.comments(load,created_at desc,id desc);
create index if not exists original_routes_origin on public.original_routes(origin_key,route_key);
create index if not exists original_routes_recent on public.original_routes(created_at desc,route_key);
create index if not exists original_places_kind on public.original_places(kind,place_key);
create index if not exists shift_tasks_state_page on public.shift_tasks(state,created_at desc,id desc);
create index if not exists profiles_normalized_name on public.profiles(lower(trim(display_name)));
create index if not exists profiles_normalized_login on public.profiles(lower(trim(login_name)));

-- Lista completa de datos recuperables. Se excluyen Auth, intentos de acceso y el secreto del worker.
create or replace function public.ops_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'profiles','loads','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history',
  'reserved_loads','reserved_load_history','customer_assignments','load_followers','user_following','shift_tasks','shift_task_history',
  'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places',
  'original_places','original_routes','original_radar','original_preferences']::text[] $$;
create or replace function public.ops_backup_manifest() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_staff(true);
  return jsonb_build_object('format','panel-bajio-backup-v2','tables',public.ops_backup_tables(),
    'revisions',(select jsonb_object_agg(area,revision::text) from public.panel_revisions));
end $$;
create or replace function public.ops_backup_page(p_table text,p_offset integer default 0,p_limit integer default 500)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare ordering text;
begin
  perform public.ops_require_staff(true);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 or p_table is null or not(p_table=any(public.ops_backup_tables())) then raise exception 'Tabla o página de respaldo no permitida'; end if;
  ordering:=case p_table when 'loads' then 'load' when 'customer_assignments' then 'customer_key'
    when 'load_followers' then 'load,user_id' when 'user_following' then 'user_id,followed_user' when 'portal_access' then 'user_id'
    when 'geo_places' then 'place_key' when 'original_places' then 'place_key' when 'original_routes' then 'route_key'
    when 'original_radar' then 'singleton' when 'original_preferences' then 'user_id' when 'import_rows' then 'batch_id,load' else 'id' end;
  return query execute format('select to_jsonb(t) from public.%I t order by %s offset $1 limit $2',p_table,ordering) using p_offset,p_limit;
end $$;

revoke all on function public.ops_bump_revision(),public.ops_track_load_version(),public.ops_load_summary(public.loads),public.ops_backup_tables() from public,anon,authenticated;
revoke all on function public.ops_loads_delta(bigint,text[],text,bigint,integer),public.ops_latest_comments(),
 public.ops_customer_communications(text,integer,integer),public.ops_backup_manifest() from public,anon;
grant execute on function public.ops_loads_delta(bigint,text[],text,bigint,integer),public.ops_latest_comments(),
 public.ops_customer_communications(text,integer,integer),public.ops_backup_manifest() to authenticated;


-- Archivo: 012_turn_rules_and_tasks.sql
-- REGLAS CONFIGURABLES Y ORGANIZACIÓN DEL TURNO. Requiere 011.
-- Predeterminados: CSR consulta toda la operación; sin correo ni borrado automáticos.
create table if not exists public.panel_settings (
  singleton boolean primary key default true check(singleton),
  csr_visibility text not null default 'all' check(csr_visibility='all'),
  status_transitions jsonb not null default '{}' check(jsonb_typeof(status_transitions)='object'),
  escalation_enabled boolean not null default false,
  escalation_hours integer not null default 24 check(escalation_hours between 1 and 720),
  supervisor_id uuid references public.profiles(id),
  external_alerts_enabled boolean not null default false,
  alert_channel text not null default 'disabled' check(alert_channel in ('disabled','google_email')),
  archive_days integer check(archive_days between 30 and 3650),
  import_retention_days integer check(import_retention_days between 30 and 3650),
  updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
insert into public.panel_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.customer_aliases (
  alias_key text primary key, alias text not null check(length(trim(alias)) between 1 and 500),
  canonical_name text not null check(length(trim(canonical_name)) between 1 and 500),
  updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  check(alias_key=public.ops_customer_key(alias))
);
create table if not exists public.vg_contacts (
  id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),
  company text not null default 'VG' check(length(company)<=200),phone text not null default '' check(length(phone)<=100),
  email text not null default '' check(length(email)<=320),note text not null default '' check(length(note)<=1000),
  active boolean not null default true,created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.task_checklist_templates (
  id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50),
  created_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
create table if not exists public.task_schedules (
  id uuid primary key default gen_random_uuid(),load text references public.loads(load),
  note text not null check(length(trim(note)) between 1 and 9500),assigned_to uuid not null references public.profiles(id),
  cadence text not null check(cadence in ('daily','weekly')),weekdays integer[] not null default '{1,2,3,4,5}',
  local_time time not null,timezone text not null default 'America/Mexico_City' check(timezone='America/Mexico_City'),
  next_run_at timestamptz not null,active boolean not null default true,
  checklist_id uuid references public.task_checklist_templates(id),created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6])
);
alter table public.shift_tasks add column if not exists schedule_id uuid references public.task_schedules(id);
alter table public.shift_tasks add column if not exists scheduled_for timestamptz;
alter table public.shift_tasks add column if not exists cancel_reason text not null default '';
create unique index if not exists task_schedule_occurrence on public.shift_tasks(schedule_id,scheduled_for) where schedule_id is not null;
create table if not exists public.task_checklist_items (
  task_id uuid not null references public.shift_tasks(id),item_id uuid not null default gen_random_uuid(),
  label text not null check(length(trim(label)) between 1 and 500),required boolean not null default true,
  done boolean not null default false,done_by uuid references public.profiles(id),done_at timestamptz,
  position integer not null,primary key(task_id,item_id),check(done=(done_at is not null)),check(done=(done_by is not null))
);
create table if not exists public.task_dependencies (
  task_id uuid not null references public.shift_tasks(id),depends_on uuid not null references public.shift_tasks(id),
  primary key(task_id,depends_on),check(task_id<>depends_on)
);
create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),recipient uuid not null references public.profiles(id),
  task_id uuid references public.shift_tasks(id),load text references public.loads(load),
  kind text not null check(kind in ('task_due','escalation','load_review')),message text not null,
  dedupe_key text not null unique,created_at timestamptz not null default now(),read_at timestamptz,
  emailed_at timestamptz,claim_id uuid,lease_until timestamptz,attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),last_error text not null default ''
);
create index if not exists operational_alerts_recipient on public.operational_alerts(recipient,created_at desc);
create index if not exists operational_alerts_unsent on public.operational_alerts(next_attempt_at) where emailed_at is null;
create index if not exists task_schedules_due on public.task_schedules(next_run_at) where active;
alter table public.reserved_loads add column if not exists related_load text references public.loads(load);
alter table public.reserved_loads add column if not exists free_reference text not null default '' check(length(free_reference)<=500);
alter table public.reserved_loads add column if not exists vg_contact_id uuid references public.vg_contacts(id);
alter table public.loads add column if not exists cancel_reason text not null default '';
alter table public.pending_loads add column if not exists cancel_reason text not null default '';
alter table public.shift_closures add column if not exists critical_pending text not null default '';
alter table public.shift_closures add column if not exists responsible_id uuid references public.profiles(id);
alter table public.shift_closures add column if not exists next_action text not null default '';

-- Lecturas y escrituras tienen contratos diferentes. Ninguna tabla nueva admite escritura directa.
do $$ declare name text; begin
  foreach name in array array['panel_settings','customer_aliases','vg_contacts','task_checklist_templates','task_schedules','task_checklist_items','task_dependencies','operational_alerts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('drop policy if exists panel_staff_read on public.%I',name);
    execute format('create policy panel_staff_read on public.%I for select to authenticated using (public.panel_role() in (''admin'',''csr'',''manager''))',name);
    execute format('grant select on public.%I to authenticated',name);
  end loop;
end $$;
drop policy if exists panel_staff_read on public.operational_alerts;
drop policy if exists panel_alert_read on public.operational_alerts;
create policy panel_alert_read on public.operational_alerts for select to authenticated using(recipient=auth.uid() and public.panel_role() in ('admin','csr','manager'));
grant update(cancel_reason) on public.loads to authenticated;

create or replace function public.ops_canonical_customer(p_name text) returns text
language sql stable security definer set search_path='' as $$
  select coalesce((select canonical_name from public.customer_aliases where alias_key=public.ops_customer_key(p_name)),trim(coalesce(p_name,'')))
$$;
create or replace function public.ops_guard_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare allowed jsonb;
begin
  if TG_OP='INSERT' or new.customer is distinct from old.customer then new.customer:=public.ops_canonical_customer(new.customer); end if;
  if TG_OP='UPDATE' and new.status is distinct from old.status then
    select status_transitions->old.status into allowed from public.panel_settings where singleton;
    if allowed is not null and (jsonb_typeof(allowed)<>'array' or not(allowed ? new.status)) then
      raise exception 'Ese avance no está permitido por las reglas del panel';
    end if;
  end if;
  if (TG_OP='INSERT' or new.status is distinct from old.status) and lower(rtrim(trim(new.status),'.'))='cancelado'
    and length(trim(coalesce(new.cancel_reason,''))) not between 3 and 1000 then raise exception 'Indica el motivo de cancelación (3 a 1000 caracteres)'; end if;
  return new;
end $$;
drop trigger if exists zz_panel_status on public.loads;
create trigger zz_panel_status before insert or update on public.loads for each row execute function public.ops_guard_status();

create or replace function public.ops_save_panel_settings(p_values jsonb,p_version timestamptz) returns public.panel_settings
language plpgsql security definer set search_path='' as $$
declare saved public.panel_settings; item record; supervisor uuid;
begin
  perform public.ops_require_staff(true);
  select * into saved from public.panel_settings where singleton for update;
  if saved.updated_at is distinct from p_version then raise exception 'Las reglas cambiaron; vuelve a cargarlas'; end if;
  supervisor:=nullif(p_values->>'supervisor_id','')::uuid;
  if supervisor is not null and not exists(select 1 from public.profiles where id=supervisor and active and role='admin') then raise exception 'Elige una cuenta administrativa para la supervisión'; end if;
  if jsonb_typeof(coalesce(p_values->'status_transitions','{}'))<>'object' then raise exception 'Transiciones no válidas'; end if;
  for item in select * from jsonb_each(coalesce(p_values->'status_transitions','{}')) loop
    if length(item.key)>100 or jsonb_typeof(item.value)<>'array' or jsonb_array_length(item.value)>50 then raise exception 'Transiciones no válidas'; end if;
  end loop;
  update public.panel_settings set status_transitions=coalesce(p_values->'status_transitions','{}'),
    escalation_enabled=coalesce((p_values->>'escalation_enabled')::boolean,false),
    escalation_hours=coalesce((p_values->>'escalation_hours')::integer,24),supervisor_id=supervisor,
    external_alerts_enabled=coalesce((p_values->>'external_alerts_enabled')::boolean,false),
    alert_channel=coalesce(p_values->>'alert_channel','disabled'),
    archive_days=nullif(p_values->>'archive_days','')::integer,import_retention_days=nullif(p_values->>'import_retention_days','')::integer,
    updated_by=auth.uid(),updated_at=now() where singleton returning * into saved;
  if saved.external_alerts_enabled and saved.alert_channel='disabled' then raise exception 'Elige un canal antes de activar el envío'; end if;
  if saved.escalation_enabled and saved.supervisor_id is null then raise exception 'Elige a quién se escalarán los pendientes'; end if;
  perform public.ops_log_admin('panel_settings_saved',jsonb_build_object('settings',to_jsonb(saved)));
  return saved;
end $$;
create or replace function public.ops_save_customer_alias(p_alias text,p_canonical text) returns void
language plpgsql security definer set search_path='' as $$
declare key text:=public.ops_customer_key(p_alias);
begin
  perform public.ops_require_staff(true);
  if length(trim(p_alias)) not between 1 and 500 or length(trim(p_canonical)) not between 1 and 500 then raise exception 'Indica alias y nombre del cliente'; end if;
  if exists(select 1 from public.customer_aliases where alias_key=public.ops_customer_key(p_canonical) and public.ops_customer_key(canonical_name)<>public.ops_customer_key(p_canonical)) then raise exception 'Usa un nombre principal, no otro alias'; end if;
  if exists(select 1 from public.customer_aliases where public.ops_customer_key(canonical_name)=key and public.ops_customer_key(p_canonical)<>key) then raise exception 'Ese nombre ya es principal de otros alias'; end if;
  if exists(select 1 from public.customer_assignments a join public.customer_assignments b on a.owner_id<>b.owner_id
    where a.customer_key=key and b.customer_key=public.ops_customer_key(p_canonical)) then raise exception 'Los nombres tienen CSR distintos. Resuelve la asignación antes de unirlos'; end if;
  insert into public.customer_aliases(alias_key,alias,canonical_name,updated_by) values(key,trim(p_alias),trim(p_canonical),auth.uid())
    on conflict(alias_key) do update set alias=excluded.alias,canonical_name=excluded.canonical_name,updated_by=auth.uid(),updated_at=now();
  -- Un nombre nuevo hereda el mismo CSR; nunca cambia las asignaciones que ya existen.
  insert into public.customer_assignments(customer,owner_id,updated_by)
    select trim(p_canonical),owner_id,auth.uid() from public.customer_assignments where customer_key=key
    on conflict(customer_key) do nothing;
  perform public.ops_log_admin('customer_alias_saved',jsonb_build_object('alias',p_alias,'canonical',p_canonical));
end $$;
create or replace function public.ops_save_vg_contact(p_id uuid,p_version timestamptz,p_values jsonb) returns public.vg_contacts
language plpgsql security definer set search_path='' as $$
declare saved public.vg_contacts;
begin
  perform public.ops_require_staff();
  if p_id is not null then
    select * into saved from public.vg_contacts where id=p_id for update;
    if not found or saved.updated_at is distinct from p_version then raise exception 'El contacto cambió; actualiza la agenda'; end if;
  end if;
  if coalesce(p_values->>'email','')<>'' and (p_values->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Revisa el correo del contacto'; end if;
  insert into public.vg_contacts(id,name,company,phone,email,note,active,created_by)
  values(coalesce(p_id,gen_random_uuid()),trim(p_values->>'name'),coalesce(p_values->>'company','VG'),coalesce(p_values->>'phone',''),coalesce(p_values->>'email',''),coalesce(p_values->>'note',''),coalesce((p_values->>'active')::boolean,true),auth.uid())
  on conflict(id) do update set name=excluded.name,company=excluded.company,phone=excluded.phone,email=excluded.email,note=excluded.note,active=excluded.active,updated_at=now() returning * into saved;
  return saved;
end $$;
create or replace function public.ops_save_reserved_details(p_id uuid,p_version timestamptz,p_values jsonb) returns public.reserved_loads
language plpgsql security definer set search_path='' as $$
declare saved public.reserved_loads; before_extra jsonb; related text:=nullif(trim(p_values->>'related_load'),''); old_related text; old_contact uuid;
begin
  perform public.ops_require_staff();
  select related_load,vg_contact_id into old_related,old_contact from public.reserved_loads where id=p_id;
  if related is distinct from old_related and related is not null and not exists(select 1 from public.loads where load=related and not archived and lower(rtrim(trim(status),'.')) not in ('delivered','completed','entregado','completado','cancelado','tonu')) then raise exception 'Elige una carga activa para relacionar'; end if;
  if nullif(p_values->>'vg_contact_id','')::uuid is distinct from old_contact and nullif(p_values->>'vg_contact_id','') is not null and not exists(select 1 from public.vg_contacts where id=(p_values->>'vg_contact_id')::uuid and active) then raise exception 'El contacto ya no está activo'; end if;
  saved:=public.save_reserved_load(p_values,p_id,p_version);
  before_extra:=to_jsonb(saved);
  update public.reserved_loads set related_load=related,free_reference=coalesce(p_values->>'free_reference',''),vg_contact_id=nullif(p_values->>'vg_contact_id','')::uuid
    where id=saved.id returning * into saved;
  if to_jsonb(saved) is distinct from before_extra then
    insert into public.reserved_load_history(reserved_id,event,note,actor,before_data,after_data)
    values(saved.id,'edited','Actualizó la carga relacionada o contacto VG',auth.uid(),before_extra,to_jsonb(saved));
  end if;
  return saved;
end $$;

create or replace function public.ops_save_checklist(p_id uuid,p_version timestamptz,p_name text,p_items jsonb) returns public.task_checklist_templates
language plpgsql security definer set search_path='' as $$
declare saved public.task_checklist_templates; item jsonb;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Agrega entre 1 y 50 pasos'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if length(trim(coalesce(item->>'label',''))) not between 1 and 500 then raise exception 'Describe cada paso del checklist'; end if;
  end loop;
  if p_id is not null then
    select * into saved from public.task_checklist_templates where id=p_id for update;
    if not found or saved.updated_at is distinct from p_version or not(public.panel_role()='admin' or saved.created_by=auth.uid()) then raise exception 'La plantilla cambió o no puedes editarla'; end if;
  end if;
  insert into public.task_checklist_templates(id,name,items,created_by) values(coalesce(p_id,gen_random_uuid()),trim(p_name),p_items,auth.uid())
    on conflict(id) do update set name=excluded.name,items=excluded.items,updated_at=now() returning * into saved;
  return saved;
end $$;
create or replace function public.ops_attach_checklist(p_task uuid,p_version timestamptz,p_template uuid) returns void
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks; template public.task_checklist_templates; item jsonb; i integer:=0;
begin
  task:=public.ops_lock_task(p_task,p_version);
  select * into template from public.task_checklist_templates where id=p_template;
  if not found or task.state<>'open' then raise exception 'Elige una plantilla y una tarea abierta'; end if;
  if exists(select 1 from public.task_checklist_items where task_id=p_task) then raise exception 'La tarea ya tiene checklist'; end if;
  for item in select value from jsonb_array_elements(template.items) loop
    insert into public.task_checklist_items(task_id,label,required,position) values(p_task,trim(item->>'label'),coalesce((item->>'required')::boolean,true),i);i:=i+1;
  end loop;
  update public.shift_tasks set updated_at=now() where id=p_task;
  insert into public.shift_task_history(task_id,event,actor,after_data) values(p_task,'checklist_added',auth.uid(),jsonb_build_object('template',template.name));
end $$;
create or replace function public.ops_check_task_item(p_task uuid,p_item uuid,p_done boolean) returns void
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks;
begin
  perform public.ops_require_staff();
  select * into task from public.shift_tasks where id=p_task for update;
  if not found or task.state<>'open' or not coalesce(public.ops_task_access(task.created_by,task.assigned_to,task.assigned_csr),false) then raise exception 'La tarea no está abierta o no tienes acceso'; end if;
  update public.task_checklist_items set done=p_done,done_by=case when p_done then auth.uid() end,done_at=case when p_done then now() end where task_id=p_task and item_id=p_item;
  if not found then raise exception 'El paso ya no existe'; end if;
  update public.shift_tasks set updated_at=now() where id=p_task;
  insert into public.shift_task_history(task_id,event,actor,after_data) values(p_task,'checklist_changed',auth.uid(),jsonb_build_object('item',p_item,'done',p_done));
end $$;
create or replace function public.ops_set_task_dependency(p_task uuid,p_version timestamptz,p_depends uuid,p_add boolean) returns void
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks; other public.shift_tasks;
begin
  -- Serializa la comprobación de ciclos: dos altas simultáneas no pueden crear A→B→A.
  perform pg_advisory_xact_lock(607035);
  task:=public.ops_lock_task(p_task,p_version);
  select * into other from public.shift_tasks where id=p_depends;
  if not found or task.state<>'open' or not coalesce(public.ops_task_access(other.created_by,other.assigned_to,other.assigned_csr),false) then raise exception 'No puedes relacionar esas tareas'; end if;
  if p_add then
    if p_task=p_depends or exists(with recursive chain(id) as (select p_depends union select d.depends_on from public.task_dependencies d join chain c on d.task_id=c.id) select 1 from chain where id=p_task) then raise exception 'Las tareas no pueden depender de sí mismas ni formar un ciclo'; end if;
    insert into public.task_dependencies(task_id,depends_on) values(p_task,p_depends) on conflict do nothing;
  else delete from public.task_dependencies where task_id=p_task and depends_on=p_depends;
  end if;
  update public.shift_tasks set updated_at=now() where id=p_task;
  insert into public.shift_task_history(task_id,event,actor,after_data) values(p_task,'dependency_changed',auth.uid(),jsonb_build_object('depends_on',p_depends,'added',p_add));
end $$;

create or replace function public.ops_change_task_state(p_id uuid,p_version timestamptz,p_state text,p_reason text default '')
returns public.shift_tasks language plpgsql security definer set search_path='' as $$
declare previous public.shift_tasks; saved public.shift_tasks;
begin
  previous:=public.ops_lock_task(p_id,p_version);
  if p_state is null or p_state not in ('open','resolved','cancelled') or previous.state='cancelled' or previous.state=p_state then raise exception 'Ese cambio no está permitido'; end if;
  if p_state='cancelled' and length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Indica el motivo de cancelar la tarea (3 a 1000 caracteres)'; end if;
  if p_state='resolved' and exists(select 1 from public.task_checklist_items where task_id=p_id and required and not done) then raise exception 'Completa los pasos obligatorios antes de resolver'; end if;
  if p_state='resolved' and exists(select 1 from public.task_dependencies d join public.shift_tasks t on t.id=d.depends_on where d.task_id=p_id and t.state<>'resolved') then raise exception 'Primero completa las tareas de las que depende'; end if;
  update public.shift_tasks set state=p_state,resolved_at=case when p_state='resolved' then now() end,
    cancel_reason=case when p_state='cancelled' then trim(p_reason) else cancel_reason end,updated_at=now()
    where id=p_id returning * into saved;
  insert into public.shift_task_history(task_id,event,actor,before_data,after_data) values(p_id,p_state,auth.uid(),to_jsonb(previous),to_jsonb(saved));
  return saved;
end $$;
create or replace function public.ops_set_task_state(p_id uuid,p_version timestamptz,p_state text) returns public.shift_tasks
language sql security definer set search_path='' as $$ select public.ops_change_task_state(p_id,p_version,p_state,'') $$;
create or replace function public.ops_task_details(p_id uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks;
begin
  select * into task from public.shift_tasks where id=p_id;
  if not found or not coalesce(public.ops_task_access(task.created_by,task.assigned_to,task.assigned_csr),false) then raise exception 'No puedes consultar esta tarea'; end if;
  if p_offset<0 then raise exception 'Página no válida'; end if;
  return jsonb_build_object('task',to_jsonb(task),'checklist',coalesce((select jsonb_agg(to_jsonb(i) order by position,item_id) from public.task_checklist_items i where task_id=p_id),'[]'),
    'dependencies',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'note',t.note,'state',t.state)) from public.task_dependencies d join public.shift_tasks t on t.id=d.depends_on
      where d.task_id=p_id and public.ops_task_access(t.created_by,t.assigned_to,t.assigned_csr)),'[]'),
    'history',coalesce((select jsonb_agg(to_jsonb(h)) from(select * from public.shift_task_history where task_id=p_id order by changed_at desc,id desc offset p_offset limit 50) h),'[]'));
end $$;

create or replace function public.ops_next_task_time(p_cadence text,p_weekdays integer[],p_time time,p_after timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare day date; candidate timestamptz; i integer;
begin
  for i in 0..7 loop
    day:=(p_after at time zone 'America/Mexico_City')::date+i;
    candidate:=(day+p_time) at time zone 'America/Mexico_City';
    if candidate>p_after and (p_cadence='daily' or extract(dow from day)::integer=any(p_weekdays)) then return candidate; end if;
  end loop;
  raise exception 'No se pudo calcular la próxima ejecución';
end $$;
create or replace function public.ops_save_task_schedule(p_id uuid,p_version timestamptz,p_values jsonb) returns public.task_schedules
language plpgsql security definer set search_path='' as $$
declare saved public.task_schedules; assignee uuid; load_number text; weekdays integer[]; cadence text; time_of_day time;
begin
  perform public.ops_require_staff();
  if p_id is not null then
    select * into saved from public.task_schedules where id=p_id for update;
    if not found or saved.updated_at is distinct from p_version or not(public.panel_role()='admin' or saved.created_by=auth.uid()) then raise exception 'La programación cambió o no puedes editarla'; end if;
  end if;
  assignee:=(p_values->>'assigned_to')::uuid;load_number:=nullif(trim(p_values->>'load'),'');
  if not exists(select 1 from public.profiles where id=assignee and active and role in ('admin','csr')) then raise exception 'Elige una persona activa del panel'; end if;
  if load_number is not null and not exists(select 1 from public.loads where load=load_number and not archived and lower(trim(status)) not in ('delivered','completed','entregado','completado','cancelado','cancelado.','tonu')) then raise exception 'La carga relacionada debe estar activa'; end if;
  cadence:=p_values->>'cadence'; time_of_day:=(p_values->>'local_time')::time;
  select array_agg(value::integer) into weekdays from jsonb_array_elements_text(coalesce(p_values->'weekdays','[1,2,3,4,5]'));
  insert into public.task_schedules(id,load,note,assigned_to,cadence,weekdays,local_time,next_run_at,active,checklist_id,created_by)
  values(coalesce(p_id,gen_random_uuid()),load_number,trim(p_values->>'note'),assignee,cadence,weekdays,time_of_day,
    public.ops_next_task_time(cadence,weekdays,time_of_day,now()),coalesce((p_values->>'active')::boolean,true),nullif(p_values->>'checklist_id','')::uuid,auth.uid())
  on conflict(id) do update set load=excluded.load,note=excluded.note,assigned_to=excluded.assigned_to,cadence=excluded.cadence,weekdays=excluded.weekdays,
    local_time=excluded.local_time,next_run_at=excluded.next_run_at,active=excluded.active,checklist_id=excluded.checklist_id,updated_at=now() returning * into saved;
  return saved;
end $$;

-- Los datos importados antiguos pueden contener una fecha libre: no detienen el lote.
-- Entregar sin POD o cerrar TONU sin recargos todavía deja trabajo operativo pendiente.
create or replace function public.ops_load_finalized(p public.loads) returns boolean
language sql immutable set search_path='' as $$ select coalesce((p).archived,false)
  or lower(rtrim(trim((p).status),'.'))='cancelado'
  or (lower(trim((p).status)) in ('delivered','completed','entregado','completado') and (p).pod_sent='true')
  or (lower(trim((p).status))='tonu' and (p).recargos_vg='true') $$;
create or replace function public.ops_safe_deadline(p_value text) returns timestamptz
language plpgsql stable set search_path='' as $$ begin return nullif(p_value,'')::timestamptz; exception when others then return null; end $$;
create or replace function public.ops_alert_current(a public.operational_alerts) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare t public.shift_tasks; l public.loads; c public.panel_settings; d text; k text;
begin
  if a.load is not null then
    select * into l from public.loads where load=a.load;
    if not found or public.ops_load_finalized(l) then return false; end if;
  end if;
  if a.task_id is not null then
    select * into t from public.shift_tasks where id=a.task_id;
    if not found or t.state<>'open' or t.follow_up_at is null or t.follow_up_at>now() then return false; end if;
    if a.kind='task_due' then return a.recipient=coalesce(t.assigned_to,t.assigned_csr) and a.dedupe_key='task:'||t.id::text||':'||t.follow_up_at::text; end if;
    select * into c from public.panel_settings where singleton;
    return c.escalation_enabled and a.recipient=c.supervisor_id and exists(select 1 from public.profiles where id=c.supervisor_id and active and role='admin') and t.follow_up_at+make_interval(hours=>c.escalation_hours)<=now() and a.dedupe_key='escalation:'||t.id::text||':'||t.follow_up_at::text||':'||c.supervisor_id::text;
  end if;
  foreach k in array array['revision_operativa','seguimiento_personal'] loop
    d:=case k when 'revision_operativa' then l.recordatorio_fecha else l.next_review_at end;
    if public.ops_safe_deadline(d)<=now() and a.dedupe_key='review:'||l.load||':'||k||':'||d||':'||a.recipient::text then
      return exists(select 1 from public.load_followers where load=l.load and user_id=a.recipient)
        or exists(select 1 from public.customer_assignments where owner_id=a.recipient and public.ops_customer_key(public.ops_canonical_customer(customer))=public.ops_customer_key(public.ops_canonical_customer(l.customer)))
        or (k='seguimiento_personal' and exists(select 1 from public.profiles where id=a.recipient and l.next_review_by in(id::text,display_name)));
    end if;
  end loop;
  return false;
end $$;
create or replace function public.ops_visible_alerts() returns setof public.operational_alerts
language sql stable security definer set search_path='' as $$
  select a.* from public.operational_alerts a where recipient=auth.uid() and public.panel_role() in ('admin','csr','manager') and read_at is null and public.ops_alert_current(a) order by created_at desc,id limit 100
$$;
-- Solo el worker limitado o Admin invocan esta tarea. Una ejecución tardía genera una ocurrencia,
-- avanza al próximo horario futuro y no inunda el turno con días de tareas omitidas.
create or replace function public.ops_tick_tasks_internal() returns jsonb
language plpgsql security definer set search_path='' as $$
declare schedule public.task_schedules; task public.shift_tasks; step jsonb; pos integer; config public.panel_settings; generated integer:=0; added integer:=0;
begin
  select * into config from public.panel_settings where singleton;
  for schedule in select * from public.task_schedules where active and next_run_at<=now() order by next_run_at limit 20 for update skip locked loop
    if schedule.load is not null and not exists(select 1 from public.loads where load=schedule.load and not archived and lower(trim(status)) not in ('delivered','completed','entregado','completado','cancelado','cancelado.','tonu')) then
      update public.task_schedules set active=false,updated_at=now() where id=schedule.id;continue;
    end if;
    if not exists(select 1 from public.profiles where id=schedule.assigned_to and active and role in ('admin','csr')) then update public.task_schedules set active=false,updated_at=now() where id=schedule.id;continue; end if;
    insert into public.shift_tasks(load,note,assigned_to,shift,created_by,follow_up_at,schedule_id,scheduled_for)
    values(schedule.load,schedule.note,schedule.assigned_to,public.ops_shift(now()),schedule.created_by,schedule.next_run_at+interval '1 day',schedule.id,schedule.next_run_at)
    on conflict(schedule_id,scheduled_for) where schedule_id is not null do nothing returning * into task;
    if found then
      generated:=generated+1;pos:=0;
      if schedule.checklist_id is not null then
        for step in select value from public.task_checklist_templates t cross join lateral jsonb_array_elements(t.items) where t.id=schedule.checklist_id loop
          insert into public.task_checklist_items(task_id,label,required,position) values(task.id,step->>'label',coalesce((step->>'required')::boolean,true),pos);pos:=pos+1;
        end loop;
      end if;
      insert into public.shift_task_history(task_id,event,actor,after_data) values(task.id,'scheduled',schedule.created_by,to_jsonb(task));
    end if;
    update public.task_schedules set next_run_at=public.ops_next_task_time(cadence,weekdays,local_time,now()),updated_at=now() where id=schedule.id;
  end loop;
  insert into public.operational_alerts(recipient,task_id,load,kind,message,dedupe_key)
  select coalesce(t.assigned_to,t.assigned_csr),t.id,t.load,'task_due','Tienes una tarea vencida: '||left(t.note,200),
    'task:'||t.id::text||':'||t.follow_up_at::text
  from public.shift_tasks t join public.profiles p on p.id=coalesce(t.assigned_to,t.assigned_csr)
  where t.state='open' and t.follow_up_at<=now() and p.active
    and not exists(select 1 from public.operational_alerts a where a.dedupe_key='task:'||t.id::text||':'||t.follow_up_at::text)
    order by t.follow_up_at,t.id limit 200 on conflict(dedupe_key) do nothing;
  get diagnostics added=row_count;
  if config.escalation_enabled and exists(select 1 from public.profiles where id=config.supervisor_id and active and role='admin') then
    insert into public.operational_alerts(recipient,task_id,load,kind,message,dedupe_key)
    select config.supervisor_id,t.id,t.load,'escalation','Revisar tarea sin atender: '||left(t.note,200),
      'escalation:'||t.id::text||':'||t.follow_up_at::text||':'||config.supervisor_id::text
    from public.shift_tasks t where t.state='open' and t.follow_up_at+make_interval(hours=>config.escalation_hours)<=now()
    and not exists(select 1 from public.operational_alerts a where a.dedupe_key='escalation:'||t.id::text||':'||t.follow_up_at::text||':'||config.supervisor_id::text)
    order by t.follow_up_at,t.id limit 200 on conflict(dedupe_key) do nothing;
  end if;
  -- Cada plazo es independiente: leer el aviso no modifica ni completa el recordatorio.
  insert into public.operational_alerts(recipient,load,kind,message,dedupe_key)
  select distinct p.id,l.load,'load_review','Revisar la carga '||l.load||': '||due.kind,
    'review:'||l.load||':'||due.kind||':'||due.deadline||':'||p.id::text
  from public.loads l
  cross join lateral (values('revision_operativa',nullif(l.recordatorio_fecha,'')),('seguimiento_personal',nullif(l.next_review_at,''))) due(kind,deadline)
  cross join lateral (
    select user_id as id from public.load_followers where load=l.load
    union select owner_id from public.customer_assignments where public.ops_customer_key(public.ops_canonical_customer(customer))=public.ops_customer_key(public.ops_canonical_customer(l.customer))
    union select id from public.profiles where due.kind='seguimiento_personal' and l.next_review_by in (id::text,display_name)
  ) recipients
  join public.profiles p on p.id=recipients.id and p.active and p.role in ('admin','csr')
  where not public.ops_load_finalized(l)
    and due.deadline is not null and public.ops_safe_deadline(due.deadline)<=now()
    and not exists(select 1 from public.operational_alerts a where a.dedupe_key='review:'||l.load||':'||due.kind||':'||due.deadline||':'||p.id::text)
  limit 200
  on conflict(dedupe_key) do nothing;
  return jsonb_build_object('generated',generated,'task_alerts',added);
end $$;
create or replace function public.ops_run_task_automation() returns jsonb
language plpgsql security definer set search_path='' as $$ begin perform public.ops_require_staff(true);return public.ops_tick_tasks_internal();end $$;
create or replace function public.ops_worker_task_tick(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin perform public.ops_require_google_worker(p_token);return public.ops_tick_tasks_internal();end $$;
create or replace function public.ops_read_operational_alert(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_staff();
  update public.operational_alerts set read_at=coalesce(read_at,now()) where id=p_id and recipient=auth.uid();
  if not found then raise exception 'El aviso no está disponible'; end if;
end $$;

create or replace function public.ops_claim_alert_emails(p_token text,p_limit integer default 20)
returns table(id uuid,claim_id uuid,email text,message text) language plpgsql security definer set search_path='' as $$
declare item record; claim uuid;
begin
  perform public.ops_require_google_worker(p_token);
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'Hasta 20 avisos por lote'; end if;
  if not exists(select 1 from public.panel_settings where singleton and external_alerts_enabled and alert_channel='google_email') then return; end if;
  for item in select a.id,p.contact_email,a.message from public.operational_alerts a join public.profiles p on p.id=a.recipient
    where a.emailed_at is null and a.read_at is null and a.next_attempt_at<=now() and (a.lease_until is null or a.lease_until<now()) and a.attempts<5
      and p.active and p.role in ('admin','csr','manager') and p.contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and public.ops_alert_current(a)
    order by a.created_at,a.id limit p_limit for update of a skip locked loop
    claim:=gen_random_uuid();
    update public.operational_alerts a set claim_id=claim,lease_until=now()+interval '10 minutes',attempts=attempts+1 where a.id=item.id;
    id:=item.id;claim_id:=claim;email:=item.contact_email;message:=item.message;return next;
  end loop;
end $$;
create or replace function public.ops_finish_alert_email(p_token text,p_id uuid,p_claim uuid,p_sent boolean,p_error text default '') returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_google_worker(p_token);
  update public.operational_alerts set emailed_at=case when p_sent then now() end,claim_id=null,lease_until=null,
    next_attempt_at=now()+make_interval(hours=>least(24,power(2,attempts)::integer)),
    last_error=case when p_sent then '' else left(p_error,100) end
  where id=p_id and claim_id=p_claim and lease_until>now() and emailed_at is null;
  return found;
end $$;

create or replace function public.change_reserved_load_state(
  p_id uuid, p_version timestamptz, p_state text, p_note text default ''
) returns public.reserved_loads language plpgsql security definer set search_path = '' as $$
declare previous public.reserved_loads; saved public.reserved_loads; allowed text[];
begin
  if p_state='liberado' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Escribe el motivo de liberar el apartado'; end if;
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
create or replace function public.ops_bulk_loads(p_items jsonb, p_values jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare item jsonb; record public.loads; assignments text; field_name text; total integer := 0;
begin
  perform public.ops_require_staff();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 cargas'; end if;
  if exists (select value ->> 'load' from jsonb_array_elements(p_items) group by value ->> 'load' having count(*) > 1) then raise exception 'La selección contiene cargas duplicadas'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}' then raise exception 'Elige los cambios'; end if;
  for field_name in select jsonb_object_keys(p_values) loop
    if field_name not in ('cancel_reason','status','recordatorio_fecha','pod_sent','recargos_vg','color','bol','doda','entry','sobre_listo') then raise exception 'Campo masivo no permitido'; end if;
  end loop;
  select string_agg(format('%I=(jsonb_populate_record(null::public.loads,$1)).%I', key, key), ',') into assignments from jsonb_object_keys(p_values) keys(key);
  for item in select value from jsonb_array_elements(p_items) order by value ->> 'load' loop
    select * into record from public.loads where load = item ->> 'load' and not archived for update;
    if not found or record.updated_at is distinct from (item ->> 'updated_at')::timestamptz then raise exception 'Una carga cambió. Actualiza la selección'; end if;
    execute format('update public.loads set %s where load=$2', assignments) using p_values, record.load;
    total := total + 1;
  end loop;
  return total;
end;
$$;
-- Cancelar o retirar requiere motivo. No se borran expedientes desde estas acciones.
create or replace function public.ops_cancel_pending_reason(p_id uuid,p_version timestamptz,p_reason text) returns public.pending_loads
language plpgsql security definer set search_path='' as $$
declare saved public.pending_loads;
begin
  perform public.ops_require_staff();
  select * into saved from public.pending_loads where id=p_id for update;
  if not found or saved.updated_at is distinct from p_version or saved.state<>'pending'
    or not(public.panel_role()='admin' or saved.created_by=auth.uid()) then raise exception 'La solicitud cambió o no puedes cancelarla'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Escribe el motivo de cancelar la solicitud'; end if;
  update public.pending_loads set state='cancelled',cancel_reason=trim(p_reason) where id=p_id returning * into saved;
  return saved;
end $$;
create or replace function public.ops_hide_reserved_reason(p_id uuid,p_version timestamptz,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.reserved_loads; saved public.reserved_loads;
begin
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Escribe el motivo de retirar el apartado'; end if;
  previous:=public.lock_reserved_load(p_id,p_version);
  update public.reserved_loads set hidden=true,state=case when state in ('usado','liberado') then state else 'liberado' end,
    next_review_at=null,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into saved;
  insert into public.reserved_load_history(reserved_id,event,note,actor,before_data,after_data)
    values(p_id,'edited',trim(p_reason),auth.uid(),to_jsonb(previous),to_jsonb(saved));
end $$;
-- Las funciones antiguas sin motivo ya no son rutas de escritura del frontend actualizado.
revoke execute on function public.cancel_pending_load(uuid,timestamptz),public.ops_hide_reserved(uuid,timestamptz) from authenticated;

create or replace function public.ops_save_structured_closure(p_body text,p_critical text,p_responsible uuid,p_next_action text) returns public.shift_closures
language plpgsql security definer set search_path='' as $$
declare saved public.shift_closures;
begin
  perform public.ops_require_staff();
  if length(trim(coalesce(p_critical,''))) not between 3 and 5000 or length(trim(coalesce(p_next_action,''))) not between 3 and 5000 then raise exception 'Indica los pendientes críticos y la siguiente acción; puedes escribir Sin pendientes'; end if;
  if not exists(select 1 from public.profiles where id=p_responsible and active and role in ('admin','csr')) then raise exception 'Elige quién recibe el seguimiento'; end if;
  insert into public.shift_closures(body,shift,created_by,critical_pending,responsible_id,next_action)
    values(p_body,public.ops_shift(now()),auth.uid(),trim(p_critical),p_responsible,trim(p_next_action)) returning * into saved;
  return saved;
end $$;
revoke execute on function public.ops_save_closure(text) from authenticated;

-- Política de retención explícita: no hay borrado programado. La vista previa y la ejecución son de Admin.
create or replace function public.ops_retention_preview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare config public.panel_settings;
begin
  perform public.ops_require_staff(true);select * into config from public.panel_settings where singleton;
  return jsonb_build_object('settings_version',config.updated_at,'revisions',(select jsonb_object_agg(area,revision::text) from public.panel_revisions),
    'archive_loads',(select coalesce(jsonb_agg(load order by load),'[]') from public.loads where not archived and config.archive_days is not null
      and updated_at<now()-make_interval(days=>config.archive_days)
      and ((lower(trim(status)) in ('delivered','completed','entregado','completado') and pod_sent='true') or (status='TONU' and recargos_vg='true'))),
    'prune_imports',(select coalesce(jsonb_agg(id order by id),'[]') from public.import_batches where config.import_retention_days is not null and created_at<now()-make_interval(days=>config.import_retention_days)));
end $$;
create or replace function public.ops_apply_retention(p_preview jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_plan jsonb; record_id text; archived_count integer:=0; import_count integer:=0;
begin
  perform public.ops_require_staff(true);perform pg_advisory_xact_lock(607031);perform pg_advisory_xact_lock(607034);
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Describe el motivo del mantenimiento'; end if;
  current_plan:=public.ops_retention_preview();
  if current_plan is distinct from p_preview then raise exception 'Los datos o la política cambiaron. Genera otra vista previa'; end if;
  for record_id in select jsonb_array_elements_text(current_plan->'archive_loads') loop
    update public.loads set archived=true,archive_reason='retencion: '||trim(p_reason),archived_at=now(),archived_by=auth.uid() where load=record_id;
    archived_count:=archived_count+1;
  end loop;
  for record_id in select jsonb_array_elements_text(current_plan->'prune_imports') loop
    delete from public.import_rows where batch_id=record_id::uuid;
    delete from public.import_batches where id=record_id::uuid;
    import_count:=import_count+1;
  end loop;
  perform public.ops_log_admin('manual_retention_applied',jsonb_build_object('archived',archived_count,'imports_pruned',import_count,'reason',trim(p_reason)));
  return jsonb_build_object('archived',archived_count,'imports_pruned',import_count);
end $$;

-- Reforzar privacidad de tareas, sin quitar a los CSR la consulta de todas las cargas.
drop policy if exists panel_staff_read on public.task_schedules;
drop policy if exists task_schedule_read on public.task_schedules;
create policy task_schedule_read on public.task_schedules for select to authenticated using(public.panel_role() in ('admin','manager') or (public.panel_role()='csr' and auth.uid() in (created_by,assigned_to)));
drop policy if exists panel_staff_read on public.task_checklist_items;
drop policy if exists task_checklist_read on public.task_checklist_items;
create policy task_checklist_read on public.task_checklist_items for select to authenticated using(exists(select 1 from public.shift_tasks t where t.id=task_id and public.ops_task_access(t.created_by,t.assigned_to,t.assigned_csr)));
drop policy if exists panel_staff_read on public.task_dependencies;
drop policy if exists task_dependency_read on public.task_dependencies;
create policy task_dependency_read on public.task_dependencies for select to authenticated using(exists(select 1 from public.shift_tasks t where t.id=task_id and public.ops_task_access(t.created_by,t.assigned_to,t.assigned_csr)));

do $$ declare item record; begin
  for item in select * from(values('panel_settings','reglas'),('customer_aliases','personas'),('vg_contacts','contactos'),
    ('task_checklist_templates','bitacora'),('task_schedules','bitacora'),('task_checklist_items','bitacora'),('task_dependencies','bitacora'),('operational_alerts','avisos')) areas(table_name,area) loop
    insert into public.panel_revisions(area,revision) values(item.area,nextval('public.panel_revision_seq')) on conflict do nothing;
    execute format('drop trigger if exists panel_revision on public.%I',item.table_name);
    execute format('create trigger panel_revision before insert or update or delete on public.%I for each statement execute function public.ops_bump_revision(%L)',item.table_name,item.area);
  end loop;
end $$;
create or replace function public.ops_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'profiles','loads','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history',
  'vg_contacts','reserved_loads','reserved_load_history','customer_assignments','load_followers','user_following',
  'task_checklist_templates','task_schedules','shift_tasks','shift_task_history','task_checklist_items','task_dependencies',
  'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places',
  'original_places','original_routes','original_radar','original_preferences','panel_settings','customer_aliases','operational_alerts']::text[] $$;
-- Orden de exportación de tablas sin id, compatible con paginación estable y ensayos de restauración.
create or replace function public.ops_backup_page(p_table text,p_offset integer default 0,p_limit integer default 500)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare ordering text;
begin
  perform public.ops_require_staff(true);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 or p_table is null or not(p_table=any(public.ops_backup_tables())) then raise exception 'Tabla o página de respaldo no permitida'; end if;
  ordering:=case p_table when 'loads' then 'load' when 'customer_assignments' then 'customer_key'
    when 'load_followers' then 'load,user_id' when 'user_following' then 'user_id,followed_user' when 'portal_access' then 'user_id'
    when 'geo_places' then 'place_key' when 'original_places' then 'place_key' when 'original_routes' then 'route_key'
    when 'original_radar' then 'singleton' when 'original_preferences' then 'user_id' when 'import_rows' then 'batch_id,load'
    when 'panel_settings' then 'singleton' when 'customer_aliases' then 'alias_key' when 'task_checklist_items' then 'task_id,item_id'
    when 'task_dependencies' then 'task_id,depends_on' else 'id' end;
  return query execute format('select to_jsonb(t) from public.%I t order by %s offset $1 limit $2',p_table,ordering) using p_offset,p_limit;
end $$;

-- Ninguna función nueva queda ejecutable por PUBLIC por el privilegio predeterminado de PostgreSQL.
do $$ declare name text; begin
  foreach name in array array['ops_guard_status','ops_save_panel_settings','ops_save_customer_alias','ops_save_vg_contact','ops_save_reserved_details',
    'ops_save_checklist','ops_attach_checklist','ops_check_task_item','ops_set_task_dependency','ops_change_task_state','ops_task_details',
    'ops_load_finalized','ops_safe_deadline','ops_alert_current','ops_visible_alerts','ops_next_task_time','ops_save_task_schedule','ops_tick_tasks_internal','ops_run_task_automation','ops_worker_task_tick','ops_read_operational_alert',
    'ops_claim_alert_emails','ops_finish_alert_email','ops_cancel_pending_reason','ops_hide_reserved_reason','ops_save_structured_closure','ops_retention_preview','ops_apply_retention'] loop
    execute format('revoke all on function %s from public,anon,authenticated',
      (select oid::regprocedure::text from pg_proc where pronamespace='public'::regnamespace and proname=name));
  end loop;
end $$;
grant execute on function public.ops_canonical_customer(text) to authenticated;
revoke execute on function public.ops_canonical_customer(text) from public,anon;
grant execute on function public.ops_save_panel_settings(jsonb,timestamptz),public.ops_save_customer_alias(text,text),
  public.ops_save_vg_contact(uuid,timestamptz,jsonb),public.ops_save_reserved_details(uuid,timestamptz,jsonb),
  public.ops_save_checklist(uuid,timestamptz,text,jsonb),public.ops_attach_checklist(uuid,timestamptz,uuid),
  public.ops_check_task_item(uuid,uuid,boolean),public.ops_set_task_dependency(uuid,timestamptz,uuid,boolean),
  public.ops_change_task_state(uuid,timestamptz,text,text),public.ops_task_details(uuid,integer),
  public.ops_save_task_schedule(uuid,timestamptz,jsonb),public.ops_run_task_automation(),public.ops_read_operational_alert(uuid),
  public.ops_cancel_pending_reason(uuid,timestamptz,text),public.ops_hide_reserved_reason(uuid,timestamptz,text),
  public.ops_save_structured_closure(text,text,uuid,text),public.ops_retention_preview(),public.ops_apply_retention(jsonb,text) to authenticated;
grant execute on function public.ops_visible_alerts() to authenticated;
grant execute on function public.ops_worker_task_tick(text),public.ops_claim_alert_emails(text,integer),public.ops_finish_alert_email(text,uuid,uuid,boolean,text) to anon,authenticated;


-- Archivo: 013_punctual_pending.sql
-- PENDIENTES PUNTUALES. Requiere 012; puede ejecutarse de nuevo sin borrar datos.
-- Una señal compartida por carga. No modifica estatus, citas ni seguimientos con fecha.

alter table public.loads add column if not exists punctual_pending boolean not null default false;
alter table public.loads add column if not exists punctual_note text not null default '';
alter table public.loads add column if not exists punctual_opened_at timestamptz;
alter table public.loads add column if not exists punctual_opened_by uuid references public.profiles(id);
alter table public.loads add column if not exists punctual_resolved_at timestamptz;
alter table public.loads add column if not exists punctual_resolved_by uuid references public.profiles(id);

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.loads'::regclass and conname='loads_punctual_valid') then
    alter table public.loads add constraint loads_punctual_valid check (
      length(punctual_note)<=1000 and
      (not punctual_pending or (length(trim(punctual_note))>=3 and punctual_opened_at is not null and punctual_opened_by is not null))
    );
  end if;
end $$;

-- Estos campos solo se escriben mediante el RPC: el servidor fija autor, fecha y versión.
-- Se revocan también al reinstalar, porque la migración 006 vuelve a conceder columnas.
revoke insert(punctual_pending,punctual_note,punctual_opened_at,punctual_opened_by,punctual_resolved_at,punctual_resolved_by),
  update(punctual_pending,punctual_note,punctual_opened_at,punctual_opened_by,punctual_resolved_at,punctual_resolved_by)
  on public.loads from authenticated;

create or replace function public.ops_set_punctual_pending(
  p_load text,p_version timestamptz,p_active boolean,p_note text
) returns public.loads
language plpgsql security definer set search_path='' as $$
declare saved public.loads; note text:=regexp_replace(coalesce(p_note,''),'^[[:space:]]+|[[:space:]]+$','','g');
begin
  perform public.ops_require_staff();
  select * into saved from public.loads where load=p_load for update;
  if not found or saved.archived then raise exception 'La carga no está disponible para editar'; end if;
  if saved.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de guardar'; end if;
  if p_active is null then raise exception 'Selecciona si hay un pendiente puntual'; end if;
  if p_active and length(note) not between 3 and 1000 then
    raise exception 'Escribe qué hay que resolver, entre 3 y 1000 caracteres';
  end if;
  -- Repetir el mismo guardado no genera una nueva entrada de historial.
  if saved.punctual_pending=p_active and (not p_active or saved.punctual_note=note) then return saved; end if;
  update public.loads set
    punctual_pending=p_active,
    punctual_note=case when p_active then note else punctual_note end,
    punctual_opened_at=case when p_active and not saved.punctual_pending then now() else punctual_opened_at end,
    punctual_opened_by=case when p_active and not saved.punctual_pending then auth.uid() else punctual_opened_by end,
    punctual_resolved_at=case when p_active then null else now() end,
    punctual_resolved_by=case when p_active then null else auth.uid() end
  where load=p_load returning * into saved;
  -- Los triggers existentes sellan updated_at y registran todo en el historial/delta.
  return saved;
end $$;
revoke all on function public.ops_set_punctual_pending(text,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.ops_set_punctual_pending(text,timestamptz,boolean,text) to authenticated;



-- Archivo: 014_load_signals.sql
-- SEÑALAMIENTOS VISUALES POR CARGA. Requiere 013. No cambia estatus ni recordatorios.
alter table public.loads add column if not exists logistics_signals text[] not null default '{}';
alter table public.loads add column if not exists logistics_signals_at timestamptz;
alter table public.loads add column if not exists logistics_signals_by uuid references public.profiles(id);

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.loads'::regclass and conname='loads_logistics_signals_valid') then
    alter table public.loads add constraint loads_logistics_signals_valid check (
      cardinality(logistics_signals)<=3 and
      coalesce(array_ndims(logistics_signals),1)=1 and
      array_position(logistics_signals,null) is null and
      logistics_signals <@ array['urgent','workshop','delay','documents','customs','handling','appointment','priority']::text[]
    );
  end if;
end $$;

-- La migración 006 concede columnas al reinstalarse: estas se vuelven a proteger al final.
revoke insert(logistics_signals,logistics_signals_at,logistics_signals_by),
  update(logistics_signals,logistics_signals_at,logistics_signals_by) on public.loads from authenticated;

create or replace function public.ops_set_load_signals(p_load text,p_version timestamptz,p_signals text[])
returns public.loads language plpgsql security definer set search_path='' as $$
declare saved public.loads; normalized text[];
begin
  perform public.ops_require_staff();
  select * into saved from public.loads where load=p_load for update;
  if not found or saved.archived then raise exception 'La carga no está disponible para editar'; end if;
  if saved.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de guardar'; end if;
  if p_signals is null or cardinality(p_signals)>3 or coalesce(array_ndims(p_signals),1)<>1 then
    raise exception 'Selecciona hasta 3 señalamientos distintos del catálogo';
  end if;
  if array_position(p_signals,null) is not null or not p_signals <@ array['urgent','workshop','delay','documents','customs','handling','appointment','priority']::text[] then
    raise exception 'Selecciona señalamientos del catálogo';
  end if;
  -- Un orden canónico evita historial por cambiar únicamente el orden de selección.
  select coalesce(array_agg(distinct value order by value),'{}') into normalized from unnest(p_signals) value;
  if cardinality(normalized)<>cardinality(p_signals) then raise exception 'Selecciona señalamientos distintos'; end if;
  if saved.logistics_signals=normalized then return saved; end if;
  update public.loads set logistics_signals=normalized,logistics_signals_at=now(),logistics_signals_by=auth.uid()
    where load=p_load returning * into saved;
  -- La auditoría y el delta usan los triggers existentes de loads.
  return saved;
end $$;
revoke all on function public.ops_set_load_signals(text,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.ops_set_load_signals(text,timestamptz,text[]) to authenticated;


-- Archivo: 015_route_instructions.sql
-- BASE DE INSTRUCCIONES APROBADAS POR CLIENTE, RUTA Y ETAPA. Requiere 014.
-- Los borradores no gobiernan cargas. Las cargas conservan la versión aplicada.
create or replace function public.ops_instruction_key(p_text text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(lower(translate(trim(coalesce(p_text,'')),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'[^a-z0-9]+','','g')
$$;
create or replace function public.ops_instruction_stages(p_flow text) returns jsonb language sql immutable set search_path='' as $$
 select case when p_flow='export' then '[{"id":"origin","label":"Planta del cliente"},{"id":"mx_yard","label":"Patio permisionario / Yarda MX"},{"id":"us_yard","label":"Yarda USA"},{"id":"destination","label":"Cliente final"}]'::jsonb
 else '[{"id":"origin","label":"Cliente de origen"},{"id":"transit","label":"Tránsito en USA"},{"id":"us_yard","label":"Yarda USA"},{"id":"customs","label":"Agente aduanal"},{"id":"mx_yard","label":"Yarda MX después del cruce"},{"id":"destination","label":"Cliente final"}]'::jsonb end
$$;
create table if not exists public.route_instruction_templates (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 3 and 200),
 customer text not null default '' check(length(customer)<=500),
 origin_city text not null check(length(trim(origin_city)) between 1 and 300),origin_state text not null default '' check(length(origin_state)<=100),
 dest_city text not null check(length(trim(dest_city)) between 1 and 300),dest_state text not null default '' check(length(dest_state)<=100),
 flow text not null check(flow in ('export','import')),steps jsonb not null default '{}' check(jsonb_typeof(steps)='object'),
 state text not null default 'draft' check(state in ('draft','approved','paused','merged')),
 source_load text not null default '' check(length(source_load)<=200),case_note text not null default '' check(length(case_note)<=3000),
 created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),
 approved_by uuid references public.profiles(id),approved_at timestamptz,updated_at timestamptz not null default now(),
 check(state<>'approved' or (approved_by is not null and approved_at is not null))
);
create unique index if not exists instruction_route_approved on public.route_instruction_templates
 (public.ops_instruction_key(customer),public.ops_instruction_key(origin_city),public.ops_instruction_key(origin_state),public.ops_instruction_key(dest_city),public.ops_instruction_key(dest_state)) where state='approved';
alter table public.route_instruction_templates enable row level security;
revoke all on public.route_instruction_templates from public,anon,authenticated;
grant select on public.route_instruction_templates to authenticated;
drop policy if exists instruction_staff_read on public.route_instruction_templates;
create policy instruction_staff_read on public.route_instruction_templates for select to authenticated using(public.panel_role() in ('admin','csr'));
alter table public.loads add column if not exists instruction_template_id uuid references public.route_instruction_templates(id);
alter table public.loads add column if not exists instruction_plan jsonb not null default '{}';
alter table public.loads add column if not exists instruction_stage_override text not null default '';
alter table public.loads add column if not exists instruction_exception text not null default '' check(length(instruction_exception)<=3000);
alter table public.loads add column if not exists instruction_progress jsonb not null default '{}';
alter table public.loads add column if not exists instruction_context jsonb not null default '{}';
revoke insert(instruction_template_id,instruction_plan,instruction_stage_override,instruction_exception,instruction_progress,instruction_context),
 update(instruction_template_id,instruction_plan,instruction_stage_override,instruction_exception,instruction_progress,instruction_context) on public.loads from authenticated;

-- La coincidencia más específica es cliente+ruta; la ruta general sirve como alternativa.
-- Dos reglas de igual prioridad son ambiguas y no se elige una al azar.
create or replace function public.ops_match_instruction(p public.loads) returns uuid language plpgsql stable security definer set search_path='' as $$
declare candidates uuid[];
begin
 select array_agg(id) into candidates from (
  select t.id,dense_rank() over(order by (t.customer<>'') desc) as priority
  from public.route_instruction_templates t where t.state='approved'
   and (t.customer='' or public.ops_customer_key(public.ops_canonical_customer(t.customer))=public.ops_customer_key(public.ops_canonical_customer(p.customer)))
   and public.ops_instruction_key(t.origin_city)=public.ops_instruction_key(p.origin_city)
   and public.ops_instruction_key(t.origin_state)=public.ops_instruction_key(p.origin_state)
   and public.ops_instruction_key(t.dest_city)=public.ops_instruction_key(p.dest_city)
   and public.ops_instruction_key(t.dest_state)=public.ops_instruction_key(p.dest_state)
 ) matches where priority=1;
 if cardinality(candidates)=1 then return candidates[1]; end if;
 return null;
end $$;

create or replace function public.ops_instruction_context(p public.loads) returns jsonb language plpgsql immutable set search_path='' as $$
declare plan jsonb:=p.instruction_plan; flow text:=plan->>'flow'; stage text:=p.instruction_stage_override;
 s text:=lower(trim(p.status)); step jsonb; state text:='ready'; missing jsonb:='[]'; item text; stage_key text; label text; mode text:='current'; result jsonb; schedule text;
begin
 if p.archived or s in ('tonu','cancelado','cancelado.') or (s in ('delivered','completed','entregado','completado') and lower(p.pod_sent)='true') then return jsonb_build_object('state','finished'); end if;
 if coalesce(plan,'{}')='{}' then return jsonb_build_object('state','no_template'); end if;
 if plan->>'route_key' is distinct from jsonb_build_array(public.ops_instruction_key(p.customer),public.ops_instruction_key(p.origin_city),public.ops_instruction_key(p.origin_state),public.ops_instruction_key(p.dest_city),public.ops_instruction_key(p.dest_state))::text then
  return jsonb_build_object('state','route_changed','template',plan->>'name','action','La ruta cambió. Revisa y aplica el instructivo correspondiente.');
 end if;
 if stage='' then
  stage:=case
   when s in ('cargando','en planta','planta','recolectando') then 'origin'
   when s in ('en yarda mx','patio permisionario','patio mty') then 'mx_yard'
   when s in ('en yarda us','en yarda usa') then 'us_yard'
   when s='en aa' then case when flow='import' then 'customs' else 'mx_yard' end
   when s in ('descargando','pte. arrivo','pte arrivo','delivered','completed','entregado','completado') then 'destination'
   when s in ('en transito','en tránsito') then case when lower(p.cruce_confirmado)='true' or p.instruction_context->>'stage' in ('destination',case when flow='import' then 'mx_yard' else 'us_yard' end) then 'destination' when flow='import' then 'transit' else 'mx_yard' end
   else '' end;
  if s in ('en transito','en tránsito') and stage<>'transit' then mode:='next'; end if;
 end if;
 if stage='' and s in ('descompuesta','en resguardo','(hos)') and p.instruction_context->>'stage' is not null then stage:=p.instruction_context->>'stage';mode:='last_confirmed'; end if;
 if stage='' then return jsonb_build_object('state','stage_unconfirmed','template',plan->>'name','flow',flow,'action','Confirma el punto de seguimiento para mostrar sus instrucciones.'); end if;
 select x->>'label' into label from jsonb_array_elements(public.ops_instruction_stages(flow)) x where x->>'id'=stage;
 if label is null then return jsonb_build_object('state','stage_unconfirmed','flow',flow); end if;
 step:=coalesce(plan->'steps'->stage,'{}');
 stage_key:=md5(coalesce(plan->>'version','')||'|'||stage||'|'||mode||'|'||step::text||'|'||p.instruction_exception);
 if length(trim(coalesce(step->>'action','')))<3 then state:='undefined'; end if;
 for item in select jsonb_array_elements_text(coalesce(step->'requires','[]')) loop
  if lower(coalesce(to_jsonb(p)->>item,'')) not in ('true','1','si','sí') then missing:=missing||to_jsonb(item); end if;
 end loop;
 if coalesce(step->>'condition','')<>'' and p.instruction_progress->>'condition_key' is distinct from stage_key then missing:=missing||'"condition"'::jsonb; end if;
 if mode='last_confirmed' then missing:=missing||'"special_status"'::jsonb; end if;
 if state='ready' and jsonb_array_length(missing)>0 then state:='waiting'; end if;
 if p.instruction_progress->>'completed_key'=stage_key then state:='completed'; end if;
 schedule:=case step->>'notice' when 'pickup' then nullif(p.pickup_appt,'') when 'delivery' then nullif(p.delivery_appt,'') else null end;
 if step->>'notice' in ('pickup','delivery') and schedule is null and state='ready' then state:='waiting_date'; end if;
 result:=jsonb_build_object('state',state,'flow',flow,'stage',stage,'stage_label',label,'mode',mode,'template',plan->>'name',
  'action',coalesce(step->>'action',''),'condition',coalesce(step->>'condition',''),'on_issue',coalesce(step->>'on_issue',''),
  'contact',coalesce(step->>'contact',''),'missing',missing,'notify_at',schedule,'stage_key',stage_key,'exception',p.instruction_exception,
  'completed_at',p.instruction_progress->>'completed_at','approved_at',plan->>'approved_at','approved_by',plan->>'approved_by');
 return result||jsonb_build_object('event_key',md5(result::text));
end $$;

create or replace function public.ops_sync_instruction() returns trigger language plpgsql security definer set search_path='' as $$
declare template public.route_instruction_templates; matched uuid; context jsonb;
begin
 if new.instruction_template_id is null and new.instruction_plan='{}' then
  matched:=public.ops_match_instruction(new);
  if matched is not null then
   select * into template from public.route_instruction_templates where id=matched;
   new.instruction_template_id:=template.id;
   new.instruction_plan:=jsonb_build_object('name',template.name,'flow',template.flow,'steps',template.steps,'version',template.updated_at::text,
    'approved_at',template.approved_at,'approved_by',template.approved_by,
    'route_key',jsonb_build_array(public.ops_instruction_key(new.customer),public.ops_instruction_key(new.origin_city),public.ops_instruction_key(new.origin_state),public.ops_instruction_key(new.dest_city),public.ops_instruction_key(new.dest_state))::text);
  end if;
 end if;
 if TG_OP='UPDATE' and new.status is distinct from old.status then new.instruction_stage_override:=''; end if;
 context:=public.ops_instruction_context(new);
 if TG_OP='UPDATE' and (context is not distinct from (old.instruction_context-'changed_at')) then new.instruction_context:=old.instruction_context;
 else new.instruction_context:=context||jsonb_build_object('changed_at',now()); end if;
 return new;
end $$;
drop trigger if exists sync_instruction on public.loads;
create trigger sync_instruction before insert or update on public.loads for each row execute function public.ops_sync_instruction();

-- Crear borrador, registrar un caso o aprobar una versión. Solo Admin aprueba y pausa.
create or replace function public.ops_save_route_instruction(p_id uuid,p_version timestamptz,p_values jsonb,p_apply_missing boolean default false)
returns public.route_instruction_templates language plpgsql security definer set search_path='' as $$
declare target_template public.route_instruction_templates; overlay jsonb; saved public.route_instruction_templates; target_state text:=coalesce(p_values->>'state','draft'); point record; step jsonb; key text; count_actions integer:=0;
begin
 perform public.ops_require_staff();
 if target_state not in ('draft','approved','paused') then raise exception 'Selecciona borrador, publicado o pausado'; end if;
 perform pg_advisory_xact_lock(607034);
 if target_state<>'draft' then perform public.ops_require_staff(true); end if;
 if p_id is not null then
  select * into saved from public.route_instruction_templates where id=p_id for update;
  if not found or saved.updated_at is distinct from p_version then raise exception 'El instructivo cambió. Vuelve a abrirlo'; end if;
  if public.panel_role()<>'admin' and (saved.created_by<>auth.uid() or saved.state<>'draft') then raise exception 'Solo puedes editar tus propuestas'; end if;
 end if;
 if jsonb_typeof(p_values->'steps') is distinct from 'object' or p_values->>'flow' not in ('export','import') then raise exception 'Selecciona el recorrido y sus etapas'; end if;
 for key in select jsonb_object_keys(p_values->'steps') loop
  if not exists(select 1 from jsonb_array_elements(public.ops_instruction_stages(p_values->>'flow')) x where x->>'id'=key) then raise exception 'La etapa no corresponde al recorrido'; end if;
 end loop;
 for point in select value from jsonb_each(p_values->'steps') loop
  step:=point.value;
  if jsonb_typeof(step)<>'object' then raise exception 'Revisa las instrucciones de cada etapa'; end if;
  foreach key in array array['action','condition','on_issue','contact'] loop
   if coalesce(jsonb_typeof(step->key),'string')<>'string' or length(coalesce(step->>key,''))>3000 then raise exception 'Cada instrucción admite hasta 3000 caracteres'; end if;
  end loop;
  if jsonb_typeof(coalesce(step->'requires','[]'))<>'array' or jsonb_array_length(coalesce(step->'requires','[]'))>5 then raise exception 'Revisa los requisitos'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(step->'requires','[]')) x where jsonb_typeof(x)<>'string') then raise exception 'Requisito no permitido'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(step->'requires','[]')) x where x not in ('bol','doda','entry','sobre_listo','cruce_confirmado')) then raise exception 'Requisito no permitido'; end if;
  if coalesce(step->>'notice','stage') not in ('stage','pickup','delivery') then raise exception 'Elige cuándo avisar'; end if;
  if length(trim(coalesce(step->>'action','')))>=3 then count_actions:=count_actions+1; end if;
 end loop;
 if target_state='approved' and count_actions=0 then raise exception 'Registra al menos una instrucción antes de aprobar'; end if;
 -- Incorporar un caso es una decisión expresa del revisor y exige la versión publicada que vio.
 if target_state='approved' and coalesce((p_values->>'merge_approved')::boolean,false) then
  perform public.ops_require_staff(true);
  select * into target_template from public.route_instruction_templates where id=(p_values->>'merge_template_id')::uuid and state='approved' for update;
  if not found or target_template.id=p_id or target_template.updated_at is distinct from (p_values->>'merge_version')::timestamptz then raise exception 'El instructivo publicado cambió. Vuelve a abrir la propuesta'; end if;
  if target_template.flow<>p_values->>'flow'
   or public.ops_instruction_key(target_template.customer)<>public.ops_instruction_key(coalesce(p_values->>'customer',''))
   or public.ops_instruction_key(target_template.origin_city)<>public.ops_instruction_key(p_values->>'origin_city')
   or public.ops_instruction_key(target_template.origin_state)<>public.ops_instruction_key(p_values->>'origin_state')
   or public.ops_instruction_key(target_template.dest_city)<>public.ops_instruction_key(p_values->>'dest_city')
   or public.ops_instruction_key(target_template.dest_state)<>public.ops_instruction_key(p_values->>'dest_state') then raise exception 'La propuesta y el instructivo deben pertenecer al mismo cliente, ruta y recorrido'; end if;
  select coalesce(jsonb_object_agg(patch.key,patch.value),'{}') into overlay from jsonb_each(p_values->'steps') patch where length(trim(coalesce(patch.value->>'action','')))>=3;
  update public.route_instruction_templates set steps=steps||overlay,updated_at=now(),updated_by=auth.uid(),approved_by=auth.uid(),approved_at=now()
   where id=target_template.id returning * into saved;
  if p_id is not null then
   update public.route_instruction_templates set name=trim(p_values->>'name'),steps=p_values->'steps',case_note=coalesce(p_values->>'case_note',''),state='merged',approved_by=auth.uid(),approved_at=now(),updated_by=auth.uid(),updated_at=now(),
    customer=saved.customer,origin_city=saved.origin_city,origin_state=saved.origin_state,dest_city=saved.dest_city,dest_state=saved.dest_state,flow=saved.flow where id=p_id;
  end if;
  if p_apply_missing then update public.loads l set instruction_plan='{}' where not archived and instruction_template_id is null and public.ops_can_read_load(l.load,l.customer) and public.ops_match_instruction(l)=saved.id; end if;
  perform public.ops_log_admin('route_instruction_case_merged',jsonb_build_object('template',to_jsonb(saved),'proposal_id',p_id,'reviewed',p_values));
  return saved;
 end if;

 insert into public.route_instruction_templates(id,name,customer,origin_city,origin_state,dest_city,dest_state,flow,steps,state,source_load,case_note,created_by,updated_by,approved_by,approved_at)
 values(coalesce(p_id,gen_random_uuid()),trim(p_values->>'name'),trim(coalesce(p_values->>'customer','')),trim(p_values->>'origin_city'),trim(coalesce(p_values->>'origin_state','')),
 trim(p_values->>'dest_city'),trim(coalesce(p_values->>'dest_state','')),p_values->>'flow',p_values->'steps',target_state,coalesce(p_values->>'source_load',''),coalesce(p_values->>'case_note',''),auth.uid(),auth.uid(),
 case when target_state='approved' then auth.uid() end,case when target_state='approved' then now() end)
 on conflict(id) do update set name=excluded.name,customer=excluded.customer,origin_city=excluded.origin_city,origin_state=excluded.origin_state,dest_city=excluded.dest_city,dest_state=excluded.dest_state,
 flow=excluded.flow,steps=excluded.steps,state=excluded.state,source_load=excluded.source_load,case_note=excluded.case_note,updated_by=auth.uid(),updated_at=now(),approved_by=excluded.approved_by,approved_at=excluded.approved_at returning * into saved;
 if p_apply_missing and saved.state='approved' then
  perform public.ops_require_staff(true);
  update public.loads l set instruction_plan='{}' where not archived and instruction_template_id is null and public.ops_can_read_load(l.load,l.customer) and public.ops_match_instruction(l)=saved.id;
 end if;
 perform public.ops_log_admin('route_instruction_saved',jsonb_build_object('template',to_jsonb(saved),'apply_missing',p_apply_missing));
 return saved;
end $$;

-- La carga solo cambia mediante acciones explícitas y con la versión que leyó el usuario.
create or replace function public.ops_load_instruction_action(p_load text,p_version timestamptz,p_action text,p_values jsonb default '{}')
returns public.loads language plpgsql security definer set search_path='' as $$
declare saved public.loads; matched uuid; stage_key text; template public.route_instruction_templates;
begin
 perform public.ops_require_staff();
 select * into saved from public.loads where load=p_load and public.ops_can_read_load(load,customer) for update;
 if not found or saved.archived then raise exception 'La carga no está disponible'; end if;
 if saved.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de guardar'; end if;
 if not public.ops_can_read_load(saved.load,saved.customer) then raise exception 'La carga no pertenece a tus clientes'; end if;
 stage_key:=saved.instruction_context->>'stage_key';
 if p_action='apply' then
  matched:=public.ops_match_instruction(saved);
  if matched is null then raise exception 'No hay una única instrucción aprobada para esta ruta'; end if;
  select * into template from public.route_instruction_templates where id=matched;
  saved.instruction_template_id:=null;saved.instruction_plan:='{}';saved.instruction_progress:='{}';saved.instruction_stage_override:='';
 elsif p_action='stage' then
  if coalesce(p_values->>'stage','')<>'' and not exists(select 1 from jsonb_array_elements(public.ops_instruction_stages(saved.instruction_plan->>'flow')) x where x->>'id'=p_values->>'stage') then raise exception 'Selecciona una etapa del recorrido'; end if;
  saved.instruction_stage_override:=coalesce(p_values->>'stage','');
 elsif p_action='exception' then
  if length(coalesce(p_values->>'note',''))>3000 then raise exception 'La excepción admite hasta 3000 caracteres'; end if;
  saved.instruction_exception:=trim(coalesce(p_values->>'note',''));
 elsif p_action='condition' then
  if stage_key is null then raise exception 'Confirma primero la etapa'; end if;
  saved.instruction_progress:=saved.instruction_progress||jsonb_build_object('condition_key',stage_key,'condition_at',now(),'condition_by',auth.uid());
 elsif p_action='complete' then
  if saved.instruction_context->>'state'<>'ready' or saved.instruction_context->>'mode'='next' then raise exception 'Atiende los requisitos y confirma la etapa antes de completar'; end if;
  saved.instruction_progress:=saved.instruction_progress||jsonb_build_object('completed_key',stage_key,'completed_at',now(),'completed_by',auth.uid());
 elsif p_action='reopen' then saved.instruction_progress:=saved.instruction_progress-'completed_key'-'completed_at'-'completed_by';
 else raise exception 'Acción de instructivo no permitida'; end if;
 update public.loads set instruction_template_id=saved.instruction_template_id,instruction_plan=saved.instruction_plan,instruction_stage_override=saved.instruction_stage_override,
 instruction_exception=saved.instruction_exception,instruction_progress=saved.instruction_progress where load=p_load returning * into saved;
 return saved;
end $$;

-- El resumen envía solo la instrucción actual; el recorrido completo se consulta al abrirlo.
create or replace function public.ops_load_summary(p public.loads) returns jsonb language sql immutable set search_path='' as $$
 select to_jsonb(p)-array['bol_source','bol_manual_by','bol_manual_at','doda_source','doda_manual_by','doda_manual_at','entry_source','entry_manual_by','entry_manual_at',
 'sobre_listo_source','sobre_listo_manual_by','sobre_listo_manual_at','archive_reason','archived_at','archived_by','instruction_plan','instruction_progress']
$$;
insert into public.panel_revisions(area,revision) values('instrucciones',nextval('public.panel_revision_seq')) on conflict do nothing;
drop trigger if exists panel_revision on public.route_instruction_templates;
create trigger panel_revision before insert or update or delete on public.route_instruction_templates for each statement execute function public.ops_bump_revision('instrucciones');
-- Conservar la nueva base de conocimientos en los respaldos paginados.
create or replace function public.ops_backup_tables() returns text[] language sql immutable set search_path='' as $$ select array[
 'profiles','route_instruction_templates','loads','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history','vg_contacts','reserved_loads','reserved_load_history',
 'customer_assignments','load_followers','user_following','task_checklist_templates','task_schedules','shift_tasks','shift_task_history','task_checklist_items','task_dependencies',
 'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places','original_places','original_routes','original_radar','original_preferences',
 'panel_settings','customer_aliases','operational_alerts']::text[] $$;
revoke all on function public.ops_instruction_key(text),public.ops_instruction_stages(text),public.ops_match_instruction(public.loads),public.ops_instruction_context(public.loads),public.ops_sync_instruction(),
 public.ops_save_route_instruction(uuid,timestamptz,jsonb,boolean),public.ops_load_instruction_action(text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.ops_instruction_key(text),public.ops_instruction_stages(text),public.ops_save_route_instruction(uuid,timestamptz,jsonb,boolean),public.ops_load_instruction_action(text,timestamptz,text,jsonb) to authenticated;


-- Archivo: 016_personal_internal_mode.sql
-- VERSIÓN INTERNA PERSONAL. Requiere 015. Conserva expedientes y datos históricos.
create or replace function public.ops_require_reader() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or coalesce(public.panel_role(),'') not in ('admin','csr') then raise exception 'Esta versión es de uso interno'; end if;
end $$;
create or replace function public.ops_can_read_load(p_load text,p_customer text) returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(public.panel_role() in ('admin','csr') and exists(
  select 1 from public.customer_assignments a where a.owner_id=auth.uid()
   and public.ops_customer_key(public.ops_canonical_customer(a.customer))=public.ops_customer_key(public.ops_canonical_customer(p_customer))),false)
$$;
create index if not exists customer_assignments_owner_idx on public.customer_assignments(owner_id,customer_key);
drop policy if exists loads_personal_scope on public.loads;
create policy loads_personal_scope on public.loads as restrictive for all to authenticated
 using(public.ops_can_read_load(load,customer)) with check(public.ops_can_read_load(load,customer));
-- La creación/importación de un cliente sin asignación lo vincula a quien lo está capturando.
create or replace function public.ops_personal_load() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.panel_role() in ('admin','csr') and trim(new.customer)<>'' then
  if TG_OP='UPDATE' and not public.ops_can_read_load('',old.customer) then raise exception 'La carga no pertenece a tus clientes'; end if;
  if exists(select 1 from public.customer_assignments a where a.owner_id<>auth.uid() and public.ops_customer_key(public.ops_canonical_customer(a.customer))=public.ops_customer_key(public.ops_canonical_customer(new.customer))) then raise exception 'El cliente está asignado a otra persona'; end if;
  insert into public.customer_assignments(customer,owner_id,updated_by) values(new.customer,auth.uid(),auth.uid()) on conflict(customer_key) do nothing;
 end if;
 if TG_TABLE_NAME='loads' then new.client_notify_pending:='false';new.client_notify_reason:='';new.client_notify_since:=''; end if;
 return new;
end $$;
drop trigger if exists zz_personal_load on public.loads;
create trigger zz_personal_load before insert or update on public.loads for each row execute function public.ops_personal_load();
do $$ declare name text; begin
 foreach name in array array['comments','incidents','load_history'] loop
  execute format('drop policy if exists personal_load_scope on public.%I',name);
  execute format('create policy personal_load_scope on public.%I as restrictive for all to authenticated using(exists(select 1 from public.loads l where l.load=%I.load)) with check(exists(select 1 from public.loads l where l.load=%I.load))',name,name,name);
 end loop;
end $$;
-- Las cuentas externas no se eliminan; se retira el acceso a los RPC de sus portales.
revoke execute on function public.ops_portal_loads(integer,integer),public.ops_portal_detail(text),
 public.confirm_client_notice(text,timestamptz,text,text),public.ops_publish_portal_message(text,timestamptz,text),public.ops_customer_communications(text,integer,integer) from authenticated;
-- Los envíos externos permanecen apagados durante la consolidación de esta versión.
update public.panel_settings set external_alerts_enabled=false,alert_channel='disabled' where singleton and (external_alerts_enabled or alert_channel<>'disabled');
revoke all on function public.ops_personal_load() from public,anon,authenticated;
-- El administrador puede recuperar/asignar clientes sin exponer expedientes ajenos.
create or replace function public.ops_internal_customer_directory() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform public.ops_require_staff(true);
 return (select coalesce(jsonb_agg(customer order by customer),'[]') from (select distinct customer from public.loads where trim(customer)<>'' and not exists(select 1 from public.customer_assignments a where public.ops_customer_key(a.customer)=public.ops_customer_key(loads.customer))) c);
end $$;
create or replace function public.ops_internal_settings() returns trigger language plpgsql set search_path='' as $$ begin
 new.external_alerts_enabled:=false;new.alert_channel:='disabled';return new;
end $$;
drop trigger if exists internal_settings on public.panel_settings;
create trigger internal_settings before insert or update on public.panel_settings for each row execute function public.ops_internal_settings();
revoke all on function public.ops_internal_customer_directory(),public.ops_internal_settings() from public,anon,authenticated;
grant execute on function public.ops_internal_customer_directory() to authenticated;


-- Solicitudes sin número también pertenecen al cliente que las origina.
drop trigger if exists zz_personal_load on public.pending_loads;
create trigger zz_personal_load before insert or update on public.pending_loads for each row execute function public.ops_personal_load();
drop policy if exists pending_personal_scope on public.pending_loads;
create policy pending_personal_scope on public.pending_loads as restrictive for all to authenticated using(public.ops_can_read_load('',customer)) with check(public.ops_can_read_load('',customer));
drop policy if exists pending_comments_personal_scope on public.pending_load_comments;
create policy pending_comments_personal_scope on public.pending_load_comments as restrictive for select to authenticated using(exists(select 1 from public.pending_loads p where p.id=pending_load_comments.pending_id));
drop policy if exists reserved_personal_scope on public.reserved_loads;
create policy reserved_personal_scope on public.reserved_loads as restrictive for select to authenticated using(public.panel_role() in ('admin','csr') and (created_by=auth.uid() or exists(select 1 from public.loads l where l.load=reserved_loads.related_load or l.load=reserved_loads.own_load)));
drop policy if exists tasks_personal_scope on public.shift_tasks;
create policy tasks_personal_scope on public.shift_tasks as restrictive for select to authenticated using(public.panel_role() in ('admin','csr') and (exists(select 1 from public.loads l where l.load=shift_tasks.load) or (load is null and auth.uid() in (created_by,assigned_to,assigned_csr))));



-- Archivo: 017_default_arrival_status.sql
-- CARGAS NUEVAS: estatus inicial PTE. ARRIVO.
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Requiere la versión personal 016. Es repetible y conserva las cargas existentes.

-- El valor predeterminado cubre capturas que no envían el campo status.
alter table public.loads alter column status set default 'PTE. ARRIVO';

-- Algunos formularios envían un campo vacío o null. Solo se completa al INSERTAR;
-- editar o restaurar una carga existente no modifica su estatus.
create or replace function public.ops_default_load_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if nullif(btrim(new.status), '') is null then
    new.status := 'PTE. ARRIVO';
  end if;
  return new;
end;
$$;
drop trigger if exists aa_default_load_status on public.loads;
create trigger aa_default_load_status before insert on public.loads
for each row execute function public.ops_default_load_status();
revoke all on function public.ops_default_load_status() from public, anon, authenticated;

-- La importación conserva estatus/POD/color de registros existentes.
-- Una carga nueva siempre comienza pendiente de arribo, aunque el archivo traiga otro estatus.
create or replace function public.ops_merge_import(p_values jsonb, p_previous jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare merged jsonb := coalesce(p_previous, '{}'); field_name text; incoming text; source_prefix text;
begin
  merged := merged || jsonb_build_object('load', trim(coalesce(p_values ->> 'load', '')));
  foreach field_name in array array[
    'customer','origin_city','origin_state','origin_address','dest_city','dest_state','dest_address',
    'pickup_appt','pickup_actual','pickup_delta_min','delivery_appt','delivery_actual','delivery_delta_min',
    'truck','trailer','work_order','bol','doc_status','doda','entry','exportacion','importacion','pedimentos','regresos',
    'sobre_listo','loaded_miles','empty_miles','rpm','charges','tracking_link','eta_note','salida_mexico_fecha','cruce_usa_fecha'
  ] loop
    if not (p_values ? field_name) then continue; end if;
    incoming := trim(coalesce(p_values ->> field_name, ''));
    if length(incoming) > 5000 then raise exception 'El campo % supera 5000 caracteres', field_name; end if;
    -- Un dato vacío de Excel no borra un valor existente; status/POD/color nunca vienen del archivo.
    if incoming = '' and p_previous is not null then continue; end if;
    if field_name in ('bol','doda','entry','sobre_listo') and lower(incoming) in ('false','0','no','null')
      and coalesce(p_previous ->> field_name, '') not in ('','false','0','no','null') then continue; end if;
    merged := merged || jsonb_build_object(field_name, incoming);
    if field_name in ('truck','trailer','bol','doda','entry','sobre_listo') and incoming <> '' then
      source_prefix := field_name;
      merged := merged || jsonb_build_object(source_prefix || '_source', 'IMPORT', source_prefix || '_manual_by', '', source_prefix || '_manual_at', '');
      if field_name in ('truck','trailer') then merged := merged || jsonb_build_object(field_name || '_vg_value', incoming); end if;
    end if;
  end loop;
  if p_previous is null then merged := merged || jsonb_build_object('status', 'PTE. ARRIVO'); end if;
  return merged;
end;
$$;



-- Archivo: 018_manual_client_messages.sql
-- MENSAJES MANUALES PARA WHATSAPP. Requiere 016; no habilita envíos ni portales.
-- Solo registra avisos sobre las cargas de los clientes asignados a la sesión.
-- Conserva datos e historial; es repetible.

-- 1. Conservar los indicadores que ya genera apply_load_rules al cambiar una carga.
-- Se mantiene la asignación personal de clientes de 016; ya no se borran sus avisos.
create or replace function public.ops_personal_load() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and public.panel_role() in ('admin', 'csr')
     and trim(new.customer) <> '' then
    if TG_OP = 'UPDATE' and not public.ops_can_read_load('', old.customer) then
      raise exception 'La carga no pertenece a tus clientes';
    end if;

    -- Una captura nunca toma el cliente que ya pertenece a otra cuenta.
    if exists (
      select 1 from public.customer_assignments a
      where a.owner_id <> auth.uid()
        and public.ops_customer_key(public.ops_canonical_customer(a.customer))
          = public.ops_customer_key(public.ops_canonical_customer(new.customer))
    ) then
      raise exception 'El cliente está asignado a otra persona';
    end if;

    insert into public.customer_assignments(customer, owner_id, updated_by)
    values (new.customer, auth.uid(), auth.uid())
    on conflict (customer_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.ops_personal_load() from public, anon, authenticated;

-- 2. Confirmar un envío manual exige el permiso de la carga y su versión vigente.
-- Esta función registra canal y tipo de aviso. No envía el mensaje a WhatsApp.
create or replace function public.confirm_client_notice(
  p_load text,
  p_version timestamptz,
  p_channel text,
  p_notice_type text
) returns setof public.loads
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ops_require_staff();
  if p_channel is null or p_channel not in ('WhatsApp', 'Correo', 'Teléfono', 'Otro') then
    raise exception 'Elige un canal válido';
  end if;
  if length(trim(coalesce(p_notice_type, ''))) not between 1 and 200 then
    raise exception 'Indica el tipo de aviso (hasta 200 caracteres)';
  end if;

  return query
    update public.loads
    set client_notify_pending = 'false',
        client_notified_at = now()::text,
        last_communication_channel = p_channel,
        last_communication_type = trim(p_notice_type)
    where load = p_load
      and updated_at = p_version
      and not archived
      and public.ops_can_read_load(load, customer)
    returning *;

  if not found then
    raise exception 'La carga cambió, está archivada o no existe. Actualiza antes de registrar el aviso';
  end if;
end;
$$;
revoke all on function public.confirm_client_notice(text, timestamptz, text, text)
from public, anon;
grant execute on function public.confirm_client_notice(text, timestamptz, text, text)
to authenticated;

-- 3. El historial manual tiene el mismo alcance personal que su carga.
drop policy if exists communications_personal_scope on public.communications;
create policy communications_personal_scope on public.communications as restrictive
for select to authenticated
using (exists (
  select 1 from public.loads l where l.load = communications.load
));
grant execute on function public.ops_customer_communications(text, integer, integer)
to authenticated;

-- Los RPC de portales y el envío automático permanecen desactivados por 016.


-- Archivo: 019_personal_load_views.sql
-- MENÚ MOSTRAR CONFIGURABLE POR CUENTA. Requiere 018.
-- Ejecutar todo en SQL Editor > New query > Run. Conserva cargas y preferencias existentes.

-- La configuración vive junto a las plantillas privadas, pero se guarda por separado.
alter table public.original_preferences
  add column if not exists load_views jsonb not null default '{}';

-- Validación cerrada: solo datos de filtros, nunca SQL ni código ejecutable.
create or replace function public.ops_validate_load_views(p_config jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  view_item jsonb;
  rules jsonb;
  field_name text;
  ids text[] := '{}';
  names text[] := '{}';
  required_id text;
  item_name text;
  first_day date;
  last_day date;
begin
  if jsonb_typeof(p_config) is distinct from 'object'
     or p_config->>'schema' is distinct from '1'
     or jsonb_typeof(p_config->'items') is distinct from 'array'
     or octet_length(p_config::text) > 65536 then
    raise exception 'Configuración del menú no válida';
  end if;
  if jsonb_array_length(p_config->'items') not between 8 and 30 then
    raise exception 'Conserva las opciones originales; el menú admite hasta 30 vistas';
  end if;
  for view_item in select value from jsonb_array_elements(p_config->'items') loop
    if jsonb_typeof(view_item) is distinct from 'object'
       or coalesce(view_item->>'id','') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
       or (view_item->>'id') = any(ids) then
      raise exception 'Hay una vista repetida o no válida';
    end if;
    ids := array_append(ids, view_item->>'id');
    item_name := lower(trim(coalesce(view_item->>'name','')));
    if length(item_name) not between 1 and 60 or item_name = any(names) then
      raise exception 'Cada vista necesita un nombre distinto de hasta 60 caracteres';
    end if;
    names := array_append(names, item_name);
    if jsonb_typeof(view_item->'visible') is distinct from 'boolean'
       or coalesce(view_item->>'layout','') not in ('keep','table','cards') then
      raise exception 'Revisa la visibilidad y presentación de la vista';
    end if;
    rules := view_item->'rules';
    if jsonb_typeof(rules) is distinct from 'object'
       or coalesce(rules->>'lifecycle','') not in ('all','open','delivered','closed')
       or coalesce(rules->>'pickup','') not in ('any','through_today','future','today','missing')
       or coalesce(rules->>'dateField','') not in ('pickup_appt','delivery_appt','cruce_usa_fecha')
       or coalesce(rules->>'period','') not in ('any','today','next7','next30','past','custom') then
      raise exception 'Revisa las condiciones de la vista';
    end if;
    foreach field_name in array array['pod','punctual','attention','notice'] loop
      if coalesce(rules->>field_name,'') not in ('any','yes','no') then
        raise exception 'Revisa los indicadores de la vista';
      end if;
    end loop;
    foreach field_name in array array['statuses','clients'] loop
      if jsonb_typeof(rules->field_name) is distinct from 'array' then
        raise exception 'Clientes y estatus deben ser listas';
      end if;
      if jsonb_array_length(rules->field_name) > (case when field_name='clients' then 100 else 50 end)
         or exists (
           select 1 from jsonb_array_elements(rules->field_name) element
           where jsonb_typeof(element) <> 'string'
              or length(trim(element#>>'{}')) not between 1 and (case when field_name='clients' then 200 else 100 end)
         ) then
        raise exception 'La selección de clientes o estatus no es válida';
      end if;
    end loop;
    if jsonb_typeof(rules->'search') is distinct from 'string'
       or length(rules->>'search') > 200 then
      raise exception 'La búsqueda admite hasta 200 caracteres';
    end if;
    first_day := null;
    last_day := null;
    foreach field_name in array array['start','end'] loop
      if jsonb_typeof(rules->field_name) is distinct from 'string' then
        raise exception 'Las fechas de la vista no son válidas';
      end if;
      if rules->>field_name <> '' then
        if rules->>field_name !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception 'Usa fechas completas en el periodo';
        end if;
        begin
          if field_name='start' then first_day := (rules->>field_name)::date;
          else last_day := (rules->>field_name)::date; end if;
        exception when others then raise exception 'La fecha indicada no existe'; end;
      end if;
    end loop;
    if rules->>'period'='custom' and (
      (first_day is null and last_day is null) or first_day > last_day
    ) then
      raise exception 'Indica Desde o Hasta; Hasta no puede ser anterior a Desde';
    end if;
    if view_item ? 'sort' and view_item->'sort' <> 'null'::jsonb then
      if jsonb_typeof(view_item->'sort') is distinct from 'object'
         or coalesce(view_item->'sort'->>'col','') not in ('load','customer','origin_city','dest_city','pickup_appt','delivery_appt','truck','trailer','status')
         or coalesce(view_item->'sort'->>'dir','') not in ('1','-1') then
        raise exception 'El orden de la vista no es válido';
      end if;
    end if;
  end loop;
  foreach required_id in array array['all','active','punctual','attention','cruce-hoy','cruce-semana','done','cancelada'] loop
    if not required_id = any(ids) then raise exception 'Las vistas originales se pueden ocultar, pero no eliminar'; end if;
  end loop;
  if not exists (
    select 1 from jsonb_array_elements(p_config->'items') v
    where v->>'id'='all' and v->'visible'='true'::jsonb
  ) or not exists (
    select 1 from jsonb_array_elements(p_config->'items') v
    where v->>'id'=p_config->>'defaultId' and v->'visible'='true'::jsonb
  ) then
    raise exception 'Elige una vista visible para abrir al entrar y conserva Todas en el menú';
  end if;
end;
$$;

-- La sesión identifica al dueño; el navegador no puede indicar otro user_id.
-- La versión evita que dos pestañas sobrescriban cambios sin avisar.
create or replace function public.ops_save_load_views(p_config jsonb, p_version timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous public.original_preferences;
  saved public.original_preferences;
begin
  perform public.ops_require_staff();
  perform public.ops_validate_load_views(p_config);
  select * into previous from public.original_preferences where user_id=auth.uid() for update;
  if found then
    if previous.updated_at is distinct from p_version then
      raise exception 'Tus preferencias cambiaron en otra ventana. Cierra la configuración y vuelve a abrirla';
    end if;
    update public.original_preferences
    set load_views=p_config, updated_at=clock_timestamp()
    where user_id=auth.uid() returning * into saved;
  else
    if p_version is not null then raise exception 'Las preferencias cambiaron. Vuelve a abrir la configuración'; end if;
    insert into public.original_preferences(user_id,load_views)
    values(auth.uid(),p_config) on conflict(user_id) do nothing returning * into saved;
    if not found then raise exception 'Las preferencias cambiaron. Vuelve a abrir la configuración'; end if;
  end if;
  return jsonb_build_object('config',saved.load_views,'version',saved.updated_at);
end;
$$;
revoke all on function public.ops_validate_load_views(jsonb), public.ops_save_load_views(jsonb,timestamptz)
from public, anon, authenticated;
grant execute on function public.ops_save_load_views(jsonb,timestamptz) to authenticated;


-- Archivo: 020_personal_consolidation.sql
-- CONSOLIDACIÓN PERSONAL R01–R20. Requiere 019. Ejecutar TODO en SQL Editor.
-- Conserva cargas y expedientes. Los cambios de datos son derivados o expresamente confirmados.

-- 1. PTE. ARRIVO no acredita tránsito ni llegada al cliente final.
create or replace function public.ops_instruction_context(p public.loads) returns jsonb language plpgsql immutable set search_path='' as $$
declare plan jsonb:=p.instruction_plan; flow text:=plan->>'flow'; stage text:=p.instruction_stage_override;
 s text:=lower(trim(p.status)); step jsonb; state text:='ready'; missing jsonb:='[]'; item text; stage_key text; label text; mode text:='current'; result jsonb; schedule text;
begin
 if p.archived or s in ('tonu','cancelado','cancelado.') or (s in ('delivered','completed','entregado','completado') and lower(p.pod_sent)='true') then return jsonb_build_object('state','finished'); end if;
 if coalesce(plan,'{}')='{}' then return jsonb_build_object('state','no_template'); end if;
 if plan->>'route_key' is distinct from jsonb_build_array(public.ops_instruction_key(p.customer),public.ops_instruction_key(p.origin_city),public.ops_instruction_key(p.origin_state),public.ops_instruction_key(p.dest_city),public.ops_instruction_key(p.dest_state))::text then
  return jsonb_build_object('state','route_changed','template',plan->>'name','action','La ruta cambió. Revisa y aplica el instructivo correspondiente.');
 end if;
 if stage='' then
  stage:=case
   when s in ('cargando','en planta','planta','recolectando') then 'origin'
   when s in ('en yarda mx','patio permisionario','patio mty') then 'mx_yard'
   when s in ('en yarda us','en yarda usa') then 'us_yard'
   when s='en aa' then case when flow='import' then 'customs' else 'mx_yard' end
   when s in ('descargando','delivered','completed','entregado','completado') then 'destination'
   when s in ('pte. arrivo','pte arrivo','pendiente arrivo') then case
    when p.delivery_actual<>'' or lower(p.cruce_confirmado)='true' then 'destination'
    when p.pickup_actual='' and p.salida_mexico_fecha='' and p.cruce_usa_fecha='' then 'origin'
    else '' end
   when s in ('en transito','en tránsito') then case when lower(p.cruce_confirmado)='true' or p.instruction_context->>'stage' in ('destination',case when flow='import' then 'mx_yard' else 'us_yard' end) then 'destination' when flow='import' then 'transit' else 'mx_yard' end
   else '' end;
  if s in ('en transito','en tránsito') and stage<>'transit' then mode:='next'; end if;
 end if;
 if stage='' and s in ('descompuesta','en resguardo','(hos)') and p.instruction_context->>'stage' is not null then stage:=p.instruction_context->>'stage';mode:='last_confirmed'; end if;
 if stage='' then return jsonb_build_object('state','stage_unconfirmed','template',plan->>'name','flow',flow,'action','Confirma el punto de seguimiento para mostrar sus instrucciones.'); end if;
 select x->>'label' into label from jsonb_array_elements(public.ops_instruction_stages(flow)) x where x->>'id'=stage;
 if label is null then return jsonb_build_object('state','stage_unconfirmed','flow',flow); end if;
 step:=coalesce(plan->'steps'->stage,'{}');
 stage_key:=md5(coalesce(plan->>'version','')||'|'||stage||'|'||mode||'|'||step::text||'|'||p.instruction_exception);
 if length(trim(coalesce(step->>'action','')))<3 then state:='undefined'; end if;
 for item in select jsonb_array_elements_text(coalesce(step->'requires','[]')) loop
  if lower(coalesce(to_jsonb(p)->>item,'')) not in ('true','1','si','sí') then missing:=missing||to_jsonb(item); end if;
 end loop;
 if coalesce(step->>'condition','')<>'' and p.instruction_progress->>'condition_key' is distinct from stage_key then missing:=missing||'"condition"'::jsonb; end if;
 if mode='last_confirmed' then missing:=missing||'"special_status"'::jsonb; end if;
 if state='ready' and jsonb_array_length(missing)>0 then state:='waiting'; end if;
 if p.instruction_progress->>'completed_key'=stage_key then state:='completed'; end if;
 schedule:=case step->>'notice' when 'pickup' then nullif(p.pickup_appt,'') when 'delivery' then nullif(p.delivery_appt,'') else null end;
 if step->>'notice' in ('pickup','delivery') and schedule is null and state='ready' then state:='waiting_date'; end if;
 result:=jsonb_build_object('state',state,'flow',flow,'stage',stage,'stage_label',label,'mode',mode,'template',plan->>'name',
  'action',coalesce(step->>'action',''),'condition',coalesce(step->>'condition',''),'on_issue',coalesce(step->>'on_issue',''),
  'contact',coalesce(step->>'contact',''),'missing',missing,'notify_at',schedule,'stage_key',stage_key,'exception',p.instruction_exception,
  'completed_at',p.instruction_progress->>'completed_at','approved_at',plan->>'approved_at','approved_by',plan->>'approved_by');
 return result||jsonb_build_object('event_key',md5(result::text));
end $$;

-- Recalcular solo instructivos afectados; no cambiar estatus, fechas, unidad ni condiciones manuales.
update public.loads set instruction_context=public.ops_instruction_context(loads)
where not archived and lower(trim(status)) in ('pte. arrivo','pte arrivo','pendiente arrivo')
 and instruction_plan<>'{}' and instruction_context->>'stage' is distinct from public.ops_instruction_context(loads)->>'stage';

-- 2. Las importaciones conservan Truck/Trailer manuales salvo selección expresa.
create or replace function public.ops_merge_import(p_values jsonb, p_previous jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare merged jsonb := coalesce(p_previous, '{}'); field_name text; incoming text; source_prefix text;
begin
  merged := merged || jsonb_build_object('load', trim(coalesce(p_values ->> 'load', '')));
  foreach field_name in array array[
    'customer','origin_city','origin_state','origin_address','dest_city','dest_state','dest_address',
    'pickup_appt','pickup_actual','pickup_delta_min','delivery_appt','delivery_actual','delivery_delta_min',
    'truck','trailer','work_order','bol','doc_status','doda','entry','exportacion','importacion','pedimentos','regresos',
    'sobre_listo','loaded_miles','empty_miles','rpm','charges','tracking_link','eta_note','salida_mexico_fecha','cruce_usa_fecha'
  ] loop
    if not (p_values ? field_name) then continue; end if;
    -- Un dato manual de unidad solo cambia con selección expresa en la vista previa.
    if field_name in ('truck','trailer') and p_previous->>(field_name||'_source')='MANUAL'
       and nullif(trim(p_previous->>field_name),'') is not null
       and not coalesce((p_values->'_replace_manual') ? field_name,false) then continue; end if;
    incoming := trim(coalesce(p_values ->> field_name, ''));
    if length(incoming) > 5000 then raise exception 'El campo % supera 5000 caracteres', field_name; end if;
    -- Un dato vacío de Excel no borra un valor existente; status/POD/color nunca vienen del archivo.
    if incoming = '' and p_previous is not null then continue; end if;
    if field_name in ('bol','doda','entry','sobre_listo') and lower(incoming) in ('false','0','no','null')
      and coalesce(p_previous ->> field_name, '') not in ('','false','0','no','null') then continue; end if;
    merged := merged || jsonb_build_object(field_name, incoming);
    if field_name in ('truck','trailer','bol','doda','entry','sobre_listo') and incoming <> '' then
      source_prefix := field_name;
      merged := merged || jsonb_build_object(source_prefix || '_source', 'IMPORT', source_prefix || '_manual_by', '', source_prefix || '_manual_at', '');
      if field_name in ('truck','trailer') then merged := merged || jsonb_build_object(field_name || '_vg_value', incoming); end if;
    end if;
  end loop;
  if p_previous is null then merged := merged || jsonb_build_object('status', 'PTE. ARRIVO'); end if;
  return merged;
end;
$$;

create or replace function public.ops_preview_import(p_records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare input jsonb; previous public.loads; merged jsonb; result jsonb := '[]'; changed text[]; differences jsonb; protected jsonb; field_name text;
begin
  perform public.ops_require_staff(true); perform public.ops_check_import(p_records);
  for input in select value from jsonb_array_elements(p_records) loop
    if input ? '_replace_manual' and (jsonb_typeof(input->'_replace_manual') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(input->'_replace_manual') v where v not in ('truck','trailer'))) then raise exception 'Selecciona solo Truck o Trailer para reemplazar datos manuales'; end if;
    select * into previous from public.loads where load=trim(input->>'load');
    if previous.load is not null and not public.ops_can_read_load(previous.load,previous.customer) then raise exception 'La carga no pertenece a tus clientes'; end if;
    if previous.archived then raise exception 'La carga % está archivada. Restáurala antes de importar',previous.load; end if;
    merged:=public.ops_merge_import(input,case when previous.load is null then null else to_jsonb(previous) end);
    select array_agg(key order by key) into changed from jsonb_each(merged) e(key,value)
      where key not in ('updated_at','updated_by','created_at') and value is distinct from to_jsonb(previous)->key;
    differences:='[]'; protected:='[]';
    foreach field_name in array array['customer','origin_city','origin_state','origin_address','dest_city','dest_state','dest_address','pickup_appt','pickup_actual','pickup_delta_min','delivery_appt','delivery_actual','delivery_delta_min','truck','trailer','work_order','bol','doc_status','doda','entry','exportacion','importacion','pedimentos','regresos','sobre_listo','loaded_miles','empty_miles','rpm','charges','tracking_link','eta_note','salida_mexico_fecha','cruce_usa_fecha','status'] loop
      if merged ? field_name and (merged->field_name) is distinct from to_jsonb(previous)->field_name then
        differences:=differences||jsonb_build_array(jsonb_build_object('field',field_name,'before',coalesce(to_jsonb(previous)->field_name,'""'::jsonb),'after',merged->field_name));
      end if;
      if field_name in ('truck','trailer') and previous.load is not null and to_jsonb(previous)->>(field_name||'_source')='MANUAL'
        and nullif(trim(to_jsonb(previous)->>field_name),'') is not null and nullif(trim(input->>field_name),'') is not null
        and trim(input->>field_name) is distinct from to_jsonb(previous)->>field_name then
        protected:=protected||jsonb_build_array(jsonb_build_object('field',field_name,'before',to_jsonb(previous)->field_name,'after',input->field_name));
      end if;
    end loop;
    result:=result||jsonb_build_array(jsonb_build_object('load',merged->>'load','customer',coalesce(merged->>'customer',previous.customer),'new',previous.load is null,'version',previous.updated_at,'changes',coalesce(changed,array[]::text[]),'differences',differences,'protected',protected,'validation_error',public.ops_load_date_error(merged)));
  end loop;
  return result;
end;
$$;

-- 3. Validar secuencias de citas nuevas sin impedir editar otros datos históricos.
create or replace function public.ops_load_date_error(p jsonb) returns text
language plpgsql immutable set search_path='' as $$
begin
 if nullif(p->>'pickup_appt','') is not null and nullif(p->>'delivery_appt','') is not null
  and (p->>'delivery_appt')::timestamptz < (p->>'pickup_appt')::timestamptz then return 'La cita de entrega no puede ser anterior al Pickup'; end if;
 if nullif(p->>'pickup_actual','') is not null and nullif(p->>'delivery_actual','') is not null
  and (p->>'delivery_actual')::timestamptz < (p->>'pickup_actual')::timestamptz then return 'La entrega real no puede ser anterior a la recolección real'; end if;
 return '';
exception when others then return 'Revisa el formato de las fechas de la carga';
end $$;
create or replace function public.ops_guard_load_dates() returns trigger language plpgsql security definer set search_path='' as $$
declare message text;
begin
 if TG_OP='INSERT' or new.pickup_appt is distinct from old.pickup_appt or new.delivery_appt is distinct from old.delivery_appt
  or new.pickup_actual is distinct from old.pickup_actual or new.delivery_actual is distinct from old.delivery_actual then
  message:=public.ops_load_date_error(to_jsonb(new)); if message<>'' then raise exception '%',message; end if;
 end if;
 return new;
end $$;
drop trigger if exists ab_guard_load_dates on public.loads;
create trigger ab_guard_load_dates before insert or update on public.loads for each row execute function public.ops_guard_load_dates();

-- 4. Preferencias de calendario privadas, independientes de plantillas y vistas.
alter table public.original_preferences add column if not exists personal_ui jsonb not null default '{}';
create or replace function public.ops_save_personal_ui(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare k text; saved jsonb;
begin
 perform public.ops_require_staff();
 if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>8000 then raise exception 'Preferencias no válidas'; end if;
 for k in select jsonb_object_keys(p_patch) loop
  if k not in ('calendar_client','calendar_view','calendar_hide_empty','show_crossings') then raise exception 'Preferencia no permitida'; end if;
  if k='calendar_view' and coalesce(p_patch->>k,'') not in ('agenda','week','list') then raise exception 'Vista de calendario no válida'; end if;
  if k='calendar_client' and (jsonb_typeof(p_patch->k)<>'string' or length(p_patch->>k)>600) then raise exception 'Cliente no válido'; end if;
  if k in ('calendar_hide_empty','show_crossings') and jsonb_typeof(p_patch->k)<>'boolean' then raise exception 'Indica sí o no'; end if;
 end loop;
 insert into public.original_preferences(user_id,personal_ui) values(auth.uid(),p_patch)
 on conflict(user_id) do update set personal_ui=original_preferences.personal_ui||excluded.personal_ui,updated_at=clock_timestamp()
 returning personal_ui into saved;
 return saved;
end $$;

-- 5. Leídos y pospuestos no completan tareas: solo guardan el estado personal del aviso.
create table if not exists public.personal_notice_state (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id),
 event_key text not null check(length(event_key) between 1 and 512),
 read_at timestamptz, snoozed_until timestamptz, updated_at timestamptz not null default now(),
 unique(user_id,event_key)
);
alter table public.personal_notice_state enable row level security;
drop policy if exists own_notice_state on public.personal_notice_state;
create policy own_notice_state on public.personal_notice_state for select to authenticated using(user_id=auth.uid() and public.panel_role() in ('admin','csr'));
revoke all on public.personal_notice_state from public,anon,authenticated;
grant select on public.personal_notice_state to authenticated;
create index if not exists personal_notice_state_user_updated on public.personal_notice_state(user_id,updated_at desc);
create or replace function public.ops_notice_state(p_changes jsonb default '[]') returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 perform public.ops_require_staff();
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>200 then raise exception 'Lista de avisos no válida'; end if;
 for item in select value from jsonb_array_elements(p_changes) loop
  if jsonb_typeof(item) is distinct from 'object' or length(coalesce(item->>'key','')) not between 1 and 512
   or coalesce(item->>'action','') not in ('read','snooze') then raise exception 'Acción de aviso no válida'; end if;
  insert into public.personal_notice_state(user_id,event_key,read_at,snoozed_until)
   values(auth.uid(),item->>'key',case when item->>'action'='read' then clock_timestamp() end,
    case when item->>'action'='snooze' then clock_timestamp()+interval '1 hour' end)
   on conflict(user_id,event_key) do update set
    read_at=coalesce(excluded.read_at,personal_notice_state.read_at),
    snoozed_until=coalesce(excluded.snoozed_until,personal_notice_state.snoozed_until),updated_at=clock_timestamp();
 end loop;
 return (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (
  select event_key,read_at,snoozed_until,updated_at from public.personal_notice_state where user_id=auth.uid() order by updated_at desc limit 200
 ) s);
end $$;

-- 6. El mensaje confirmado se guarda privado. El portal y los envíos automáticos siguen desactivados.
alter table public.communications add column if not exists manual_message text not null default '' check(length(manual_message)<=10000);
create or replace function public.log_load_communication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.client_notify_pending='true' and new.client_notify_since is distinct from old.client_notify_since then
  insert into public.communications(load,event_type,reason,actor) values(new.load,'PENDIENTE',new.client_notify_reason,auth.uid());
 end if;
 if new.client_notified_at<>'' and new.client_notified_at is distinct from old.client_notified_at then
  insert into public.communications(load,event_type,reason,actor,channel,notice_type,manual_message)
  values(new.load,'NOTIFICADO',old.client_notify_reason,auth.uid(),new.last_communication_channel,new.last_communication_type,
   coalesce(current_setting('panel.manual_notice_body',true),''));
 end if;
 return new;
end $$;
create or replace function public.ops_record_manual_notice(p_load text,p_version timestamptz,p_channel text,p_type text,p_message text default null)
returns setof public.loads language plpgsql security definer set search_path='' as $$
begin
 perform public.ops_require_staff();
 if p_message is not null and length(trim(p_message)) not between 1 and 10000 then raise exception 'Escribe un mensaje de hasta 10000 caracteres'; end if;
 perform set_config('panel.manual_notice_body',coalesce(p_message,''),true);
 return query select * from public.confirm_client_notice(p_load,p_version,p_channel,p_type);
 perform set_config('panel.manual_notice_body','',true);
end $$;
create or replace function public.ops_customer_communications(p_customer text,p_offset integer default 0,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.ops_require_reader();
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'Página no válida'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (
  select c.id,c.load,c.event_type,c.reason,c.actor,c.channel,c.notice_type,c.public_message,c.manual_message,c.created_at
  from public.communications c join public.loads l on l.load=c.load
  where public.ops_customer_key(public.ops_canonical_customer(l.customer))=public.ops_customer_key(public.ops_canonical_customer(p_customer))
   and public.ops_can_read_load(l.load,l.customer)
  order by c.created_at desc,c.id desc offset p_offset limit p_limit
 ) c);
end $$;

-- 7. Enlaces de documentos: sin almacenamiento nuevo ni descargas públicas del panel.
create table if not exists public.load_document_links (
 id uuid primary key default gen_random_uuid(), load text not null references public.loads(load) on delete cascade,
 kind text not null check(kind in ('pod','bol','doda','entry','other')), label text not null check(length(trim(label)) between 1 and 200),
 url text not null check(url ~ '^https://' and length(url)<=2000),
 created_by uuid not null default auth.uid() references public.profiles(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists load_document_links_load on public.load_document_links(load,created_at desc) where deleted_at is null;
alter table public.load_document_links enable row level security;
drop policy if exists document_load_scope on public.load_document_links;
create policy document_load_scope on public.load_document_links for select to authenticated
 using(exists(select 1 from public.loads l where l.load=load_document_links.load and public.ops_can_read_load(l.load,l.customer)));
revoke all on public.load_document_links from public,anon,authenticated;
grant select on public.load_document_links to authenticated;
create or replace function public.ops_save_document_link(p_load text,p_id uuid,p_version timestamptz,p_kind text,p_label text,p_url text)
returns public.load_document_links language plpgsql security definer set search_path='' as $$
declare saved public.load_document_links; owner public.loads;
begin
 perform public.ops_require_staff();
 select * into owner from public.loads where load=p_load;
 if not found or owner.archived or not public.ops_can_read_load(owner.load,owner.customer) then raise exception 'Carga no disponible para editar documentos'; end if;
 if coalesce(p_kind,'') not in ('pod','bol','doda','entry','other') or length(trim(coalesce(p_label,''))) not between 1 and 200
  or coalesce(p_url,'') !~ '^https://[^[:space:]]+$' or length(p_url)>2000 or p_url ~ '^https://[^/]*@' then raise exception 'Indica nombre, tipo y un enlace HTTPS válido sin credenciales'; end if;
 if p_id is null then
  insert into public.load_document_links(load,kind,label,url) values(p_load,p_kind,trim(p_label),trim(p_url)) returning * into saved;
 else
  update public.load_document_links set kind=p_kind,label=trim(p_label),url=trim(p_url),updated_at=clock_timestamp()
   where id=p_id and load=p_load and updated_at=p_version and deleted_at is null returning * into saved;
  if not found then raise exception 'El documento cambió. Actualiza antes de guardar'; end if;
 end if;
 perform public.ops_log_admin('document_link_saved',jsonb_build_object('load',p_load,'document',saved.id,'label',saved.label));
 return saved;
end $$;
create or replace function public.ops_remove_document_link(p_id uuid,p_version timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare doc public.load_document_links;
begin
 perform public.ops_require_staff();
 select * into doc from public.load_document_links where id=p_id for update;
 if not found or doc.updated_at is distinct from p_version or doc.deleted_at is not null
  or not exists(select 1 from public.loads l where l.load=doc.load and not archived and public.ops_can_read_load(l.load,l.customer)) then raise exception 'Documento no disponible o cambió'; end if;
 update public.load_document_links set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
 perform public.ops_log_admin('document_link_removed',jsonb_build_object('load',doc.load,'document',doc.id,'label',doc.label));
end $$;

-- 8. Salud de instalación y trabajo de millas, sin exponer el secreto del worker.
alter table public.original_google_worker_config
 add column if not exists last_run_at timestamptz,
 add column if not exists last_status text not null default '',
 add column if not exists last_summary jsonb not null default '{}';
create or replace function public.ops_google_worker_report(p_token text,p_summary jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.ops_require_google_worker(p_token);
 if jsonb_typeof(p_summary) is distinct from 'object' or octet_length(p_summary::text)>4000
  or coalesce(p_summary->>'status','') not in ('ok','time_limit','quota','connection_error','running') then raise exception 'Resumen de millas no válido'; end if;
 update public.original_google_worker_config set last_run_at=clock_timestamp(),last_status=p_summary->>'status',last_summary=p_summary where singleton;
end $$;
create or replace function public.ops_miles_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.ops_require_staff(true);
 return jsonb_build_object('last_run',(select last_run_at from public.original_google_worker_config where singleton),
  'status',(select last_status from public.original_google_worker_config where singleton),
  'enabled',(select enabled from public.original_google_worker_config where singleton),
  'paused_until',(select paused_until from public.original_google_worker_config where singleton),
  'last_summary',(select last_summary from public.original_google_worker_config where singleton),
  'pending',(select count(*) from public.original_routes where google_miles is null and google_state in ('pending','processing','retry')),
  'retry',(select count(*) from public.original_routes where google_miles is null and google_state='retry'),
  'completed',(select count(*) from public.original_routes where google_miles is not null),
  'no_route',(select count(*) from public.original_routes where google_miles is null and google_state='no_route'),
  'last_calculation',(select max(google_at) from public.original_routes), 'batch_limit',20);
end $$;
create or replace function public.ops_site_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.ops_require_reader();
 return jsonb_build_object('schema',20,'features',jsonb_build_array('personal_views','safe_import','manual_messages','document_links','calendar_preferences','notice_sync','route_instructions'));
end $$;

-- Archivo, autor y fecha identifican exactamente la importación que se deshace.
create or replace function public.ops_original_import_info() returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch public.import_batches;
begin
 perform public.ops_require_staff();
 select * into batch from public.import_batches order by created_at desc,id limit 1;
 return jsonb_build_object('lastImportAt',coalesce(batch.created_at::text,''),'fileName',coalesce(batch.file_name,''),
  'author',coalesce((select display_name from public.profiles where id=batch.created_by),''),'batch',batch.id,
  'deshacerDisponibleDesde',case when public.panel_role()='admin' and batch.undone_at is null then coalesce(batch.created_at::text,'') else '' end);
end $$;

-- Revisiones y respaldos incluyen los enlaces y el estado de avisos, ambos privados en la aplicación.
drop trigger if exists panel_revision on public.load_document_links;
create trigger panel_revision before insert or update or delete on public.load_document_links for each statement execute function public.ops_bump_revision('documentos');
insert into public.panel_revisions(area,revision) values('documentos',nextval('public.panel_revision_seq')) on conflict do nothing;

create or replace function public.ops_backup_tables() returns text[] language sql immutable set search_path='' as $$ select array[
 'profiles','personal_notice_state','route_instruction_templates','loads','load_document_links','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history','vg_contacts','reserved_loads','reserved_load_history',
 'customer_assignments','load_followers','user_following','task_checklist_templates','task_schedules','shift_tasks','shift_task_history','task_checklist_items','task_dependencies',
 'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places','original_places','original_routes','original_radar','original_preferences',
 'panel_settings','customer_aliases','operational_alerts']::text[] $$;

revoke all on function public.ops_load_date_error(jsonb),public.ops_guard_load_dates(),public.ops_save_personal_ui(jsonb),public.ops_notice_state(jsonb),
 public.ops_record_manual_notice(text,timestamptz,text,text,text),public.ops_save_document_link(text,uuid,timestamptz,text,text,text),public.ops_remove_document_link(uuid,timestamptz),
 public.ops_google_worker_report(text,jsonb),public.ops_miles_dashboard(),public.ops_site_status() from public,anon,authenticated;
grant execute on function public.ops_save_personal_ui(jsonb),public.ops_notice_state(jsonb),public.ops_record_manual_notice(text,timestamptz,text,text,text),
 public.ops_save_document_link(text,uuid,timestamptz,text,text,text),public.ops_remove_document_link(uuid,timestamptz),public.ops_miles_dashboard(),public.ops_site_status() to authenticated;
grant execute on function public.ops_google_worker_report(text,jsonb) to anon;


-- Archivo: 021_gmail_per_load.sql
-- GMAIL POR CARGA. Requiere 020. No activa envíos ni cambia WhatsApp.
create table if not exists public.gmail_connections (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 email text not null, refresh_encrypted text not null, updated_at timestamptz not null default now()
);
create table if not exists public.gmail_oauth_states (
 state_hash text primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null, verifier_encrypted text not null
);
create table if not exists public.load_gmail_threads (
 id uuid not null unique default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 load text not null references public.loads(load) on delete cascade,
 url text not null, thread_id text not null, updated_at timestamptz not null default now(),
 primary key(user_id,load)
);
create table if not exists public.load_gmail_outbox (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 load text not null references public.loads(load) on delete cascade,
 preview jsonb not null, fingerprint text not null,
 state text not null default 'prepared' check(state in ('prepared','sending','uncertain','sent')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 claimed_at timestamptz, sent_at timestamptz, message_id text, gmail_thread_id text,
 unique(user_id,load,fingerprint)
);
-- Solo el servidor accede a secretos y resultados de Gmail. Ningún JWT del navegador escribe estas tablas.
alter table public.gmail_connections enable row level security;
alter table public.gmail_oauth_states enable row level security;
alter table public.load_gmail_threads enable row level security;
alter table public.load_gmail_outbox enable row level security;
revoke all on public.gmail_connections,public.gmail_oauth_states,public.load_gmail_threads,public.load_gmail_outbox from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant all on public.gmail_connections,public.gmail_oauth_states,public.load_gmail_threads,public.load_gmail_outbox to service_role;
 end if;
end $$;

create or replace function public.ops_gmail_context(p_load text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare thread public.load_gmail_threads; history jsonb;
begin
 perform public.ops_require_staff();
 if not exists(select 1 from public.loads l where l.load=p_load and not l.archived and public.ops_can_read_load(l.load,l.customer)) then
  raise exception 'La carga no está disponible para tu cuenta';
 end if;
 select * into thread from public.load_gmail_threads where user_id=auth.uid() and load=p_load;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into history from
  (select id,preview,state,created_at,sent_at,message_id,gmail_thread_id from public.load_gmail_outbox
   where user_id=auth.uid() and load=p_load order by created_at desc limit 30) x;
 return jsonb_build_object('thread',to_jsonb(thread),'items',history);
end $$;

create or replace function public.ops_gmail_link(p_load text,p_url text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare thread_id text;
begin
 perform public.ops_gmail_context(p_load);
 -- Solo identificadores de hilo Gmail; no admite credenciales, búsquedas ni destinos externos.
 if length(p_url)>2000 or p_url !~ '^https://mail[.]google[.]com/mail/u/[0-9]+/#(inbox|all|sent|starred|important)/[A-Za-z0-9_-]+$' then
  raise exception 'Pega la liga de un hilo de Gmail abierto';
 end if;
 thread_id:=substring(p_url from '/([A-Za-z0-9_-]+)$');
 insert into public.load_gmail_threads(user_id,load,url,thread_id) values(auth.uid(),p_load,p_url,thread_id)
 on conflict(user_id,load) do update set url=excluded.url,thread_id=excluded.thread_id,updated_at=now();
 return public.ops_gmail_context(p_load);
end $$;

-- Una transición atómica y permanente. Nunca se libera por tiempo: evita repetir un envío incierto.
create or replace function public.ops_gmail_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.load_gmail_outbox;
begin
 select * into item from public.load_gmail_outbox where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Respuesta no disponible'; end if;
 perform public.ops_gmail_context(item.load);
 if item.state<>'prepared' then return jsonb_build_object('claimed',false,'item',to_jsonb(item)); end if;
 if item.expires_at<now() then raise exception 'La vista previa venció. Prepara otra respuesta'; end if;
 if not exists(select 1 from public.load_gmail_threads t where t.user_id=auth.uid() and t.load=item.load
  and t.thread_id=item.preview->>'threadId') then raise exception 'El hilo cambió. Prepara otra respuesta'; end if;
 update public.load_gmail_outbox set state='sending',claimed_at=now() where id=p_id returning * into item;
 return jsonb_build_object('claimed',true,'item',to_jsonb(item));
end $$;
revoke all on function public.ops_gmail_context(text),public.ops_gmail_link(text,text),public.ops_gmail_claim(uuid) from public,anon,authenticated;
grant execute on function public.ops_gmail_context(text),public.ops_gmail_link(text,text),public.ops_gmail_claim(uuid) to authenticated;
-- Los respaldos conservan ligas e historial, nunca secretos OAuth ni estados de consentimiento.
create or replace function public.ops_backup_tables() returns text[] language sql immutable set search_path='' as $$ select array[
 'profiles','personal_notice_state','route_instruction_templates','loads','load_document_links','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history','vg_contacts','reserved_loads','reserved_load_history',
 'customer_assignments','load_followers','user_following','task_checklist_templates','task_schedules','shift_tasks','shift_task_history','task_checklist_items','task_dependencies',
 'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places','original_places','original_routes','original_radar','original_preferences',
 'panel_settings','customer_aliases','operational_alerts','load_gmail_threads','load_gmail_outbox']::text[] $$;

commit;
