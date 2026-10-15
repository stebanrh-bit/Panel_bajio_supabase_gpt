-- MILLAS DE GOOGLE EN SEGUNDO PLANO. Requiere las migraciones 001–009.
-- Conserva las millas OSM y los resultados Google existentes. Se puede repetir.
begin;

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

commit;
