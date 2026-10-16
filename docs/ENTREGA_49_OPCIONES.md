# Las 49 opciones seleccionadas

Esta entrega conserva Supabase como base y Google Apps Script como alojamiento. Los cambios están preparados en la rama `supabase-inicial`; el enlace publicado no cambia hasta actualizarlo con [estas instrucciones](INSTALAR_SITIO.md).

## Decisiones aplicadas

- CSR consulta **toda la operación**. «Mis clientes» es un filtro de trabajo, no una restricción de acceso. Admin y Supervisor conservan la consulta general.
- Los envíos externos quedan **desactivados** hasta elegir canal. Hay tareas y avisos internos programables; no se agregó envío automático de correos. Las funciones SQL de reserva de avisos quedan preparadas para una integración posterior.
- Los estatus y la revisión de tránsito de tres horas conservan sus reglas actuales. Admin puede configurar transiciones y escalamiento. El escalamiento comienza apagado y no hay borrado automático.
- Se conservan Admin para Esteban y Supervisor para Abraham. Esas etiquetas no alteran los permisos almacenados.
- El CSR externo de VG sigue siendo texto manual. La agenda es opcional y no crea cuentas.

## Dónde están las funciones

Abre **Organizar turno** en el encabezado. Incluye tareas y checklist, programaciones, contactos VG, referencias de regreso y avisos. Admin también tiene reglas, equivalencias de clientes y respaldo/archivo. «Guía de uso» explica los conceptos sin salir del panel.

En Inicio, el plan separa urgente/vencido, hoy/después y futuro. Las revisiones operativas, seguimientos personales y avisos al cliente conservan acciones independientes. En Cargas puedes combinar filtros, verlos como etiquetas y limpiarlos; la tabla prioriza carga, cliente, estatus y entrega. El trailer conserva su ancho y el desplazamiento horizontal dentro del listado.

Las tareas recurrentes usan hora del centro de México. El proceso horario de millas también comprueba programaciones cuando se actualiza `Code.gs` y SQL 012. Si ya estaba activado, conserva su activador. Si estuvo detenido, genera una sola ocurrencia atrasada y continúa con el próximo horario. Una carga entregada/cancelada detiene las siguientes ocurrencias asociadas. «Comprobar programaciones ahora» permite una ejecución manual de Admin.

## Alcance por opción

| Código | Resultado |
|---|---|
| M01 | Texto y atributos escapados, enlaces HTTP(S), selectores escapados y listas por claves seguras. |
| M02 | Los CSV neutralizan texto que Excel interpretaría como fórmula; conservan números negativos válidos. |
| M04 | Respaldo v2 incluye radar, rutas, preferencias y nuevas tablas; ensayo de restauración local con relaciones. |
| M05 | Coordenadas por llaves y rutas por origen; no se descarga el catálogo completo al consultar un trayecto. |
| M06 | A→B y B→A guardan mediciones independientes. |
| M07 | Cargas nuevas, modificadas, archivadas o eliminadas se sincronizan por revisión y páginas. |
| M08 | El resumen consulta solo el último comentario por carga/solicitud. |
| M09 | Supabase calcula el contador de incidencias activas sin descargar todas las incidencias. |
| M10 | Las comunicaciones por cliente se filtran en el servidor. |
| M11 | Historial de carga y apartado por páginas al abrir; tareas muestran los últimos cambios bajo demanda. |
| M12 | Las tareas abiertas y el histórico por periodo se filtran en Supabase; el histórico tiene páginas. |
| M13 | Eventos administrativos: máximo 100 por consulta; cierres: últimos 30 desde el servidor. |
| M14 | CSV/XLSX/XLS se procesan en Worker con progreso, cancelación y límite de tiempo. |
| M15 | El acceso por nombre consulta hasta dos coincidencias mediante RPC privada del servidor. |
| M17 | Contadores de revisión sustituyen agregados globales durante el sondeo. |
| M18 | Pestañas de fondo coordinan sondeos por sesión; foco y actualización explícita recuperan datos. |
| M19 | Lecturas con columnas definidas; procedencias del expediente se consultan al abrir. |
| M20 | Paquetes de entrega comprimidos; fuentes mantenidas legibles y comentadas. |
| M21 | Panel, cliente y gerencia se entregan por separado; lector de Excel bajo demanda. |
| M22 | Listas conservan nodos al insertar/reordenar; el detalle sin cambios conserva sus controles. |
| M23 | Índices para historial, comentarios, rutas, tareas y acceso; planes EXPLAIN locales guardados. |
| M24 | Política configurable y vista previa manual para archivar cargas y retirar instantáneas antiguas. Sin ejecución automática. |
| M25 | Consultas externas con plazo y cancelación; no se presentan resultados de direcciones que ya cambiaron. |
| M28 | GitHub Actions instala con lockfile, prueba, compila y verifica SQL/HTML/ZIP. |
| M30 | Interfaz distribuida por áreas, con módulos separados de datos, formularios, seguridad, red, fechas y lector. |
| C01 | Etiquetas principales uniformes: carga, unidad, trailer y cita. |
| C02 | Inicio presenta un plan del día con urgente, hoy y futuro. |
| C03 | Transiciones configurables; no se endurecen las reglas actuales por defecto. |
| C04 | Expediente distingue etapa, prioridad y motivos de atención. |
| C05 | Diálogos con espacio, contraste, foco y acciones consistentes. |
| C06 | Avisos no urgentes permanecen en la campana mientras escribes; los errores siguen visibles. |
| C07 | Revisión operativa y seguimiento personal se explican y completan por separado. |
| C11 | Toda la operación disponible para CSR, con filtro «Mis clientes». |
| C12 | Cierre con pendientes críticos, persona a cargo y próxima acción. |
| C13 | Un plazo vencido permanece hasta atenderlo; renovar o completar retira el aviso anterior. |
| C14 | Formularios con validación junto al campo; SQL vuelve a validar antes de guardar. |
| C17 | Fuente y fecha de cálculo de millas; se distingue estimado, mapas abiertos y Google. |
| C18 | Apartado distingue carga relacionada, referencia libre y contacto externo. |
| C19 | Equivalencias de clientes para nuevas capturas; los datos históricos no se reescriben. Un nombre principal nuevo hereda el mismo CSR del alias. |
| C21 | Filtros activos visibles y acción para limpiarlos. |
| C22 | Fechas legibles en hora del centro de México, sin cambiar los instantes guardados; cero se distingue de ausencia. |
| C23 | Tabla ordenada por decisiones: carga, cliente, estatus, entrega, trailer y destino. |
| C24 | Cancelar, liberar o retirar exige motivo y conserva el expediente/historial. |
| C30 | Guía dentro del panel y manual por función del equipo. |
| F04 | Escalamiento interno configurable a una cuenta de supervisión; comienza desactivado. |
| F05 | Tareas diarias/semanales con persona, horario, carga opcional y pausa. |
| F06 | Checklist obligatorio/opcional y dependencias; el servidor bloquea ciclos y cierres incompletos. |
| F08 | Cola y avisos preparados; envío externo desactivado hasta elegir canal. |
| F18 | Agenda VG opcional, con edición y baja sin convertir contactos en usuarios. |

## Verificación y límites

Las pruebas automatizadas usan PostgreSQL efímero y peticiones interceptadas; no modifican tu Supabase. El navegador compara las tres vistas y sus ventanas, y verifica las pantallas nuevas con persistencia en PostgreSQL local. El respaldo se restaura en una segunda base efímera. Los resultados definitivos están en [el registro por opción](IMPLEMENTACION_49_OPCIONES.json) y [la validación de esta entrega](VALIDACION_49_OPCIONES.md).

Los planes [EXPLAIN](evidencia-consultas-49.json) utilizan 100 cargas, 50 100 cambios y 10 000 rutas sintéticas. Son evidencia de consultas e índices, no una promesa de consumo en producción. Las revisiones se ordenan mediante bloqueo transaccional para evitar perder cambios al avanzar el cursor; la prueba de carga real debe considerar importaciones y usuarios simultáneos.

El respaldo contiene información operativa y datos de contacto: guárdalo en un lugar privado. No contiene contraseñas, sesiones de Auth, secreto del worker ni su configuración. El ensayo local simula identidades y no restaura credenciales de Supabase Auth. En una recuperación real se deben preparar las identidades y permisos en una base separada antes de publicar.

La retención no borra cargas: archiva las terminadas con POD o recargos confirmados. Retirar instantáneas antiguas sí elimina la posibilidad de deshacer esas importaciones, por lo que muestra los IDs, exige verificar un respaldo y comprueba que la vista previa siga vigente.

La instalación y las pruebas finales con tus cuentas reales se hacen después de actualizar Google y Supabase. La conectividad, cuotas y autorizaciones de tu cuenta Google solo se validan allí.
