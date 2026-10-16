-- REGLAS CONFIGURABLES Y ORGANIZACIÓN DEL TURNO. Requiere 011.
-- Predeterminados: CSR consulta toda la operación; sin correo ni borrado automáticos.
begin;
create table if not exists public.panel_settings (
  singleton boolean primary key default true check(singleton),
  csr_visibility text not null default 'all' check(csr_visibility='all'),
  status_transitions jsonb not null default '{}' check(jsonb_typeof(status_transitions)='object'),
  escalation_enabled boolean not null default false,
  escalation_hours integer not null default 24 check(escalation_hours between 1 and 720),
  supervisor_id uuid references public.profiles(id),
  external_alerts_enabled boolean not null default false,
  alert_channel text not null default 'disabled' check(alert_channel in ('disabled','google_email')),
  archive_days integer check(archive_days between 30 and 3650),
  import_retention_days integer check(import_retention_days between 30 and 3650),
  updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
insert into public.panel_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.customer_aliases (
  alias_key text primary key, alias text not null check(length(trim(alias)) between 1 and 500),
  canonical_name text not null check(length(trim(canonical_name)) between 1 and 500),
  updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  check(alias_key=public.ops_customer_key(alias))
);
create table if not exists public.vg_contacts (
  id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),
  company text not null default 'VG' check(length(company)<=200),phone text not null default '' check(length(phone)<=100),
  email text not null default '' check(length(email)<=320),note text not null default '' check(length(note)<=1000),
  active boolean not null default true,created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.task_checklist_templates (
  id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50),
  created_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
create table if not exists public.task_schedules (
  id uuid primary key default gen_random_uuid(),load text references public.loads(load),
  note text not null check(length(trim(note)) between 1 and 9500),assigned_to uuid not null references public.profiles(id),
  cadence text not null check(cadence in ('daily','weekly')),weekdays integer[] not null default '{1,2,3,4,5}',
  local_time time not null,timezone text not null default 'America/Mexico_City' check(timezone='America/Mexico_City'),
  next_run_at timestamptz not null,active boolean not null default true,
  checklist_id uuid references public.task_checklist_templates(id),created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6])
);
alter table public.shift_tasks add column if not exists schedule_id uuid references public.task_schedules(id);
alter table public.shift_tasks add column if not exists scheduled_for timestamptz;
alter table public.shift_tasks add column if not exists cancel_reason text not null default '';
create unique index if not exists task_schedule_occurrence on public.shift_tasks(schedule_id,scheduled_for) where schedule_id is not null;
create table if not exists public.task_checklist_items (
  task_id uuid not null references public.shift_tasks(id),item_id uuid not null default gen_random_uuid(),
  label text not null check(length(trim(label)) between 1 and 500),required boolean not null default true,
  done boolean not null default false,done_by uuid references public.profiles(id),done_at timestamptz,
  position integer not null,primary key(task_id,item_id),check(done=(done_at is not null)),check(done=(done_by is not null))
);
create table if not exists public.task_dependencies (
  task_id uuid not null references public.shift_tasks(id),depends_on uuid not null references public.shift_tasks(id),
  primary key(task_id,depends_on),check(task_id<>depends_on)
);
create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),recipient uuid not null references public.profiles(id),
  task_id uuid references public.shift_tasks(id),load text references public.loads(load),
  kind text not null check(kind in ('task_due','escalation','load_review')),message text not null,
  dedupe_key text not null unique,created_at timestamptz not null default now(),read_at timestamptz,
  emailed_at timestamptz,claim_id uuid,lease_until timestamptz,attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),last_error text not null default ''
);
create index if not exists operational_alerts_recipient on public.operational_alerts(recipient,created_at desc);
create index if not exists operational_alerts_unsent on public.operational_alerts(next_attempt_at) where emailed_at is null;
create index if not exists task_schedules_due on public.task_schedules(next_run_at) where active;
alter table public.reserved_loads add column if not exists related_load text references public.loads(load);
alter table public.reserved_loads add column if not exists free_reference text not null default '' check(length(free_reference)<=500);
alter table public.reserved_loads add column if not exists vg_contact_id uuid references public.vg_contacts(id);
alter table public.loads add column if not exists cancel_reason text not null default '';
alter table public.pending_loads add column if not exists cancel_reason text not null default '';
alter table public.shift_closures add column if not exists critical_pending text not null default '';
alter table public.shift_closures add column if not exists responsible_id uuid references public.profiles(id);
alter table public.shift_closures add column if not exists next_action text not null default '';

-- Lecturas y escrituras tienen contratos diferentes. Ninguna tabla nueva admite escritura directa.
do $$ declare name text; begin
  foreach name in array array['panel_settings','customer_aliases','vg_contacts','task_checklist_templates','task_schedules','task_checklist_items','task_dependencies','operational_alerts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('drop policy if exists panel_staff_read on public.%I',name);
    execute format('create policy panel_staff_read on public.%I for select to authenticated using (public.panel_role() in (''admin'',''csr'',''manager''))',name);
    execute format('grant select on public.%I to authenticated',name);
  end loop;
end $$;
drop policy if exists panel_staff_read on public.operational_alerts;
drop policy if exists panel_alert_read on public.operational_alerts;
create policy panel_alert_read on public.operational_alerts for select to authenticated using(recipient=auth.uid() and public.panel_role() in ('admin','csr','manager'));
grant update(cancel_reason) on public.loads to authenticated;

create or replace function public.ops_canonical_customer(p_name text) returns text
language sql stable security definer set search_path='' as $$
  select coalesce((select canonical_name from public.customer_aliases where alias_key=public.ops_customer_key(p_name)),trim(coalesce(p_name,'')))
$$;
create or replace function public.ops_guard_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare allowed jsonb;
begin
  if TG_OP='INSERT' or new.customer is distinct from old.customer then new.customer:=public.ops_canonical_customer(new.customer); end if;
  if TG_OP='UPDATE' and new.status is distinct from old.status then
    select status_transitions->old.status into allowed from public.panel_settings where singleton;
    if allowed is not null and (jsonb_typeof(allowed)<>'array' or not(allowed ? new.status)) then
      raise exception 'Ese avance no está permitido por las reglas del panel';
    end if;
  end if;
  if (TG_OP='INSERT' or new.status is distinct from old.status) and lower(rtrim(trim(new.status),'.'))='cancelado'
    and length(trim(coalesce(new.cancel_reason,''))) not between 3 and 1000 then raise exception 'Indica el motivo de cancelación (3 a 1000 caracteres)'; end if;
  return new;
end $$;
drop trigger if exists zz_panel_status on public.loads;
create trigger zz_panel_status before insert or update on public.loads for each row execute function public.ops_guard_status();

create or replace function public.ops_save_panel_settings(p_values jsonb,p_version timestamptz) returns public.panel_settings
language plpgsql security definer set search_path='' as $$
declare saved public.panel_settings; item record; supervisor uuid;
begin
  perform public.ops_require_staff(true);
  select * into saved from public.panel_settings where singleton for update;
  if saved.updated_at is distinct from p_version then raise exception 'Las reglas cambiaron; vuelve a cargarlas'; end if;
  supervisor:=nullif(p_values->>'supervisor_id','')::uuid;
  if supervisor is not null and not exists(select 1 from public.profiles where id=supervisor and active and role='admin') then raise exception 'Elige una cuenta administrativa para la supervisión'; end if;
  if jsonb_typeof(coalesce(p_values->'status_transitions','{}'))<>'object' then raise exception 'Transiciones no válidas'; end if;
  for item in select * from jsonb_each(coalesce(p_values->'status_transitions','{}')) loop
    if length(item.key)>100 or jsonb_typeof(item.value)<>'array' or jsonb_array_length(item.value)>50 then raise exception 'Transiciones no válidas'; end if;
  end loop;
  update public.panel_settings set status_transitions=coalesce(p_values->'status_transitions','{}'),
    escalation_enabled=coalesce((p_values->>'escalation_enabled')::boolean,false),
    escalation_hours=coalesce((p_values->>'escalation_hours')::integer,24),supervisor_id=supervisor,
    external_alerts_enabled=coalesce((p_values->>'external_alerts_enabled')::boolean,false),
    alert_channel=coalesce(p_values->>'alert_channel','disabled'),
    archive_days=nullif(p_values->>'archive_days','')::integer,import_retention_days=nullif(p_values->>'import_retention_days','')::integer,
    updated_by=auth.uid(),updated_at=now() where singleton returning * into saved;
  if saved.external_alerts_enabled and saved.alert_channel='disabled' then raise exception 'Elige un canal antes de activar el envío'; end if;
  if saved.escalation_enabled and saved.supervisor_id is null then raise exception 'Elige a quién se escalarán los pendientes'; end if;
  perform public.ops_log_admin('panel_settings_saved',jsonb_build_object('settings',to_jsonb(saved)));
  return saved;
end $$;
create or replace function public.ops_save_customer_alias(p_alias text,p_canonical text) returns void
language plpgsql security definer set search_path='' as $$
declare key text:=public.ops_customer_key(p_alias);
begin
  perform public.ops_require_staff(true);
  if length(trim(p_alias)) not between 1 and 500 or length(trim(p_canonical)) not between 1 and 500 then raise exception 'Indica alias y nombre del cliente'; end if;
  if exists(select 1 from public.customer_aliases where alias_key=public.ops_customer_key(p_canonical) and public.ops_customer_key(canonical_name)<>public.ops_customer_key(p_canonical)) then raise exception 'Usa un nombre principal, no otro alias'; end if;
  if exists(select 1 from public.customer_aliases where public.ops_customer_key(canonical_name)=key and public.ops_customer_key(p_canonical)<>key) then raise exception 'Ese nombre ya es principal de otros alias'; end if;
  if exists(select 1 from public.customer_assignments a join public.customer_assignments b on a.owner_id<>b.owner_id
    where a.customer_key=key and b.customer_key=public.ops_customer_key(p_canonical)) then raise exception 'Los nombres tienen CSR distintos. Resuelve la asignación antes de unirlos'; end if;
  insert into public.customer_aliases(alias_key,alias,canonical_name,updated_by) values(key,trim(p_alias),trim(p_canonical),auth.uid())
    on conflict(alias_key) do update set alias=excluded.alias,canonical_name=excluded.canonical_name,updated_by=auth.uid(),updated_at=now();
  -- Un nombre nuevo hereda el mismo CSR; nunca cambia las asignaciones que ya existen.
  insert into public.customer_assignments(customer,owner_id,updated_by)
    select trim(p_canonical),owner_id,auth.uid() from public.customer_assignments where customer_key=key
    on conflict(customer_key) do nothing;
  perform public.ops_log_admin('customer_alias_saved',jsonb_build_object('alias',p_alias,'canonical',p_canonical));
end $$;
create or replace function public.ops_save_vg_contact(p_id uuid,p_version timestamptz,p_values jsonb) returns public.vg_contacts
language plpgsql security definer set search_path='' as $$
declare saved public.vg_contacts;
begin
  perform public.ops_require_staff();
  if p_id is not null then
    select * into saved from public.vg_contacts where id=p_id for update;
    if not found or saved.updated_at is distinct from p_version then raise exception 'El contacto cambió; actualiza la agenda'; end if;
  end if;
  if coalesce(p_values->>'email','')<>'' and (p_values->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Revisa el correo del contacto'; end if;
  insert into public.vg_contacts(id,name,company,phone,email,note,active,created_by)
  values(coalesce(p_id,gen_random_uuid()),trim(p_values->>'name'),coalesce(p_values->>'company','VG'),coalesce(p_values->>'phone',''),coalesce(p_values->>'email',''),coalesce(p_values->>'note',''),coalesce((p_values->>'active')::boolean,true),auth.uid())
  on conflict(id) do update set name=excluded.name,company=excluded.company,phone=excluded.phone,email=excluded.email,note=excluded.note,active=excluded.active,updated_at=now() returning * into saved;
  return saved;
end $$;
create or replace function public.ops_save_reserved_details(p_id uuid,p_version timestamptz,p_values jsonb) returns public.reserved_loads
language plpgsql security definer set search_path='' as $$
declare saved public.reserved_loads; before_extra jsonb; related text:=nullif(trim(p_values->>'related_load'),''); old_related text; old_contact uuid;
begin
  perform public.ops_require_staff();
  select related_load,vg_contact_id into old_related,old_contact from public.reserved_loads where id=p_id;
  if related is distinct from old_related and related is not null and not exists(select 1 from public.loads where load=related and not archived and lower(rtrim(trim(status),'.')) not in ('delivered','completed','entregado','completado','cancelado','tonu')) then raise exception 'Elige una carga activa para relacionar'; end if;
  if nullif(p_values->>'vg_contact_id','')::uuid is distinct from old_contact and nullif(p_values->>'vg_contact_id','') is not null and not exists(select 1 from public.vg_contacts where id=(p_values->>'vg_contact_id')::uuid and active) then raise exception 'El contacto ya no está activo'; end if;
  saved:=public.save_reserved_load(p_values,p_id,p_version);
  before_extra:=to_jsonb(saved);
  update public.reserved_loads set related_load=related,free_reference=coalesce(p_values->>'free_reference',''),vg_contact_id=nullif(p_values->>'vg_contact_id','')::uuid
    where id=saved.id returning * into saved;
  if to_jsonb(saved) is distinct from before_extra then
    insert into public.reserved_load_history(reserved_id,event,note,actor,before_data,after_data)
    values(saved.id,'edited','Actualizó la carga relacionada o contacto VG',auth.uid(),before_extra,to_jsonb(saved));
  end if;
  return saved;
end $$;

create or replace function public.ops_save_checklist(p_id uuid,p_version timestamptz,p_name text,p_items jsonb) returns public.task_checklist_templates
language plpgsql security definer set search_path='' as $$
declare saved public.task_checklist_templates; item jsonb;
begin
  perform public.ops_require_staff();
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Agrega entre 1 y 50 pasos'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if length(trim(coalesce(item->>'label',''))) not between 1 and 500 then raise exception 'Describe cada paso del checklist'; end if;
  end loop;
  if p_id is not null then
    select * into saved from public.task_checklist_templates where id=p_id for update;
    if not found or saved.updated_at is distinct from p_version or not(public.panel_role()='admin' or saved.created_by=auth.uid()) then raise exception 'La plantilla cambió o no puedes editarla'; end if;
  end if;
  insert into public.task_checklist_templates(id,name,items,created_by) values(coalesce(p_id,gen_random_uuid()),trim(p_name),p_items,auth.uid())
    on conflict(id) do update set name=excluded.name,items=excluded.items,updated_at=now() returning * into saved;
  return saved;
end $$;
create or replace function public.ops_attach_checklist(p_task uuid,p_version timestamptz,p_template uuid) returns void
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks; template public.task_checklist_templates; item jsonb; i integer:=0;
begin
  task:=public.ops_lock_task(p_task,p_version);
  select * into template from public.task_checklist_templates where id=p_template;
  if not found or task.state<>'open' then raise exception 'Elige una plantilla y una tarea abierta'; end if;
  if exists(select 1 from public.task_checklist_items where task_id=p_task) then raise exception 'La tarea ya tiene checklist'; end if;
  for item in select value from jsonb_array_elements(template.items) loop
    insert into public.task_checklist_items(task_id,label,required,position) values(p_task,trim(item->>'label'),coalesce((item->>'required')::boolean,true),i);i:=i+1;
  end loop;
  update public.shift_tasks set updated_at=now() where id=p_task;
  insert into public.shift_task_history(task_id,event,actor,after_data) values(p_task,'checklist_added',auth.uid(),jsonb_build_object('template',template.name));
end $$;
create or replace function public.ops_check_task_item(p_task uuid,p_item uuid,p_done boolean) returns void
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks;
begin
  perform public.ops_require_staff();
  select * into task from public.shift_tasks where id=p_task for update;
  if not found or task.state<>'open' or not coalesce(public.ops_task_access(task.created_by,task.assigned_to,task.assigned_csr),false) then raise exception 'La tarea no está abierta o no tienes acceso'; end if;
  update public.task_checklist_items set done=p_done,done_by=case when p_done then auth.uid() end,done_at=case when p_done then now() end where task_id=p_task and item_id=p_item;
  if not found then raise exception 'El paso ya no existe'; end if;
  update public.shift_tasks set updated_at=now() where id=p_task;
  insert into public.shift_task_history(task_id,event,actor,after_data) values(p_task,'checklist_changed',auth.uid(),jsonb_build_object('item',p_item,'done',p_done));
end $$;
create or replace function public.ops_set_task_dependency(p_task uuid,p_version timestamptz,p_depends uuid,p_add boolean) returns void
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks; other public.shift_tasks;
begin
  -- Serializa la comprobación de ciclos: dos altas simultáneas no pueden crear A→B→A.
  perform pg_advisory_xact_lock(607035);
  task:=public.ops_lock_task(p_task,p_version);
  select * into other from public.shift_tasks where id=p_depends;
  if not found or task.state<>'open' or not coalesce(public.ops_task_access(other.created_by,other.assigned_to,other.assigned_csr),false) then raise exception 'No puedes relacionar esas tareas'; end if;
  if p_add then
    if p_task=p_depends or exists(with recursive chain(id) as (select p_depends union select d.depends_on from public.task_dependencies d join chain c on d.task_id=c.id) select 1 from chain where id=p_task) then raise exception 'Las tareas no pueden depender de sí mismas ni formar un ciclo'; end if;
    insert into public.task_dependencies(task_id,depends_on) values(p_task,p_depends) on conflict do nothing;
  else delete from public.task_dependencies where task_id=p_task and depends_on=p_depends;
  end if;
  update public.shift_tasks set updated_at=now() where id=p_task;
  insert into public.shift_task_history(task_id,event,actor,after_data) values(p_task,'dependency_changed',auth.uid(),jsonb_build_object('depends_on',p_depends,'added',p_add));
end $$;

create or replace function public.ops_change_task_state(p_id uuid,p_version timestamptz,p_state text,p_reason text default '')
returns public.shift_tasks language plpgsql security definer set search_path='' as $$
declare previous public.shift_tasks; saved public.shift_tasks;
begin
  previous:=public.ops_lock_task(p_id,p_version);
  if p_state is null or p_state not in ('open','resolved','cancelled') or previous.state='cancelled' or previous.state=p_state then raise exception 'Ese cambio no está permitido'; end if;
  if p_state='cancelled' and length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Indica el motivo de cancelar la tarea (3 a 1000 caracteres)'; end if;
  if p_state='resolved' and exists(select 1 from public.task_checklist_items where task_id=p_id and required and not done) then raise exception 'Completa los pasos obligatorios antes de resolver'; end if;
  if p_state='resolved' and exists(select 1 from public.task_dependencies d join public.shift_tasks t on t.id=d.depends_on where d.task_id=p_id and t.state<>'resolved') then raise exception 'Primero completa las tareas de las que depende'; end if;
  update public.shift_tasks set state=p_state,resolved_at=case when p_state='resolved' then now() end,
    cancel_reason=case when p_state='cancelled' then trim(p_reason) else cancel_reason end,updated_at=now()
    where id=p_id returning * into saved;
  insert into public.shift_task_history(task_id,event,actor,before_data,after_data) values(p_id,p_state,auth.uid(),to_jsonb(previous),to_jsonb(saved));
  return saved;
end $$;
create or replace function public.ops_set_task_state(p_id uuid,p_version timestamptz,p_state text) returns public.shift_tasks
language sql security definer set search_path='' as $$ select public.ops_change_task_state(p_id,p_version,p_state,'') $$;
create or replace function public.ops_task_details(p_id uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.shift_tasks;
begin
  select * into task from public.shift_tasks where id=p_id;
  if not found or not coalesce(public.ops_task_access(task.created_by,task.assigned_to,task.assigned_csr),false) then raise exception 'No puedes consultar esta tarea'; end if;
  if p_offset<0 then raise exception 'Página no válida'; end if;
  return jsonb_build_object('task',to_jsonb(task),'checklist',coalesce((select jsonb_agg(to_jsonb(i) order by position,item_id) from public.task_checklist_items i where task_id=p_id),'[]'),
    'dependencies',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'note',t.note,'state',t.state)) from public.task_dependencies d join public.shift_tasks t on t.id=d.depends_on
      where d.task_id=p_id and public.ops_task_access(t.created_by,t.assigned_to,t.assigned_csr)),'[]'),
    'history',coalesce((select jsonb_agg(to_jsonb(h)) from(select * from public.shift_task_history where task_id=p_id order by changed_at desc,id desc offset p_offset limit 50) h),'[]'));
end $$;

create or replace function public.ops_next_task_time(p_cadence text,p_weekdays integer[],p_time time,p_after timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare day date; candidate timestamptz; i integer;
begin
  for i in 0..7 loop
    day:=(p_after at time zone 'America/Mexico_City')::date+i;
    candidate:=(day+p_time) at time zone 'America/Mexico_City';
    if candidate>p_after and (p_cadence='daily' or extract(dow from day)::integer=any(p_weekdays)) then return candidate; end if;
  end loop;
  raise exception 'No se pudo calcular la próxima ejecución';
end $$;
create or replace function public.ops_save_task_schedule(p_id uuid,p_version timestamptz,p_values jsonb) returns public.task_schedules
language plpgsql security definer set search_path='' as $$
declare saved public.task_schedules; assignee uuid; load_number text; weekdays integer[]; cadence text; time_of_day time;
begin
  perform public.ops_require_staff();
  if p_id is not null then
    select * into saved from public.task_schedules where id=p_id for update;
    if not found or saved.updated_at is distinct from p_version or not(public.panel_role()='admin' or saved.created_by=auth.uid()) then raise exception 'La programación cambió o no puedes editarla'; end if;
  end if;
  assignee:=(p_values->>'assigned_to')::uuid;load_number:=nullif(trim(p_values->>'load'),'');
  if not exists(select 1 from public.profiles where id=assignee and active and role in ('admin','csr')) then raise exception 'Elige una persona activa del panel'; end if;
  if load_number is not null and not exists(select 1 from public.loads where load=load_number and not archived and lower(trim(status)) not in ('delivered','completed','entregado','completado','cancelado','cancelado.','tonu')) then raise exception 'La carga relacionada debe estar activa'; end if;
  cadence:=p_values->>'cadence'; time_of_day:=(p_values->>'local_time')::time;
  select array_agg(value::integer) into weekdays from jsonb_array_elements_text(coalesce(p_values->'weekdays','[1,2,3,4,5]'));
  insert into public.task_schedules(id,load,note,assigned_to,cadence,weekdays,local_time,next_run_at,active,checklist_id,created_by)
  values(coalesce(p_id,gen_random_uuid()),load_number,trim(p_values->>'note'),assignee,cadence,weekdays,time_of_day,
    public.ops_next_task_time(cadence,weekdays,time_of_day,now()),coalesce((p_values->>'active')::boolean,true),nullif(p_values->>'checklist_id','')::uuid,auth.uid())
  on conflict(id) do update set load=excluded.load,note=excluded.note,assigned_to=excluded.assigned_to,cadence=excluded.cadence,weekdays=excluded.weekdays,
    local_time=excluded.local_time,next_run_at=excluded.next_run_at,active=excluded.active,checklist_id=excluded.checklist_id,updated_at=now() returning * into saved;
  return saved;
end $$;

-- Los datos importados antiguos pueden contener una fecha libre: no detienen el lote.
-- Entregar sin POD o cerrar TONU sin recargos todavía deja trabajo operativo pendiente.
create or replace function public.ops_load_finalized(p public.loads) returns boolean
language sql immutable set search_path='' as $$ select coalesce((p).archived,false)
  or lower(rtrim(trim((p).status),'.'))='cancelado'
  or (lower(trim((p).status)) in ('delivered','completed','entregado','completado') and (p).pod_sent='true')
  or (lower(trim((p).status))='tonu' and (p).recargos_vg='true') $$;
create or replace function public.ops_safe_deadline(p_value text) returns timestamptz
language plpgsql stable set search_path='' as $$ begin return nullif(p_value,'')::timestamptz; exception when others then return null; end $$;
create or replace function public.ops_alert_current(a public.operational_alerts) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare t public.shift_tasks; l public.loads; c public.panel_settings; d text; k text;
begin
  if a.load is not null then
    select * into l from public.loads where load=a.load;
    if not found or public.ops_load_finalized(l) then return false; end if;
  end if;
  if a.task_id is not null then
    select * into t from public.shift_tasks where id=a.task_id;
    if not found or t.state<>'open' or t.follow_up_at is null or t.follow_up_at>now() then return false; end if;
    if a.kind='task_due' then return a.recipient=coalesce(t.assigned_to,t.assigned_csr) and a.dedupe_key='task:'||t.id::text||':'||t.follow_up_at::text; end if;
    select * into c from public.panel_settings where singleton;
    return c.escalation_enabled and a.recipient=c.supervisor_id and exists(select 1 from public.profiles where id=c.supervisor_id and active and role='admin') and t.follow_up_at+make_interval(hours=>c.escalation_hours)<=now() and a.dedupe_key='escalation:'||t.id::text||':'||t.follow_up_at::text||':'||c.supervisor_id::text;
  end if;
  foreach k in array array['revision_operativa','seguimiento_personal'] loop
    d:=case k when 'revision_operativa' then l.recordatorio_fecha else l.next_review_at end;
    if public.ops_safe_deadline(d)<=now() and a.dedupe_key='review:'||l.load||':'||k||':'||d||':'||a.recipient::text then
      return exists(select 1 from public.load_followers where load=l.load and user_id=a.recipient)
        or exists(select 1 from public.customer_assignments where owner_id=a.recipient and public.ops_customer_key(public.ops_canonical_customer(customer))=public.ops_customer_key(public.ops_canonical_customer(l.customer)))
        or (k='seguimiento_personal' and exists(select 1 from public.profiles where id=a.recipient and l.next_review_by in(id::text,display_name)));
    end if;
  end loop;
  return false;
end $$;
create or replace function public.ops_visible_alerts() returns setof public.operational_alerts
language sql stable security definer set search_path='' as $$
  select a.* from public.operational_alerts a where recipient=auth.uid() and public.panel_role() in ('admin','csr','manager') and read_at is null and public.ops_alert_current(a) order by created_at desc,id limit 100
$$;
-- Solo el worker limitado o Admin invocan esta tarea. Una ejecución tardía genera una ocurrencia,
-- avanza al próximo horario futuro y no inunda el turno con días de tareas omitidas.
create or replace function public.ops_tick_tasks_internal() returns jsonb
language plpgsql security definer set search_path='' as $$
declare schedule public.task_schedules; task public.shift_tasks; step jsonb; pos integer; config public.panel_settings; generated integer:=0; added integer:=0;
begin
  select * into config from public.panel_settings where singleton;
  for schedule in select * from public.task_schedules where active and next_run_at<=now() order by next_run_at limit 20 for update skip locked loop
    if schedule.load is not null and not exists(select 1 from public.loads where load=schedule.load and not archived and lower(trim(status)) not in ('delivered','completed','entregado','completado','cancelado','cancelado.','tonu')) then
      update public.task_schedules set active=false,updated_at=now() where id=schedule.id;continue;
    end if;
    if not exists(select 1 from public.profiles where id=schedule.assigned_to and active and role in ('admin','csr')) then update public.task_schedules set active=false,updated_at=now() where id=schedule.id;continue; end if;
    insert into public.shift_tasks(load,note,assigned_to,shift,created_by,follow_up_at,schedule_id,scheduled_for)
    values(schedule.load,schedule.note,schedule.assigned_to,public.ops_shift(now()),schedule.created_by,schedule.next_run_at+interval '1 day',schedule.id,schedule.next_run_at)
    on conflict(schedule_id,scheduled_for) where schedule_id is not null do nothing returning * into task;
    if found then
      generated:=generated+1;pos:=0;
      if schedule.checklist_id is not null then
        for step in select value from public.task_checklist_templates t cross join lateral jsonb_array_elements(t.items) where t.id=schedule.checklist_id loop
          insert into public.task_checklist_items(task_id,label,required,position) values(task.id,step->>'label',coalesce((step->>'required')::boolean,true),pos);pos:=pos+1;
        end loop;
      end if;
      insert into public.shift_task_history(task_id,event,actor,after_data) values(task.id,'scheduled',schedule.created_by,to_jsonb(task));
    end if;
    update public.task_schedules set next_run_at=public.ops_next_task_time(cadence,weekdays,local_time,now()),updated_at=now() where id=schedule.id;
  end loop;
  insert into public.operational_alerts(recipient,task_id,load,kind,message,dedupe_key)
  select coalesce(t.assigned_to,t.assigned_csr),t.id,t.load,'task_due','Tienes una tarea vencida: '||left(t.note,200),
    'task:'||t.id::text||':'||t.follow_up_at::text
  from public.shift_tasks t join public.profiles p on p.id=coalesce(t.assigned_to,t.assigned_csr)
  where t.state='open' and t.follow_up_at<=now() and p.active
    and not exists(select 1 from public.operational_alerts a where a.dedupe_key='task:'||t.id::text||':'||t.follow_up_at::text)
    order by t.follow_up_at,t.id limit 200 on conflict(dedupe_key) do nothing;
  get diagnostics added=row_count;
  if config.escalation_enabled and exists(select 1 from public.profiles where id=config.supervisor_id and active and role='admin') then
    insert into public.operational_alerts(recipient,task_id,load,kind,message,dedupe_key)
    select config.supervisor_id,t.id,t.load,'escalation','Revisar tarea sin atender: '||left(t.note,200),
      'escalation:'||t.id::text||':'||t.follow_up_at::text||':'||config.supervisor_id::text
    from public.shift_tasks t where t.state='open' and t.follow_up_at+make_interval(hours=>config.escalation_hours)<=now()
    and not exists(select 1 from public.operational_alerts a where a.dedupe_key='escalation:'||t.id::text||':'||t.follow_up_at::text||':'||config.supervisor_id::text)
    order by t.follow_up_at,t.id limit 200 on conflict(dedupe_key) do nothing;
  end if;
  -- Cada plazo es independiente: leer el aviso no modifica ni completa el recordatorio.
  insert into public.operational_alerts(recipient,load,kind,message,dedupe_key)
  select distinct p.id,l.load,'load_review','Revisar la carga '||l.load||': '||due.kind,
    'review:'||l.load||':'||due.kind||':'||due.deadline||':'||p.id::text
  from public.loads l
  cross join lateral (values('revision_operativa',nullif(l.recordatorio_fecha,'')),('seguimiento_personal',nullif(l.next_review_at,''))) due(kind,deadline)
  cross join lateral (
    select user_id as id from public.load_followers where load=l.load
    union select owner_id from public.customer_assignments where public.ops_customer_key(public.ops_canonical_customer(customer))=public.ops_customer_key(public.ops_canonical_customer(l.customer))
    union select id from public.profiles where due.kind='seguimiento_personal' and l.next_review_by in (id::text,display_name)
  ) recipients
  join public.profiles p on p.id=recipients.id and p.active and p.role in ('admin','csr')
  where not public.ops_load_finalized(l)
    and due.deadline is not null and public.ops_safe_deadline(due.deadline)<=now()
    and not exists(select 1 from public.operational_alerts a where a.dedupe_key='review:'||l.load||':'||due.kind||':'||due.deadline||':'||p.id::text)
  limit 200
  on conflict(dedupe_key) do nothing;
  return jsonb_build_object('generated',generated,'task_alerts',added);
end $$;
create or replace function public.ops_run_task_automation() returns jsonb
language plpgsql security definer set search_path='' as $$ begin perform public.ops_require_staff(true);return public.ops_tick_tasks_internal();end $$;
create or replace function public.ops_worker_task_tick(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin perform public.ops_require_google_worker(p_token);return public.ops_tick_tasks_internal();end $$;
create or replace function public.ops_read_operational_alert(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_staff();
  update public.operational_alerts set read_at=coalesce(read_at,now()) where id=p_id and recipient=auth.uid();
  if not found then raise exception 'El aviso no está disponible'; end if;
end $$;

create or replace function public.ops_claim_alert_emails(p_token text,p_limit integer default 20)
returns table(id uuid,claim_id uuid,email text,message text) language plpgsql security definer set search_path='' as $$
declare item record; claim uuid;
begin
  perform public.ops_require_google_worker(p_token);
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'Hasta 20 avisos por lote'; end if;
  if not exists(select 1 from public.panel_settings where singleton and external_alerts_enabled and alert_channel='google_email') then return; end if;
  for item in select a.id,p.contact_email,a.message from public.operational_alerts a join public.profiles p on p.id=a.recipient
    where a.emailed_at is null and a.read_at is null and a.next_attempt_at<=now() and (a.lease_until is null or a.lease_until<now()) and a.attempts<5
      and p.active and p.role in ('admin','csr','manager') and p.contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and public.ops_alert_current(a)
    order by a.created_at,a.id limit p_limit for update of a skip locked loop
    claim:=gen_random_uuid();
    update public.operational_alerts a set claim_id=claim,lease_until=now()+interval '10 minutes',attempts=attempts+1 where a.id=item.id;
    id:=item.id;claim_id:=claim;email:=item.contact_email;message:=item.message;return next;
  end loop;
end $$;
create or replace function public.ops_finish_alert_email(p_token text,p_id uuid,p_claim uuid,p_sent boolean,p_error text default '') returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_google_worker(p_token);
  update public.operational_alerts set emailed_at=case when p_sent then now() end,claim_id=null,lease_until=null,
    next_attempt_at=now()+make_interval(hours=>least(24,power(2,attempts)::integer)),
    last_error=case when p_sent then '' else left(p_error,100) end
  where id=p_id and claim_id=p_claim and lease_until>now() and emailed_at is null;
  return found;
end $$;

create or replace function public.change_reserved_load_state(
  p_id uuid, p_version timestamptz, p_state text, p_note text default ''
) returns public.reserved_loads language plpgsql security definer set search_path = '' as $$
declare previous public.reserved_loads; saved public.reserved_loads; allowed text[];
begin
  if p_state='liberado' and length(trim(coalesce(p_note,'')))<3 then raise exception 'Escribe el motivo de liberar el apartado'; end if;
  previous := public.lock_reserved_load(p_id, p_version);
  allowed := case previous.state
    when 'cruce' then array['transito', 'broker', 'liberado']
    when 'transito' then array['cruce', 'entregado', 'broker', 'liberado']
    when 'entregado' then array['transito', 'usado', 'broker', 'liberado']
    when 'broker' then array['entregado', 'usado', 'liberado']
    else array['cruce'] end;
  if p_state is null or not (p_state = any(allowed)) then
    raise exception 'Ese cambio de etapa no está permitido';
  end if;
  update public.reserved_loads set state = p_state,
    next_review_at = public.next_reserved_review(p_state, crossing_at, delivery_at, review_hours, now()),
    updated_at = now(), updated_by = auth.uid()
  where id = p_id returning * into saved;
  insert into public.reserved_load_history(reserved_id, event, note, actor, before_data, after_data)
  values (p_id, 'state_changed', trim(coalesce(p_note, '')), auth.uid(), to_jsonb(previous), to_jsonb(saved));
  return saved;
end;
$$;
create or replace function public.ops_bulk_loads(p_items jsonb, p_values jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare item jsonb; record public.loads; assignments text; field_name text; total integer := 0;
begin
  perform public.ops_require_staff();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 cargas'; end if;
  if exists (select value ->> 'load' from jsonb_array_elements(p_items) group by value ->> 'load' having count(*) > 1) then raise exception 'La selección contiene cargas duplicadas'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}' then raise exception 'Elige los cambios'; end if;
  for field_name in select jsonb_object_keys(p_values) loop
    if field_name not in ('cancel_reason','status','recordatorio_fecha','pod_sent','recargos_vg','color','bol','doda','entry','sobre_listo') then raise exception 'Campo masivo no permitido'; end if;
  end loop;
  select string_agg(format('%I=(jsonb_populate_record(null::public.loads,$1)).%I', key, key), ',') into assignments from jsonb_object_keys(p_values) keys(key);
  for item in select value from jsonb_array_elements(p_items) order by value ->> 'load' loop
    select * into record from public.loads where load = item ->> 'load' and not archived for update;
    if not found or record.updated_at is distinct from (item ->> 'updated_at')::timestamptz then raise exception 'Una carga cambió. Actualiza la selección'; end if;
    execute format('update public.loads set %s where load=$2', assignments) using p_values, record.load;
    total := total + 1;
  end loop;
  return total;
end;
$$;
-- Cancelar o retirar requiere motivo. No se borran expedientes desde estas acciones.
create or replace function public.ops_cancel_pending_reason(p_id uuid,p_version timestamptz,p_reason text) returns public.pending_loads
language plpgsql security definer set search_path='' as $$
declare saved public.pending_loads;
begin
  perform public.ops_require_staff();
  select * into saved from public.pending_loads where id=p_id for update;
  if not found or saved.updated_at is distinct from p_version or saved.state<>'pending'
    or not(public.panel_role()='admin' or saved.created_by=auth.uid()) then raise exception 'La solicitud cambió o no puedes cancelarla'; end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Escribe el motivo de cancelar la solicitud'; end if;
  update public.pending_loads set state='cancelled',cancel_reason=trim(p_reason) where id=p_id returning * into saved;
  return saved;
end $$;
create or replace function public.ops_hide_reserved_reason(p_id uuid,p_version timestamptz,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.reserved_loads; saved public.reserved_loads;
begin
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Escribe el motivo de retirar el apartado'; end if;
  previous:=public.lock_reserved_load(p_id,p_version);
  update public.reserved_loads set hidden=true,state=case when state in ('usado','liberado') then state else 'liberado' end,
    next_review_at=null,updated_at=now(),updated_by=auth.uid() where id=p_id returning * into saved;
  insert into public.reserved_load_history(reserved_id,event,note,actor,before_data,after_data)
    values(p_id,'edited',trim(p_reason),auth.uid(),to_jsonb(previous),to_jsonb(saved));
end $$;
-- Las funciones antiguas sin motivo ya no son rutas de escritura del frontend actualizado.
revoke execute on function public.cancel_pending_load(uuid,timestamptz),public.ops_hide_reserved(uuid,timestamptz) from authenticated;

create or replace function public.ops_save_structured_closure(p_body text,p_critical text,p_responsible uuid,p_next_action text) returns public.shift_closures
language plpgsql security definer set search_path='' as $$
declare saved public.shift_closures;
begin
  perform public.ops_require_staff();
  if length(trim(coalesce(p_critical,''))) not between 3 and 5000 or length(trim(coalesce(p_next_action,''))) not between 3 and 5000 then raise exception 'Indica los pendientes críticos y la siguiente acción; puedes escribir Sin pendientes'; end if;
  if not exists(select 1 from public.profiles where id=p_responsible and active and role in ('admin','csr')) then raise exception 'Elige quién recibe el seguimiento'; end if;
  insert into public.shift_closures(body,shift,created_by,critical_pending,responsible_id,next_action)
    values(p_body,public.ops_shift(now()),auth.uid(),trim(p_critical),p_responsible,trim(p_next_action)) returning * into saved;
  return saved;
end $$;
revoke execute on function public.ops_save_closure(text) from authenticated;

-- Política de retención explícita: no hay borrado programado. La vista previa y la ejecución son de Admin.
create or replace function public.ops_retention_preview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare config public.panel_settings;
begin
  perform public.ops_require_staff(true);select * into config from public.panel_settings where singleton;
  return jsonb_build_object('settings_version',config.updated_at,'revisions',(select jsonb_object_agg(area,revision::text) from public.panel_revisions),
    'archive_loads',(select coalesce(jsonb_agg(load order by load),'[]') from public.loads where not archived and config.archive_days is not null
      and updated_at<now()-make_interval(days=>config.archive_days)
      and ((lower(trim(status)) in ('delivered','completed','entregado','completado') and pod_sent='true') or (status='TONU' and recargos_vg='true'))),
    'prune_imports',(select coalesce(jsonb_agg(id order by id),'[]') from public.import_batches where config.import_retention_days is not null and created_at<now()-make_interval(days=>config.import_retention_days)));
end $$;
create or replace function public.ops_apply_retention(p_preview jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_plan jsonb; record_id text; archived_count integer:=0; import_count integer:=0;
begin
  perform public.ops_require_staff(true);perform pg_advisory_xact_lock(607031);perform pg_advisory_xact_lock(607034);
  if length(trim(coalesce(p_reason,''))) not between 3 and 1000 then raise exception 'Describe el motivo del mantenimiento'; end if;
  current_plan:=public.ops_retention_preview();
  if current_plan is distinct from p_preview then raise exception 'Los datos o la política cambiaron. Genera otra vista previa'; end if;
  for record_id in select jsonb_array_elements_text(current_plan->'archive_loads') loop
    update public.loads set archived=true,archive_reason='retencion: '||trim(p_reason),archived_at=now(),archived_by=auth.uid() where load=record_id;
    archived_count:=archived_count+1;
  end loop;
  for record_id in select jsonb_array_elements_text(current_plan->'prune_imports') loop
    delete from public.import_rows where batch_id=record_id::uuid;
    delete from public.import_batches where id=record_id::uuid;
    import_count:=import_count+1;
  end loop;
  perform public.ops_log_admin('manual_retention_applied',jsonb_build_object('archived',archived_count,'imports_pruned',import_count,'reason',trim(p_reason)));
  return jsonb_build_object('archived',archived_count,'imports_pruned',import_count);
end $$;

-- Reforzar privacidad de tareas, sin quitar a los CSR la consulta de todas las cargas.
drop policy if exists panel_staff_read on public.task_schedules;
drop policy if exists task_schedule_read on public.task_schedules;
create policy task_schedule_read on public.task_schedules for select to authenticated using(public.panel_role() in ('admin','manager') or (public.panel_role()='csr' and auth.uid() in (created_by,assigned_to)));
drop policy if exists panel_staff_read on public.task_checklist_items;
drop policy if exists task_checklist_read on public.task_checklist_items;
create policy task_checklist_read on public.task_checklist_items for select to authenticated using(exists(select 1 from public.shift_tasks t where t.id=task_id and public.ops_task_access(t.created_by,t.assigned_to,t.assigned_csr)));
drop policy if exists panel_staff_read on public.task_dependencies;
drop policy if exists task_dependency_read on public.task_dependencies;
create policy task_dependency_read on public.task_dependencies for select to authenticated using(exists(select 1 from public.shift_tasks t where t.id=task_id and public.ops_task_access(t.created_by,t.assigned_to,t.assigned_csr)));

do $$ declare item record; begin
  for item in select * from(values('panel_settings','reglas'),('customer_aliases','personas'),('vg_contacts','contactos'),
    ('task_checklist_templates','bitacora'),('task_schedules','bitacora'),('task_checklist_items','bitacora'),('task_dependencies','bitacora'),('operational_alerts','avisos')) areas(table_name,area) loop
    insert into public.panel_revisions(area,revision) values(item.area,nextval('public.panel_revision_seq')) on conflict do nothing;
    execute format('drop trigger if exists panel_revision on public.%I',item.table_name);
    execute format('create trigger panel_revision before insert or update or delete on public.%I for each statement execute function public.ops_bump_revision(%L)',item.table_name,item.area);
  end loop;
end $$;
create or replace function public.ops_backup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
  'profiles','loads','comments','incidents','load_history','communications','pending_loads','pending_load_comments','pending_load_history',
  'vg_contacts','reserved_loads','reserved_load_history','customer_assignments','load_followers','user_following',
  'task_checklist_templates','task_schedules','shift_tasks','shift_task_history','task_checklist_items','task_dependencies',
  'shift_closures','message_templates','portal_access','admin_events','import_batches','import_rows','radar_sources','geo_places',
  'original_places','original_routes','original_radar','original_preferences','panel_settings','customer_aliases','operational_alerts']::text[] $$;
-- Orden de exportación de tablas sin id, compatible con paginación estable y ensayos de restauración.
create or replace function public.ops_backup_page(p_table text,p_offset integer default 0,p_limit integer default 500)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare ordering text;
begin
  perform public.ops_require_staff(true);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 or p_table is null or not(p_table=any(public.ops_backup_tables())) then raise exception 'Tabla o página de respaldo no permitida'; end if;
  ordering:=case p_table when 'loads' then 'load' when 'customer_assignments' then 'customer_key'
    when 'load_followers' then 'load,user_id' when 'user_following' then 'user_id,followed_user' when 'portal_access' then 'user_id'
    when 'geo_places' then 'place_key' when 'original_places' then 'place_key' when 'original_routes' then 'route_key'
    when 'original_radar' then 'singleton' when 'original_preferences' then 'user_id' when 'import_rows' then 'batch_id,load'
    when 'panel_settings' then 'singleton' when 'customer_aliases' then 'alias_key' when 'task_checklist_items' then 'task_id,item_id'
    when 'task_dependencies' then 'task_id,depends_on' else 'id' end;
  return query execute format('select to_jsonb(t) from public.%I t order by %s offset $1 limit $2',p_table,ordering) using p_offset,p_limit;
end $$;

-- Ninguna función nueva queda ejecutable por PUBLIC por el privilegio predeterminado de PostgreSQL.
do $$ declare name text; begin
  foreach name in array array['ops_guard_status','ops_save_panel_settings','ops_save_customer_alias','ops_save_vg_contact','ops_save_reserved_details',
    'ops_save_checklist','ops_attach_checklist','ops_check_task_item','ops_set_task_dependency','ops_change_task_state','ops_task_details',
    'ops_load_finalized','ops_safe_deadline','ops_alert_current','ops_visible_alerts','ops_next_task_time','ops_save_task_schedule','ops_tick_tasks_internal','ops_run_task_automation','ops_worker_task_tick','ops_read_operational_alert',
    'ops_claim_alert_emails','ops_finish_alert_email','ops_cancel_pending_reason','ops_hide_reserved_reason','ops_save_structured_closure','ops_retention_preview','ops_apply_retention'] loop
    execute format('revoke all on function %s from public,anon,authenticated',
      (select oid::regprocedure::text from pg_proc where pronamespace='public'::regnamespace and proname=name));
  end loop;
end $$;
grant execute on function public.ops_canonical_customer(text) to authenticated;
revoke execute on function public.ops_canonical_customer(text) from public,anon;
grant execute on function public.ops_save_panel_settings(jsonb,timestamptz),public.ops_save_customer_alias(text,text),
  public.ops_save_vg_contact(uuid,timestamptz,jsonb),public.ops_save_reserved_details(uuid,timestamptz,jsonb),
  public.ops_save_checklist(uuid,timestamptz,text,jsonb),public.ops_attach_checklist(uuid,timestamptz,uuid),
  public.ops_check_task_item(uuid,uuid,boolean),public.ops_set_task_dependency(uuid,timestamptz,uuid,boolean),
  public.ops_change_task_state(uuid,timestamptz,text,text),public.ops_task_details(uuid,integer),
  public.ops_save_task_schedule(uuid,timestamptz,jsonb),public.ops_run_task_automation(),public.ops_read_operational_alert(uuid),
  public.ops_cancel_pending_reason(uuid,timestamptz,text),public.ops_hide_reserved_reason(uuid,timestamptz,text),
  public.ops_save_structured_closure(text,text,uuid,text),public.ops_retention_preview(),public.ops_apply_retention(jsonb,text) to authenticated;
grant execute on function public.ops_visible_alerts() to authenticated;
grant execute on function public.ops_worker_task_tick(text),public.ops_claim_alert_emails(text,integer),public.ops_finish_alert_email(text,uuid,uuid,boolean,text) to anon,authenticated;
commit;
