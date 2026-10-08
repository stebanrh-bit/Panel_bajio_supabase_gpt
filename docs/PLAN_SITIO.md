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
| Equipo, clientes asignados y seguimiento | Por implementar |
| Bitácora y cierres de turno | Por implementar |
| Plantillas y cuenta personal | Por implementar |
| Inicio, calendario, indicadores y SLA | Por implementar |
| Archivo, importación y deshacer | Por implementar |
| Radar y mapas/distancias | Por implementar |
| Portal de clientes y vista de gerencia | Por completar |
| Integraciones externas y tareas programadas | Revisar requisitos y documentar limitaciones reales |

## Entrega conjunta

Preparar una actualización SQL que incluya únicamente las migraciones nuevas, un HTML para el proyecto Google existente y un listado de pruebas manuales. No volver a ejecutar SQL 001 en el proyecto actual. Hasta ejecutar esa actualización y activar Nueva versión en Google, los módulos nuevos son entregas preparadas, no funciones verificadas en producción.

Las pruebas finales cubrirán acceso, cargas, pendientes, apartados, turnos, equipo, calendario, importación/deshacer, archivo, indicadores y portal. Las pruebas entre cuentas quedan pendientes para esa etapa por decisión del usuario.

## Diferencias que deben conservarse explícitas

- Un apartado puede referirse a una carga externa aún no registrada en Cargas.
- La agenda de apartados usa la fecha futura de cruce o entrega; cuando ya pasó, usa la frecuencia elegida. Usar o liberar cierra el registro y permite reabrirlo.
- Los cierres conservan su expediente y el historial.
- Las comprobaciones locales con Auth y DOM simulados no sustituyen las pruebas en Google y Supabase reales.
- El proxy de Codex bloqueó las llamadas directas a Google. El usuario validó los flujos publicados en su navegador.
