# Numeración, orden manual y En planta

El listado de Cargas agrega la columna **N.º** con posiciones 1, 2, 3… La numeración describe la vista actual; no sustituye ni modifica el número de Load. Al filtrar, ordenar o mostrar más cargas, las posiciones se actualizan.

Para reacomodar una carga, mantén pulsado su número y arrástralo hacia otra fila. La línea azul indica dónde quedará al soltar. Funciona con ratón y dedo. Con el número enfocado, **↑ / ↓** mueve una posición e **Inicio / Fin** mueve al principio o al final de las filas visibles. **Escape** cancela el arrastre. Los campos de estatus, comentarios y detalle conservan sus acciones.

El orden se guarda por cuenta en este navegador. No cambia el orden de otras personas ni se sincroniza entre dispositivos. Las cargas nuevas se agregan al final; los identificadores de cargas que ya no existen no recrean registros. Un movimiento con filtros solo reordena las posiciones visibles y conserva los lugares de las cargas ocultas. Si se ordena por una columna, **Cargas → Opciones → Mi orden** recupera el acomodo personal. Arrastrar desde un listado ordenado por columna establece un nuevo orden personal a partir de lo que se está viendo.

**En planta** vuelve a tener fondo rosa en su selector. Se reconocen variantes de mayúsculas y espacios sin reescribir el estatus guardado. Los estilos de la tabla sencilla estaban imponiendo un fondo azul sobre el color original; la regla de planta ahora prevalece. La presentación de tarjetas utiliza el mismo reconocimiento del estatus.

## Código

`web/src/original/load-order.js` concentra el orden por identificador, la preferencia local y los controles de arrastre y teclado. El fragmento `panel/04_table_and_team.js` integra el módulo con filtros, numeración, paginación y renderizado existente. El estado transitorio del arrastre no modifica datos de cargas ni llama a Supabase. El almacenamiento local mantiene una alternativa en memoria cuando el navegador rechaza escribir y el aviso distingue ese caso.

Las filas se reconcilian por número de Load y la numeración se actualiza sin reconstruir controles ni generar cambios de DOM cuando no cambió la posición. Los colores, dimensiones y guías de movimiento se documentan en `usability.css`; la hoja de estilos original permanece intacta.

## Actualizar Google Apps Script

Copia todo [index-sitio.html](../google-apps-script/index-sitio.html) y reemplaza **index.html**. Guarda y selecciona **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**. Recarga con **Ctrl+Shift+R**. Esta entrega no requiere SQL, Code.gs ni actualizar los portales.

## Comprobaciones

Se aprobaron **34 pruebas automáticas** relacionadas con el orden, almacenamiento aislado por cuenta, datos dañados y bloqueo de almacenamiento, presentación y adaptador. Compilan las cuatro entradas y se verifica la correspondencia entre HTML y ZIP.

La comprobación de Chromium usa el HTML entregable con peticiones interceptadas: revisa rosa en tres variantes de En planta; numeración consecutiva; arrastre de ratón y de dedo con eventos táctiles reales mediante CDP; teclado; cancelación; filtros; recuperación de Mi orden; persistencia tras recarga y ocho anchos sin scroll lateral. También pasan los recorridos existentes de tabla en once anchos, calendario en seis anchos, filtros, detalle, edición, seguimiento y contraste del tema claro. Se utilizan datos ficticios y no se escriben datos en producción. Las pruebas manuales siguen canceladas.

[Evidencia](evidencia-orden-manual-2026-10-22.json) · [Captura](imagenes/cargas-orden-manual-2026-10-22.png).

```bash
cd web
node --test test/load-order.test.js test/usability.test.js test/original-adapter.test.js test/original-layout.test.js test/optimization.test.js test/calendar.test.js
```

Con el sitio compilado, empaquetado y servido localmente:

```bash
node scripts/check_browser.mjs --calendar-tasks-only
```
