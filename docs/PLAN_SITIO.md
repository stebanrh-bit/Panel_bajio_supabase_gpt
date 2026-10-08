# Construcción del sitio y pruebas finales

El usuario pidió construir los módulos del sitio y hacer las pruebas manuales al final, una por una. Durante el desarrollo se mantienen pruebas automáticas de reglas, permisos, transacciones e interfaz. No pedir otra cuenta ni despliegues parciales para cada módulo.

## Arquitectura

Supabase conserva usuarios, permisos y datos. Google Apps Script sirve un único HTML autónomo. Los archivos de la raíz son la referencia funcional del sitio anterior y se conservan. El código nuevo se organiza por módulos, con nombres descriptivos y notas en español.

## Cobertura y secuencia de trabajo

| Área original | Estado |
| --- | --- |
| Cargas, documentos, comentarios, incidencias, historial y comunicación | Implementados; varios flujos confirmados por el usuario en Google |
| Solicitudes pendientes y vinculación | Implementados; creación, vínculo y cancelación confirmados con persistencia |
| Apartados para regreso cargado | Código preparado; pruebas automáticas de agenda, permisos, etapas, cierre, reapertura y filtros |
| Equipo, clientes asignados y seguimiento | Preparados; administración por RPC y pruebas de roles/versiones |
| Bitácora y cierres de turno | Preparados; tareas múltiples, seguimiento, estados e historial |
| Plantillas y cuenta personal | Preparadas; privacidad por autor y cambio de contraseña vía Auth |
| Inicio, calendario, indicadores y SLA | Preparados; filtros y definiciones de métricas explícitas |
| Archivo, importación y deshacer | Preparados; archivo reversible, .xlsx/CSV, vista previa, versiones, deshacer y respaldo JSON |
| Radar y mapas/distancias | Preparados; fuente compartida, coordenadas y puente Google con Auth comprobado antes de Maps |
| Portal de clientes y vista de gerencia | Preparados; campos y cliente restringidos, gerencia en consulta |
| Integraciones externas y tareas programadas | Alcance documentado: no se instalan envíos automáticos, TCI, cron ni restauración de respaldos |

## Visualización original y categoría de incidencias

Por petición del usuario, el sitio recupera la barra lateral, encabezado/logo, Inicio Mi operación, tarjetas/tabla, filtros de cruces y calendario semanal del original. El expediente agrupa los controles en seis pestañas y conserva sus eventos. Entregadas requiere estatus de cierre y POD compartido; los cierres con POD pendiente permanecen en curso como en el original. Los módulos se conservan sobre Supabase y el HTML se publica en Google.

La categoría de incidencias se exige en el formulario antes del envío y en SQL 008. Las incidencias previas sin categoría quedan conservadas; no se inventa su clasificación ni se eliminan. Ambas modificaciones se entregan juntas para reducir pasos de instalación.

## Entrega conjunta

La entrega conjunta está en `supabase/actualizar_sitio.sql`, `google-apps-script/index-sitio.html`, `google-apps-script/Code-sitio.gs` y `entregables/panel-bajio-sitio.zip`. La guía está en `docs/INSTALAR_SITIO.md` y las pruebas ordenadas en `docs/PRUEBAS_FINALES.md`. No volver a ejecutar SQL 001 en el proyecto actual. Hasta ejecutar esa actualización y activar Nueva versión en Google, los módulos nuevos son entregas preparadas, no funciones verificadas en producción.

Las pruebas finales cubrirán acceso, cargas, pendientes, apartados, turnos, equipo, calendario, importación/deshacer, archivo, indicadores y portal. Las pruebas entre cuentas quedan pendientes para esa etapa por decisión del usuario.

## Diferencias que deben conservarse explícitas

- Un apartado puede referirse a una carga externa aún no registrada en Cargas.
- La agenda de apartados usa la fecha futura de cruce o entrega; cuando ya pasó, usa la frecuencia elegida. Usar o liberar cierra el registro y permite reabrirlo.
- Los cierres conservan su expediente y el historial.
- Las comprobaciones locales con Auth y DOM simulados no sustituyen las pruebas en Google y Supabase reales.
- El proxy de Codex bloqueó las llamadas directas a Google. El usuario validó los flujos publicados en su navegador.

## Mantenimiento

Ejecutar `npm ci`, `npm test` y `npm run build` desde web/ (usar caché `/tmp/panel-npm-cache` en Codex). Desde la raíz, `python3 scripts/package_site.py` regenera la entrega durante un cambio autorizado y `python3 scripts/package_site.py --check` la comprueba sin modificarla. El HTML incluye las bibliotecas; el código editable y comentado permanece en web/src/.
