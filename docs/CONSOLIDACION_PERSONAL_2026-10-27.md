# Consolidación personal — versión 2026.10.27.1

Implementación de R01–R20 de la revisión del 27 de octubre. Aplicación en Google Apps Script, datos y sesión en Supabase. Conserva la operación personal y la preparación manual de mensajes.

## Instalar

1. En Supabase → SQL Editor → New query, copiar y ejecutar **todo** `supabase/actualizar_consolidacion_personal.sql`. Requiere las actualizaciones 001–019. Si están pendientes varias actualizaciones desde 004, usar `supabase/actualizar_sitio.sql` en su lugar; no ejecutar ambos.
2. En el proyecto actual de Apps Script, reemplazar todo el archivo HTML `index` por `google-apps-script/index-sitio.html`.
3. Reemplazar todo `Code.gs` por `google-apps-script/Code-sitio.gs`. Conserva las propiedades del proyecto, el secreto del worker y el disparador horario existentes. No hace falta crear otro disparador.
4. Guardar → Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar. Se conserva el mismo enlace.
5. Recargar el panel. El pie identifica la versión del sitio y la base instalada. No es necesario realizar una ronda de pruebas manuales para instalar.

El código del sitio no ejecuta SQL por sí mismo. Los archivos se entregan para publicar; esta entrega no afirma que el sitio de producción ya esté actualizado.

## Cambios incluidos

| Revisión | Resultado |
|---|---|
| R01 | PTE. ARRIVO inicial corresponde al origen. Los casos con avance incompleto piden confirmar la etapa; no se inventa llegada final. |
| R02 | Equivalencias de clientes aplicadas a cargas, asignaciones y campana sin cambiar permisos. |
| R03 | Catálogo MX/US para dirección de viaje; conserva la excepción de Laredo y Transload. |
| R04 | Truck/Trailer manuales protegidos; reemplazo opcional por campo desde la vista previa. |
| R05 | Criterio común de abierta, entregada con POD y cancelada/finalizada. |
| R06 | Exportación con elección y conteo de vista actual o reporte completo de mis clientes; incluye todas las filas coincidentes antes de paginar. |
| R07 | Cruces históricos ocultos inicialmente y recuperables en preferencias; se conservan las fechas. |
| R08 | Indicadores personales y eliminación del resumen Por CSR en esta versión; Administración y clientes permanecen. |
| R09 | Acción concreta y fecha en Inicio. |
| R10 | Ahora, Programados y Atendidos, con tareas personales y seguimientos; leer avisos no resuelve trabajo. |
| R11 | Truck/Trailer y citas con lectura primero y edición desplegable; tarjetas de altura natural. |
| R12 | Agenda/Semana/Lista, cliente y días vacíos guardados por cuenta en Supabase. |
| R13 | Un solo manejador para copiar mensajes. |
| R14 | Opción de conservar el texto final confirmado, privado y plegado en historial; también en mensajes de varias cargas. |
| R15 | Nombre real del archivo, autor, fecha, cambios antes/después y exclusiones. Deshacer identifica el archivo y conserva la protección contra ediciones posteriores. |
| R16 | Un aviso agrupado por carga; lectura y ocultación por una hora sincronizadas por cuenta. |
| R17 | Términos Load/Pickup/Truck/Trailer y «Histórico de tareas». |
| R18 | Enlaces HTTPS de documentos por carga, con control de versiones y retiro sin borrar el archivo. |
| R19 | Versión del sitio/base, aviso claro de SQL 020 pendiente y acceso al respaldo. |
| R20 | Estado del worker de Google: última ejecución, pendientes, reintentos y cálculos; sin mostrar secretos. |

## Alcance y conservación

- Los documentos se registran como **enlaces**. Los permisos del archivo dependen de su sitio de origen. Registrar un enlace no marca automáticamente el POD como enviado.
- Los mensajes se preparan y envían manualmente por el usuario. Registrar como enviado conserva el texto solo si la casilla está activa. No se habilitan envíos automáticos ni portales.
- Atendidos recientes consulta hasta 50 resultados de tareas y hasta 100 cambios de carga de los últimos 30 días; el histórico completo sigue disponible en cada expediente.
- Lecturas/ocultaciones recuperan las 200 claves más recientes de la cuenta. No cambian el estatus de una carga ni completan tareas.
- La validación rechaza nuevas citas invertidas; no reordena fechas automáticamente ni impide editar campos ajenos a las fechas en registros históricos.
- El worker sigue usando su caché y hasta 20 rutas por ejecución horaria. El tablero describe la cola; no calcula consumo ni cuota restante del plan gratuito.
- SQL 020 conserva los datos de negocio. Solo recalcula el contexto derivado de instructivos afectados por PTE. ARRIVO; ese recálculo puede generar historial normal.
- Conviene descargar un respaldo semanal y antes de una limpieza. La restauración debe ensayarse en otra base, nunca encima de producción.

## Validación de la entrega

- 214 pruebas automáticas aprobadas: reglas, PostgreSQL local, permisos, importaciones y ensayo de restauración con los nuevos enlaces y estados personales.
- 20 comprobaciones de navegador con Supabase simulado: escritorio, móvil, sesiones independientes, documentos, mensajes, importación, exportación y SQL faltante.
- Regresión del menú Mostrar y de los instructivos por ruta aprobada.
- Compilación de los cuatro modos y comprobación de correspondencia entre fuentes, HTML, SQL y ZIP.

No se modificó la base de producción ni se envió ningún mensaje externo durante estas comprobaciones.

[Vista de Inicio](imagenes/consolidacion-personal-inicio.png) · [Vista móvil](imagenes/consolidacion-personal-movil.png) · [Evidencia de navegador](evidencia-consolidacion-personal.json).
