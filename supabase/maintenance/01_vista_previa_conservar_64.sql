-- VISTA PREVIA: este archivo NO elimina ni modifica datos de la aplicación.
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

-- En Results: Faltantes debe ser 0. Si no lo es, no ejecutar el archivo de borrado.
select * from (
  select 'CONTROL'::text as grupo, 'Cargas solicitadas'::text as concepto,
    count(*) as cantidad, 'La lista debe contener 64 numeros'::text as detalle from pb_conservar
  union all select 'CONTROL', 'Faltantes de tu lista', count(*), coalesce(string_agg(k.load, ', ' order by k.load), 'Ninguna')
    from pb_conservar k where not exists (select 1 from public.loads l where l.load=k.load)
  union all select 'CONSERVAR', 'Cargas encontradas, con todos sus datos', count(*), string_agg(l.load, ', ' order by l.load)
    from public.loads l join pb_conservar k on k.load=l.load
  union all select 'ELIMINAR', 'Cargas', (select count(*) from pb_eliminar), ''
  union all select 'ELIMINAR', 'Comentarios', (select count(*) from public.comments t join pb_eliminar d on d.load=t.load), ''
  union all select 'ELIMINAR', 'Incidencias, incluidas retiradas', (select count(*) from public.incidents t join pb_eliminar d on d.load=t.load), ''
  union all select 'ELIMINAR', 'Historial de cargas', (select count(*) from public.load_history t join pb_eliminar d on d.load=t.load), ''
  union all select 'ELIMINAR', 'Comunicaciones', (select count(*) from public.communications t join pb_eliminar d on d.load=t.load), ''
  union all select 'ELIMINAR', 'Seguidores de cargas', (select count(*) from public.load_followers t join pb_eliminar d on d.load=t.load), ''
  union all select 'ELIMINAR', 'Tareas relacionadas', (select count(*) from pb_tareas_eliminar), ''
  union all select 'ELIMINAR', 'Historial de esas tareas', (select count(*) from public.shift_task_history t join pb_tareas_eliminar d on d.id=t.task_id), ''
  union all select 'ELIMINAR', 'Solicitudes vinculadas', (select count(*) from pb_solicitudes_eliminar), ''
  union all select 'ELIMINAR', 'Comentarios de esas solicitudes', (select count(*) from public.pending_load_comments t join pb_solicitudes_eliminar d on d.id=t.pending_id), ''
  union all select 'ELIMINAR', 'Historial de esas solicitudes', (select count(*) from public.pending_load_history t join pb_solicitudes_eliminar d on d.id=t.pending_id), ''
  union all select 'ELIMINAR', 'Apartados relacionados sin carga protegida', (select count(*) from pb_apartados_eliminar), ''
  union all select 'ELIMINAR', 'Historial de esos apartados', (select count(*) from public.reserved_load_history t join pb_apartados_eliminar d on d.id=t.reserved_id), ''
  union all select 'ELIMINAR', 'Filas de importacion no conservadas', (select count(*) from public.import_rows t where not exists (select 1 from pb_conservar k where k.load=t.load)), ''
  union all select 'ELIMINAR', 'Lotes sin cargas protegidas', (select count(*) from pb_lotes_eliminar), ''
  union all select 'ELIMINAR', 'Eventos de cargas/lotes eliminados', (select count(*) from public.admin_events t where (
    exists (select 1 from pb_eliminar d where d.load=t.details->>'load')
    or exists (select 1 from pb_lotes_eliminar b where b.id::text=t.details->>'batch')
  ) and not exists (select 1 from pb_conservar k where k.load=t.details->>'load')
    and not exists (select 1 from public.import_rows r join pb_conservar k on k.load=r.load
      where r.batch_id::text=t.details->>'batch')), ''
  union all select 'ELIMINAR', 'Filas de archivos Radar', (select count(*) from public.radar_sources s cross join lateral jsonb_array_elements(s.records) e(value) where exists (select 1 from pb_eliminar d where d.load=e.value->>'load')), ''
  union all select 'ELIMINAR', 'Filas del Radar actual', (select count(*) from public.original_radar s cross join lateral jsonb_array_elements(s.records) e(value) where exists (select 1 from pb_eliminar d where d.load=e.value->>'load')), ''
 ) resumen order by grupo, concepto;
rollback;
