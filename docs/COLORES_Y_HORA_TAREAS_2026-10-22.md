# Colores de cargas y horario de tareas

Los colores manuales vuelven a teñir **toda la fila** del listado y la tarjeta de la carga. La selección, las franjas alternadas y el hover de la hoja clara estaban imponiendo sus fondos. La selección conserva un contorno visible y el color manual permanece; quitar el color devuelve la apariencia normal. No cambia el color del estatus ni se alteran los indicadores de atención.

Las tareas de turno permiten elegir **fecha y hora de seguimiento**. El formulario, la tarjeta y los avisos muestran el horario en la zona **America/Mexico_City**. La edición conserva la hora cuando se modifican otros campos. La base ya admite `follow_up_at` con zona horaria; no hace falta una migración SQL.

La campana espera hasta el momento programado. Antes comparaba con el final del día, lo que adelantaba tareas para más tarde hoy. Además, una fecha sin hora se convertía en medianoche UTC, que podía mostrarse como el día anterior en México. Las fechas nuevas sin zona ahora se interpretan expresamente en México. Una fecha heredada sin hora que llegue al adaptador significa medianoche de México.

Una tarea programada por otra persona también espera su horario; las asignaciones sin fecha conservan su aviso inmediato. Los recordatorios locales y del servidor se deduplican por tarea. Si una tarea se reprograma, resuelve o cancela, un aviso antiguo del servidor no debe mantenerla en la campana. Los avisos de cargas siguen restringidos a los clientes de la cuenta autenticada.

El panel comprueba avisos periódicamente y al actualizar; el horario marca a partir de cuándo puede aparecer el recordatorio. Leer u ocultar un aviso no completa la tarea. Los canales externos continúan desactivados.

## La tarea creada con la versión anterior

Las tareas ya guardadas conservan su instante almacenado. No se cambian automáticamente, porque una medianoche UTC también puede ser un horario legítimo de una tarea recurrente. Para la tarea que se había programado «para mañana», abre **Editar tarea**, vuelve a elegir el día correcto con la hora deseada y guarda. Esto retira el aviso anterior al actualizarse la tarea.

## Actualizar Apps Script

Reemplaza **index.html** con todo [index-sitio.html](../google-apps-script/index-sitio.html). Guarda y selecciona **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**. Recarga con **Ctrl+Shift+R**. No requiere SQL, Code.gs ni actualizar los portales.

## Mantenimiento y verificación

`task-time.js` centraliza la conversión con las reglas IANA, la recuperación del campo editable y la comprobación de vencimiento. El formulario y el adaptador comparten esa conversión; no dependen del huso configurado en el equipo. `usability.css` restaura la prioridad del color manual.

Se aprobaron 34 pruebas relacionadas: conversión de México con y sin hora, medianoche, precisión, reglas históricas de verano, fechas inexistentes, aviso en el límite exacto y ausencia de avisos futuros, resueltos o cancelados; además de las regresiones de presentación y alcance de la campana.

En Chromium se recorren los nueve colores con guardado y recarga, hover, selección y vista tarjetas; creación de una tarea para la propia cuenta con fecha y hora; ausencia de aviso para mañana y un segundo antes; un solo aviso al llegar el horario; reprogramación que retira un aviso viejo; y persistencia de la hora al recargar. También se ejecutan los recorridos de orden manual, calendario, listado, edición y contraste. Las peticiones se interceptan localmente y usan datos ficticios; no hay escrituras en producción ni rondas de pruebas manuales.

[Evidencia](evidencia-colores-tareas-2026-10-22.json).

```bash
cd web
node --test test/task-time.test.js test/notice-scope.test.js test/original-adapter.test.js test/usability.test.js test/original-layout.test.js test/optimization.test.js
```

Con el HTML compilado, empaquetado y servido localmente:

```bash
node scripts/check_browser.mjs --calendar-tasks-only
```
