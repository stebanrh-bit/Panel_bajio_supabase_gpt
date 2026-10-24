-- BASE DE INSTRUCCIONES APROBADAS POR CLIENTE, RUTA Y ETAPA. Requiere 014.
-- Los borradores no gobiernan cargas. Las cargas conservan la versión aplicada.
begin;
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
commit;
