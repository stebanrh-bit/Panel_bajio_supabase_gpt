-- CARGAS NUEVAS: estatus inicial PTE. ARRIVO.
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Requiere la versión personal 016. Es repetible y conserva las cargas existentes.
begin;

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

commit;
