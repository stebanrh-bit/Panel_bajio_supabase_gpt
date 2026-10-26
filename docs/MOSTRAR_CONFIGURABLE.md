# Menú Mostrar configurable

En Cargas, pulsar **Configurar**, junto a Mostrar. Cada cuenta puede ajustar los nombres y condiciones de las opciones originales, ocultarlas, cambiar su orden y elegir cuál se abre al iniciar. **Agregar nueva** crea una opción propia. Guardar menú confirma el conjunto; Cancelar conserva lo anterior.

Se pueden combinar cargas abiertas/entregadas/canceladas, fecha de Pickup, estatus, clientes, periodo de Pickup/entrega/cruce, POD, pendientes puntuales, atención, avisos pendientes y texto de búsqueda. Las condiciones se cumplen juntas; dentro de clientes y estatus basta cualquiera de los seleccionados. Sin selección de clientes o estatus se incluyen todos. El recuento del editor muestra cuántas cargas coinciden antes de guardar.

Ejemplos:

- **Activas que incluyan futuras:** editar Activas → Fecha de Pickup → Cualquier fecha → Guardar menú.
- **Programadas:** Agregar nueva → Nombre Programadas → Abiertas → Solo futuras → Guardar menú.
- **En taller:** Agregar nueva → elegir Descompuesta en Estatus → Guardar menú.

Las fechas se comparan por día del centro de México. La regla inicial de Activas conserva el Pickup de hoy y anteriores o sin fecha hasta que el usuario la cambie. Entregadas exige POD registrado; Canceladas incluye Cancelado y TONU con recargos confirmados. Las cargas entregadas sin POD y TONU sin recargos siguen abiertas. El cambio de vistas no modifica estatus ni fechas de las cargas.

Las vistas guardadas anteriormente en este navegador se incorporan al menú cuando todavía no existe configuración en la cuenta. Se conservan los archivos locales originales; Guardar menú sincroniza las opciones importadas. La caché permite mostrar la última configuración mientras se recupera Supabase. Cada guardado comprueba la versión y conserva las plantillas de mensajes; un conflicto mantiene el formulario para que pueda revisarse.

Instalación: aplicar completo `supabase/migrations/019_personal_load_views.sql`, sobre la entrega 018. Reemplazar `index.html` en Apps Script con `google-apps-script/index-sitio.html` y publicar una nueva versión de la implementación. `Code.gs` conserva su contenido.

La configuración es privada por cuenta, con un máximo de 30 opciones. No amplía el acceso a cargas de otros clientes. Las opciones originales pueden restaurarse individualmente; Todas permanece visible para conservar un acceso de regreso al menú.

Código: `web/src/original/load-views/rules.js` evalúa las reglas; `editor.js` administra el borrador y `style.css` su presentación. La migración 019 guarda solo la configuración del usuario autenticado. Las pruebas usan PostgreSQL temporal y un navegador con Supabase simulado; no escriben en producción. Recorrido: `node scripts/check_browser.mjs --views-only` después de compilar, empaquetar y servir `google-apps-script/` en el puerto 5182.
