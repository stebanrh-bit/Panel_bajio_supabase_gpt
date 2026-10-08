-- PANEL BAJÍO: ACTUALIZACIÓN CONJUNTA 004–009.
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

commit;
