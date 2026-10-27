# Calendario: corrección de NaN / Invalid Date

Versión del sitio: **2026.10.27.2**.

La versión anterior pasaba objetos `Date` del calendario a una función que solo aceptaba texto de fecha. La función devolvía un texto vacío y el calendario calculaba los días a partir de una fecha inválida. Esto también impedía agrupar los movimientos en su día.

La conversión ahora acepta las fechas ya interpretadas y conserva su instante. El calendario muestra los movimientos en hora del centro de México. El título de la semana evita aplicar por segunda vez la zona horaria, para conservar el mismo rango en equipos configurados en otra zona. Los registros sin una fecha válida se omiten del calendario sin modificar la carga.

## Actualizar en Google Apps Script

1. Abrir `google-apps-script/index-sitio.html` y copiar todo su contenido.
2. En el proyecto actual de Apps Script, reemplazar todo el contenido del archivo HTML `index`.
3. Guardar → **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar**.
4. Recargar la página del panel. El pie muestra **v2026.10.27.2**.

Esta corrección solo requiere reemplazar el HTML. Se conserva el mismo enlace; no requiere ejecutar SQL ni reemplazar Code.gs.

## Comprobación automática

La regresión cubre objetos Date válidos, objetos inválidos, conservación del instante y la conversión de hora. El recorrido de Chromium comprueba las fechas del lunes al domingo, la presencia y hora de Pickup/Entrega en Agenda/Semana/Lista, las semanas anterior y siguiente, el regreso a esta semana y la opción de ocultar días vacíos. Se ejecuta en las zonas de México, UTC y Tijuana, con Supabase simulado.

- 18 pruebas automáticas de fechas, calendario, vistas y usabilidad aprobadas; 20 comprobaciones de regresión de la operación personal aprobadas.
- Pruebas: `node --test --test-isolation=none web/test/task-time.test.js web/test/calendar.test.js`.
- Navegador: `node scripts/check_browser.mjs --calendar-dates-only`.
- [Evidencia](evidencia-calendario-fechas-2026-10-27.json).
- [Calendario corregido](imagenes/calendario-fechas-corregidas.png) · [Vista móvil](imagenes/calendario-fechas-corregidas-movil.png).
