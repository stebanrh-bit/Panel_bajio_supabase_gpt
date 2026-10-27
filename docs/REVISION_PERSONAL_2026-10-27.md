# Revisión de Panel Bajío · versión personal

27 de octubre de 2026, hora del centro de México. Código revisado: `305bc0d`, rama `supabase-inicial`.

La prioridad es consolidar una operación personal clara: cargas propias, pendientes que indiquen qué hacer y mensajes manuales para WhatsApp. Conservaría el tema claro, la tabla sencilla, el menú Mostrar configurable, los colores y señalamientos, las validaciones de incidencias y el guardado con control de versión.

Revisé Inicio, Cargas, vistas personales, calendario, indicadores, solicitudes, tareas, apartados, Radar, detalle y expediente, mensajes, documentos, incidencias, historial y Organizar turno. Pasaron 204 comprobaciones automáticas, la compilación de cuatro entregas y la verificación del paquete. Los recorridos vigentes de vistas e instructivos pasaron. El recorrido adicional cubrió 28 vistas en escritorio y móvil, sin errores JavaScript ni desbordamiento horizontal en los anchos revisados.

La revisión usa PostgreSQL temporal y Supabase simulado. Los ejemplos son ficticios. No se consultaron la cuenta publicada ni la base de producción; tampoco se enviaron mensajes ni se midieron cuotas reales de Google o Supabase. No se aplicaron cambios funcionales durante esta revisión.

## Corregir primero

| ID | Hallazgo confirmado | Qué conviene cambiar |
| --- | --- | --- |
| R01 | Una carga recién creada con PTE. ARRIVO y Pickup futuro recibe el instructivo de cliente final. La etiqueta de etapa también puede decir En tránsito. | Conservar el estatus inicial elegido, pero distinguir preparación/origen de arribo a destino. Una carga nueva no debe asumir llegada ni tránsito sin información que lo respalde. |
| R02 | Con un cliente histórico registrado como alias de un cliente asignado, Supabase entrega la carga, pero la pantalla y la campana comparan los nombres literalmente. | Usar la misma identidad canónica del cliente en asignaciones, filtros y campana. El usuario no debería perder una carga por diferencias de nombre. |
| R03 | La dirección importación/exportación se deduce de si la abreviatura del estado termina en punto. Monterrey, NL → Laredo, TX resulta Importación; Monterrey, NL → Dallas, TX queda sin dirección. | Usar país y un catálogo de estados/equivalencias, conservando las excepciones operativas que se hayan acordado. No usar la puntuación del nombre para decidir el país. |
| R04 | Una importación con Truck o Trailer no vacíos reemplaza valores capturados manualmente y cambia su procedencia a IMPORT. | Mostrar las diferencias antes de guardar y conservar por defecto el dato manual; permitir reemplazarlo expresamente por el del archivo. No confundirlo con la protección que ya existe para estatus, POD, color y campos vacíos. |
| R05 | Los contadores usan criterios distintos: con una cancelada de prueba, Indicadores muestra 2 activas, pero Por CSR y el CSV cuentan 3. | Reutilizar una clasificación única de abierta, entregada y cancelada. Las vistas personales pueden añadir sus filtros, pero una cancelada no debe contarse como activa en otro resumen. |
| R06 | Exportar reporte incluye una carga propia de otro cliente fuera de la vista activa seleccionada. | Separar Exportar vista actual de Reporte completo. Mostrar el número de cargas y el alcance antes de descargar. Esto no fue acceso a otro usuario: eran clientes autorizados de la misma cuenta. |

Estas correcciones cambian la confiabilidad de lo que indica el panel y de los datos que se importan o descargan; deben ir antes que nuevos cambios de color o más funciones.

## Simplificar después

| ID | Situación actual | Mejora recomendada |
| --- | --- | --- |
| R07 | Salida de planta y Cruce ya no aparecen al abrir una carga, pero Tiempo en frontera, Cruce del calendario y ¿Ya cruzó la caja? siguen dependiendo de esas fechas. | Comprobar cuáles siguen recibiendo fechas desde el archivo. Ocultar por defecto los que no tengan una fuente vigente, o definir otra forma de alimentarlos; conservar lo histórico. |
| R08 | La versión personal conserva Por CSR, SLA de respuesta, textos de toda la operación y apartados del cierre de turno. | Dejar indicadores personales: cargas abiertas, pendientes por atender, entregas y POD pendiente. Mantener administración y asignación de clientes, necesarias para tu cuenta Admin. |
| R09 | Inicio puede mostrar una carga con un texto genérico como 1 revisión pendiente; el motivo concreto queda detrás de Ver acciones. | Mostrar directamente la próxima acción y su plazo. Una fila por carga con Load, cliente, Truck, Trailer, acción principal y Abrir. Agrupar los otros motivos dentro de esa fila. |
| R10 | Existen pendiente puntual, seguimiento personal, revisión de tránsito, tarea de turno y aviso de campana. Sus finalidades son distintas, pero se presentan en varios lugares. | Usar un centro visual de pendientes con Ahora, Programados y Atendidos. Conservar las diferencias operativas y dejar claro qué resuelve cada botón; leer un aviso no debe completar una tarea. |
| R11 | El detalle rápido permite editar citas, mientras el expediente muestra esas citas como lectura. En el expediente hay tarjetas altas porque los editores de unidad permanecen abiertos. | Elegir un comportamiento de edición consistente. Mostrar primero los datos y abrir el editor al pulsar Editar; compactar Citas, Ruta y Unidad para que no queden espacios vacíos grandes. |
| R12 | Calendario ya tiene tres vistas, recuerda la presentación en este navegador y permite filtrar por cliente. Agenda dedica espacio a días vacíos y el cliente seleccionado se reinicia. | Ofrecer ocultar días sin movimientos y conservar también el cliente elegido. Sincronizar las preferencias entre dispositivos si hace falta. Mantener los colores actuales y permitir volver a ver la semana completa. |
| R13 | Un clic en Copiar dentro del mensaje individual invoca dos veces el portapapeles. | Dejar un solo manejador y una sola confirmación de copiado. Se reprodujo con una pulsación; no implica que se hayan enviado dos mensajes. |
| R14 | El historial de avisos guarda canal y tipo, pero no el texto final editado del mensaje. | Ofrecer conservar el texto confirmado, plegado en el historial. Mantener el envío manual y diferenciar Preparar mensaje de Registrar como enviado. |
| R15 | La importación se registra con el nombre genérico Importación del panel original y la confirmación muestra totales, sin detallar valores anteriores/nuevos por carga. | Conservar nombre real del archivo, fecha, autor y resultados. Mostrar una comparación por Load y permitir excluir filas antes de confirmar; facilitar identificar qué importación se va a deshacer. |
| R16 | La campana puede representar varios motivos de una carga como avisos separados. Leídos y pospuestos se guardan en este navegador. | Agrupar por carga, mostrar primero la acción más importante y sincronizar leído/pospuesto por cuenta si se usará desde más de un dispositivo. Mantener el filtro por clientes propios. |
| R17 | Las palabras Carga/Load, Truck/Unidad, pendiente/tarea y el acceso Histórico se usan de maneras diferentes. | Usar los mismos nombres que en tu archivo de trabajo. Aclarar Histórico de tareas para que no se confunda con cargas entregadas; dejar una ayuda breve con ejemplos. |
| R18 | Documentos muestra indicadores; POD registrado no permite localizar un archivo desde esa pestaña. | Si te resulta útil para la operación, añadir un vínculo o adjunto de POD y documentos, separado de su casilla de registro. Definir permisos y retención antes de almacenar archivos. |
| R19 | Las actualizaciones se instalan pegando HTML y ejecutando SQL por separado. La versión instalada no queda visible en el panel. | Mostrar la versión del sitio y el estado de sus módulos en Administración. Detectar una actualización SQL faltante con un mensaje concreto, en lugar de un error genérico al usarla. |
| R20 | Radar ya usa caché, rutas por sentido y un lote Google limitado; no se revisó el consumo real de tu proyecto. | Mostrar última ejecución, rutas pendientes, reintentos y fecha de cálculo. Revisar uso real antes de cambiar límites; evitar recalcular todas las rutas por rutina. |

## Reproducciones y evidencia

- **R01:** se publicó un instructivo sintético con acciones diferentes para origen y destino; se insertó una carga sin indicar estatus y con Pickup futuro. Se guardó PTE. ARRIVO, el contexto eligió `destination` y la acción fue Coordinar recepción con cliente final. `loadModel` presentó En tránsito. Fuentes: `015_route_instructions.sql`, `017_default_arrival_status.sql`, `load-rules.js`.
- **R02:** se creó una carga histórica antes de registrar su alias, se asignó el nombre principal y se registró la equivalencia. La consulta autenticada devolvió la carga; `customerNoticeScope` la excluyó. El filtro personal usa la misma comparación literal. Fuentes: `notice-scope.js`, `panel/04_table_and_team.js`, `012_turn_rules_and_tasks.sql` y `016_personal_internal_mode.sql`.
- **R03:** se ejecutaron las funciones actuales de dirección con estados NL, TX y S.L.P. Los resultados cambiaron según la puntuación. Fuente: `panel/05_workspace.js`, funciones `esEstadoMexicano_` y `loadDirection`.
- **R04:** una carga con Truck y Trailer de procedencia MANUAL se importó con otros dos valores no vacíos. Ambos cambiaron a los del archivo y quedaron con procedencia IMPORT. Fuente: `ops_merge_import` y `ops_write_load_snapshot`.
- **R05/R06:** se seleccionó Activas y se descargó el CSV. Había dos cargas visibles; el reporte incluyó una cancelada propia de otro cliente y contó tres activas. Fuente: `buildReporteOperacionCsv_` y `loadsOfCsr`.
- **R13:** se sustituyó el portapapeles por un contador local; una pulsación produjo dos llamadas. Fuente: los dos manejadores de `data-comm-copy` en `panel/05_workspace.js`.

[Evidencia reproducida con datos ficticios](evidencia-revision-personal-2026-10-27.json). [Captura de Indicadores](imagenes/revision-personal-2026-10-27-indicadores.png). [Captura del expediente](imagenes/revision-personal-2026-10-27-expediente.png).

Para mantenimiento, conviene convertir los hallazgos R01–R06 y R13 en casos de regresión al corregirlos, unificar las funciones de estado/cliente y reducir el código duplicado de la interfaz heredada. También conviene usar la misma zona horaria para comparar fechas del calendario y las vistas, y advertir citas con secuencias imposibles sin intercambiar las fechas automáticamente. El respaldo completo ya existe; conviene descargarlo y ensayar su restauración con una periodicidad definida.

Empezaría por R01–R06; después haría juntos R07–R11 para que la versión personal tenga menos elementos y una operación consistente. Las propuestas de adjuntos y métricas adicionales pueden quedar para cuando la operación diaria esté consolidada.
