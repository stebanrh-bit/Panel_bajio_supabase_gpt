-- PANEL BAJÍO: CONSOLIDACIÓN PERSONAL R01–R20.
-- Copiar TODO a SQL Editor > New query > Run. Requiere 001 a 019.
-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.
begin;


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
