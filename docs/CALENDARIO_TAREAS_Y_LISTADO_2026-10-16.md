# Calendario, tareas y listado — 16 de octubre de 2026

## Cambios preparados

| Lugar | Comportamiento |
| --- | --- |
| Calendario | Botones Agenda, Semana y Lista compacta. Agenda organiza los días en filas; Semana compara días en columnas adaptables; Lista compacta muestra todos los movimientos sin desplegables. |
| Preferencias | Cambiar de vista conserva semana, cliente y tipo de movimiento. El navegador recuerda la elección por cuenta. Limpiar filtros conserva la vista elegida. |
| Detalle de carga | Una sola acción **Crear tarea** sustituye Marcar pendiente y Asignar a alguien en especial, también en las tarjetas. |
| Asignación | Dentro de la tarea se elige una persona específica o quien cubra al CSR del cliente. El segundo destino solo se ofrece si todas las cargas seleccionadas tienen el mismo CSR; quitar o cambiar la selección vuelve a calcularlo. Las tareas existentes conservan su destino. |
| Seguimiento programado | Estado visible **Programado para**, **Pendiente de atender** o **Sin seguimiento programado**. La fecha indica cuándo atender; al vencer no se elimina ni se completa automáticamente. Al terminar se pulsa **Completar seguimiento**; si falta trabajo se usa **Reprogramar**. |
| Cierre del seguimiento | Espera visible, botones bloqueados mientras se confirma y recuperación tras un error. Completarlo actualiza Inicio y conserva la revisión de tránsito y los avisos de comunicación con el cliente. |
| Listado | Origen antes de destino. Se retira la columna Recolección · cita, que permanece editable en el detalle. Último comentario recibe más ancho y sigue visible al abrir el detalle. |
| Pantallas pequeñas y detalle abierto | El ancho disponible de la lista decide si sus ocho columnas se muestran como tabla o se agrupan con etiquetas. Origen y destino quedan juntos; el comentario ocupa una fila completa. Sin scroll lateral. |

Las cargas, sus fechas, tareas previas y permisos se conservan. Esta actualización no cambia SQL, las cuotas de Maps ni el alcance personal de la campana.

## Comprobación local

- 152 pruebas Node aprobadas, ninguna fallida, cancelada u omitida.
- Cinco escenarios nuevos de navegador: conservación de registros en tres vistas y seis anchos (18 combinaciones), filtros y preferencia al recargar, columnas con detalle abierto, destinos de tarea distintos y ciclo de seguimiento con error/reintento/cierre/reprogramación.
- Regresión del navegador: once escenarios de revisión general, campana de tres cuentas, filtros de calendario, 26 combinaciones de listado con/sin detalle, importaciones CSV/XLSX/XLS y recordatorios independientes. Sin errores JavaScript.
- Compilación de las cuatro entradas y correspondencia entre HTML entregado y ZIP.

Los datos de las capturas son ficticios. Los recorridos de navegador interceptan Supabase; no escriben en producción. Las pruebas manuales siguen canceladas. La instalación de Google se realiza con los pasos siguientes.

[Evidencia](evidencia-calendario-tareas-2026-10-16.json).

## Actualizar Google Apps Script

Si ya instalaste la revisión general, esta entrega requiere únicamente **index.html**:

1. Abre [el HTML actualizado del panel](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html) y copia todo con **Ctrl+A → Ctrl+C**.
2. En el proyecto Google existente, abre **index.html**, selecciona todo y pega el código. Guarda.
3. Ve a **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**.
4. Abre el enlace habitual del panel y recarga con **Ctrl+Shift+R**.

No requiere ejecutar SQL ni cambiar Code.gs, lector.html, index-cliente.html o index-gerencia.html. La página publicada incorpora los cambios después de actualizar el archivo y la versión de su implementación.

## Capturas

- [Agenda](imagenes/calendario-vista-agenda.png).
- [Semana](imagenes/calendario-vista-week.png).
- [Lista compacta](imagenes/calendario-vista-list.png).
- [Listado con origen y comentarios](imagenes/cargas-origen-comentarios.png).
- [Estado de seguimiento](imagenes/seguimiento-estado.png).
