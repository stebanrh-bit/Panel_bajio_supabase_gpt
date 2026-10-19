# Guía para usar Panel Bajío

## CSR: atender el turno

1. Entra con tu cuenta. Abre Inicio y elige **Urgente**, **Hoy** o **Próximos días**. Cada fila muestra carga, cliente, trailer y truck; **Ver acciones** despliega sus recordatorios y botones.
2. Abre Cargas: la tabla sencilla muestra una carga por fila. **Mostrar**, cliente y búsqueda filtran la lista. **Opciones** reúne los controles secundarios; el número de carga abre el detalle y los comentarios se abren al pulsarlos. Puedes consultar toda la operación; **Mis clientes** muestra tus clientes y cargas seguidas. Los filtros solo cambian la vista. **Limpiar filtros** recupera la lista general.
3. En el expediente, **Etapa** indica el avance, **Prioridad** el orden de trabajo y **Atención** el motivo para revisarlo. Unidad es el tractocamión; trailer es la caja; cita es la hora acordada.
4. **Revisión operativa** depende del estatus, por ejemplo revisar tránsito cada tres horas. **Seguimiento personal** guarda una próxima acción propia. Atender una no completa la otra. Vencer significa «ya toca», no elimina nada. El expediente indica **Programado para**, **Pendiente de atender** o **Sin seguimiento programado**. Pulsa **Completar seguimiento** cuando hayas terminado o **Reprogramar** si aún falta trabajo.
5. Prepara el mensaje al cliente y envíalo por tu canal habitual. Después registra que ya avisaste. Preparar o copiar el texto no equivale a enviarlo.
6. Solicitudes son viajes sin número confirmado. Vincúlalas cuando exista una carga activa. Tareas son acciones asignadas a personas del panel. En el detalle de una carga, usa **Crear tarea** y elige **Persona específica** o **Quien cubra al CSR del cliente**. La cobertura se ofrece cuando todas las cargas seleccionadas tienen el mismo CSR asignado.
7. En **Organizar turno → Tareas y checklist**, abre tus tareas y completa los pasos obligatorios. Si la lista está vacía, usa **Nueva tarea de turno** en esa misma ventana. Si depende de otra tarea, termina primero el antecedente. Puedes agregar una plantilla con un paso por línea o seleccionar una existente.
8. En **Tareas recurrentes**, elige persona, frecuencia, hora y carga opcional. Los días usan 0 domingo a 6 sábado; por ejemplo `1,2,3,4,5` para lunes a viernes. Puedes pausar una programación.
9. Para un regreso, el CSR de VG se escribe manualmente. Una carga relacionada debe estar activa al crear el vínculo; una referencia libre admite datos externos.
10. Antes de salir, prepara el cierre. Indica pendientes críticos (o «Sin pendientes críticos»), quién continúa y la próxima acción con plazo.

## Calendario y listado

En **Calendario**, elige la vista que prefieras:

- **Agenda:** días en filas, con tres movimientos y un desplegable para los demás.
- **Semana:** días en columnas; se adapta a menos columnas en pantallas pequeñas.
- **Lista compacta:** todos los movimientos ordenados por día y hora, sin desplegables.

Cambiar de vista conserva la semana y los filtros. El navegador recuerda la vista por cuenta. **Limpiar filtros** recupera todos los clientes y movimientos, conservando esa vista. Pulsa una carga o apartado para abrir su detalle.

El listado de **Cargas** muestra origen antes de destino y da más espacio al último comentario. Al abrir un detalle o reducir el ancho, los campos se agrupan con etiquetas y los comentarios ocupan la fila completa. La cita de recolección se consulta y edita dentro del detalle.

## Campana personal

Los avisos de cargas se limitan a tus clientes asignados, también para Admin y Supervisor. Consultar otro CSR o seguir una carga de otro cliente no cambia esta regla. Los avisos guardados de clientes ajenos se retiran al actualizar. Las tareas sin carga pueden avisarte si se asignaron directamente a tu cuenta.

## Supervisor: revisar la operación

Consulta el plan, las tareas y los cierres. Comprueba que cada pendiente tenga una próxima acción y una persona asignada. El escalamiento interno requiere que Admin elija destinatario y plazo; no se activa por defecto. Los avisos resueltos o reprogramados dejan de aparecer como vigentes.

La etiqueta **Supervisor** de Abraham y **Admin** de Esteban identifican su función visible. Los permisos efectivos siguen dependiendo de Supabase.

## Admin: mantener el portal

Gestiona cuentas y asignaciones en la administración existente. En **Organizar turno** puedes configurar reglas y equivalencias de clientes, descargar el respaldo completo y revisar un plan manual de archivo/retención. Una equivalencia no cambia textos históricos ni reasigna un cliente con otro CSR; el servidor rechaza asignaciones incompatibles.

Empieza sin reglas de transición nuevas y sin escalamiento hasta definirlos con el equipo. Quitar una regla recupera el avance habitual desde ese estatus. Las reglas también se validan al guardar en la base.

Los envíos externos permanecen apagados hasta elegir canal. La campana y los avisos internos pueden utilizarse sin correo. Leer un aviso no completa su tarea.

Cancelar una carga/solicitud/tarea, liberar un apartado o retirarlo requiere motivo. El historial conserva lo ocurrido. Antes de archivar o eliminar instantáneas de importación, descarga y verifica un respaldo. El archivo mantiene expedientes; eliminar una instantánea impide deshacer esa importación.

## Cliente y gerencia

El Portal Cliente conserva sus cargas, documentos y avisos autorizados. La vista de gerencia es de consulta. Cada vista se entrega en su propio archivo para abrir más rápido. No se comparten contraseñas para revisar lo que ve otra cuenta.

## Fechas, distancias y errores

Las fechas se presentan en hora del centro de México. Un valor ausente se distingue de cero o de un documento pendiente. Los campos de captura conservan el formato del selector.

Las millas indican su fuente y fecha cuando están disponibles. Los mapas abiertos calculan primero; el proceso Google completa trayectos cuando hay cuota. Un estimado en línea recta no se guarda como una ruta medida. Cada sentido del trayecto tiene su propia distancia.

Si un campo marca error, corrígelo antes de guardar. Si otro usuario cambió el registro, actualiza y revisa sus datos. Un aviso de «guardado» aparece después de la confirmación del servidor.
