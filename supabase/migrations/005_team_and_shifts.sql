-- EQUIPO, CLIENTES, SEGUIMIENTO, TURNOS, PLANTILLAS Y PORTAL.
-- Ejecutar completo después de 004. Los cambios son aditivos y repetibles.
begin;

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
commit;
