-- INCIDENCIAS: CATEGORÍA OBLIGATORIA TAMBIÉN EN SUPABASE.
-- Copiar y ejecutar TODO. Funciona con la tabla incidents de la primera entrega.
-- Conserva incidencias anteriores: NOT VALID controla registros nuevos sin borrarlas.
begin;
alter table public.incidents drop constraint if exists incidents_category_required_check;
alter table public.incidents add constraint incidents_category_required_check check (
  category is not null
  and char_length(btrim(category, E' \t\n\r\f' || chr(11) || chr(160))) between 1 and 100
) not valid;
commit;
