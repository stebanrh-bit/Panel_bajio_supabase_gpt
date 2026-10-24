-- VERSIÓN INTERNA PERSONAL. Requiere 015. Conserva expedientes y datos históricos.
begin;
create or replace function public.ops_require_reader() returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or coalesce(public.panel_role(),'') not in ('admin','csr') then raise exception 'Esta versión es de uso interno'; end if;
end $$;
create or replace function public.ops_can_read_load(p_load text,p_customer text) returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(public.panel_role() in ('admin','csr') and exists(
  select 1 from public.customer_assignments a where a.owner_id=auth.uid()
   and public.ops_customer_key(public.ops_canonical_customer(a.customer))=public.ops_customer_key(public.ops_canonical_customer(p_customer))),false)
$$;
create index if not exists customer_assignments_owner_idx on public.customer_assignments(owner_id,customer_key);
drop policy if exists loads_personal_scope on public.loads;
create policy loads_personal_scope on public.loads as restrictive for all to authenticated
 using(public.ops_can_read_load(load,customer)) with check(public.ops_can_read_load(load,customer));
-- La creación/importación de un cliente sin asignación lo vincula a quien lo está capturando.
create or replace function public.ops_personal_load() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.panel_role() in ('admin','csr') and trim(new.customer)<>'' then
  if TG_OP='UPDATE' and not public.ops_can_read_load('',old.customer) then raise exception 'La carga no pertenece a tus clientes'; end if;
  if exists(select 1 from public.customer_assignments a where a.owner_id<>auth.uid() and public.ops_customer_key(public.ops_canonical_customer(a.customer))=public.ops_customer_key(public.ops_canonical_customer(new.customer))) then raise exception 'El cliente está asignado a otra persona'; end if;
  insert into public.customer_assignments(customer,owner_id,updated_by) values(new.customer,auth.uid(),auth.uid()) on conflict(customer_key) do nothing;
 end if;
 if TG_TABLE_NAME='loads' then new.client_notify_pending:='false';new.client_notify_reason:='';new.client_notify_since:=''; end if;
 return new;
end $$;
drop trigger if exists zz_personal_load on public.loads;
create trigger zz_personal_load before insert or update on public.loads for each row execute function public.ops_personal_load();
do $$ declare name text; begin
 foreach name in array array['comments','incidents','load_history'] loop
  execute format('drop policy if exists personal_load_scope on public.%I',name);
  execute format('create policy personal_load_scope on public.%I as restrictive for all to authenticated using(exists(select 1 from public.loads l where l.load=%I.load)) with check(exists(select 1 from public.loads l where l.load=%I.load))',name,name,name);
 end loop;
end $$;
-- Las cuentas externas no se eliminan; se retira el acceso a los RPC de sus portales.
revoke execute on function public.ops_portal_loads(integer,integer),public.ops_portal_detail(text),
 public.confirm_client_notice(text,timestamptz,text,text),public.ops_publish_portal_message(text,timestamptz,text),public.ops_customer_communications(text,integer,integer) from authenticated;
-- Los envíos externos permanecen apagados durante la consolidación de esta versión.
update public.panel_settings set external_alerts_enabled=false,alert_channel='disabled' where singleton and (external_alerts_enabled or alert_channel<>'disabled');
revoke all on function public.ops_personal_load() from public,anon,authenticated;
-- El administrador puede recuperar/asignar clientes sin exponer expedientes ajenos.
create or replace function public.ops_internal_customer_directory() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform public.ops_require_staff(true);
 return (select coalesce(jsonb_agg(customer order by customer),'[]') from (select distinct customer from public.loads where trim(customer)<>'' and not exists(select 1 from public.customer_assignments a where public.ops_customer_key(a.customer)=public.ops_customer_key(loads.customer))) c);
end $$;
create or replace function public.ops_internal_settings() returns trigger language plpgsql set search_path='' as $$ begin
 new.external_alerts_enabled:=false;new.alert_channel:='disabled';return new;
end $$;
drop trigger if exists internal_settings on public.panel_settings;
create trigger internal_settings before insert or update on public.panel_settings for each row execute function public.ops_internal_settings();
revoke all on function public.ops_internal_customer_directory(),public.ops_internal_settings() from public,anon,authenticated;
grant execute on function public.ops_internal_customer_directory() to authenticated;


-- Solicitudes sin número también pertenecen al cliente que las origina.
drop trigger if exists zz_personal_load on public.pending_loads;
create trigger zz_personal_load before insert or update on public.pending_loads for each row execute function public.ops_personal_load();
drop policy if exists pending_personal_scope on public.pending_loads;
create policy pending_personal_scope on public.pending_loads as restrictive for all to authenticated using(public.ops_can_read_load('',customer)) with check(public.ops_can_read_load('',customer));
drop policy if exists pending_comments_personal_scope on public.pending_load_comments;
create policy pending_comments_personal_scope on public.pending_load_comments as restrictive for select to authenticated using(exists(select 1 from public.pending_loads p where p.id=pending_load_comments.pending_id));
drop policy if exists reserved_personal_scope on public.reserved_loads;
create policy reserved_personal_scope on public.reserved_loads as restrictive for select to authenticated using(public.panel_role() in ('admin','csr') and (created_by=auth.uid() or exists(select 1 from public.loads l where l.load=reserved_loads.related_load or l.load=reserved_loads.own_load)));
drop policy if exists tasks_personal_scope on public.shift_tasks;
create policy tasks_personal_scope on public.shift_tasks as restrictive for select to authenticated using(public.panel_role() in ('admin','csr') and (exists(select 1 from public.loads l where l.load=shift_tasks.load) or (load is null and auth.uid() in (created_by,assigned_to,assigned_csr))));

commit;
