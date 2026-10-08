-- IMPORTACIÓN CON VISTA PREVIA, DESHACER, ARCHIVO Y MENSAJES DEL PORTAL.
-- Ejecutar completo después de 005. No elimina cargas ni su historial.
begin;
alter table public.loads add column if not exists archive_reason text not null default '';
alter table public.loads add column if not exists archived_at timestamptz;
alter table public.loads add column if not exists archived_by uuid references public.profiles(id);
alter table public.loads add column if not exists portal_message text not null default '';
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(file_name) between 1 and 200),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  state text not null default 'applied' check (state in ('applied', 'undone')),
  undone_by uuid references public.profiles(id),
  undone_at timestamptz
);
create table if not exists public.import_rows (
  batch_id uuid not null references public.import_batches(id),
  load text not null,
  before_data jsonb,
  after_data jsonb not null,
  primary key(batch_id, load)
);
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
drop policy if exists import_batches_read on public.import_batches;
create policy import_batches_read on public.import_batches for select to authenticated using (public.panel_role() = 'admin');
drop policy if exists import_rows_read on public.import_rows;
create policy import_rows_read on public.import_rows for select to authenticated using (public.panel_role() = 'admin');
revoke all on public.import_batches, public.import_rows from anon, authenticated;
grant select on public.import_batches, public.import_rows to authenticated;

-- El navegador no puede cambiar los metadatos de archivo o suplantar procedencias.
revoke update, insert on public.loads from authenticated;
do $$
declare columns_list text;
begin
  select string_agg(quote_ident(attname), ',') into columns_list from pg_attribute
  where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
    and attname not in ('load','created_at','updated_at','updated_by','archived','archive_reason','archived_at','archived_by','portal_message',
      'client_notify_pending','client_notify_reason','client_notify_since','client_notified_at','client_notified_by',
      'last_communication_channel','last_communication_type','next_review_by','ultima_revision_csr_by')
    and attname !~ '(_source|_manual_by|_manual_at)$';
  execute 'grant update (' || columns_list || ') on public.loads to authenticated';
  execute 'grant insert (load,' || columns_list || ') on public.loads to authenticated';
end;
$$;
drop policy if exists loads_update on public.loads;
create policy loads_update on public.loads for update to authenticated
using (public.panel_role() = 'admin' or (public.panel_role() = 'csr' and not archived))
with check (public.panel_role() = 'admin' or (public.panel_role() = 'csr' and not archived));
revoke insert on public.comments,public.incidents from authenticated;
grant insert(load,body) on public.comments to authenticated;
grant insert(load,category,severity,description,action_taken) on public.incidents to authenticated;
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check(
  public.panel_role() in ('admin','csr') and created_by=auth.uid()
  and exists(select 1 from public.loads where loads.load=comments.load and not archived));
drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert on public.incidents for insert to authenticated with check(
  public.panel_role() in ('admin','csr') and created_by=auth.uid()
  and exists(select 1 from public.loads where loads.load=incidents.load and not archived));

-- 1. Combinar un archivo con el registro actual conserva los campos operativos manuales.
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
  if p_previous is null then merged := merged || jsonb_build_object('status', 'Cargando'); end if;
  return merged;
end;
$$;

-- Solo estas funciones privadas escriben instantáneas; los nombres de columnas salen del esquema.
create or replace function public.ops_write_load_snapshot(p_values jsonb, p_insert boolean) returns public.loads
language plpgsql security definer set search_path = '' as $$
declare columns_list text; expressions text; saved public.loads; metadata_columns text;
begin
  select string_agg(quote_ident(attname), ','),
    string_agg(format('(jsonb_populate_record(null::public.loads,$1)).%I', attname), ',')
  into columns_list, expressions from pg_attribute where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
    and p_values ? attname and attname not in ('created_at','updated_at','updated_by');
  if p_insert then
    execute format('insert into public.loads(%s) select %s returning *', columns_list, expressions) using p_values into saved;
  else
    select string_agg(format('%I = (jsonb_populate_record(null::public.loads,$1)).%I', attname, attname), ',')
    into expressions from pg_attribute where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
      and p_values ? attname and attname not in ('load','created_at','updated_at','updated_by');
    execute format('update public.loads set %s where load=$2 returning *', expressions) using p_values, p_values ->> 'load' into saved;
  end if;
  -- Las reglas normales marcaron procedencia manual; se restablece la procedencia del archivo.
  -- Esta segunda escritura no vuelve a cambiar fechas ni valores operativos.
  select string_agg(format('%I = (jsonb_populate_record(null::public.loads,$1)).%I', attname, attname), ',')
  into metadata_columns from pg_attribute where attrelid = 'public.loads'::regclass and attnum > 0 and not attisdropped
    and p_values ? attname and attname ~ '(_source|_manual_by|_manual_at)$';
  if metadata_columns is not null then
    execute format('update public.loads set %s where load=$2 returning *', metadata_columns) using p_values, saved.load into saved;
  end if;
  return saved;
end;
$$;
create or replace function public.ops_check_import(p_records jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) not between 1 and 1000 then
    raise exception 'La importación admite entre 1 y 1000 cargas por archivo';
  end if;
  if exists (select 1 from jsonb_array_elements(p_records) record where jsonb_typeof(record) <> 'object'
    or length(trim(coalesce(record ->> 'load', ''))) not between 1 and 200) then raise exception 'Todos los registros requieren un número de carga válido'; end if;
  if exists (select trim(value ->> 'load') from jsonb_array_elements(p_records) group by trim(value ->> 'load') having count(*) > 1) then
    raise exception 'El archivo contiene números de carga duplicados';
  end if;
end;
$$;
create or replace function public.ops_preview_import(p_records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare input jsonb; previous public.loads; merged jsonb; result jsonb := '[]'; changed text[];
begin
  perform public.ops_require_staff(true); perform public.ops_check_import(p_records);
  for input in select value from jsonb_array_elements(p_records) loop
    select * into previous from public.loads where load = trim(input ->> 'load');
    if previous.archived then raise exception 'La carga % está archivada. Restáurala antes de importar', previous.load; end if;
    merged := public.ops_merge_import(input, case when previous.load is null then null else to_jsonb(previous) end);
    select array_agg(key order by key) into changed from jsonb_each(merged) item(key, value)
      where key not in ('updated_at','updated_by','created_at') and value is distinct from to_jsonb(previous) -> key;
    result := result || jsonb_build_array(jsonb_build_object('load', merged ->> 'load', 'new', previous.load is null,
      'version', previous.updated_at, 'changes', coalesce(changed, array[]::text[])));
  end loop;
  return result;
end;
$$;
create or replace function public.ops_apply_import(p_records jsonb, p_preview jsonb, p_file_name text) returns public.import_batches
language plpgsql security definer set search_path = '' as $$
declare input jsonb; previous public.loads; saved public.loads; batch public.import_batches; expected jsonb; merged jsonb;
begin
  perform public.ops_require_staff(true); perform public.ops_check_import(p_records);
  if p_preview is null or jsonb_typeof(p_preview) <> 'array' or jsonb_array_length(p_preview) <> jsonb_array_length(p_records) then raise exception 'Primero genera la vista previa'; end if;
  -- Todas las importaciones se serializan; cada carga se bloquea para detectar cambios desde la vista previa.
  perform pg_advisory_xact_lock(607031);
  insert into public.import_batches(file_name, created_by) values(p_file_name, auth.uid()) returning * into batch;
  for input in select value from jsonb_array_elements(p_records) order by trim(value ->> 'load') loop
    select * into previous from public.loads where load = trim(input ->> 'load') for update;
    select value into expected from jsonb_array_elements(p_preview) where value ->> 'load' = trim(input ->> 'load');
    if expected is null or previous.updated_at is distinct from (expected ->> 'version')::timestamptz then raise exception 'La carga % cambió. Genera otra vista previa', input ->> 'load'; end if;
    if previous.archived then raise exception 'La carga % está archivada', previous.load; end if;
    merged := public.ops_merge_import(input, case when previous.load is null then null else to_jsonb(previous) end);
    if previous.load is not null and merged = to_jsonb(previous) then continue; end if;
    saved := public.ops_write_load_snapshot(merged, previous.load is null);
    insert into public.import_rows(batch_id, load, before_data, after_data)
    values(batch.id, saved.load, case when previous.load is null then null else to_jsonb(previous) end, to_jsonb(saved));
  end loop;
  perform public.ops_log_admin('import_applied', jsonb_build_object('batch', batch.id, 'file', p_file_name));
  return batch;
end;
$$;

-- Deshacer comprueba versiones y conserva la auditoría. Las cargas nuevas pasan al archivo.
create or replace function public.ops_undo_import(p_batch uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare batch public.import_batches; item public.import_rows; current_load public.loads;
begin
  perform public.ops_require_staff(true); perform pg_advisory_xact_lock(607031);
  select * into batch from public.import_batches where id = p_batch for update;
  if not found or batch.state <> 'applied' then raise exception 'La importación no existe o ya fue deshecha'; end if;
  for item in select * from public.import_rows where batch_id = p_batch order by load loop
    select * into current_load from public.loads where load = item.load for update;
    if not found or current_load.updated_at is distinct from (item.after_data ->> 'updated_at')::timestamptz then
      raise exception 'La carga % cambió después de importar. No se sobrescribirá', item.load;
    end if;
    if item.before_data is null then
      if exists (select 1 from public.comments where load = item.load and created_at > batch.created_at)
        or exists (select 1 from public.incidents where load = item.load and created_at > batch.created_at) then
        raise exception 'La carga % tiene actividad posterior. Revisa antes de deshacer', item.load;
      end if;
      update public.loads set archived = true, archive_reason = 'import_undo', archived_at = now(), archived_by = auth.uid() where load = item.load;
    else
      perform public.ops_write_load_snapshot(item.before_data, false);
    end if;
  end loop;
  update public.import_batches set state = 'undone', undone_by = auth.uid(), undone_at = now() where id = p_batch;
  perform public.ops_log_admin('import_undone', jsonb_build_object('batch', p_batch));
end;
$$;

-- 2. Archivo reversible. Las cargas conservan comentarios, incidencias y vínculos.
create or replace function public.ops_archive_load(p_load text, p_version timestamptz, p_archive boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare record public.loads;
begin
  perform public.ops_require_staff(true);
  if p_archive is null then raise exception 'Indica la acción de archivo'; end if;
  select * into record from public.loads where load = p_load for update;
  if not found or record.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de archivar'; end if;
  update public.loads set archived = p_archive, archive_reason = case when p_archive then 'manual' else '' end,
    archived_at = case when p_archive then now() else null end, archived_by = case when p_archive then auth.uid() else null end
  where load = p_load;
  perform public.ops_log_admin('load_archive_changed', jsonb_build_object('load', p_load, 'archived', p_archive));
end;
$$;
create or replace function public.ops_archive_finished() returns integer
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  perform public.ops_require_staff(true);
  update public.loads set archived = true, archive_reason = 'finished_60_days', archived_at = now(), archived_by = auth.uid()
  where not archived and updated_at < now() - interval '60 days' and (
    (lower(status) in ('delivered','completed','entregado','completado') and lower(pod_sent) not in ('','false','0','no','null'))
    or lower(trim(status, '. ')) = 'cancelado'
    or (status = 'TONU' and lower(recargos_vg) not in ('','false','0','no','null'))
  );
  get diagnostics total = row_count;
  perform public.ops_log_admin('finished_loads_archived', jsonb_build_object('count', total));
  return total;
end;
$$;

-- 3. El texto publicado en el portal se registra por separado de notas y motivos internos.
-- Conserva el registro de avisos de SQL 002 al proteger sus columnas de escritura directa.
create or replace function public.confirm_client_notice(p_load text,p_version timestamptz,p_channel text,p_notice_type text)
returns setof public.loads language plpgsql security definer set search_path='' as $$
begin
  perform public.ops_require_staff();
  if p_channel is null or p_channel not in ('WhatsApp','Correo','Teléfono','Otro') then raise exception 'Elige un canal válido'; end if;
  if length(trim(coalesce(p_notice_type,''))) not between 1 and 200 then raise exception 'Indica el tipo de aviso (hasta 200 caracteres)'; end if;
  return query update public.loads set client_notify_pending='false',client_notified_at=now()::text,
    last_communication_channel=p_channel,last_communication_type=trim(p_notice_type)
    where load=p_load and updated_at=p_version and not archived returning *;
  if not found then raise exception 'La carga cambió, está archivada o no existe. Actualiza antes de registrar el aviso'; end if;
end;
$$;
create or replace function public.review_load(p_load text,p_version timestamptz)
returns setof public.loads language plpgsql set search_path='' as $$
begin
  if coalesce(public.panel_role(),'') not in ('admin','csr') then raise exception 'Sin permiso'; end if;
  return query update public.loads set next_review_at='',next_review_note='',
    recordatorio_fecha=case when status='En transito' then (now()+interval '3 hours')::text else recordatorio_fecha end
    where load=p_load and updated_at=p_version and not archived returning *;
  if not found then raise exception 'La carga cambió, está archivada o no existe. Actualiza antes de marcar la revisión'; end if;
end;
$$;
revoke execute on function public.confirm_client_notice(text,timestamptz,text,text),public.review_load(text,timestamptz) from public,anon;
grant execute on function public.confirm_client_notice(text,timestamptz,text,text),public.review_load(text,timestamptz) to authenticated;
create or replace function public.log_load_communication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_notify_pending = 'true' and new.client_notify_since is distinct from old.client_notify_since then
    insert into public.communications(load,event_type,reason,actor) values(new.load,'PENDIENTE',new.client_notify_reason,auth.uid());
  elsif new.client_notified_at <> '' and new.client_notified_at is distinct from old.client_notified_at then
    insert into public.communications(load,event_type,reason,actor,channel,notice_type,public_message)
    values(new.load,'NOTIFICADO',old.client_notify_reason,auth.uid(),new.last_communication_channel,new.last_communication_type,
      case when new.last_communication_channel = 'Portal' then new.portal_message else '' end);
  end if;
  return new;
end;
$$;
create or replace function public.ops_publish_portal_message(p_load text, p_version timestamptz, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare record public.loads;
begin
  perform public.ops_require_staff();
  if length(trim(coalesce(p_message, ''))) not between 1 and 10000 then raise exception 'Escribe un mensaje de hasta 10000 caracteres'; end if;
  select * into record from public.loads where load = p_load and not archived for update;
  if not found or record.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de publicar'; end if;
  update public.loads set client_notify_pending = 'false', client_notified_at = now()::text,
    last_communication_channel = 'Portal', last_communication_type = 'Mensaje en portal', portal_message = trim(p_message)
  where load = p_load;
end;
$$;

-- 4. Cambios masivos: todas las versiones deben coincidir o no se guarda ninguna fila.
create or replace function public.ops_bulk_loads(p_items jsonb, p_values jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare item jsonb; record public.loads; assignments text; field_name text; total integer := 0;
begin
  perform public.ops_require_staff();
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 cargas'; end if;
  if exists (select value ->> 'load' from jsonb_array_elements(p_items) group by value ->> 'load' having count(*) > 1) then raise exception 'La selección contiene cargas duplicadas'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}' then raise exception 'Elige los cambios'; end if;
  for field_name in select jsonb_object_keys(p_values) loop
    if field_name not in ('status','recordatorio_fecha','pod_sent','recargos_vg','color','bol','doda','entry','sobre_listo') then raise exception 'Campo masivo no permitido'; end if;
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

-- Funciones privadas sin permiso de ejecución; solo se exponen los RPC autorizados.
do $$ declare signature regprocedure; begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'ops\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', signature);
  end loop;
end; $$;
revoke execute on function public.ops_merge_import(jsonb,jsonb), public.ops_write_load_snapshot(jsonb,boolean), public.ops_check_import(jsonb) from authenticated;
grant execute on function public.ops_preview_import(jsonb), public.ops_apply_import(jsonb,jsonb,text), public.ops_undo_import(uuid),
  public.ops_archive_load(text,timestamptz,boolean), public.ops_archive_finished(), public.ops_publish_portal_message(text,timestamptz,text),
  public.ops_bulk_loads(jsonb,jsonb) to authenticated;
revoke execute on function public.log_load_communication() from public, anon, authenticated;
commit;
