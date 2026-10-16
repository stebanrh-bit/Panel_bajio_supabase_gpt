# Qué código se mantiene

La actualización de calendario, tareas y listado está documentada en [CALENDARIO_TAREAS_Y_LISTADO_2026-10-16.md](CALENDARIO_TAREAS_Y_LISTADO_2026-10-16.md). La presentación activa se modifica en las fuentes siguientes; los archivos históricos de la raíz conservan su contenido.

## Sitio actual

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
- `supabase/migrations/`: cambios ordenados del esquema. La entrega conjunta se genera con 004–012, sobre 001–003.
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
