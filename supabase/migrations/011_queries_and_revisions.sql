-- CONSULTAS ACOTADAS, REVISIONES E INTEGRIDAD DE RESPALDOS.
-- Aplicar completo después de 010. No elimina ni reescribe datos operativos.
begin;
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
commit;
