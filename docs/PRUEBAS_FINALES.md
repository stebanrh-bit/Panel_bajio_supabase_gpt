# Pruebas finales, una por una

Realizar después de instalar la entrega conjunta. No repetir todas las pruebas de módulos entre cada cambio. Avanzar acompañados desde el punto 1, registrar resultado y corregir antes de continuar cuando falle. Usar cargas de prueba claramente identificadas; conservar los expedientes de prueba en Archivo al terminar.

Las comprobaciones reales anteriores de login, cargas, comentarios, revisión/aviso y pendientes ya fueron confirmadas por el usuario; esta lista valida la versión conjunta nueva. Las pruebas automáticas locales no marcan estos puntos como aprobados en producción.

| Orden | Prueba | Resultado esperado | Estado real |
| --- | --- | --- | --- |
| 1 | Entrar por el mismo `/exec` y abrir todos los módulos | Inicio Mi operación y barra lateral visibles; cargas existentes en Operación completa; tarjetas/tabla y navegación sin errores | Pendiente |
| 2 | Crear `SITIO-001`, editar cita/unidad/estatus; actualizar | Datos conservados y citas en la zona indicada | Pendiente |
| 3 | Abrir pestañas Comunicación/Incidencias; intentar una incidencia sin categoría; luego registrar una válida y actualizar | La vacía no se guarda; comentario e incidencia válida conservados, sin duplicados | Pendiente |
| 4 | Cambiar a En transito y pulsar Ya revisé; cambiar cita; registrar aviso | Revisión a tres horas; aviso pendiente y después resuelto con canal/tipo | Pendiente |
| 5 | Crear solicitud desde Cancelados, comentar y vincular a carga del mismo cliente | Vuelve a Pendientes; vínculo traslada texto y queda en Vinculados | Pendiente |
| 6 | Crear otra solicitud y cancelarla; actualizar | Expediente en Cancelados conserva nota/comentario | Pendiente |
| 7 | Crear apartado, revisar, avanzar etapas, usar/liberar y reabrir | Agenda cambia; Cerrados conserva historia; reapertura vuelve a activos | Pendiente |
| 8 | Crear pendiente de turno para dos cargas y para uno mismo; resolver/reabrir/cancelar | Una tarea por carga; filtros correctos e historial conservado | Pendiente |
| 9 | Preparar y guardar cierre de turno | Resumen editable conservado después de actualizar | Pendiente |
| 10 | Crear/editar plantilla con `{load}` y `{customer}`; usarla en una carga | Variables se sustituyen; copiar funciona o ofrece selección manual | Pendiente |
| 11 | Asignar cliente a tu cuenta; seguir una carga; abrir Mi operación | Filtros de cliente/operador/seguidas coherentes; alertas visibles | Pendiente |
| 12 | Abrir Calendario y cambiar semana; revisar indicadores | Fechas de citas/cruce/apartados correctas; métricas y muestra explicadas | Pendiente |
| 13 | Abrir la misma carga en dos pestañas y guardar cambios en ambas | La segunda edición con versión anterior se rechaza; no pisa cambios | Pendiente |
| 14 | Seleccionar dos cargas y cambiar un campo masivamente | Ambas se guardan; una versión vieja revierte el conjunto | Pendiente |
| 15 | Importar CSV de prueba con una carga nueva y una existente, primero vista previa | Vista previa no cambia datos; aplicar mantiene estatus/POD manuales y campos vacíos | Pendiente |
| 16 | Deshacer esa importación sin actividad posterior | Existente recupera datos; nueva pasa a Archivo; historial queda | Pendiente |
| 17 | Importar otra carga nueva, comentarla y tratar de deshacer | Operación rechazada para conservar actividad posterior | Pendiente |
| 18 | Archivar `SITIO-001`, abrir expediente y restaurarlo | Sale de activos/portal; conserva comentario/incidencia/historial; vuelve al restaurar | Pendiente |
| 19 | Descargar respaldo JSON y abrir el archivo local | Contiene tablas y datos; no incluye contraseñas ni tokens | Pendiente |
| 20 | Buscar Laredo, Texas, USA en Radar y verificar una carretera | Google autoriza consulta; distancias/tiempos identificados; errores de cuota explicados | Pendiente |
| 21 | Compartir archivo de radar; actualizar | Equipo conserva referencia; no crea cargas operativas | Pendiente |
| 22 | Cerrar sesión y entrar; probar desde móvil | Login y navegación funcionan; no queda pantalla de datos al salir | Pendiente |

## Última etapa: cuentas y permisos reales

Pospuesta por petición del usuario hasta contar con cuentas adicionales. No pedir otro correo durante la construcción. Las cuentas de prueba se crean desde Authentication en el Dashboard de Supabase; no compartir contraseñas por chat. Se pueden usar cuentas de prueba administradas sin buzón real si se crean y confirman manualmente, entendiendo que no reciben recuperación por correo.

| Prueba | Resultado esperado | Estado real |
| --- | --- | --- |
| Operador A y operador B | Cada quien edita sus pendientes/apartados; no puede suplantar al otro | Pendiente |
| Seguimiento y tareas entre operadores | Las tareas se muestran a autor/asignado/seguidores autorizados; cierres respetan acceso | Pendiente |
| Gerencia | Consulta módulos y expedientes; no modifica ni importa | Pendiente |
| Administración | Gestiona equipo, asignaciones, archivo e importación; no se quita su propio acceso administrativo | Pendiente |
| Cuenta cliente asignada a PRUEBA CLIENTE | Ve solo sus embarques, documentos, incidencias y mensajes publicados; no ve notas internas/cargos | Pendiente |
| Cliente con otra asignación | No accede al expediente ajeno, aun copiando el número de carga | Pendiente |
| Publicar mensaje desde SITIO-001 | Texto aparece en el portal correcto y permanece al actualizar | Pendiente |
| Cuenta desactivada o pendiente | No recibe datos ni puede guardar cambios | Pendiente |
| Sin sesión | Solo login; consultas a datos y funciones protegidas denegadas | Pendiente |

## CSV mínimo para la prueba de importación

En el repositorio se incluye [importacion-prueba.csv](../entregables/importacion-prueba.csv). Antes de usarlo, crea `IMPORT-EXISTENTE` con estatus manual y POD compartido. El CSV contiene un cambio a esa carga y una nueva `IMPORT-NUEVA`. Genera vista previa, aplica y deshaz antes de comentar la carga nueva. No lo mezcles con datos operativos reales.
