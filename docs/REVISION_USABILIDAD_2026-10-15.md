# Revisión funcional y de usabilidad: 15 de octubre de 2026

El panel conserva sus funciones principales y pasa las pruebas disponibles, pero necesita corregir ventanas, mejorar la lectura y reducir controles repetidos. La recomendación es conservar la identidad visual y reorganizar la información alrededor de las tareas del usuario.

Se revisó la rama `supabase-inicial`, con código base `2acacef`. Este documento entrega hallazgos y propuestas: no modifica la aplicación publicada, las cuentas ni los datos.

**Entrega posterior autorizada por el usuario:** las correcciones de ventanas, teclado, campos y móvil, junto con la simplificación de Inicio, tarjetas, Administración, cuenta y guardado, se implementaron después de esta revisión. Consulta [MEJORAS_USABILIDAD.md](MEJORAS_USABILIDAD.md) y los resultados actuales en [VALIDACION_SITIO.md](VALIDACION_SITIO.md). Las mediciones siguientes conservan el estado anterior para que pueda compararse; los permisos de cuentas se mantienen.

## Qué se comprobó

| Área | Evidencia de esta revisión |
| --- | --- |
| Base de datos y operación | 81 pruebas aprobadas, 0 fallidas y 0 omitidas: permisos, versiones, transacciones, cargas, comentarios, incidencias, solicitudes, tareas de turno, apartados, importaciones y portales |
| Compilación | 125 módulos compilados correctamente |
| Cuentas | Tipos de `panel-accounts` correctos; sus pruebas ejecutan el manejador con SDK real y transporte simulado |
| Navegador | 35 comparaciones de la presentación prevista, con datos ficticios; flujos de incidencias, cierre de sesión, Admin/CSR, CSV/XLSX/XLS y recordatorios correctos; sin errores JavaScript |
| Importación en navegador | Seis vistas previas y una confirmación simuladas; persistencia comprobada al recargar el escenario de prueba |
| Lectura y accesibilidad | Inspección adicional de controles, tamaños de texto, ventanas, móvil y navegación con Tab/Escape |
| Entrega | `python3 scripts/package_site.py --check` correcto: el HTML y ZIP corresponden al build |
| Supabase remoto, solo lectura | Auth y directorio: 200. Cargas y perfiles sin sesión: 401 |
| Google remoto | Respuesta 302 hacia `accounts.google.com`; no hay sesión de Google disponible para inspeccionar el despliegue |

La comparación visual verifica que los adaptadores entreguen la presentación prevista. No determina por sí sola si esa presentación resulta fácil de usar: los problemas siguientes aparecen aunque las comparaciones pasen.

## Correcciones prioritarias

### 1. Administración: contenido fuera de la ventana

**Observación confirmada.** En escritorio de 1440 × 1024, el cuadro tiene 819 px de alto interior y 1131 px de contenido, con `overflow-y: visible`. Las secciones de importación y bitácora administrativa quedan debajo del borde inferior de la pantalla. En móvil de 390 × 844, el contenido alcanza 1342 px dentro de un cuadro de 675 px; varias secciones quedan fuera del área visible.

**Cambio recomendado.** Primero asegurar desplazamiento interno y un encabezado/cierre accesible. Después organizar Administración en secciones independientes: Personas, Clientes y asignaciones, Accesos, Importaciones y Bitácora. La importación no debe quedar escondida al final de la gestión de personas.

**Cómo validarlo.** Llegar a todas las secciones con ratón, tacto y teclado en escritorio y móvil, sin perder el botón de cierre. Probar también con más personas y cuentas de cliente.

Fuentes: `web/src/original/index.template.html`, sección `csr-backdrop`; `web/src/original/panel-styles.css`, regla `.modal-box`.

### 2. Cargas en móvil: campos que exceden el ancho

**Observación confirmada.** A 390 px de ancho, la página de Cargas alcanza 413 px de ancho de documento. La inspección identifica cuatro campos `.v.field-input` de las tarjetas que sobresalen por la derecha. Inicio y los portales no tuvieron ese desbordamiento en los escenarios revisados.

**Cambio recomendado.** Ajustar el ancho mínimo y la disposición de los campos de las tarjetas; usar una columna cuando corresponda. Mantener accesibles los filtros y la barra inferior sin tapar las acciones.

**Cómo validarlo.** Documento sin desplazamiento horizontal en Cargas a 360 y 390 px, con fechas completas, clientes largos y ambas vistas. Conservar desplazamiento interno intencional en tablas o pestañas cuando sea necesario.

Fuentes: `cardHtml` y los campos de fecha en `web/src/original/panel-script.js`; estilos de tarjetas y campos en `web/src/original/panel-styles.css`.

### 3. Ventanas: foco de teclado y nombres de campos

**Observación confirmada.** En Comentarios, desde el área de texto, Tab llega al botón de ingreso y el siguiente Tab sale del diálogo. Escape sí cierra la ventana. Hay roles de diálogo y nombres accesibles agregados por el código, pero falta contener el foco y restituirlo al control que abrió la ventana.

También hay campos con rótulos visuales que no están asociados mediante `label`/`for` ni tienen nombre accesible; ocurre en fechas de las tarjetas y en `next-review-at`. Un texto colocado junto al campo no equivale a una etiqueta asociada.

**Cambio recomendado.** Foco inicial dentro de la ventana, recorrido circular con Tab/Shift+Tab, contenido de fondo fuera del recorrido mientras esté abierta y retorno al botón de origen al cerrar. Asociar cada campo a una etiqueta permanente. Conservar Escape y las advertencias de cambios sin guardar existentes.

**Cómo validarlo.** Completar un comentario y una incidencia utilizando solo teclado; repetir con lector de pantalla y móvil. No dar por validada la accesibilidad completa por estas comprobaciones puntuales.

## Qué quitar de la vista principal, sin eliminar funciones

| Situación actual | Propuesta | Beneficio |
| --- | --- | --- |
| Una misma carga aparece en Qué debes atender, Revisiones y seguimientos y Avisar al cliente | Una fila por carga en Inicio con motivos y acciones diferenciados; filtros para ver cada tipo | Menos repetición, conservando las distintas obligaciones |
| Cada tarjeta expone fechas editables, unidad, documentación, colores y varios botones | Resumen con carga, cliente, ruta, estatus, próximo compromiso y acciones frecuentes; demás campos en el expediente o Más acciones | Se reconoce rápidamente qué hacer; menos cambios accidentales |
| Cargas muestra numerosos filtros y configuraciones al mismo nivel | Mantener búsqueda, cliente y estado principales; agrupar filtros avanzados y opciones de vista | Menos decisiones antes de comenzar |
| Gestión de personas, accesos, contraseñas, importación y bitácora comparten una ventana larga | Secciones administrativas separadas | Es más fácil localizar cada función |
| El encabezado repite nombre y muestra acciones de cuenta junto a acciones de operación | Menú de cuenta con nombre y puesto visible; acciones de cuenta agrupadas | Encabezado más despejado y contexto de sesión claro |

No conviene combinar los datos de los recordatorios: la revisión automática de tránsito y el seguimiento personal son plazos independientes. La simplificación propuesta es de presentación; completar uno debe seguir conservando el otro.

Los apartados, el historial, la trazabilidad de avisos y las funciones de deshacer conservan su utilidad. Pueden ocupar una segunda capa de navegación sin desaparecer del proyecto.

## Qué agregar o mejorar

1. **Lectura y tacto.** Texto de trabajo de 14–16 px, etiquetas secundarias de al menos 12–13 px y objetivos táctiles amplios, idealmente de 44 px. Hay controles cercanos a 10–11 px en Cargas y de 9,92 px en Inicio móvil. Los valores se midieron en los escenarios de prueba; no son un análisis completo de contraste.
2. **Vocabulario uniforme.** Usar Carga en lugar de alternar Load/Carga; Expediente para Workspace; Seguimiento para Tracking; Cierre de turno para Handoff. Mantener las abreviaturas de negocio que el equipo usa, acompañadas de ayuda breve donde se necesite. Corregir títulos como Nuevo registro sin load y Correo de Google, que no describen bien el acceso actual con Supabase.
3. **Estado del guardado consistente.** Ya existen mensajes de Guardando, confirmaciones y reversión cuando falla el servidor. Homogeneizarlos: Guardando → Guardado, o un error persistente junto al campo con una acción de recuperación. Algunos cambios son optimistas y los avisos generales desaparecen a los 2,8 segundos; eso puede confundir sobre lo que ya se guardó.
4. **Fechas entendibles.** Mostrar fecha, hora y contexto de zona horaria sin depender del formato del navegador. Combinar una fecha inequívoca como 15 oct, 14:30 con Vence en 2 h o Vencido hace 30 min. No cambiar el instante guardado en la base.
5. **Comunicación en pasos claros.** Conservar Preparar mensaje, Abrir WhatsApp/correo y Registrar aviso enviado. Abrir la aplicación externa no prueba que se envió el mensaje. El panel ya distingue estas acciones; el diseño debe reforzarlo y evitar un botón ambiguo de Enviar.
6. **Ayuda contextual breve.** Explicar en la pantalla qué son Solicitud, Tarea de turno, Apartado y Aviso, con un ejemplo y una acción para comenzar. Ya existe una ayuda de Inicio; conviene extender ese patrón al resto sin agregar ventanas que interrumpan.

## Admin y Supervisor: puesto frente a permisos

El directorio remoto volvió a confirmar que Esteban y Abraham comparten el identificador interno que corresponde a `admin`. La interfaz presenta a Esteban como Admin y a Abraham como Supervisor, tal como se solicitó; el cambio anterior fue de etiqueta, no de autorización.

Antes de diseñar una pantalla exclusiva para supervisión, conviene definir sus facultades: consultar toda la operación, asignar clientes, operar cargas o administrar cuentas son decisiones distintas. Si Abraham debe tener menos permisos, hará falta implementar esa diferencia en Supabase y en el servidor, además de reflejarla en la interfaz. No basta con ocultar botones o cambiar un nombre.

Para futuras cuentas, el puesto visible debería guardarse asociado a un identificador estable de perfil. Actualmente la excepción de Abraham se configura por nombre en `PROFILE_ROLE_LABELS`; renombrar la cuenta puede afectar su etiqueta. Esto no cambia sus permisos.

## Organización recomendada

| Destino | Qué debe resolver |
| --- | --- |
| Inicio | Qué atender primero, por qué, para cuándo y con qué acción |
| Cargas | Buscar, filtrar y abrir el expediente de cada carga |
| Solicitudes y tareas | Trabajo pendiente sin carga confirmada y tareas del turno, con su tipo claramente identificado |
| Calendario | Fechas y compromisos próximos |
| Herramientas | Apartados, Radar e Indicadores, disponibles cuando se necesitan |
| Administración | Personas, clientes, asignaciones, accesos, importaciones y bitácora, según permisos |

Esta organización es una propuesta, no un cambio ya aplicado. Conviene conservar atajos útiles para usuarios frecuentes y los colores y logo con los que el equipo está familiarizado. Un tema claro opcional puede evaluarse después de resolver tamaños y jerarquía; no sustituye esas correcciones.

## Orden sugerido de trabajo y aceptación

1. **Corregir obstáculos actuales:** Administración completa y desplazable, Cargas móvil sin desbordamiento, teclado dentro de las ventanas y campos etiquetados.
2. **Mejorar la lectura:** tamaños, espacios, nombres consistentes, fechas claras y estado del guardado.
3. **Reducir saturación:** tarjeta resumida, acciones secundarias agrupadas y una sola lista de atención por carga.
4. **Cerrar la validación real:** recorrer [PRUEBAS_FINALES.md](PRUEBAS_FINALES.md) en Google con cuentas reales, incluyendo las diferencias entre Admin, Supervisor, CSR y Cliente que se decidan.

La primera entrega debería permitir localizar una carga, abrirla, comentar, registrar una incidencia y volver a Inicio sin ayuda externa, tanto en escritorio como en móvil. La importación debe seguir mostrando vista previa y conservar sus protecciones de versiones y deshacer.

## Límites y evidencia

Las pruebas de base se ejecutan en PGlite con Auth simulado. El navegador usa el SDK real con peticiones Supabase interceptadas y datos ficticios. No se cargaron archivos al proyecto real ni se modificaron cuentas. La consulta remota fue de lectura y sin sesión.

Siguen pendientes la publicación Google autenticada, el archivo real del usuario, otros roles con sesiones reales, cuotas y mapas en Google. Las automatizaciones externas TCI y los activadores del sistema anterior no están instalados, según [COMPARACION_ORIGINAL.md](COMPARACION_ORIGINAL.md). No se declara que el sitio publicado esté validado al 100 %.

El inventario visual temporal incluyó 36 estados contando Administración y detectó los problemas descritos. Su primer recorrido no terminó los flujos de archivos porque la sonda temporal resolvía una ruta de fixture desde `/tmp`; se ejecutó después el verificador original del proyecto, que terminó las 35 comparaciones y todos sus flujos correctamente. Las sondas adicionales de teclado y tamaños también finalizaron. Ese error correspondía al instrumento de revisión, no al importador del panel.

Mediciones y resultados resumidos: [evidencia de la revisión](evidencia-usabilidad-2026-10-15.json). Referencias para repetir las pruebas: [VALIDACION_SITIO.md](VALIDACION_SITIO.md).
