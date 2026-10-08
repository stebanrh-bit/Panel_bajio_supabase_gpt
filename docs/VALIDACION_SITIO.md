# Validación de la entrega conjunta

Comprobaciones ejecutadas en Codex el 8 de octubre de 2026. No representan un despliegue nuevo en Google ni ejecución remota de SQL 004–007.

| Comprobación | Resultado |
| --- | --- |
| Instalación reproducible con `npm --cache /tmp/panel-npm-cache ci --no-audit --no-fund` | Correcta con el lockfile actualizado |
| `npm --cache /tmp/panel-npm-cache test` | 47 pruebas aprobadas; 0 fallidas y 0 omitidas |
| `npm --cache /tmp/panel-npm-cache run build` | Compilación de 125 módulos correcta |
| Peticiones internas al servidor Vite | Documento, main, radar e importador respondieron HTTP 200 |
| `python3 scripts/package_site.py --check` | SQL, HTML y contenido íntegro del ZIP coinciden con las fuentes |
| HTML autónomo | Estilos incluidos, base `_top`, un módulo JavaScript válido y ningún asset externo |
| Archivos originales de la raíz | Conservados como referencia |

Las pruebas de PostgreSQL usan PGlite, identidades Auth simuladas y los roles `anon`/`authenticated` con concesiones por defecto similares a Supabase. Cubren lectura y escritura por rol, autor real, versiones, transacciones, repetición de migraciones, datos del portal restringidos, importación/deshacer y exportación administrativa. La instalación conjunta se probó incluyendo un fallo deliberado al final: revierte todo y conserva las cargas anteriores. Al repetir la instalación, los datos se conservan y los permisos de avisos/respaldos siguen activos.

Las pruebas de interfaz usan Happy DOM. Cubren listas de solicitudes/apartados al crear/cerrar/reabrir, turnos múltiples, plantillas, portal sin campos internos y respuestas tardías después de salir. Se probó la lectura de un XLSX real y CSV con comillas/saltos de línea. El puente de Google se probó con servicios simulados para verificar que autentica y comprueba el rol antes de consumir Maps y que suma todos los tramos de carretera.

Falta instalar la actualización en el proyecto real y seguir [las pruebas finales](PRUEBAS_FINALES.md). Supabase Auth real, Google HtmlService, permisos de UrlFetch/Maps, cuotas y cuentas adicionales requieren la validación en el navegador del usuario. El proxy de Codex había bloqueado Google con CONNECT 403; no se repitió esa llamada sin cambios. Las comprobaciones reales anteriores del usuario se conservan documentadas; no validan los módulos nuevos.
