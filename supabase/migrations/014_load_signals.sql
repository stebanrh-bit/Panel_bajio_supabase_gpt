-- SEÑALAMIENTOS VISUALES POR CARGA. Requiere 013. No cambia estatus ni recordatorios.
begin;
alter table public.loads add column if not exists logistics_signals text[] not null default '{}';
alter table public.loads add column if not exists logistics_signals_at timestamptz;
alter table public.loads add column if not exists logistics_signals_by uuid references public.profiles(id);

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.loads'::regclass and conname='loads_logistics_signals_valid') then
    alter table public.loads add constraint loads_logistics_signals_valid check (
      cardinality(logistics_signals)<=3 and
      coalesce(array_ndims(logistics_signals),1)=1 and
      array_position(logistics_signals,null) is null and
      logistics_signals <@ array['urgent','workshop','delay','documents','customs','handling','appointment','priority']::text[]
    );
  end if;
end $$;

-- La migración 006 concede columnas al reinstalarse: estas se vuelven a proteger al final.
revoke insert(logistics_signals,logistics_signals_at,logistics_signals_by),
  update(logistics_signals,logistics_signals_at,logistics_signals_by) on public.loads from authenticated;

create or replace function public.ops_set_load_signals(p_load text,p_version timestamptz,p_signals text[])
returns public.loads language plpgsql security definer set search_path='' as $$
declare saved public.loads; normalized text[];
begin
  perform public.ops_require_staff();
  select * into saved from public.loads where load=p_load for update;
  if not found or saved.archived then raise exception 'La carga no está disponible para editar'; end if;
  if saved.updated_at is distinct from p_version then raise exception 'La carga cambió. Actualiza antes de guardar'; end if;
  if p_signals is null or cardinality(p_signals)>3 or coalesce(array_ndims(p_signals),1)<>1 then
    raise exception 'Selecciona hasta 3 señalamientos distintos del catálogo';
  end if;
  if array_position(p_signals,null) is not null or not p_signals <@ array['urgent','workshop','delay','documents','customs','handling','appointment','priority']::text[] then
    raise exception 'Selecciona señalamientos del catálogo';
  end if;
  -- Un orden canónico evita historial por cambiar únicamente el orden de selección.
  select coalesce(array_agg(distinct value order by value),'{}') into normalized from unnest(p_signals) value;
  if cardinality(normalized)<>cardinality(p_signals) then raise exception 'Selecciona señalamientos distintos'; end if;
  if saved.logistics_signals=normalized then return saved; end if;
  update public.loads set logistics_signals=normalized,logistics_signals_at=now(),logistics_signals_by=auth.uid()
    where load=p_load returning * into saved;
  -- La auditoría y el delta usan los triggers existentes de loads.
  return saved;
end $$;
revoke all on function public.ops_set_load_signals(text,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.ops_set_load_signals(text,timestamptz,text[]) to authenticated;
commit;
