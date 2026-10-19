# Cargas como una hoja de trabajo — 19 de octubre de 2026

La pantalla Cargas toma la hoja compartida por el usuario como referencia: tabla clara, filas compactas y una sola línea de filtros. El detalle y los procesos siguen usando Supabase y Google Apps Script.

## Uso

- Columnas: **Load, Cliente, Origen, Destino, Entrega, Truck, Trailer, Estatus, CSR y Comentarios**. Origen precede a destino; la cita de recolección permanece en el detalle, como se había solicitado.
- En la primera entrada a esta entrega se abre la tabla, incluso si antes se usaban tarjetas. Después se conserva la elección del navegador.
- **Mostrar**, cliente y búsqueda filtran el listado. El selector Mostrar reúne las opciones Todas, Activas, Necesitan atención, cruces, entregadas y canceladas; conserva sus reglas anteriores.
- **Opciones** concentra Mis clientes, tarjetas, mensajes, selección múltiple, densidad, reporte CSV, resumen y vistas guardadas.
- Pulsa el número o cualquier dato de la fila para abrir el detalle. El diálogo conserva el ancho de la hoja, admite teclado y se cierra con Escape o con su botón. Truck y trailer se editan ahí y se reflejan en la fila; un error devuelve el dato anterior.
- El estatus se puede cambiar directamente en la fila. Pulsa Comentarios para consultar o escribir; su historial completo no se elimina aunque solo se muestren dos líneas en la tabla.
- Un punto discreto indica atención. Los motivos y acciones completos se consultan en el detalle, Inicio y la campana.
- En pantallas pequeñas, cada fila agrupa sus campos con etiquetas; no se agrega scroll lateral. Trailer y comentarios conservan espacio para leerlos.

## Notificaciones y datos

La campana sigue limitada a los clientes asignados a cada cuenta, también para Admin y Supervisor. No depende de la presentación de la tabla. Se conservan revisiones de tránsito, seguimiento programado, avisos al cliente, tareas, incidencias, calendario, importación y permisos. Los envíos externos siguen desactivados hasta elegir canal.

Esta entrega no contiene cambios SQL ni requiere otra base de datos. La pantalla no es una hoja de Google Sheets y no necesita crear una.

## Verificación

Los escenarios y resultados de esta entrega están en [evidencia-vista-sencilla-2026-10-19.json](evidencia-vista-sencilla-2026-10-19.json). Las pruebas de navegador usan el SDK y el HTML entregado con peticiones interceptadas; las pruebas de permisos usan PostgreSQL local. No escriben en producción. Las pruebas manuales continúan canceladas por indicación del usuario.

- **152 pruebas Node aprobadas**, sin fallos, cancelaciones ni omisiones.
- Seis escenarios nuevos de navegador y once anchos para la hoja; regresión de la campana de tres cuentas, 26 combinaciones de listado, calendario, tareas e importaciones CSV/XLSX/XLS. Sin errores JavaScript.
- Compilación de las cuatro entradas y correspondencia entre los archivos y el ZIP entregado.

- [Vista sencilla](imagenes/cargas-vista-simple.png).
- [Vista en celular](imagenes/cargas-vista-simple-movil.png).

## Actualizar el proyecto Google existente

1. Abre [index-sitio.html actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html) y copia todo con Ctrl+A → Ctrl+C.
2. En Apps Script, abre **index.html**, reemplaza todo su contenido y guarda.
3. Ve a **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**.
4. Abre el enlace habitual y recarga con **Ctrl+Shift+R**.

Solo cambia index.html. No es necesario cambiar Code.gs, los portales o el lector, ni ejecutar SQL. Preparar el archivo en GitHub no modifica la implementación publicada de Google.
