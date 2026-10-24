-- PANEL BAJÍO: VERSIÓN PERSONAL E INSTRUCTIVOS 013–016.
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


commit;
