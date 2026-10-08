# Pruebas finales, una por una

Realizar después de instalar SQL 004–009, la función `panel-accounts` y la nueva versión de Google. Avanzar juntos desde el punto 1, registrar cada resultado y corregir un fallo antes de continuar. Las verificaciones anteriores del usuario siguen siendo válidas para sus versiones; esta tabla está pendiente en la nueva publicación.

| Orden | Prueba | Resultado esperado | Estado real |
| --- | --- | --- | --- |
| 1 | Entrar con Esteban y su contraseña actual | Login original, mismo enlace Google y mismas cargas Supabase | Pendiente |
| 2 | Inicio/Ahora/Mi turno y selector de persona | Paneles originales, jornada, pendientes y cierres | Pendiente |
| 3 | Operación, filtros, búsqueda, tarjetas/tabla, densidad y vistas guardadas | Mismos controles y ventanas del original | Pendiente |
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

Las pruebas locales están documentadas en VALIDACION_SITIO.md. Las funciones anteriores de archivo y respaldo permanecen en el backend; no se agregan botones que no pertenecen a la interfaz original.
