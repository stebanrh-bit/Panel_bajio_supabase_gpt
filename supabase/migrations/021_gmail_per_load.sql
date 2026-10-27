-- GMAIL POR CARGA. Requiere 020. No activa envíos ni cambia WhatsApp.
begin;
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
