-- Compatibilidad con las tres interfaces originales. Aplicar después de 001–008.
-- Agrega datos y funciones; conserva todas las cargas, usuarios e historiales existentes.
begin;

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
