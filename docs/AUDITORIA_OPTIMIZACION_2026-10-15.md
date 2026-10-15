# Revisión del proyecto y 90 opciones de evolución

Fecha: 15 de octubre de 2026 · zona de referencia: America/Mexico_City.

Base revisada: `c4bbade`. La revisión cubre la entrada activa `web/src/original/main.js`, adaptadores, servicios reutilizados, diez migraciones, función de cuentas, servidor Google y pantallas interna/Cliente/Gerencia. Los originales con Sheets y la primera interfaz se identifican como referencia; no se proponen como backend activo.

La auditoría de esa base produce un diagnóstico y un catálogo de opciones. Las propuestas no son 90 defectos: incluyen correcciones comprobadas, decisiones de operación y capacidades futuras. Después de la auditoría se prepararon los cuatro ajustes de interfaz que pidió el usuario; se describen abajo y no equivalen a implementar las 90 propuestas. No se modificaron permisos ni datos de producción y no se publicó una versión remota.

[Ir a las 30 mejoras](#30-mejoras-y-optimizaciones) · [30 cambios](#30-cambios-de-uso-y-operación) · [30 funciones nuevas](#30-funciones-nuevas).

## Resultado principal

La prioridad es reforzar seguridad del contenido y exportaciones, recuperar la visibilidad de eventos del historial, preparar una recuperación completa y reducir las lecturas masivas. La cola de Google ya está acotada; no es razonable atribuirle todo el consumo de Supabase sin revisar antes descargas, refrescos e historiales.

Verificaciones de esta revisión: **108 pruebas aprobadas, 0 fallidas, 0 omitidas; 129 módulos compilados; HTML/SQL/ZIP vigentes según package_site.py --check**. Se ejecutaron además las cinco comprobaciones locales descritas en la evidencia. Las 38 comparaciones de navegador corresponden a la validación previa de esta misma base; no se repitieron para esta auditoría.

No se accedió a la sesión privada de Google ni a estadísticas/SQL de producción. No se midieron tiempos reales, planes EXPLAIN, tamaño de tablas o consumo de Egress del proyecto. Tampoco se ejecutó JavaScript malicioso ni fórmulas en un equipo del usuario. Una suite aprobada no cubre todos los riesgos encontrados.

## Ajustes posteriores solicitados por el usuario

- **Trailer con detalle abierto:** la vista dividida imponía una columna de 82 px. El editor ahora conserva espacio para T0132 y la tabla se desplaza por dentro cuando hace falta. Abrir «Editar trailer» ya no cambia la selección del detalle y su encabezado refleja el nuevo trailer al editarlo. Los identificadores largos siguen mostrándose completos fuera del campo editable.
- **Destinos del menú lateral:** Solicitudes muestra las solicitudes sin carga confirmada; Tareas de turno muestra las asignadas a ti y las que registraste. Cada botón marca su destino y abre sus secciones aunque se hubieran guardado cerradas. La pestaña «Solicitudes y tareas» permite volver al conjunto con el resumen del turno.
- **Asignación:** Nueva tarea dice «Asignar a:» y conserva la selección de personas del panel. La edición mantiene la persona asignada previamente.
- **Cargas para vincular:** solo se ofrecen cargas activas. Se excluyen entregadas y completadas aunque falte el POD, canceladas, archivadas y TONU ya finalizadas con recargos registrados. El mismo criterio se usa al elegir relaciones nuevas en tareas; una relación anterior se conserva al editar para no perder contexto. Sin coincidencias, Vincular queda deshabilitado.

**Validación de estos ajustes:** 108 pruebas aprobadas, 0 fallidas y 0 omitidas; build de 129 módulos; 38 comparaciones visuales aprobadas, importación CSV/XLSX/XLS y recorridos funcionales sin errores JS. T0132 cabe en el editor con detalle abierto a 1533, 1440, 1180, 1024, 390 y 360 px, sin desbordamiento del documento. Se comprobaron destinos distintos, apertura de secciones plegadas, etiqueta accesible, asignación guardada y selección filtrada de cargas activas con datos ficticios. [Captura del editor](imagenes/trailer-detalle-T0132.png).

Para activar estos cuatro ajustes, reemplazar únicamente `index.html` en Google con [index-sitio.html](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html), guardar y publicar **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**. Después actualizar el sitio con Ctrl+Shift+R. No requieren SQL ni cambios al proceso de Maps.

## Lo que ya funciona y conviene conservar

- Supabase Auth, comprobaciones de rol, RLS/RPC, autor real y versiones para evitar sobrescrituras.
- Vista previa de importación, protección de ediciones manuales, transacciones y deshacer con comprobación de actividad posterior.
- Separación de revisión operativa y seguimiento personal; historial persistido; incidencias sin categoría rechazadas.
- Misma cuenta Admin para administración y operación CSR; Portal Cliente con alcance y campos limitados.
- Calendario filtrable, captura manual del CSR externo de VG, reglas de apartados y mejoras de lectura y teclado.
- Cola de millas Google con credencial limitada, reserva, reintento, conservación de OSM y prioridad de correcciones manuales.

## Hallazgos comprobados y decisiones pendientes

### H01 · Datos de carga interpretados como HTML · P1

Confirmado localmente: un identificador de 44 caracteres con una etiqueta inofensiva produjo dos elementos HTML al ejecutar el fragmento real de tableRowHtml. No se ejecutó JavaScript ni se probó explotación remota. La importación valida longitud, no un formato que excluya esos caracteres.

Evidencia: [web/src/original/panel-script.js:4336](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/panel-script.js#L4336).

### H02 · CSV conserva prefijos de fórmula · P1

csvEscape_("=1+1") devuelve el mismo texto. Las comillas CSV no son una defensa contra interpretación de fórmulas al abrirlo en una hoja de cálculo. La prueba no abrió Excel ni ejecutó fórmulas.

Evidencia: [web/src/original/panel-script.js:7991](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/panel-script.js#L7991).

### H03 · Retiro de incidencia guardado pero omitido en el historial visible · P1

ops_remove_incident escribe la clave «Incidencia eliminada». El presentador recorre una lista de campos que no contiene ese evento. Una entrada de ejemplo produce cero elementos visibles; la auditoría en la base no se borra.

Evidencia: [web/src/original/history.js:128](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/history.js#L128).

### H04 · Respaldo reutilizable no cubre las tablas activas nuevas · P1

La rutina de exportación y la lista permitida del RPC no incluyen original_places, original_routes, original_radar ni original_preferences. Esa rutina está disponible como servicio reutilizable; no está expuesta como botón de respaldo en la interfaz activa. No se ha comprobado un respaldo real del usuario ni una restauración.

Evidencia: [web/src/features/imports/service.js:25](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/features/imports/service.js#L25).

### H05 · Radar lee catálogos completos para consultas puntuales · P1

getDistancias descarga original_routes antes de filtrar; getDirecciones, búsquedas y recálculo también leen catálogos completos. En el ensayo ficticio: 10,000 rutas leídas para mostrar una. Con el lector actual de 500 filas serían 21 páginas si hay exactamente 10,000 filas.

Evidencia: [web/src/original/api/radar.js:78](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/radar.js#L78).

### H06 · Se trata la ruta inversa como si tuviera la misma distancia · P1

getDistancias usa también filas cuyo destino coincide con el origen; ops_original_routes omite guardar el sentido inverso si el primero existe. Ida y vuelta pueden diferir por accesos, sentidos y cruces. No se consultó un trayecto real para cuantificar la diferencia.

Evidencia: [supabase/migrations/009_original_interface.sql:137](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/supabase/migrations/009_original_interface.sql#L137).

### H07 · El supuesto delta de cargas devuelve una descarga completa · P1

getLoadsDelta responde full:true y vuelve a leer todas las cargas activas e incidencias visibles. Las marcas evitan lecturas cuando nada cambia, pero un cambio de esa área vuelve a descargar el conjunto completo.

Evidencia: [web/src/original/api/operations.js:99](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/operations.js#L99).

### H08 · Últimos comentarios calculados después de descargar todos · P1

getUltimosComentarios lee toda la tabla visible y construye el mapa final en el navegador. El costo crece con el historial aunque la pantalla solo use el último por carga.

Evidencia: [web/src/original/api/operations.js:136](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/operations.js#L136).

### H09 · Comunicaciones filtradas después de descargarlas · P2

La consulta por cliente obtiene sus cargas, pero lee todas las comunicaciones visibles y luego filtra en JavaScript. El SLA también agrega registros en el navegador.

Evidencia: [web/src/original/api/operations.js:209](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/operations.js#L209).

### H10 · Historiales completos en cargas y apartados · P1

getApartados lee el historial visible completo y ejecuta un filtro por apartado. El expediente carga todo el historial de la carga antes de mostrarlo. Propongo carga bajo demanda y paginación.

Evidencia: [web/src/original/api/operations.js:350](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/operations.js#L350).

### H11 · Tareas y bitácoras descargadas antes de recortar · P2

Se filtran estados de tareas en JavaScript; cierres se recortan a 30 y eventos administrativos a 100 después de leer páginas completas.

Evidencia: [web/src/original/api/team.js:167](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/team.js#L167).

### H12 · Importación robusta, con oportunidades de trazabilidad y respuesta · P2

Ya hay vista previa, límite de 1,000 cargas, archivo de hasta 10 MB, control de versiones y protección de datos manuales. El adaptador guarda un nombre genérico de importación y el análisis del archivo ocurre en el hilo de la página. XLS depende de una biblioteca heredada cargada desde CDN. No se afirma una vulnerabilidad de dependencia sin analizarla específicamente.

Evidencia: [web/src/original/api/imports.js:96](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/imports.js#L96).

### H13 · Acceso público con lectura completa de perfiles y límites por identificador · P1

findAccount recorre todos los perfiles; directory publica nombres, roles y passwordSet sin sesión. El bloqueo existente es por identificador, con cinco fallos y espera, pero el código no muestra un límite global de esta aplicación ni limpieza de identificadores fallidos antiguos. No se evaluaron protecciones adicionales del proveedor.

Evidencia: [supabase/functions/panel-accounts/index.ts:53](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/supabase/functions/panel-accounts/index.ts#L53).

### H14 · Cada refresco hace agregaciones generales para conocer cambios · P2

ops_original_marks usa count, max y agregación de seguidores sobre varias tablas. La página consulta cada minuto visible y cada cinco minutos oculta; ya existe reducción al ocultarse, pero no coordinación entre pestañas. Faltan mediciones reales de latencia/carga para elegir la alternativa.

Evidencia: [supabase/migrations/009_original_interface.sql:181](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/supabase/migrations/009_original_interface.sql#L181).

### H15 · Entrega grande y script principal muy concentrado · P2

El build incluye las tres plantillas y el lector de archivos. El artefacto JS mide 1,916,125 bytes; Vite estima 440.65 kB gzip, lo que no mide la transferencia real de Apps Script. El script interno tiene 16,473 líneas y hay un observador de cambios sobre todo body. Algunas dependencias de mapas ya se cargan bajo demanda.

Evidencia: [web/src/original/main.js:3](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/main.js#L3).

### H16 · Índices específicos por confirmar con consultas representativas · P2

Hay índices útiles de clientes, actualizaciones, comentarios, incidencias, tareas y la cola Google. No se encontró un índice dedicado load_history(load, changed_at) ni por origin_key/destination_key en original_routes. No se atribuye un tiempo real ni se recomienda indexar todo.

Evidencia: [supabase/migrations/001_panel.sql:122](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/supabase/migrations/001_panel.sql#L122).

### H17 · Auditoría e importaciones conservan instantáneas completas · P2

Cada cambio de carga guarda before_data/after_data; import_rows conserva además instantáneas para deshacer. Esto protege la operación, pero crece con el uso. No se midió cuánto ocupa en la base real; requiere política de archivo y recuperación antes de eliminar algo.

Evidencia: [supabase/migrations/001_panel.sql:138](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/supabase/migrations/001_panel.sql#L138).

### H18 · Google tiene cola controlada; quedan observabilidad y límites por día · P2

La cola ya usa reservas, lotes de 20, pausa por cuota y reintentos. El usuario confirmó cuatro resultados completados en el primer lote. Solo se guarda el último resumen de ejecución; los fetch de mapas del navegador no muestran cancelación/timeout explícito. OSRM driving y Google DRIVING no garantizan restricciones para camión.

Evidencia: [google-apps-script/Code-sitio.gs:321](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/google-apps-script/Code-sitio.gs#L321).

### H19 · Buenas pruebas locales, con verificación real y automatización pendientes · P1

Pasaron 108 pruebas y la compilación. Hay verificador de paquete y comprobación de navegador; no hay flujo .github de CI en este checkout. Hay módulos de la versión anterior que no son la entrada activa. Las pruebas con otros usuarios reales siguen pendientes según lo acordado con el usuario.

Evidencia: [docs/PRUEBAS_FINALES.md:44](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/docs/PRUEBAS_FINALES.md#L44).

### H20 · Decisiones de autorización y publicación que deben hacerse explícitas · Decisión

El texto Supervisor no crea un rol separado de admin. CSR puede consultar cargas por política amplia; el selector de persona es una vista. El Portal Cliente sí usa RPC y campos explícitos, pero publica descripciones de incidencias activas. Esto requiere confirmar la política deseada, no implica por sí mismo que los permisos actuales incumplan un requisito.

Evidencia: [web/src/original/api/models.js:8](https://github.com/stebanrh-bit/Panel_bajio_supabase_gpt/blob/c4bbadec545c08e4588ed962a4a1c249efd37012/web/src/original/api/models.js#L8).

## Qué significa cada categoría

- **Mejora M:** corrige u optimiza una capacidad que el proyecto ya tiene.
- **Cambio C:** modifica el flujo, la presentación o una regla de operación; varios requieren acordar la política antes de programar.
- **Función F:** agrega una capacidad que no tiene un flujo equivalente en la interfaz activa revisada.

Prioridad: **P1** atender antes de ampliar la operación; **P2** siguiente etapa; **P3** futuro o condicionado. El esfuerzo Bajo/Medio/Alto es relativo, no una cotización ni un plazo prometido. Consumo **↓** busca reducirlo; **≈** se espera similar; **↑** agrega datos, trabajo o servicio; **↓/↑** tiene un intercambio que se debe medir. Ningún símbolo garantiza el costo final ni los límites de un proveedor.

## 30 mejoras y optimizaciones

| ID | Opción y beneficio | Prioridad | Esfuerzo | Consumo | Evidencia o condición |
| --- | --- | --- | --- | --- | --- |
| **M01** | **Escapar todo dato dinámico antes de insertarlo en HTML.** Que una carga con símbolos se vea como texto y no cree elementos HTML. | P1 | Medio | ≈ | H01 |
| **M02** | **Proteger los CSV contra fórmulas inesperadas.** Exportar texto seguro para Excel sin convertir importes negativos válidos en texto. | P1 | Bajo | ≈ | H02 |
| **M03** | **Mostrar en el historial el retiro de incidencias.** Conservar visible quién retiró la incidencia, cuándo y cuál era. | P1 | Bajo | ≈ | H03 |
| **M04** | **Completar el respaldo de datos y comprobar una restauración.** Incluir las tablas actuales del radar y preferencias; verificar recuperación en una base de prueba. | P1 | Medio | ↑ | H04 |
| **M05** | **Consultar en Supabase solo las rutas y ubicaciones necesarias.** Evitar descargar el catálogo entero para calcular o abrir un trayecto. | P1 | Medio | ↓ | H05 |
| **M06** | **Guardar las distancias por sentido del recorrido.** Distinguir origen→destino de destino→origen; no presentar la ruta inversa como medición exacta. | P1 | Medio | ↑ | H06 |
| **M07** | **Implementar actualizaciones incrementales reales de cargas.** Traer altas, cambios y salidas del listado sin descargar todas las cargas activas. | P1 | Alto | ↓ | H07 |
| **M08** | **Traer únicamente el último comentario de cada carga.** Una consulta de resumen en vez de descargar todo el historial de comentarios. | P1 | Medio | ↓ | H08 |
| **M09** | **Contar incidencias en la base de datos.** Enviar cantidades por carga sin descargar sus descripciones completas para los contadores. | P1 | Medio | ↓ | H07 |
| **M10** | **Filtrar las comunicaciones por cliente desde Supabase.** Consultar solo comunicaciones de las cargas del cliente solicitado. | P2 | Medio | ↓ | H09 |
| **M11** | **Paginar los historiales y cargarlos al abrirlos.** Evitar descargar historiales completos de cargas y apartados en cada refresco. | P1 | Medio | ↓ | H10 |
| **M12** | **Filtrar tareas por estado y periodo en el servidor.** Cargar primero tareas abiertas y consultar las antiguas bajo demanda. | P2 | Medio | ↓ | H11 |
| **M13** | **Aplicar límites de bitácoras y cierres en la consulta.** Solicitar los últimos registros directamente en lugar de descargar todo y recortar. | P2 | Bajo | ↓ | H11 |
| **M14** | **Procesar Excel pesado fuera del hilo de la pantalla.** Mantener el panel utilizable mientras se lee y convierte un archivo permitido. | P2 | Medio | ≈ | H12 |
| **M15** | **Buscar la cuenta de acceso mediante una consulta específica.** Dejar de leer todos los perfiles para resolver un solo usuario. | P1 | Medio | ↓ | H13 |
| **M16** | **Reforzar límites de acceso y caducar intentos antiguos.** Complementar el bloqueo por usuario con control global y limpieza de registros sin uso. | P1 | Medio | ↓ | H13 |
| **M17** | **Usar revisiones de datos en vez de recuentos completos para detectar cambios.** Reducir el trabajo de cada refresco de las marcas de actualización. | P2 | Medio | ↓ | H14 |
| **M18** | **Coordinar el refresco entre pestañas y adaptarlo a la actividad.** Evitar varias pestañas de una cuenta preguntando lo mismo cada minuto. | P2 | Medio | ↓ | H14 |
| **M19** | **Seleccionar solo las columnas requeridas por cada pantalla.** Separar resúmenes ligeros y datos completos del expediente. | P2 | Medio | ↓ | H05,H07,H11 |
| **M20** | **Reducir el tamaño del código publicado conservando fuentes legibles.** Optimizar la entrega de producción sin perder archivos fuente comentados para mantenimiento. | P2 | Medio | ↓ | H15; decidir si se compacta el artefacto generado |
| **M21** | **Generar o cargar solo la vista y los lectores que se están usando.** Evitar cargar desde el inicio el código de los tres portales y del lector de archivos. | P2 | Alto | ↓ | H15; conservar alojamiento Google y enlace actual |
| **M22** | **Actualizar únicamente los componentes visuales afectados.** Reducir reconstrucciones de tablas y recorridos generales del observador del DOM. | P2 | Medio | ≈ | H15 |
| **M23** | **Añadir índices después de medir las consultas más usadas.** Probar índices de historial y rutas con EXPLAIN y datos representativos. | P2 | Medio | ↓/↑ | H16; índices ahorran lectura pero ocupan espacio |
| **M24** | **Definir retención y archivo de historiales e importaciones.** Controlar crecimiento sin borrar auditoría ni evidencias necesarias por defecto. | P2 | Alto | ↓ | H17; requiere acordar periodos y recuperación |
| **M25** | **Poner tiempo máximo y cancelación a consultas externas.** Una búsqueda nueva o un servicio caído no debe dejar búsquedas antiguas ocupadas indefinidamente. | P2 | Medio | ↓ | H18 |
| **M26** | **Establecer presupuesto diario del cálculo de Google.** Coordinar trabajos programados y recálculos manuales dentro de una reserva de cuota. | P2 | Medio | ↓ | H18; el límite actual es por lote y depende también de otros usos de Google |
| **M27** | **Clasificar fallos y conservar métricas de ejecución sin secretos.** Distinguir cuota, autorización y guardado; registrar duración, intentos y recuperaciones. | P2 | Medio | ↑ | H18 |
| **M28** | **Automatizar pruebas, compilación y verificación del paquete en cada cambio.** Impedir publicar un HTML, SQL o ZIP desactualizado. | P1 | Medio | ≈ | H19 |
| **M29** | **Ampliar las pruebas adversariales y validar permisos con cuentas reales de prueba.** Cubrir HTML, CSV, datos límite y aislamiento; complementar la simulación existente. | P1 | Medio | ≈ | H01,H02,H19 |
| **M30** | **Dividir el script principal y documentar qué código está activo.** Facilitar cambios pequeños y conservar los originales como referencia claramente identificada. | P2 | Alto | ≈ | H15,H19 |

## 30 cambios de uso y operación

| ID | Opción y beneficio | Prioridad | Esfuerzo | Consumo | Evidencia o condición |
| --- | --- | --- | --- | --- | --- |
| **C01** | **Unificar palabras: carga, unidad, trailer y cita.** Evitar términos mezclados en inglés y español en la misma operación. | P2 | Bajo | ≈ | Interfaz interna y portales |
| **C02** | **Ordenar Inicio como un plan de trabajo del día.** Destacar lo urgente, lo que toca después y el trabajo futuro. | P2 | Medio | ≈ | Ajustar la presentación actual, que ya agrupa por carga |
| **C03** | **Acordar estatus y transiciones por etapa.** Reducir cambios ambiguos y definir cuándo se puede avanzar, regresar o cancelar. | P1 | Alto | ≈ | Decisión operativa; conservar compatibilidad con los estatus importados |
| **C04** | **Distinguir etapa, prioridad y condición de atención.** Evitar que el color de la tarjeta se confunda con el estatus del viaje. | P2 | Medio | ≈ | Actualmente conviven estatus, colores y alertas |
| **C05** | **Usar una distribución uniforme en todas las ventanas.** Homogeneizar etiquetas, espacio, cierre, desplazamiento y posición de Guardar. | P2 | Medio | ≈ | Extender los ajustes ya aplicados a solicitudes y tareas |
| **C06** | **Mantener avisos no urgentes dentro de la campana al capturar.** Evitar que notificaciones de fondo cubran campos; conservar errores visibles. | P2 | Bajo | ≈ | Extender el criterio ya aplicado a algunos formularios |
| **C07** | **Nombrar de forma uniforme revisión operativa y seguimiento personal.** Reconocer sus dos plazos independientes en todas las ventanas. | P2 | Bajo | ≈ | No fusionar los dos recordatorios existentes |
| **C08** | **Separar mensaje preparado, envío confirmado y respuesta recibida.** Hacer explícito qué acción realizó realmente la persona. | P2 | Medio | ↑ | Cambio del flujo manual de comunicación, no prueba de entrega automática |
| **C09** | **Cambiar documentos de una casilla a estados operativos acordados.** Distinguir pendiente, recibido, validado y rechazado cuando la operación lo necesite. | P2 | Alto | ↑ | Hoy existen principalmente indicadores de recibido/enviado |
| **C10** | **Separar el rol real Supervisor de los permisos de Admin.** Decidir qué puede administrar Abraham y qué queda reservado al administrador. | P1 | Alto | ≈ | H20; no inferir autorización a partir del texto del perfil |
| **C11** | **Definir si el CSR puede consultar todo o solo sus clientes.** Alinear visibilidad y permisos reales con la política que elijas. | P1 | Alto | ≈ | H20; el filtro de persona actual no equivale a aislamiento por RLS |
| **C12** | **Estandarizar qué debe contener cada cierre de turno.** Exigir pendientes críticos, responsable y siguiente acción, conservando el resumen automático. | P2 | Medio | ≈ | Cambio de procedimiento del cierre existente |
| **C13** | **Definir cuándo vence, se renueva y se completa cada tipo de aviso.** Documentar reglas únicas para evitar renovaciones accidentales o expectativas distintas. | P2 | Medio | ≈ | Revisión del significado de acciones existentes, no eliminación de pendientes |
| **C14** | **Mostrar validación de campos junto al dato que falta.** Aplicar el mismo lenguaje y ubicación del error en todos los formularios. | P2 | Medio | ≈ | Conservar siempre la validación de Supabase |
| **C15** | **Mostrar la vista previa de importación por carga y campo.** Permitir comprender el cambio exacto antes de confirmar, además de los totales actuales. | P2 | Medio | ↑ | La vista previa ya existe; cambia su nivel de detalle |
| **C16** | **Explicar qué datos manuales se conservarán al importar.** Hacer visibles las reglas de protección antes de aplicar el archivo. | P2 | Medio | ≈ | No quitar la protección ni resolver conflictos de manera silenciosa |
| **C17** | **Mostrar fuente y fecha del cálculo junto a las millas.** Identificar Google, OSM y estimación y la vigencia del dato utilizado. | P2 | Medio | ≈ | La fuente ya se muestra; uniformar fecha y explicación |
| **C18** | **Separar carga relacionada y referencia libre del apartado.** Relacionar un número real cuando exista y conservar notas libres aparte. | P2 | Alto | ↑ | El CSR externo de VG permanece como captura manual |
| **C19** | **Estandarizar nombres y alias de clientes.** Evitar que diferencias de escritura fragmenten filtros, asignaciones y reportes. | P2 | Alto | ↑ | Revisar nombres existentes antes de fusionar clientes |
| **C20** | **Elegir explícitamente la zona horaria operativa.** Distinguir la hora de despacho de la hora local del origen o destino. | P1 | Alto | ≈ | Actualmente parte de la presentación usa el horario del dispositivo |
| **C21** | **Hacer visibles los filtros activos y un patrón común para limpiarlos.** Evitar interpretar una lista filtrada como registros perdidos. | P2 | Medio | ≈ | Conservar filtros existentes de cada sección |
| **C22** | **Uniformar fechas, horas y valores sin información.** Usar el mismo formato legible y distinguir sin fecha, cero y pendiente. | P2 | Medio | ≈ | Extender reglas existentes sin alterar instantes guardados |
| **C23** | **Ordenar las columnas por decisión operativa.** Priorizar carga, cliente, etapa y próximo compromiso; relegar detalles secundarios. | P2 | Medio | ≈ | Cambio de orden y jerarquía de la tabla actual |
| **C24** | **Pedir motivo y explicar el efecto de cancelar, liberar o retirar.** Unificar las acciones sensibles con confirmaciones concretas y auditoría. | P2 | Medio | ↑ | No sustituye la validación de autor y versión existente |
| **C25** | **Usar acceso por usuario escrito sin publicar el directorio del equipo.** Reducir información expuesta en la pantalla de acceso. | P1 | Medio | ↓ | H13; decisión de comodidad frente a exposición del directorio |
| **C26** | **Dar a Gerencia accesos individuales en lugar de una contraseña compartida.** Identificar y revocar a cada persona de consulta. | P1 | Alto | ↑ | El acceso actual de Vista Gerencia usa vista-gerencia |
| **C27** | **Acordar qué detalle de una incidencia se publica al cliente.** Separar el texto de operación interna del mensaje destinado al cliente. | P1 | Alto | ↑ | H20; hoy el portal recibe incidencias activas mediante una lista explícita |
| **C28** | **Usar una revisión de prueba antes de cada publicación Google.** Comprobar la misma versión y sus pasos de activación antes de sustituir la publicación habitual. | P1 | Medio | ↑ | Proceso de publicación; no promesa de acceso real desde Codex |
| **C29** | **Normalizar tipos y reglas de campos entre interfaz y base.** Migrar gradualmente booleanos y fechas heredados a contratos coherentes. | P2 | Alto | ≈ | Requiere migración compatible, ensayo de restauración y pruebas de importación |
| **C30** | **Crear instrucciones cortas por rol con ejemplos reales.** Ayudar a Admin, Supervisor, CSR y Cliente a completar sus tareas habituales. | P2 | Bajo | ≈ | Complementar las guías de instalación y la ayuda actual |

## 30 funciones nuevas

| ID | Opción y beneficio | Prioridad | Esfuerzo | Consumo | Evidencia o condición |
| --- | --- | --- | --- | --- | --- |
| **F01** | **Adjuntar POD, BOL y otros documentos privados.** Consultar el archivo real desde la carga con acceso controlado. | P2 | Alto | ↑ | Requiere Storage, reglas de acceso y política de tamaños/retención |
| **F02** | **Controlar vigencia y vencimiento de documentos.** Avisar antes de caducidad de permisos o documentación relevante. | P2 | Medio | ↑ | Estados de documentos acordados en C09 |
| **F03** | **Configurar SLA por cliente.** Definir plazos y metas diferentes para avisos, respuesta y seguimiento. | P2 | Medio | ↑ | El cálculo SLA actual no constituye un configurador por cliente |
| **F04** | **Escalar pendientes sin atender al responsable de supervisión.** Derivar tareas críticas según plazo y responsable. | P2 | Alto | ↑ | Depende de C10, C11 y reglas operativas explícitas |
| **F05** | **Crear tareas recurrentes.** Programar revisiones diarias o semanales sin volver a capturarlas. | P2 | Medio | ↑ | Nueva programación, distinta de los recordatorios de una carga |
| **F06** | **Agregar plantillas de checklist y dependencias de tareas.** No olvidar pasos y ordenar el trabajo que depende de otro. | P2 | Medio | ↑ | Nueva estructura para tareas, además de su nota |
| **F07** | **Solicitar y aprobar recargos con evidencia.** Documentar autorización, importe y responsable antes de cerrar el cargo. | P2 | Alto | ↑ | El indicador actual de recargos no es un flujo de aprobación |
| **F08** | **Enviar alertas programadas con el panel cerrado.** Recibir avisos por un canal externo autorizado aunque no esté abierta la página. | P3 | Alto | ↑ | Diferente de las notificaciones actuales del navegador; requiere elegir proveedor/canal |
| **F09** | **Enviar reportes semanales automáticamente por correo.** Entregar resúmenes programados por cliente y destinatario. | P2 | Alto | ↑ | Hoy existen exportaciones manuales; requiere permisos y cuotas de correo |
| **F10** | **Integrar WhatsApp con confirmaciones reales de entrega.** Registrar el resultado del proveedor en vez de depender solo de la marca manual. | P3 | Alto | ↑ | API externa, consentimiento de destinatarios y posible costo adicional |
| **F11** | **Conectar telemetría de Samsara u otro proveedor.** Actualizar ubicación sin pegar coordenadas manualmente. | P3 | Alto | ↑ | Requiere acceso autorizado a la API y conocer sus cuotas |
| **F12** | **Detectar llegada y salida mediante geocercas.** Generar eventos al entrar o salir de una instalación. | P3 | Alto | ↑ | Depende de F11 o de otra fuente de posición |
| **F13** | **Calcular rutas con restricciones de camión.** Considerar altura, peso y vías restringidas con un proveedor adecuado. | P3 | Alto | ↑ | Los modos driving actuales no garantizan rutas autorizadas para camión |
| **F14** | **Planear disponibilidad del conductor según horas de servicio.** Estimar si el operador puede llegar según jornada y descanso. | P3 | Alto | ↑ | La etiqueta HOS actual no es un cálculo de disponibilidad |
| **F15** | **Manejar viajes con múltiples paradas.** Registrar varias recolecciones, entregas y compromisos dentro de una carga. | P3 | Alto | ↑ | Modelo nuevo de paradas y adaptación del calendario |
| **F16** | **Detectar conflictos y capacidad de citas por instalación.** Evitar programaciones incompatibles en una misma ventana o andén. | P2 | Alto | ↑ | Requiere catálogo de instalaciones y capacidad acordada |
| **F17** | **Administrar disponibilidad de unidades y trailers.** Identificar equipo libre, asignado, en patio o en mantenimiento. | P3 | Alto | ↑ | Distinto de los campos de texto de unidad y trailer de cada carga |
| **F18** | **Guardar una agenda opcional de contactos externos de VG.** Consultar datos de contacto sin convertirlos en usuarios ni forzar la selección del CSR. | P2 | Medio | ↑ | Conservar siempre la captura manual del CSR externo solicitada por el usuario |
| **F19** | **Guardar contactos de transportista y conductor por carga.** Facilitar llamadas y seguimiento operativo con acceso controlado. | P2 | Medio | ↑ | Requiere definir qué datos personales se guardan y quién los consulta |
| **F20** | **Estimar rentabilidad del regreso y de cada trayecto.** Comparar ingresos con combustible, peajes y millas vacías. | P3 | Alto | ↑ | Los campos actuales de millas, RPM y cargos no incluyen este modelo completo |
| **F21** | **Controlar facturación y cobro de cargos.** Seguir de autorizado a facturado y pagado, con referencias. | P3 | Alto | ↑ | Nueva función administrativa, separada de F07 |
| **F22** | **Permitir al cliente confirmar lectura o recepción de un aviso.** Distinguir que el cliente lo revisó de que el CSR lo marcó enviado. | P2 | Medio | ↑ | Confirmación explícita en el Portal Cliente |
| **F23** | **Configurar secciones y datos públicos por cliente.** Adaptar la experiencia del portal sin exponer notas o cargos internos. | P2 | Alto | ↑ | Requiere reglas verificadas en servidor, no solo ocultar componentes |
| **F24** | **Exportar o suscribir el calendario mediante iCalendar.** Consultar compromisos en Google Calendar u otra agenda compatible. | P2 | Medio | ↑ | Enlaces o feeds con acceso revocable y alcance limitado |
| **F25** | **Sincronizar vistas guardadas entre dispositivos.** Conservar las preferencias al cambiar de computadora o teléfono. | P2 | Medio | ↑ | Las vistas actuales se guardan localmente en el navegador |
| **F26** | **Guardar borradores sin conexión y revisarlos antes de enviarlos.** Recuperar una captura interrumpida sin aplicar cambios automáticamente. | P3 | Alto | ↑ | Separar borradores por cuenta y resolver versiones al reconectar |
| **F27** | **Reconocer archivos ya importados por su huella.** Advertir que el mismo contenido ya se procesó y localizar su resultado. | P2 | Medio | ↑ | Complementa la detección actual de cargas repetidas y filas sin cambios |
| **F28** | **Agregar una pantalla administrativa de respaldos y recuperación.** Descargar, verificar y ensayar una restauración con controles explícitos. | P2 | Alto | ↑ | Primero corregir y probar M04; no restaurar directamente sobre producción |
| **F29** | **Mostrar un centro de salud del portal.** Consultar versión, errores recientes y cola de millas desde Administración. | P2 | Medio | ↑ | Datos operativos limitados; no exponer secretos ni tokens de administración |
| **F30** | **Registrar aceptación del cierre por el siguiente turno.** Confirmar quién recibió el trabajo y qué pendientes tomó. | P2 | Medio | ↑ | Amplía el cierre existente con recepción explícita y responsable |

## Primera secuencia recomendada

1. **Seguridad y regresiones:** M01, M02, M15, M16 y M29. Cubrir nombres de carga con símbolos, atributos HTML, texto CSV y accesos fallidos sin romper los flujos válidos.
2. **Integridad y recuperación:** M03, M04 y M06. Ver el retiro de incidencias, ensayar el respaldo completo y distinguir los dos sentidos de carretera.
3. **Ahorro medible:** M05, M07–M13 y M17–M19; acompañar índices M23 con mediciones. Comparar filas/bytes, consultas y tiempos antes/después con el mismo conjunto de datos.
4. **Claridad de operación:** acordar primero C03, C10, C11, C20 y C27; aplicar después los cambios visuales C01, C05, C06, C14 y C21.
5. **Primeras ampliaciones con alcance acotado:** F05, F06, F18 y F30. Las integraciones F10–F14 y la carga de archivos F01 requieren revisar proveedor, permisos, datos y presupuesto.

El activador de Maps confirmado por el usuario debe conservarse. El catálogo de opciones no requiere repetir SQL ni cambiar Code.gs. Los cuatro ajustes de interfaz descritos arriba sí requieren publicar una nueva versión del HTML. Las 90 propuestas quedan priorizadas para entregas posteriores.

## Cómo medir ahorro antes de cambiar de plan

- Registrar en Usage de Supabase almacenamiento de base y Egress; separar esos valores de las cuotas de Maps y del navegador. No copiar claves para obtenerlos.
- Medir filas/bytes de una búsqueda de radar, de abrir Inicio y de un refresco con una sola carga modificada.
- Usar los mismos usuarios, cantidad de cargas y periodo al comparar. Probar también múltiples pestañas y reconexión.
- Una búsqueda de ejemplo con 10,000 rutas mostró una sola ruta después de leer todas. El lector de páginas de 500 haría 21 solicitudes en ese caso exacto; consultar por origen debería traer solo las coincidencias. Es un ejemplo ficticio, no el tamaño del proyecto real ni una reducción de costo medida.
- Con el código actual, una pestaña visible puede consultar las marcas unas 60 veces por hora; oculta, unas 12. El número real puede bajar mientras se edita o no hay sesión. Los cálculos SQL y los datos devueltos importan más que contar únicamente las llamadas.
- El activador, con un lote lleno de 20 por hora, puede hacer 24 consultas de reserva y hasta 480 confirmaciones al día. No significa 480 rutas nuevas reales diarias; se reutilizan resultados y se aplican pausas/reintentos. No incluye uso manual ni otros usuarios/servicios.

## Criterios de aceptación para la primera entrega

- HTML: caracteres como `<`, `>`, comillas y acentos se muestran literalmente, sin crear nodos o atributos nuevos a partir de datos.
- CSV: texto con prefijos de fórmula se abre como texto; valores numéricos negativos, ceros iniciales y acentos conservan su significado.
- Historial: una incidencia retirada aparece con autor y fecha, mientras el registro original de auditoría se conserva.
- Recuperación: una exportación de prueba recupera cargas, comentarios, rutas OSM/Google y preferencias. No se exportan contraseñas, JWT, claves privilegiadas ni el secreto del proceso; Auth y vinculación se recuperan por procedimiento aparte.
- Rutas: un par A→B y B→A puede guardar valores distintos y mostrar correctamente su fuente.
- Consultas: la mejora se valida con llamadas, filas/bytes y resultados equivalentes; se mantienen RLS, límites y comprobación de versiones.

## Archivos de evidencia

- [Catálogo estructurado de las 90 opciones](OPCIONES_PORTAL_2026-10-15.json).
- [Evidencia técnica de esta revisión](evidencia-auditoria-2026-10-15.json).
- [Pruebas reales aún pendientes](PRUEBAS_FINALES.md).
