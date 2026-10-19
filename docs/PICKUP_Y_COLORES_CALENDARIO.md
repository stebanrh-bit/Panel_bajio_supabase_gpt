# Pickup en Cargas y colores del calendario

El listado de Cargas presenta diez columnas: **Load, Cliente, Origen, Destino, Pickup, Entrega, Truck, Trailer, Estatus y Comentarios**. Pickup muestra la cita de recolección con el mismo formato y zona horaria de Entrega y permite ordenar por esa fecha. Sin cita se muestra «—». Se retira CSR de este listado; las asignaciones y sus permisos permanecen en sus módulos.

La tabla conserva el espaciado Normal/Reducido, las diez columnas y los comentarios sin scroll lateral. En pantallas estrechas, Pickup y Entrega se agrupan con sus etiquetas.

El calendario colorea toda la tarjeta y su filtro con la misma familia de color en Agenda, Semana y Lista compacta:

| Movimiento | Color |
| --- | --- |
| Pickup | Azul |
| Cruce | Ámbar |
| Entrega | Verde |
| Load apartado | Violeta |
| Todos | Gris azulado |

El filtro seleccionado usa un fondo más intenso, texto blanco y una marca **✓**. Los nombres y `aria-pressed` identifican el tipo y la selección sin depender solo del color. Los contadores mantienen contraste propio. No cambian los filtros, fechas, datos, notificaciones ni consultas a Supabase.

## Instalar

Copia todo [index-sitio.html](../google-apps-script/index-sitio.html) y reemplaza **index.html** en Google Apps Script. Guarda y selecciona **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**. Recarga con **Ctrl+Shift+R**. No requiere SQL ni cambios en Code.gs. El tema compartido se vuelve a empaquetar también en los portales, pero estas reglas se limitan al panel interno y no requieren actualizar los portales existentes.

## Comprobaciones

Se aprobaron 31 pruebas automáticas relacionadas, la compilación de las cuatro entradas y la correspondencia HTML/ZIP. En Chromium se verificaron los fondos completos y distintos de los cuatro tipos, su coincidencia con los filtros, selección y marca ✓, las tres vistas del calendario en seis anchos, y el listado en once anchos. Se conservaron las comprobaciones de edición, teclado, filtros y persistencia del espaciado.

La revisión de contraste examinó 3,096 textos en 45 escenas, incluidos los cinco filtros seleccionados en escritorio y móvil, sin hallazgos bajo los criterios comprobados. Los datos son ficticios y las peticiones se interceptan localmente; no se escribieron cambios en Supabase del usuario. Las pruebas manuales continúan canceladas.

[Evidencia resumida](evidencia-pickup-calendario.json).
