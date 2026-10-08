-- Aplicar una sola vez en un proyecto Supabase nuevo.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'pending' check (role in ('pending','admin','csr','manager'))
);
create function public.provision_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;
create trigger provision_profile after insert on auth.users for each row execute function public.provision_profile();
-- También crea perfiles para cuentas registradas antes de instalar las tablas.
insert into public.profiles(id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name', '') from auth.users
on conflict (id) do nothing;
create function public.panel_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create table public.loads (
  load text primary key check (length(trim(load)) > 0),
  customer text not null default '',
  origin_city text not null default '',
  origin_state text not null default '',
  origin_address text not null default '',
  dest_city text not null default '',
  dest_state text not null default '',
  dest_address text not null default '',
  pickup_appt text not null default '',
  pickup_actual text not null default '',
  pickup_delta_min text not null default '',
  delivery_appt text not null default '',
  delivery_actual text not null default '',
  delivery_delta_min text not null default '',
  truck text not null default '',
  trailer text not null default '',
  status text not null default '',
  work_order text not null default '',
  bol text not null default '',
  doc_status text not null default '',
  doda text not null default '',
  entry text not null default '',
  exportacion text not null default '',
  importacion text not null default '',
  pedimentos text not null default '',
  regresos text not null default '',
  sobre_listo text not null default '',
  loaded_miles text not null default '',
  empty_miles text not null default '',
  rpm text not null default '',
  charges text not null default '',
  created_at timestamptz not null default now(),
  tracking_link text not null default '',
  eta_note text not null default '',
  updated_at timestamptz not null default now(),
  pod_sent text not null default '',
  recargos_vg text not null default '',
  recordatorio_fecha text not null default '',
  color text not null default '',
  salida_mexico_fecha text not null default '',
  cruce_usa_fecha text not null default '',
  updated_by text not null default '',
  client_notify_pending text not null default '',
  client_notify_reason text not null default '',
  client_notified_at text not null default '',
  client_notified_by text not null default '',
  next_review_at text not null default '',
  next_review_note text not null default '',
  next_review_by text not null default '',
  truck_source text not null default '',
  truck_manual_by text not null default '',
  truck_manual_at text not null default '',
  truck_vg_value text not null default '',
  trailer_source text not null default '',
  trailer_manual_by text not null default '',
  trailer_manual_at text not null default '',
  trailer_vg_value text not null default '',
  operacion_pais text not null default '',
  llegada_planta_fecha text not null default '',
  ultima_revision_csr text not null default '',
  ultima_revision_csr_by text not null default '',
  siguiente_movimiento text not null default '',
  etd_operativa text not null default '',
  cruce_confirmado text not null default '',
  bol_source text not null default '',
  bol_manual_by text not null default '',
  bol_manual_at text not null default '',
  doda_source text not null default '',
  doda_manual_by text not null default '',
  doda_manual_at text not null default '',
  entry_source text not null default '',
  entry_manual_by text not null default '',
  entry_manual_at text not null default '',
  sobre_listo_source text not null default '',
  sobre_listo_manual_by text not null default '',
  sobre_listo_manual_at text not null default '',
  client_notify_since text not null default '',
  archived boolean not null default false
);
create index loads_customer_idx on public.loads(customer);
create index loads_updated_idx on public.loads(updated_at);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  load text not null references public.loads(load) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 10000),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  load text not null references public.loads(load) on delete restrict,
  category text not null check (length(trim(category)) between 1 and 100),
  severity text not null check (severity in ('baja','media','alta')),
  description text not null check (length(trim(description)) between 1 and 10000),
  action_taken text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index comments_load_idx on public.comments(load, created_at);
create index incidents_load_idx on public.incidents(load, created_at);
create table public.load_history (
  id uuid primary key default gen_random_uuid(),
  load text not null references public.loads(load) on delete restrict,
  actor uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
create function public.stamp_load() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid()::text, 'database');
  if TG_OP = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger stamp_load before insert or update on public.loads for each row execute function public.stamp_load();
create function public.audit_load() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.load_history(load, actor, before_data, after_data)
  values(new.load, auth.uid(), case when TG_OP = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end $$;
create trigger audit_load after insert or update on public.loads for each row execute function public.audit_load();
alter table public.profiles enable row level security;
alter table public.loads enable row level security;
alter table public.comments enable row level security;
alter table public.incidents enable row level security;
alter table public.load_history enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.panel_role() in ('admin','csr','manager'));
create policy loads_read on public.loads for select to authenticated using (public.panel_role() in ('admin','csr','manager'));
create policy loads_insert on public.loads for insert to authenticated with check (public.panel_role() in ('admin','csr'));
create policy loads_update on public.loads for update to authenticated using (public.panel_role() in ('admin','csr')) with check (public.panel_role() in ('admin','csr'));
create policy comments_read on public.comments for select to authenticated using (public.panel_role() in ('admin','csr','manager'));
create policy comments_insert on public.comments for insert to authenticated with check (public.panel_role() in ('admin','csr') and created_by = auth.uid());
create policy incidents_read on public.incidents for select to authenticated using (public.panel_role() in ('admin','csr','manager'));
create policy incidents_insert on public.incidents for insert to authenticated with check (public.panel_role() in ('admin','csr') and created_by = auth.uid());
create policy history_read on public.load_history for select to authenticated using (public.panel_role() in ('admin','csr','manager'));
revoke all on public.profiles, public.loads, public.comments, public.incidents, public.load_history from anon, authenticated;
grant select on public.profiles, public.load_history to authenticated;
grant select, insert, update on public.loads to authenticated;
grant select, insert on public.comments, public.incidents to authenticated;
revoke execute on function public.provision_profile(), public.stamp_load(), public.audit_load(), public.panel_role() from public;
grant execute on function public.panel_role() to authenticated;
commit;
