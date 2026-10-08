-- Ejecutar DESPUÉS de 001_panel.sql. No elimina cargas ni usuarios.
begin;
alter table public.loads add column if not exists last_communication_channel text not null default '';
alter table public.loads add column if not exists last_communication_type text not null default '';
create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  load text not null references public.loads(load) on delete restrict,
  event_type text not null check (event_type in ('PENDIENTE','NOTIFICADO')),
  reason text not null default '',
  actor uuid references public.profiles(id),
  channel text not null default '',
  notice_type text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists communications_load_idx on public.communications(load, created_at);
alter table public.communications enable row level security;
drop policy if exists communications_read on public.communications;
create policy communications_read on public.communications for select to authenticated
using (public.panel_role() in ('admin','csr','manager'));
revoke all on public.communications from anon, authenticated;
grant select on public.communications to authenticated;

create or replace function public.apply_load_rules() returns trigger
language plpgsql set search_path = public as $$
declare
  previous jsonb := '{}'::jsonb;
  field text;
  field_value text;
  reason text := '';
  actor_name text := coalesce(auth.uid()::text, 'database');
begin
  if TG_OP = 'UPDATE' then previous := to_jsonb(old); end if;
  -- Estas fechas se capturan en el navegador con zona horaria y se validan también aquí.
  foreach field in array array['pickup_appt','pickup_actual','delivery_appt','delivery_actual',
    'salida_mexico_fecha','cruce_usa_fecha','recordatorio_fecha','next_review_at'] loop
    field_value := to_jsonb(new)->>field;
    if field_value <> '' and field_value is distinct from previous->>field then
      if field_value !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}.*(Z|[+-]\d{2}(:?\d{2})?)$' then
        raise exception 'Fecha no válida o sin zona horaria: %', field;
      end if;
      perform field_value::timestamptz;
    end if;
  end loop;
  if new.tracking_link <> '' and (new.tracking_link !~* '^https?://[^[:space:]]+$' or length(new.tracking_link)>2000) then
    raise exception 'El enlace de seguimiento debe usar http o https y tener hasta 2000 caracteres';
  end if;
  if new.status in ('Descompuesta','En resguardo','Patio permisionario') and new.recordatorio_fecha = ''
     and (TG_OP = 'INSERT' or new.status is distinct from previous->>'status'
          or new.recordatorio_fecha is distinct from previous->>'recordatorio_fecha') then
    raise exception 'Este estatus requiere una fecha de recordatorio o despacho';
  end if;
  if new.status = 'En transito' and (TG_OP = 'INSERT' or new.status is distinct from previous->>'status') then
    new.recordatorio_fecha := (now() + interval '3 hours')::text;
  elsif TG_OP = 'UPDATE' and new.status is distinct from old.status
        and new.status not in ('Descompuesta','En resguardo','Patio permisionario') then
    new.recordatorio_fecha := '';
  end if;
  if TG_OP = 'UPDATE' then
    foreach field in array array['status','pickup_appt','delivery_appt','salida_mexico_fecha','cruce_usa_fecha'] loop
      if to_jsonb(new)->>field is distinct from previous->>field then
        reason := concat_ws(' · ', nullif(reason,''), case field
          when 'status' then 'Cambio de estatus: ' || new.status
          when 'pickup_appt' then 'Cambio en cita de pickup'
          when 'delivery_appt' then 'Cambio en cita de entrega'
          when 'salida_mexico_fecha' then 'Salida de planta actualizada'
          when 'cruce_usa_fecha' then 'Cruce aduana actualizado' end);
      end if;
    end loop;
    if new.cruce_usa_fecha is distinct from old.cruce_usa_fecha then new.cruce_confirmado := ''; end if;
    if reason <> '' then
      new.client_notify_pending := 'true';
      new.client_notify_reason := concat_ws(' · ', nullif(old.client_notify_reason,''), reason);
      new.client_notify_since := now()::text;
      new.client_notified_at := '';
      new.client_notified_by := '';
    elsif new.client_notified_at is distinct from old.client_notified_at
          or (old.client_notify_pending = 'true' and new.client_notify_pending in ('','false')) then
      new.client_notify_pending := 'false';
      new.client_notify_reason := '';
      new.client_notify_since := '';
      new.client_notified_at := now()::text;
      new.client_notified_by := actor_name;
      if new.status = 'En transito' then new.recordatorio_fecha := (now()+interval '3 hours')::text; end if;
    end if;
  end if;
  foreach field in array array['truck','trailer','bol','doda','entry','sobre_listo'] loop
    if to_jsonb(new)->>field is distinct from previous->>field and (TG_OP='UPDATE' or to_jsonb(new)->>field <> '') then
      new := jsonb_populate_record(new,jsonb_build_object(field||'_source','MANUAL',field||'_manual_by',actor_name,field||'_manual_at',now()::text));
    end if;
  end loop;
  if new.next_review_at is distinct from previous->>'next_review_at' then
    new.next_review_by := case when new.next_review_at = '' then '' else actor_name end;
    if new.next_review_at = '' then new.next_review_note := ''; end if;
  end if;
  return new;
end $$;
drop trigger if exists operational_load on public.loads;
create trigger operational_load before insert or update on public.loads
for each row execute function public.apply_load_rules();

create or replace function public.log_load_communication() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_notify_pending = 'true' and (new.client_notify_since is distinct from old.client_notify_since) then
    insert into public.communications(load,event_type,reason,actor)
    values(new.load,'PENDIENTE',new.client_notify_reason,auth.uid());
  elsif new.client_notified_at <> '' and new.client_notified_at is distinct from old.client_notified_at then
    insert into public.communications(load,event_type,reason,actor,channel,notice_type)
    values(new.load,'NOTIFICADO',old.client_notify_reason,auth.uid(),new.last_communication_channel,new.last_communication_type);
  end if;
  return new;
end $$;
drop trigger if exists log_load_communication on public.loads;
create trigger log_load_communication after update on public.loads
for each row execute function public.log_load_communication();

create or replace function public.review_after_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.loads set recordatorio_fecha=(now()+interval '3 hours')::text
  where load=new.load and status='En transito';
  return new;
end $$;
drop trigger if exists review_after_comment on public.comments;
create trigger review_after_comment after insert on public.comments
for each row execute function public.review_after_comment();

create or replace function public.confirm_client_notice(p_load text,p_version timestamptz,p_channel text,p_notice_type text)
returns setof public.loads language plpgsql set search_path = public as $$
begin
  if coalesce(public.panel_role(),'') not in ('admin','csr') then raise exception 'Sin permiso'; end if;
  if p_channel is null or p_channel not in ('WhatsApp','Correo','Teléfono','Otro') then raise exception 'Elige un canal válido'; end if;
  if coalesce(trim(p_notice_type),'') = '' or length(p_notice_type)>200 then raise exception 'Indica el tipo de aviso (hasta 200 caracteres)'; end if;
  return query update public.loads set client_notify_pending='false',client_notified_at=now()::text,
    last_communication_channel=p_channel,last_communication_type=trim(p_notice_type)
    where load=p_load and updated_at=p_version returning *;
  if not found then raise exception 'La carga cambió o no existe. Actualiza antes de registrar el aviso'; end if;
end $$;
create or replace function public.review_load(p_load text,p_version timestamptz)
returns setof public.loads language plpgsql set search_path = public as $$
begin
  if coalesce(public.panel_role(),'') not in ('admin','csr') then raise exception 'Sin permiso'; end if;
  return query update public.loads set next_review_at='',next_review_note='',
    recordatorio_fecha=case when status='En transito' then (now()+interval '3 hours')::text else recordatorio_fecha end
    where load=p_load and updated_at=p_version returning *;
  if not found then raise exception 'La carga cambió o no existe. Actualiza antes de marcar la revisión'; end if;
end $$;
revoke execute on function public.apply_load_rules(), public.log_load_communication(),public.review_after_comment(),
  public.confirm_client_notice(text,timestamptz,text,text),public.review_load(text,timestamptz) from public;
grant execute on function public.confirm_client_notice(text,timestamptz,text,text),public.review_load(text,timestamptz) to authenticated;
commit;
