-- PANEL BAJÍO: ESTATUS INICIAL Y MENSAJES MANUALES 017–018.
-- Copiar TODO a SQL Editor > New query > Run. Requiere 001 a 016.
-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.
begin;


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

commit;
