-- MENSAJES MANUALES PARA WHATSAPP. Requiere 016; no habilita envíos ni portales.
-- Solo registra avisos sobre las cargas de los clientes asignados a la sesión.
-- Conserva datos e historial; es repetible.
begin;

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
