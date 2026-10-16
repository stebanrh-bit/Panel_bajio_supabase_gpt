# Pruebas finales, una por una

Realizar después de instalar SQL 004–010, la función `panel-accounts` y la nueva versión de Google. Registrar cada resultado y corregir un fallo antes de continuar. El usuario ya confirmó el acceso y la apariencia original; las demás verificaciones siguen pendientes, incluyendo la actualización de supervisor como CSR.

Para la entrega del 15 de octubre, seguir [MEJORAS_USABILIDAD.md](MEJORAS_USABILIDAD.md): las acciones de cuenta están en el menú del nombre; Administración tiene secciones y la edición de tarjetas se despliega. Las pruebas reales pendientes de esta tabla se conservan aunque las pruebas locales hayan pasado.

| Orden | Prueba | Resultado esperado | Estado real |
| --- | --- | --- | --- |
| 1 | Entrar con Esteban y su contraseña actual | Login original, mismo enlace Google y mismas cargas Supabase | Confirmado por el usuario antes del ajuste de supervisor como CSR |
| 2 | Inicio/Por atender/Solicitudes y tareas y selector de persona | Paneles originales, jornada, pendientes y cierres | Pendiente |
| 3 | Cargas, búsqueda, tarjetas/tabla y Más filtros y opciones | Controles conservados; edición de tarjetas accesible en Más detalles y edición | Pendiente |
| 4 | Abrir una carga y recorrer las seis pestañas del Workspace | Datos correctos en cada pestaña | Pendiente |
| 5 | Cambiar truck/trailer, tracking, citas, salida y cruce en una carga de prueba | Guarda, persiste al recargar y deja historial | Pendiente |
| 6 | Cambiar estatus y programar recordatorio/revisión | Reglas y avisos originales, fechas correctas | Pendiente |
| 7 | Agregar comentario y registrar comunicación Email/WhatsApp | Persisten; comunicación resuelve pendiente y deja canal/tipo | Pendiente |
| 8 | Intentar incidencia sin categoría y luego registrar una válida | La vacía no guarda; la válida persiste | Pendiente |
| 9 | Retirar una incidencia de prueba | Desaparece de la lista y del portal; conserva auditoría | Pendiente |
| 10 | Seguir y dejar de seguir una carga | Botón estrella y alcance se actualizan; persiste al recargar | Pendiente |
| 11 | Crear pendiente, comentarlo y vincularlo a una carga del mismo cliente | Nota y comentarios conservan autor/fecha; pendiente se retira | Pendiente |
| 12 | Crear/editar/atender pendiente de turno, abrir histórico y enviar cierre | Persiste y aparece para la persona autorizada | Pendiente |
| 13 | Crear apartado externo, editarlo, revisar, avanzar, cerrar y reabrir | Agenda e historial correctos; no requiere carga local | Pendiente |
| 14 | Abrir calendario/indicadores, cambiar semana/filtros y exportar reporte | Datos y archivo correctos | Pendiente |
| 15 | Editar plantillas, copiar mensaje y abrir avisos/mensajes múltiples | Plantillas persisten por usuario; controles originales | Pendiente |
| 16 | Importar archivo de prueba con vista previa | Revisa antes de guardar, conserva datos manuales y deja resumen | Pendiente |
| 17 | Deshacer importación sin actividad posterior y luego intentar tras editar | Restaura o rechaza íntegramente para conservar actividad | Pendiente |
| 18 | Radar: Excel compartido, búsqueda de ciudad/dirección y recálculo Google | Conserva fuente y rutas; distingue OSRM/Google y millas rectas | Pendiente |
| 19 | Abrir Gestionar CSR con contraseña personal y crear una persona | Cuenta creada en Auth; asignar contraseña y rol | Pendiente |
| 20 | Crear/editar/desactivar cliente y configurar Vista Gerencia | Accesos administrados sin exponer contraseñas | Pendiente |
| 21 | Cerrar sesión, entrar de nuevo y navegar desde móvil | Login correcto; no quedan datos de otra sesión | Pendiente |
| 22 | Asignar clientes a Esteban y alternar Esteban · CSR / Todos | Vista propia y general con la misma cuenta; conserva administración | Pendiente |
| 23 | Revisiones y seguimientos: programados, vencidos y acciones | Revisar tránsito mantiene el seguimiento personal; completarlo conserva la revisión de tránsito | Pendiente |
| 24 | Ventanas usando Tab/Shift+Tab y Escape | El foco permanece dentro; al cerrar vuelve al origen | Pendiente |
| 25 | Administración y Cargas desde móvil, con detalles desplegados | Todas las secciones accesibles y página sin desbordamiento horizontal | Pendiente |
| 26 | Confirmación de cambios y mensajes de error | Distingue Guardando, Guardado y Error; no oculta errores sin intervención | Pendiente |
| 27 | Guardar un Trailer largo en una carga de prueba y recargar | Valor completo en listado de tabla y tarjeta; Editar trailer conserva la edición | Pendiente |
| 28 | Abrir Historial después de cambiar estatus, Trailer y una confirmación | Nombres legibles, autor y fecha; Antes/Ahora claros; cero y No enviado no aparecen vacíos | Pendiente |
| 29 | Abrir/cerrar Solicitudes y tareas y registrar una solicitud | Encabezados alineados; campos legibles; fecha clara; guarda y se puede comentar/vincular | Pendiente |
| 30 | Registrar y editar una tarea desde escritorio y móvil | Búsqueda, selección de cargas activas, Asignar a:, fecha y color accesibles; persiste; editar conserva la persona asignada | Pendiente |
| 31 | Calendario: elegir cliente y Pickup/Cruce/Entrega/Load apartado; cambiar semana y limpiar | Solo aparecen movimientos del tipo y cliente elegidos; filtros se conservan entre semanas; apartados sin relación tienen opción separada; abre registros y funciona en móvil | Pendiente |
| 32 | Activar millas automáticas, guardar un trayecto OSM y ejecutar un lote | Un activador por hora; Google se guarda en Supabase conservando OSM; al volver a buscar se muestra Google; funciona con el panel cerrado | Usuario confirmó activación y primer lote de 4 completados el 15 de octubre; falta confirmar ejecución programada y lectura desde el radar |
| 33 | Repetir activación, detener y reactivar; recálculo manual | No duplica activadores de la cuenta; detener conserva datos; corrección manual persiste y tiene prioridad | Pendiente |
| 34 | Apartar un load con CSR de VG que no sea usuario del panel; repetir desde Radar | Captura manual sin directorio ni asignación automática; nombre persiste al recargar y editar; autor del apartado sigue siendo la cuenta autenticada | Pendiente |

| 35 | En Cargas, abrir el detalle de una fila y después Editar trailer; escribir T0132 | El detalle sigue abierto, T0132 cabe en el campo; abrir el editor no cambia la selección; tabla con desplazamiento interno en pantallas estrechas | Pendiente en Google; comprobación local documentada en VALIDACION_SITIO.md |
| 36 | Plegar las tres secciones del turno, ir a Cargas y entrar por Solicitudes y por Tareas de turno | Solicitudes muestra sus registros; Tareas muestra las asignadas a ti y las registradas; botón lateral marcado y secciones abiertas; la pestaña conjunta recupera el resumen | Pendiente en Google |
| 37 | Abrir Vincular a una carga, buscar una activa, una entregada sin POD y una cancelada | Solo se ofrecen cargas activas; entregadas/completadas y canceladas no aparecen; sin coincidencias no permite vincular | Pendiente en Google |

## Última etapa: cuentas y permisos

Pospuesta por el usuario hasta disponer de otras cuentas. No hace falta otro correo real para cuentas administradas sin buzón: se pueden crear desde Gestionar CSR. No compartir contraseñas por chat.

| Prueba | Resultado esperado | Estado real |
| --- | --- | --- |
| Dos CSR y una cuenta de consulta | Permisos Supabase vigentes; no suplantan autores ni administran cuentas | Pendiente |
| Cambio o desactivación de cuenta | Las operaciones nuevas se rechazan y el refresco exige acceso válido | Pendiente |
| Portal Cliente `?portal=cliente` | Solo cargas asignadas; documentos/incidencias/avisos públicos; sin notas/cargos internos | Pendiente |
| Cliente intentando otra carga por número | Acceso rechazado en la base | Pendiente |
| Gerencia `?portal=gerencia` | Agrupación, filtros y detalle originales; lectura sin escritura | Pendiente |
| Cinco accesos fallidos y desbloqueo administrativo | Bloqueo temporal y auditoría sin contraseñas | Pendiente |
| Dos ediciones simultáneas sobre una carga | Versión vieja rechazada; no pierde el cambio más reciente | Pendiente |
| Sin sesión | Login público; datos y acciones privadas denegados | Pendiente |

Las comprobaciones históricas están documentadas en VALIDACION_SITIO.md. La entrega de las 49 opciones agrega Organizar turno y Guía de uso; sus pruebas locales se registran por separado.


## Entrega de las 49 opciones: aceptación después de instalar

Estas pruebas están **pendientes en tu Google y Supabase**. Se hacen una por una después de seguir INSTALAR_SITIO.md; las pruebas automatizadas locales no sustituyen esta aceptación. No hay que borrar tus cargas.

| Paso | Acción | Resultado esperado | Estado |
| --- | --- | --- | --- |
| 1 | Entrar como Esteban y abrir Cargas; alternar Mis clientes y Limpiar filtros | Toda la operación disponible; filtro y etiquetas claros; perfil Admin | Pendiente |
| 2 | Abrir Inicio y una carga con revisión y seguimiento personal | Urgente/hoy/futuro; completar un seguimiento no borra la revisión independiente; entregada sin POD conserva lo pendiente | Pendiente |
| 3 | Tabla con detalle abierto y trailer T0132; filtros y calendario por cliente/tipo | Trailer completo; filtros visibles; columnas alineadas; solo movimientos seleccionados | Pendiente |
| 4 | Crear apartado de prueba y referencia de regreso | CSR externo manual; carga relacionada solo activa; texto libre separado; sin agenda VG | CSR manual y referencia persistente confirmados por el usuario; selección de carga activa pendiente |
| 5 | Crear checklist y dependencia; intentar terminar sin completarlos | Indica qué falta; rechaza ciclos; guarda los pasos al completarlos | Pendiente |
| 6 | Programar tarea diaria/semanal y comprobar programaciones ahora | Una ocurrencia por horario de México; persona asignada correcta; pausa disponible | Pendiente |
| 7 | Admin: configurar escalamiento, revisar avisos y devolverlo al estado deseado | Destinatario correcto; avisos renovados desaparecen; envío externo siempre desactivado | Pendiente |
| 8 | Crear cierre con críticos, persona y siguiente acción; probar cancelar con y sin motivo | Campos obligatorios junto al dato; guarda autor y motivo legible en historial | Pendiente |
| 9 | Admin: equivalencia de cliente de prueba y nueva captura | Usa nombre principal sin reescribir cargas anteriores ni cambiar otra asignación | Pendiente |
| 10 | Importar CSV y Excel de prueba; ver historial anterior; revisar trayecto en ambos sentidos | Lector responde; historial por páginas; millas con fuente/fecha; sentidos independientes | Pendiente |
| 11 | Descargar respaldo y abrir vista previa de archivo sin aplicar | Respaldo v2; vista previa explica IDs/efecto; ninguna eliminación automática | Pendiente |
| 12 | Actualizar en dos pestañas, cerrar sesión con ventana abierta y volver a entrar | Datos al día; ventanas privadas se cierran; no quedan datos de otra sesión | Pendiente |
| 13 | Portal Cliente y Vista Gerencia desde sus enlaces, también en móvil | Cada vista carga su archivo; permisos y lectura correspondientes | Pendiente |

La restauración se ensayó en bases efímeras separadas, con identidades simuladas. No ejecutar una restauración ni una limpieza en producción como parte de estas pruebas. Las pruebas con otras cuentas permanecen para el final, como acordamos.


## Confirmaciones del usuario y corrección del 16 de octubre

Confirmado por el usuario en su sitio publicado: aparecen Organizar turno y Guía de uso; su perfil dice Admin; Mis clientes filtra y Limpiar filtros recupera la operación; el plan de Inicio permite abrir la carga correcta; el trailer se ve completo en listado/editor con el detalle abierto; el CSR manual y la referencia libre del apartado persisten.

El contacto de prueba se guardó, pero el usuario pidió retirar Contactos VG. Esa sección y el selector se eliminaron de la entrega, conservando los registros existentes. Después reportó vacía la pestaña Tareas y checklist. Se corrigieron la consulta y la presentación de lista vacía; se agregó Nueva tarea de turno dentro de la ventana. **Pendiente de instalar esta corrección y repetir la séptima prueba**. No se da el checklist por aprobado en producción.
