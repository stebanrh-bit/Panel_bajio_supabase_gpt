# Panel más sencillo: entrega del 15 de octubre de 2026

Esta actualización aplica la simplificación autorizada tras la revisión de usabilidad. Conserva el logo, los colores, los expedientes, las cuentas y las funciones. El nuevo HTML incluye los cambios; la publicación de Google se actualiza con los pasos del final.

Esta guía cubre los cambios de interfaz. La automatización de millas Google también modifica el servidor y requiere [sus pasos de activación](MILLAS_GOOGLE_AUTOMATICAS.md), además del HTML.

## Inicio: una sola fila por carga

Cada carga reúne su prioridad, el aviso al cliente y sus revisiones. Los filtros **Todas**, **Revisiones y seguimientos** y **Avisar al cliente** permiten ver el trabajo de cada tipo sin repetir la carga en tres listas.

- **Preparar aviso** abre Comunicación del expediente. Se prepara el mensaje, se abre el canal elegido y se registra cuando ya se envió. El panel no confirma el envío de WhatsApp o correo por sí mismo.
- **Ya revisé (+3 h)** reinicia la revisión automática de tránsito.
- **Completar seguimiento** completa exclusivamente el seguimiento personal.
- **Próximas revisiones** muestra las fechas futuras dentro de la misma carga.
- **Agenda y resumen de la operación** conserva las citas e indicadores adicionales.

La lista muestra inicialmente ocho cargas y permite desplegar las demás. Vencer no elimina fechas ni tareas. Las dos revisiones siguen siendo independientes.

## Cargas: resumen y edición desplegable

Las tarjetas muestran carga, cliente, ruta, estatus, unidad y cita de entrega. **Abrir expediente**, **Comentarios** e **Incidencias** permanecen a la vista.

- **Más detalles y edición** despliega los campos de fechas, unidad, documentos y confirmaciones de POD/recargos que ya existían.
- **Más acciones** conserva las tareas de turno, asignaciones y colores.
- **Más filtros y opciones** reúne filtros de cruce, canceladas/finalizadas, selección masiva, densidad y vistas guardadas.

Se mantienen los controles originales y sus manejadores. Los cambios siguen pasando por las mismas verificaciones de Supabase.

## Corrección de Trailer e historial

El listado reserva más espacio al Trailer y muestra su valor completo, en varias líneas cuando hace falta. **Editar trailer** despliega el campo de edición; el valor visible se actualiza al guardar y se restaura si el servidor rechaza el cambio. También se permite el salto de línea en las tarjetas.

En **Expediente → Historial → Cambios**, cada cambio usa un nombre de trabajo como **Estatus**, **POD enviado al cliente** o **Seguimiento programado**, junto al autor y la fecha. Los bloques **Antes** y **Ahora** distinguen el valor anterior del nuevo. Las confirmaciones se leen como Enviado/No enviado o Confirmado/No confirmado; un cero sigue siendo cero y una ausencia se indica como Sin información. La creación de la carga aparece una sola vez.

Los nombres técnicos y metadatos de sincronización se omiten de esta presentación. La auditoría guardada en Supabase se conserva íntegra. Ejemplos con datos ficticios: [Trailer completo](imagenes/trailer-completo.png) e [historial legible](imagenes/historial-legible.png).

## Solicitudes y tareas: desplegables y formularios

Las tres secciones se apilan con el mismo encabezado, contador y flecha; el botón de alta queda separado del control de abrir/cerrar. Cada sección incluye una explicación breve. Al cerrarla se ocultan sus tarjetas y su explicación; se conserva la preferencia del navegador. Las tarjetas se distribuyen según el espacio disponible, sin dejar media fila vacía cuando hay una sola.

**Nueva solicitud** organiza cliente, origen, destino, fecha y nota con etiquetas visibles. **Nueva tarea** agrupa descripción, búsqueda y selección de cargas, fecha, responsable y color. Los colores también se identifican por texto. En móvil se usa una columna y desplazamiento dentro de la ventana para llegar a Guardar. Mientras están abiertos estos formularios, los avisos de fondo y las confirmaciones temporales se apartan para no tapar campos ni Guardar; vuelven a mostrarse al cerrar si siguen vigentes. Los mensajes de error y Deshacer conservan su visibilidad. Se conservan los controles y las acciones de comentarios, vinculación, edición y seguimiento.

El contador de **Tareas que registraste** cuenta únicamente tus tareas abiertas; **Tareas asignadas a ti** mantiene su contador separado. Las fechas estimadas de las solicitudes se muestran con el mes escrito. La edición de una tarea conserva el responsable y el turno originales.

Capturas con datos ficticios: [Nueva solicitud](imagenes/nueva-solicitud.png), [Nueva tarea](imagenes/nueva-tarea.png) y [Tarea en móvil](imagenes/nueva-tarea-movil.png).

## Calendario semanal: cliente y tipo de movimiento

**Cliente** permite ver el plan de un solo cliente o de todos los clientes del alcance actual. Los botones **Pickup**, **Cruce**, **Entrega** y **Load apartado** muestran exclusivamente el tipo elegido; los demás movimientos desaparecen del calendario. Solo hay un tipo seleccionado a la vez. **Todos** recupera todos los tipos para el cliente elegido; **Limpiar filtros** recupera todos los clientes y tipos.

Los filtros se conservan al usar **Anterior**, **Siguiente** y **Esta semana**. El rango de fechas indica la semana completa; el resumen y los contadores por día corresponden a los resultados visibles. Los números en los botones indican los movimientos disponibles de cada tipo para el cliente y la semana elegidos. Una carga con pickup, cruce y entrega cuenta como tres movimientos. Sin coincidencias, se muestra un mensaje explícito y se mantienen los siete días.

Para identificar al cliente de un apartado se usa el campo **Mi carga** cuando coincide con una carga visible o con un nombre de cliente conocido. Si no hay una relación identificable, se agrupa en **Sin cliente identificado**; no se adivina a partir de notas. Los apartados relacionados con un cliente se incluyen al filtrar por ese cliente. Las cargas canceladas y los apartados cerrados conservan su exclusión original del calendario.

Al pulsar un movimiento se conserva el acceso al expediente o al apartado. El filtrado es local: no escribe ni cambia fechas, registros o permisos, y no modifica los filtros del listado de Cargas. La semana abierta se actualiza cuando llegan cambios de cargas o apartados. Las opciones y botones se adaptan al móvil.

Capturas con datos ficticios: [Cliente y Entrega](imagenes/calendario-cliente-entrega.png) y [calendario en móvil](imagenes/calendario-movil.png).

## Administración por secciones

| Sección | Contenido |
| --- | --- |
| Personas | Cuentas del equipo, rol, correo de contacto y contraseña |
| Clientes y asignaciones | Asignar clientes a CSR y administrar cuentas del Portal Cliente |
| Accesos | Contraseña personal, Vista Gerencia y cuentas bloqueadas |
| Importaciones | Seleccionar CSV/Excel, consultar la última importación y deshacer cuando proceda |
| Bitácora | Acciones administrativas recientes |

Cambiar de sección conserva los borradores; no guarda ni modifica una cuenta por sí solo. La ventana tiene desplazamiento interno y cierre accesible, también en móvil. El botón de importación conserva la comprobación administrativa y la vista previa antes de guardar.

**Esteban sigue identificado como Admin y Abraham como Supervisor.** Sus permisos actuales se mantienen. Esta entrega no crea un nuevo rol de autorización Supervisor ni cambia las facultades de Abraham.

## Cuenta, lectura y guardado

La cuenta aparece con nombre y puesto en el encabezado. Al abrirla están **Cambiar contraseña** y **Cerrar sesión**. La leyenda **Vista** distingue toda la operación de la vista de CSR, sin cambiar quién firma los registros.

Los textos de trabajo y botones son más grandes. Las tarjetas se adaptan al ancho del móvil; los campos se despliegan sin obligar a desplazar toda la página de lado a lado. Las fechas de lectura indican mes y año; se informa el horario del dispositivo. Los valores de los formularios y los instantes guardados se conservan.

El estado del guardado indica **Guardando cambios…**, **Cambios guardados** o un error persistente. Un guardado correcto no borra el error de otra operación. **Entendido** descarta el aviso; no reintenta ni guarda los datos. Ante un error, revisar el campo y volver a guardar explícitamente. Las esperas del botón Deshacer también se presentan como cambios pendientes.

Dentro de las ventanas, Tab y Shift+Tab recorren sus controles; el fondo queda fuera del recorrido. Escape mantiene su comportamiento de cierre y las advertencias existentes. Al cerrar, el foco vuelve al control que abrió la ventana cuando sigue disponible. Se asocian los rótulos visuales a los campos para que puedan identificarse con tecnologías de asistencia.

## Actualizar la página de Google

1. Abre [index-sitio.html completo](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html). Copia todo con Ctrl+A y Ctrl+C.
2. En el proyecto Google existente, abre **index.html**, reemplaza su contenido y guarda.
3. Ve a **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**.
4. Abre el enlace habitual y actualiza con Ctrl+Shift+R.

Solo se reemplaza el HTML. Se conservan `Code.gs`, la función de cuentas y las migraciones ya instaladas. No hay que vaciar la base ni repetir SQL.

## Comprobaciones

La entrega terminó con **107 pruebas aprobadas, 0 fallidas y 0 omitidas**, **129 módulos compilados** y **38 comparaciones visuales correctas**, además de los flujos de usabilidad, guardado e importación. En las mediciones de Cargas, el documento quedó en 390 px para un ancho de 390, y 360 px para un ancho de 360. Administración permaneció dentro del alto disponible, con `overflow-y: auto`.

La entrega se comprueba con la suite automática, la compilación y el verificador del paquete. Chromium recorre las pantallas y los flujos existentes con datos ficticios y transporte Supabase interceptado. Además comprueba:

- Una fila por carga en Inicio y filtros por tipo de acción.
- Calendario con dos clientes: tipos exclusivos, combinación con cliente, apartados relacionados y sin cliente identificado, semana anterior/siguiente/actual, limpiar filtros, abrir registros y móvil a 360/390 px.
- Desplegables de solicitudes/tareas con teclado y preferencia conservada al recargar; altas con validación y envío de los campos correctos; edición con responsable conservado; ventanas sin desbordamiento a 360 y 390 px.
- Trailer largo completo en tabla y tarjetas, guardado y persistencia; historial con valores Antes/Ahora, cero y confirmaciones, sin nombres técnicos ni ejecución de HTML en los valores.
- Dos plazos independientes al revisar tránsito o completar un seguimiento.
- Tab/Shift+Tab dentro de Comentarios y el expediente, ventanas anidadas, Escape y retorno al botón de origen.
- Edición desde una tarjeta desplegada, confirmación del servidor y persistencia al recargar.
- Error de escritura simulado que no modifica el registro y permanece visible más allá del aviso temporal.
- Cargas sin desbordamiento de documento a 360 y 390 px, con la edición desplegada.
- Navegación por todas las secciones administrativas y conservación de un borrador.
- Etiquetas de Admin/Supervisor, operación propia como CSR, incidencias e importaciones CSV/XLSX/XLS.

Resultados detallados en [VALIDACION_SITIO.md](VALIDACION_SITIO.md). Las capturas incluidas muestran datos ficticios. La publicación Google con sesiones reales, las cuotas de mapas y las pruebas entre cuentas reales siguen pendientes después de actualizar. Las automatizaciones externas del sistema anterior mantienen los límites documentados en [COMPARACION_ORIGINAL.md](COMPARACION_ORIGINAL.md).

Capturas: [Inicio](imagenes/panel-home.png), [Cargas](imagenes/panel-operation.png), [Administración](imagenes/panel-administracion.png) y [Cargas en móvil](imagenes/panel-cargas-movil.png).

## Archivos fuente

- `web/src/original/calendar.js`: claves de cliente, identificación del cliente de un apartado y filtrado sin modificar los datos.
- `web/src/original/history.js`: selección de cambios operativos y traducción de campos y valores para el historial, sin alterar los registros guardados.
- `web/src/original/usability.js`: presentación agrupada, fechas, etiquetas, ventanas, secciones administrativas y estado de guardado. Los nombres visibles no autorizan operaciones.
- `web/src/original/usability.css`: lectura, tamaños, ventanas y distribución móvil del panel interno.
- `web/src/original/panel-script.js`: integra la lista de atención y mantiene las acciones originales de las tarjetas.
- `web/src/original/api/index.js`: informa inicio, confirmación o rechazo de una escritura, sin publicar argumentos ni contraseñas.

Los archivos originales de la raíz permanecen como referencia. Las nuevas funciones tienen responsabilidades y comentarios en español; el HTML generado se reconstruye desde estos archivos fuente.
