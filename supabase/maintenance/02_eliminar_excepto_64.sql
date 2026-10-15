-- BORRADO DEFINITIVO: ejecutar solo después de revisar 01_vista_previa_conservar_64.sql.
-- Conserva exactamente la lista autorizada. El bloque se revierte entero ante cualquier error.
-- PANEL BAJÍO · LIMPIEZA PUNTUAL DEL 15 DE OCTUBRE DE 2026.
-- No es una migración: no agregar a actualizar_sitio.sql ni al arranque del sitio.
-- Ejecutar completo en Supabase > SQL Editor con el rol postgres.
-- Solo trata las cargas y los registros asociados; conserva cuentas, permisos y mapas.
-- Solicitudes/tareas generales y apartados externos sin relación con cargas eliminadas quedan intactos.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local row_security = off;

-- Evita que una importación o edición cambie los datos durante esta transacción.
select pg_advisory_xact_lock(607031);
lock table public.loads, public.comments, public.incidents, public.load_history,
  public.communications, public.load_followers, public.shift_tasks, public.shift_task_history,
  public.pending_loads, public.pending_load_comments, public.pending_load_history,
  public.reserved_loads, public.reserved_load_history, public.import_rows, public.import_batches,
  public.admin_events, public.radar_sources, public.original_radar in share row exclusive mode;

-- Lista exacta del usuario: 64 números únicos, incluido 844090 en la segunda columna.
create temporary table pb_conservar (load text primary key) on commit drop;
insert into pb_conservar(load) values
  ('839445'), ('839453'), ('839454'), ('839995'), ('839996'), ('839997'), ('839998'), ('839994'),
  ('840598'), ('840600'), ('840720'), ('840721'), ('840722'), ('840723'), ('841140'), ('841431'),
  ('841757'), ('841758'), ('842233'), ('842232'), ('841947'), ('842234'), ('842382'), ('842362'),
  ('842386'), ('842908'), ('842909'), ('842910'), ('843065'), ('843444'), ('843196'), ('843847'),
  ('843855'), ('843106'), ('844224'), ('844223'), ('843107'), ('843108'), ('843121'), ('843122'),
  ('845121'), ('845120'), ('845704'), ('845309'), ('844408'), ('845690'), ('845515'), ('845122'),
  ('845941'), ('845942'), ('845943'), ('845517'), ('845709'), ('845496'), ('845516'), ('845520'),
  ('843516'), ('845679'), ('844304'), ('844745'), ('845667'), ('844090'), ('845562'), ('845112');

-- Todas las demás cargas, incluidas las archivadas, son candidatas al borrado.
create temporary table pb_eliminar on commit drop as
select l.load from public.loads l
where not exists (select 1 from pb_conservar k where k.load = l.load);
create temporary table pb_tareas_eliminar on commit drop as
select t.id from public.shift_tasks t join pb_eliminar d on d.load = t.load;
create temporary table pb_solicitudes_eliminar on commit drop as
select p.id from public.pending_loads p join pb_eliminar d on d.load = p.linked_load;

-- Un apartado puede mencionar varias cargas en su referencia libre own_load.
-- Si está relacionado con alguna protegida, se conserva completo, también su historial.
create temporary table pb_apartados_conservar on commit drop as
select r.id from public.reserved_loads r where exists (
  select 1 from pb_conservar k where k.load = r.load
    or k.load = any(regexp_split_to_array(r.own_load, '[^0-9]+'))
);
create temporary table pb_apartados_eliminar on commit drop as
select r.id from public.reserved_loads r where not exists (
  select 1 from pb_apartados_conservar k where k.id = r.id
) and exists (
  select 1 from pb_eliminar d where d.load = r.load
    or d.load = any(regexp_split_to_array(r.own_load, '[^0-9]+'))
);

-- La importación compartida con cargas protegidas permanece tal como estaba.
create temporary table pb_lotes_eliminar on commit drop as
select b.id from public.import_batches b
where exists (select 1 from public.import_rows r where r.batch_id = b.id)
  and not exists (
    select 1 from public.import_rows r join pb_conservar k on k.load = r.load
    where r.batch_id = b.id
  );

-- Radar es un archivo independiente: quitar solo filas que identifiquen cargas eliminadas.
-- El contenido y orden de las filas conservadas no cambian; ubicaciones/rutas no se tocan.
create temporary table pb_radar_fuentes on commit drop as
select s.id, coalesce(jsonb_agg(e.value order by e.ord) filter (where not exists (
  select 1 from pb_eliminar d where d.load = e.value ->> 'load'
)), '[]'::jsonb) as records
from public.radar_sources s
cross join lateral jsonb_array_elements(s.records) with ordinality e(value, ord)
group by s.id
having bool_or(exists (select 1 from pb_eliminar d where d.load = e.value ->> 'load'));
create temporary table pb_radar_original on commit drop as
select s.singleton, coalesce(jsonb_agg(e.value order by e.ord) filter (where not exists (
  select 1 from pb_eliminar d where d.load = e.value ->> 'load'
)), '[]'::jsonb) as records
from public.original_radar s
cross join lateral jsonb_array_elements(s.records) with ordinality e(value, ord)
group by s.singleton
having bool_or(exists (select 1 from pb_eliminar d where d.load = e.value ->> 'load'));

-- Detenerse si falta cualquier número; no inventar ni recrear una carga ausente.
do $$
declare faltantes text;
begin
  if (select count(*) from pb_conservar) <> 64 then
    raise exception 'La lista debe contener exactamente los 64 numeros autorizados';
  end if;
  select string_agg(k.load, ', ' order by k.load) into faltantes from pb_conservar k
  where not exists (select 1 from public.loads l where l.load=k.load);
  if faltantes is not null then
    raise exception 'No se borro nada. Estas cargas de tu lista no existen: %', faltantes;
  end if;
end $$;

-- Guardar una comparación exacta (incluidos fechas, autores, estados e historial).
-- Es temporal: desaparece al terminar. No crea un respaldo permanente con datos eliminados.
create temporary view pb_registros_protegidos as
select 'loads'::text as tabla, to_jsonb(t) as datos from public.loads t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'comments'::text as tabla, to_jsonb(t) as datos from public.comments t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'incidents'::text as tabla, to_jsonb(t) as datos from public.incidents t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'load_history'::text as tabla, to_jsonb(t) as datos from public.load_history t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'communications'::text as tabla, to_jsonb(t) as datos from public.communications t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'load_followers'::text as tabla, to_jsonb(t) as datos from public.load_followers t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'shift_tasks'::text as tabla, to_jsonb(t) as datos from public.shift_tasks t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'shift_task_history'::text as tabla, to_jsonb(t) as datos from public.shift_task_history t
where exists (select 1 from public.shift_tasks s join pb_conservar k on k.load=s.load where s.id=t.task_id)
union all
select 'pending_loads'::text as tabla, to_jsonb(t) as datos from public.pending_loads t
where exists (select 1 from pb_conservar k where k.load=t.linked_load)
union all
select 'pending_load_comments'::text as tabla, to_jsonb(t) as datos from public.pending_load_comments t
where exists (select 1 from public.pending_loads s join pb_conservar k on k.load=s.linked_load where s.id=t.pending_id)
union all
select 'pending_load_history'::text as tabla, to_jsonb(t) as datos from public.pending_load_history t
where exists (select 1 from public.pending_loads s join pb_conservar k on k.load=s.linked_load where s.id=t.pending_id)
union all
select 'reserved_loads'::text as tabla, to_jsonb(t) as datos from public.reserved_loads t
where exists (select 1 from pb_apartados_conservar k where k.id=t.id)
union all
select 'reserved_load_history'::text as tabla, to_jsonb(t) as datos from public.reserved_load_history t
where exists (select 1 from pb_apartados_conservar k where k.id=t.reserved_id)
union all
select 'import_rows'::text as tabla, to_jsonb(t) as datos from public.import_rows t
where exists (select 1 from pb_conservar k where k.load=t.load)
union all
select 'import_batches'::text as tabla, to_jsonb(t) as datos from public.import_batches t
where exists (select 1 from public.import_rows s join pb_conservar k on k.load=s.load where s.batch_id=t.id)
union all
select 'admin_events'::text as tabla, to_jsonb(t) as datos from public.admin_events t
where exists (select 1 from pb_conservar k where k.load=t.details->>'load') or exists (select 1 from public.import_rows s join pb_conservar k on k.load=s.load where s.batch_id::text=t.details->>'batch')
union all
select 'radar_sources_fila', e.value from public.radar_sources t
cross join lateral jsonb_array_elements(t.records) e(value)
where exists (select 1 from pb_conservar k where k.load=e.value->>'load')
union all
select 'original_radar_fila', e.value from public.original_radar t
cross join lateral jsonb_array_elements(t.records) e(value)
where exists (select 1 from pb_conservar k where k.load=e.value->>'load');
create temporary table pb_foto_protegida on commit drop as select * from pb_registros_protegidos;

-- Borrar primero los hijos, respetando todas las claves foráneas y sin desactivar triggers.
delete from public.shift_task_history t using pb_tareas_eliminar d where t.task_id=d.id;
delete from public.shift_tasks t using pb_tareas_eliminar d where t.id=d.id;
delete from public.pending_load_comments t using pb_solicitudes_eliminar d where t.pending_id=d.id;
delete from public.pending_load_history t using pb_solicitudes_eliminar d where t.pending_id=d.id;
delete from public.pending_loads t using pb_solicitudes_eliminar d where t.id=d.id;
delete from public.reserved_load_history t using pb_apartados_eliminar d where t.reserved_id=d.id;
delete from public.reserved_loads t using pb_apartados_eliminar d where t.id=d.id;
delete from public.comments t using pb_eliminar d where t.load=d.load;
delete from public.incidents t using pb_eliminar d where t.load=d.load;
delete from public.communications t using pb_eliminar d where t.load=d.load;
delete from public.load_followers t using pb_eliminar d where t.load=d.load;
delete from public.load_history t using pb_eliminar d where t.load=d.load;

-- Quitar instantáneas de importaciones que podrían volver a introducir cargas descartadas.
delete from public.import_rows t where not exists (select 1 from pb_conservar k where k.load=t.load);
delete from public.admin_events t where (
  exists (select 1 from pb_eliminar d where d.load=t.details->>'load')
  or exists (select 1 from pb_lotes_eliminar b where b.id::text=t.details->>'batch')
) and not exists (
  select 1 from pb_conservar k where k.load=t.details->>'load'
) and not exists (
  select 1 from public.import_rows r join pb_conservar k on k.load=r.load
  where r.batch_id::text=t.details->>'batch'
);
delete from public.import_batches t using pb_lotes_eliminar d where t.id=d.id;

-- Si un archivo Radar queda vacío, retirar esa fuente o esconder el Radar actual vacío.
delete from public.radar_sources t using pb_radar_fuentes f
where t.id=f.id and jsonb_array_length(f.records)=0;
update public.radar_sources t set records=f.records from pb_radar_fuentes f
where t.id=f.id and jsonb_array_length(f.records)>0;
update public.original_radar t set records=f.records,
  visible=case when jsonb_array_length(f.records)=0 then false else t.visible end
from pb_radar_original f where t.singleton=f.singleton;

delete from public.loads t using pb_eliminar d where t.load=d.load;

-- Comprobar el resultado antes de confirmar. Una diferencia revierte todo el borrado.
do $$
begin
  if (select count(*) from public.loads) <> 64 or exists (
    select 1 from public.loads l where not exists (select 1 from pb_conservar k where k.load=l.load)
  ) then
    raise exception 'El resultado no coincide con las 64 cargas. Se cancela la limpieza';
  end if;
  if exists (
    (select * from pb_foto_protegida except all select * from pb_registros_protegidos)
    union all
    (select * from pb_registros_protegidos except all select * from pb_foto_protegida)
  ) then
    raise exception 'Cambio inesperado en datos protegidos. Se cancela toda la limpieza';
  end if;
end $$;
drop view pb_registros_protegidos;
commit;

-- Resultado visible: debe indicar 64. Actualizar el panel después con Ctrl+Shift+R.
select 'Limpieza completada' as resultado, count(*) as cargas_conservadas,
  string_agg(load, ', ' order by load) as numeros_conservados from public.loads;
