# Validación de la entrega conjunta

Comprobaciones ejecutadas en Codex el 8 de octubre de 2026. No representan un despliegue nuevo en Google ni ejecución remota de SQL 004–008.

| Comprobación | Resultado |
| --- | --- |
| Instalación reproducible con `npm --cache /tmp/panel-npm-cache ci --no-audit --no-fund` | Correcta con el lockfile actualizado |
| `npm --cache /tmp/panel-npm-cache test` | 59 pruebas aprobadas; 0 fallidas y 0 omitidas |
| `npm --cache /tmp/panel-npm-cache run build` | Compilación de 134 módulos correcta |
| Peticiones internas al servidor Vite | Documento, main, radar e importador respondieron HTTP 200 |
| `python3 scripts/package_site.py --check` | SQL, HTML y contenido íntegro del ZIP coinciden con las fuentes |
| HTML autónomo | Estilos incluidos, base `_top`, un módulo JavaScript válido y ningún asset externo |
| Archivos originales de la raíz | Conservados; estilos y logos reutilizados en la interfaz Supabase |
| Chromium local con respuestas Supabase simuladas | Inicio/Ahora/Mi turno, tarjetas/tabla, filtros, seis pestañas, guardado de incidencias, semana y navegación móvil correctos |

Las pruebas de PostgreSQL usan PGlite, identidades Auth simuladas y los roles `anon`/`authenticated` con concesiones por defecto similares a Supabase. Cubren lectura y escritura por rol, autor real, versiones, transacciones, repetición de migraciones, datos del portal restringidos, importación/deshacer y exportación administrativa. La instalación conjunta se probó incluyendo un fallo deliberado al final: revierte todo y conserva las cargas anteriores. Al repetir la instalación, los datos se conservan y los permisos de avisos/respaldos siguen activos.

Las pruebas de interfaz usan Happy DOM. Se verifica que mover el expediente a sus pestañas conserva los controles y sus eventos, que los textos se escapan y que la semana navega en ambos sentidos. Cubren listas de solicitudes/apartados al crear/cerrar/reabrir, turnos múltiples, plantillas, portal sin campos internos y respuestas tardías después de salir. Se probó la lectura de un XLSX real y CSV con comillas/saltos de línea. El puente de Google se probó con servicios simulados para verificar que autentica y comprueba el rol antes de consumir Maps y que suma todos los tramos de carretera.

La regresión de incidencias se reprodujo en el manejador anterior: envíos directos con categoría vacía/espacios alcanzaban el guardado y un doble envío podía duplicarlo. El nuevo manejador valida antes de guardar y controla envíos repetidos. La prueba SQL simula la ausencia de la restricción inicial, conserva un registro antiguo inválido y verifica el rechazo de nuevos valores vacíos, nulos, con espacios/saltos/NBSP o más de 100 caracteres. Esto no establece qué restricciones tiene la base remota del usuario.

La revisión en Chromium usa el navegador real con sesiones y respuestas HTTP simuladas, sin consultar ni escribir en producción. Se comparó la organización con los archivos originales `index.html` y `PanelEstilos.html`. No sustituye las comprobaciones del iframe de Google y las cuentas reales.

Falta instalar la actualización en el proyecto real y seguir [las pruebas finales](PRUEBAS_FINALES.md). Supabase Auth real, Google HtmlService, permisos de UrlFetch/Maps, cuotas y cuentas adicionales requieren la validación en el navegador del usuario. El proxy de Codex había bloqueado Google con CONNECT 403; no se repitió esa llamada sin cambios. Las comprobaciones reales anteriores del usuario se conservan documentadas; no validan los módulos nuevos.

## Repetir la comprobación del HTML final

Desde la raíz del repositorio, con Chromium instalado en `/usr/bin/chromium`:

```bash
npm install --prefix /tmp/panel-browser-tools --cache /tmp/panel-npm-cache --no-audit --no-fund playwright-core@1.56.1
python3 -m http.server 5182 --bind 127.0.0.1 --directory google-apps-script
```

En otra terminal de la misma máquina:

```bash
node scripts/check_browser.mjs
```

El servidor se usa solo durante esta comprobación interna. El script abre `index-sitio.html`, intercepta las solicitudes a Supabase y utiliza una sesión ficticia: no hace operaciones en producción. También comprueba que Cancelar no deje bloqueado el scroll y abre pendientes, bitácora, apartados, radar, indicadores, archivo, plantillas y cuenta bajo la barra lateral nueva. Las capturas se guardan en `/tmp/panel-*.png`. Puedes cambiar la ruta de herramientas con `PANEL_BROWSER_TOOLS` y la URL interna con `PANEL_PREVIEW_URL`.
