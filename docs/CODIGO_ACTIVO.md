# Qué código se mantiene

La actualización de calendario, tareas y listado está documentada en [CALENDARIO_TAREAS_Y_LISTADO_2026-10-16.md](CALENDARIO_TAREAS_Y_LISTADO_2026-10-16.md). La presentación activa se modifica en las fuentes siguientes; los archivos históricos de la raíz conservan su contenido.

La vista sencilla de Cargas está documentada en [VISTA_SENCILLA_2026-10-19.md](VISTA_SENCILLA_2026-10-19.md). Usa la misma tabla y los mismos adaptadores; no modifica la campana ni añade consultas de datos. Sus estilos se limitan a `.sheet-view` en `usability.css`.

El tema compartido está en `web/src/original/theme-light.css`. Las entradas del panel y los portales lo pasan a `page.js`; su carga al final evita modificar las hojas históricas. [Tema claro y controles compactos](TEMA_CLARO_2026-10-19.md).

Los [pendientes puntuales](PENDIENTES_PUNTUALES.md) usan la migración 013 y el RPC `ops_set_punctual_pending`. La presentación y sus eventos están en `panel/04_table_and_team.js`; se reutiliza el mismo editor en el detalle rápido y en el expediente. Inicio muestra hasta cinco notas y el filtro de Cargas permite consultar todas.

Los [señalamientos de logística](SENALAMIENTOS_CARGAS.md) usan el catálogo `logistics-signals.js`, SVG locales de Lucide, la migración 014 y el RPC `ops_set_load_signals`. El mismo selector se abre desde el trailer, el detalle y el expediente.

La entrega activa es la [versión personal con instructivos por ruta](VERSION_PERSONAL_E_INSTRUCTIVOS.md). Solo arranca la operación interna para Admin/CSR. Las entregas de Gerencia/cliente son mensajes estáticos; los archivos originales de esas vistas se conservan como historia. `instructions/content.js` presenta la instrucción vigente y los avisos; `instructions/ui.js` administra plantillas y casos. Las migraciones 015/016 implementan asignación, autorización y alcance personal de las cargas.

## Sitio actual

El [Gmail manual por carga](GMAIL_POR_CARGA.md) usa `gmail/` y los enlaces e historial de SQL 020. Solo requiere actualizar HTML. El usuario envía desde Gmail y luego registra su confirmación manual; no usa OAuth ni Edge. WhatsApp permanece manual. SQL 021 pertenece a la integración anterior y no se instala en la entrega activa.

- `web/src/original/main.js`: arranque del panel interno; `main-portal.js`: arranque de cliente/gerencia.
- `index.template.html`, `client.template.html`, `manager.template.html`: presentación de cada vista.
- `panel-source.js` y `panel.parts.json`: ensamblan los nueve archivos de `panel/` en orden. Mantienen un único cierre para preservar los eventos heredados; no se ejecutan por separado.
- `api/`: adaptadores de operaciones, equipo, importación, radar y organización. `context.js` guarda sesiones, versiones y cachés por cuenta.
- `notice-scope.js`: alcance de la campana por clientes asignados a la sesión real; independiente del rol y de los filtros de consulta. `panel/09_reports_and_alerts.js` lo aplica a los candidatos y a los avisos guardados antes de mostrarlos.
- `validation.js`: validación compartida, mensajes por campo, asociaciones accesibles y rangos de fechas; `dialogs.js` reutiliza el mismo validador.
- `organization.js` y `organization.css`: centro de turno con navegación por secciones; `dialogs.js` y `validation.js`: formularios y validación compartidos.
- `panel/02_daily_plan.js`: tarjetas del plan en tres grupos; `panel/06_events_and_sync.js`: agenda semanal con días desplegables. Su presentación está en `usability.css`. Los contadores incluyen registros aún no desplegados.
- `content.js`, `rendering.js`, `network.js`, `coordination.js`, `usability.js`: texto/CSV seguros, actualización de nodos, plazos de red, sondeos y presentación.
- `files.js` extrae el lector del contenedor HTML/JSON válido para HtmlService e inicia el Worker bajo demanda. `reader-worker.js` procesa archivos; `files-fallback.js` conserva el contrato del lector anterior para pruebas de compatibilidad y no se carga al arrancar.
- `features/*/service.js`, `data/columns.js`: consultas reutilizadas y contratos de columnas.
- `supabase/migrations/`: cambios ordenados del esquema. La entrega conjunta se genera con 004–020, sobre 001–003.
- `supabase/functions/panel-accounts/index.ts`: Auth y administración de cuentas en el servidor.
- `google-apps-script/Code-sitio.gs`: alojamiento, consultas Google y proceso horario limitado. No usa claves privilegiadas.

## Archivos generados

`google-apps-script/index-sitio.html`, `index-cliente.html`, `index-gerencia.html`, `lector.html`, `supabase/actualizar_sitio.sql` y `entregables/panel-bajio-sitio.zip` son entregables. Se generan con `npm --prefix web run build` y `python scripts/package_site.py`. El código fuente se mantiene legible; la entrega se comprime para reducir la descarga.

`python scripts/package_site.py --check` comprueba SQL/HTML/ZIP sin modificarlos. GitHub Actions ejecuta instalación, pruebas, compilación y esta verificación.

## Referencias históricas

Los archivos de la raíz `Code.gs`, `PanelScript.html`, `PanelEstilos.html`, `index.html` pertenecen al proyecto original con Sheets. No se editan ni se publican para esta versión. Las primeras entregas `google-apps-script/index.html`, `index-operaciones.html`, `index-pendientes.html` también se conservan como referencia. La entrada antigua `web/src/main.js` y sus pantallas siguen documentando la primera migración, pero Vite compila `web/src/original/` para la entrega actual.

Los SQL de `supabase/maintenance/` son herramientas manuales independientes. No forman parte de la instalación, de CI ni de los procesos programados.

## Verificaciones de desarrollo

```bash
npm --prefix web ci
npm --prefix web test
npm --prefix web run build
python scripts/package_site.py
python scripts/package_site.py --check
node scripts/measure_queries.mjs
node scripts/rehearse_backup.mjs /ruta/privada/respaldo.json
```

Para navegador, servir `google-apps-script/` localmente y ejecutar `scripts/check_browser.mjs --legacy-xls` y `scripts/check_organization_browser.mjs`, con Chromium y `playwright-core` disponibles. La opción `--reader-files` de `check_organization_browser.mjs` además verifica XLSX/XLS del Radar con el puente Google simulado y los archivos sintéticos `web/test/fixtures/radar.*`; requiere la biblioteca heredada almacenada en `PANEL_SHEETJS_FILE` (por defecto `/tmp/panel-audit-sheetjs.js`). Ambos interceptan Supabase; el segundo usa PostgreSQL efímero. Los requisitos y rutas de herramientas están al principio de esos scripts. Nunca se requieren contraseñas o `service_role` para estas pruebas.

La revisión general se ejecuta con `node scripts/check_browser.mjs --review-only` después de compilar y empaquetar. `scripts/panel_review_checks.mjs` contiene el recorrido de las siete secciones, búsqueda, errores de formulario, respuestas tardías, avisos y portales. Se incluye también al ejecutar el recorrido funcional completo con `--imports-only --legacy-xls`.

Para esta entrega personal, el recorrido de navegador vigente es `node scripts/check_browser.mjs --internal-only`. Los recorridos anteriores que incluyen portales o consulta compartida corresponden a entregas históricas y no describen la interfaz actual. El script vigente intercepta Supabase y no escribe en producción.

Las cargas nuevas usan `PTE. ARRIVO` mediante la migración 017, tanto en captura como en importación. El rojo contempla también las escrituras anteriores del mismo estatus. Los comentarios se escriben libremente, sin botones de frases preestablecidas.

La migración 018 recupera la redacción y confirmación manual de mensajes para WhatsApp. `MANUAL_CLIENT_MESSAGES` muestra el compositor individual y «Mensaje a cliente» para varias cargas; mantiene los portales y envíos automáticos desactivados. El SQL breve está en `supabase/actualizar_cargas_y_mensajes.sql` y requiere 016.

El [menú Mostrar configurable](MOSTRAR_CONFIGURABLE.md) usa `load-views/rules.js`, `load-views/editor.js` y la migración 019. Las preferencias se guardan por cuenta en `original_preferences.load_views`, separadas de las plantillas de WhatsApp. El recorrido de navegador es `node scripts/check_browser.mjs --views-only`.

En la consulta de una carga se retiraron Salida de planta y Cruce del detalle rápido, la edición de tarjetas y la pestaña Operación del expediente. El recorrido visible muestra Pickup y Entrega; el grupo de datos se llama Ruta. Las fechas históricas se conservan en Supabase y siguen disponibles para calendario, historial e instructivos. Esta actualización de presentación solo requiere reemplazar `index.html` en Apps Script.

La [consolidación personal R01–R20](CONSOLIDACION_PERSONAL_2026-10-27.md) usa `personal/` (reglas, documentos, preferencias, importación, exportación y avisos) y SQL 020. `main.js` instala sus dependencias antes de ejecutar la interfaz compartida. La prueba de navegador se ejecuta con `node scripts/check_browser.mjs --personal-only`; usa Supabase simulado.

La [corrección de guardar y buscar instructivos v2026.10.27.5](CORRECCION_INSTRUCTIVOS_2026-10-27.md) distingue borrador/publicación y presenta resultados antes de aplicar a la carga. `instructions/matching.js` reproduce las comparaciones de cliente y ruta para la vista previa; `ui.js` gestiona el guardado y la confirmación. Supabase conserva la autoridad de aplicación. Solo requiere actualizar el HTML; el recorrido de regresión está en `scripts/internal_instructions_checks.mjs` y se ejecuta con `--internal-only`.

El [cierre de pendientes y seguimientos v2026.10.27.6](CIERRE_SEGUIMIENTOS_2026-10-27.md) invalida avisos antiguos al completar o reprogramar. `guidance.js` compara el evento con el plazo vigente; la campana aplica esa comprobación también a los avisos en caché. Las acciones de cierre conservan la respuesta confirmada completa. No cambia el esquema ni agrega vencimiento automático. El recorrido de navegador usa `--followups-only`.
