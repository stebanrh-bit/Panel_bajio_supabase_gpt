-- PENDIENTES PUNTUALES. Requiere 012; puede ejecutarse de nuevo sin borrar datos.
-- Una señal compartida por carga. No modifica estatus, citas ni seguimientos con fecha.
begin;

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

commit;
