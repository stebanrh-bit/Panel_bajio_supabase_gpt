-- PANEL BAJÍO: VERSIÓN PERSONAL E INSTRUCTIVOS 013–020.
-- Copiar TODO a SQL Editor > New query > Run. Requiere 001 a 012.
-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.
begin;


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

commit;
