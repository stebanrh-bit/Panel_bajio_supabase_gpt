# Pendientes puntuales

La entrega personal vigente incluye la [revisión del cierre de pendientes y seguimientos v2026.10.27.6](CIERRE_SEGUIMIENTOS_2026-10-27.md). Esa actualización solo requiere reemplazar el HTML; no agrega vencimiento automático ni SQL nuevo.

Permiten destacar una carga para atender algo ahora, por ejemplo confirmar la salida de una unidad del taller. Son compartidos por el equipo y no cambian el estatus de la carga ni sus seguimientos con fecha.

## Instalar

1. Supabase → SQL Editor → New query: ejecutar **todo** `supabase/migrations/013_punctual_pending.sql`. Requiere las migraciones anteriores hasta 012. Si el sitio ya funcionaba con la versión anterior, basta con este archivo nuevo. Se puede volver a ejecutar sin borrar registros.
2. Reemplazar todo el contenido de `index.html` del proyecto Google Apps Script con `google-apps-script/index-sitio.html`.
3. Guardar → Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar. Recargar el panel con Ctrl + Shift + R.

El ZIP también incluye el SQL conjunto 004–013 para instalaciones que necesiten actualizar varios módulos. No es necesario crear otra implementación ni cambiar el enlace del portal.

## Usar

- Abrir una carga, en su detalle rápido o en Expediente → Operación.
- En **Pendiente puntual**, elegir **Atender ahora**, escribir qué hay que resolver y pulsar **Guardar pendiente**.
- Inicio muestra hasta cinco pendientes, con cliente, Truck, Trailer y nota. **Ver en Cargas** abre el apartado completo. También se puede elegir **Mostrar → Pendientes puntuales** en Cargas y combinarlo con cliente, Mis clientes o búsqueda.
- Al terminar, abrir el pendiente y pulsar **Marcar resuelto**. No vence solo: permanece hasta resolverlo. Es posible editar la nota o volver a abrir un pendiente.

Se conserva la nota y quién/cuándo abrió y resolvió en el historial. Admin y CSR pueden editar; Gerencia conserva lectura. El cliente no recibe acceso directo a estos campos internos. El alcance de Inicio respeta el selector de CSR y el filtro de Cargas respeta los filtros habituales. No genera mensajes externos ni cambia el alcance personal de la campana.

## Notas técnicas

La migración agrega seis columnas a `loads`; no crea cargas, tareas ni comentarios. El RPC `ops_set_punctual_pending` bloquea y comprueba la versión de la carga, valida la nota (3–1000 caracteres), comprueba el rol y fija autor/fecha desde Auth. La interfaz espera confirmación del servidor antes de mostrar el cambio. Los triggers existentes conservan auditoría y sincronización incremental. El SQL conjunto revoca explícitamente la escritura directa de estas columnas incluso al reinstalar migraciones anteriores.

## Verificación automática

- PostgreSQL local: nota obligatoria (incluye espacios/saltos), rol y autor, rechazo de versión vieja, lectura compartida, auditoría, resolución/reapertura, aislamiento del seguimiento con fecha y reinstalación del SQL conjunto. El portal cliente no recibe los campos nuevos.
- Chromium con todo el transporte Supabase simulado: error de guardado conserva la nota, persistencia tras recargar, editor rápido y expediente, Inicio, filtro y resolución. Revisión de anchos entre 320 y 1920 px.
- Regresión de colores, orden manual, vistas del calendario, tareas y tema claro. No se ejecutaron operaciones ni pruebas manuales sobre producción.

Comandos de reproducción: `node --test web/test/punctual-pending-database.test.js`; después de compilar y empaquetar, servir `google-apps-script` en el puerto local 5182 y ejecutar `node scripts/check_browser.mjs --punctual-only`. La opción `--calendar-tasks-only` incluye la regresión de estas pantallas. El navegador necesita las herramientas externas descritas en el script.
