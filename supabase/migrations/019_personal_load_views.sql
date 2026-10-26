-- MENÚ MOSTRAR CONFIGURABLE POR CUENTA. Requiere 018.
-- Ejecutar todo en SQL Editor > New query > Run. Conserva cargas y preferencias existentes.
begin;

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
commit;
