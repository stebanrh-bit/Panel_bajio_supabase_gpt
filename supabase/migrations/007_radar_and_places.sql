-- RADAR COMPARTIDO Y UBICACIONES. Ejecutar completo después de 006.
begin;
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
commit;
