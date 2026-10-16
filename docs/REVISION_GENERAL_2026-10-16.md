# Revisión general del panel

Fecha: 16 de octubre de 2026, hora del centro de México. Base: `98bd631`, rama `supabase-inicial`.

La revisión recorre Inicio, Cargas, Calendario, Indicadores, Apartados, Radar, Histórico, Organizar turno, administración, Portal Cliente y Gerencia. Se revisaron las fuentes activas y los flujos locales con datos ficticios. Esta revisión no accede a la sesión privada del sitio publicado ni cambia registros de Supabase.

## Mejoras aplicadas

| Área | Problema encontrado | Resultado |
| --- | --- | --- |
| Búsqueda de Inicio | Escape ocultaba resultados, pero Enter podía abrir uno oculto. Flecha arriba empezaba en una posición incorrecta. | Solo se abre un resultado visible; selección con flechas, posición anunciada y desplazamiento al resultado elegido. |
| Formularios | Los errores podían duplicarse entre validadores y dejar referencias accesibles obsoletas. | Un mensaje por campo, foco en el primer error, limpieza al corregir y conservación de las ayudas del campo. Se mantiene el rechazo de datos inválidos antes de guardar. |
| Histórico | Un intervalo de fechas invertido parecía una búsqueda sin resultados. | Mensaje junto a Hasta; se pide corregir el rango antes de consultar y se conservan las fechas capturadas. |
| Histórico | Una respuesta antigua podía reemplazar un filtro más reciente. | Solo la consulta vigente puede actualizar la lista. |
| Histórico | El fallo dejaba una tabla vacía y no había un reintento propio. | Error explícito, botón Actualizar que conserva filtros y paginación recuperable tras un fallo. |
| Organizar turno | No informaba de la espera y una apertura pendiente podía terminar después de salir de la cuenta. | Botón con estado Abriendo turno, fallo visible con reintento y descarte de la respuesta tras cerrar sesión. |
| Campana | Avisos de tareas vinculadas podían llevar al expediente de la carga y los textos confundían tarea con revisión. | Los avisos de tareas, locales y del servidor, abren su tarea. Las revisiones abren el expediente y explican qué revisar. Se conserva la regla de clientes propios. |
| Portal Cliente | Una respuesta lenta podía pintar un embarque distinto del abierto más recientemente; durante la espera quedaban avisos del anterior. | Se descartan respuestas anteriores al cambiar o volver a la lista. Los avisos antiguos se sustituyen por un estado de carga y se informa de la espera. |
| Radar y textos | Se llamaba exacta a una estimación, se describían todas las distancias como línea recta y aún se mencionaban hojas de Sheets. | Se distingue ruta por carretera de aproximación, se pide revisar fuente y fecha y se habla de la base de datos. Apartados aclara que la campana depende del cliente propio. |
| Plan del día | Se repetía el formato y cálculo de clasificación al ordenar, contar y filtrar. | La clasificación se calcula una sola vez por carga y por render. Conserva el plan compacto, trailer/truck visibles y acciones desplegables. |

## Verificación local

- **152 pruebas Node aprobadas**, ninguna fallida u omitida; incluyen PostgreSQL efímero y tres nuevas pruebas de validación.
- Recorrido general de navegador: once comprobaciones de comportamiento y **28 combinaciones de sección y ancho** (siete secciones a 1440, 768, 390 y 320 px).
- Regresión funcional: campana de tres cuentas con clientes distintos, reasignación, calendario con 29 movimientos, listado sin scroll en 26 combinaciones, importaciones CSV/XLSX/XLS y seguimientos independientes.
- Nueve flujos de organización con guardado real en PostgreSQL local: tareas, checklist, recurrencia, configuración y datos de texto adversos.
- Compilación de las cuatro entradas y comprobación de correspondencia entre HTML, SQL y ZIP.

[Evidencia detallada](evidencia-revision-general-2026-10-16.json). Las comprobaciones de navegador interceptan Supabase; no escriben en producción. No se repitió la batería de comparación exacta de píxeles. Las pruebas manuales continúan canceladas por indicación del usuario. Las cuotas reales y la instalación Google se comprueban en su entorno publicado, no desde estas muestras locales.

## Actualizar Google Apps Script

Esta actualización añade un cambio en Portal Cliente y requiere **dos archivos**:

1. Abre [el panel actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html). Copia todo con **Ctrl+A → Ctrl+C**, pégalo en **index.html** del proyecto Google existente y guarda.
2. Abre [el Portal Cliente actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-cliente.html). Copia todo y reemplaza el archivo **index-cliente.html** de ese mismo proyecto. Guarda.
3. Ve a **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**, conservando la misma implementación.
4. Abre el enlace habitual y recarga con **Ctrl+Shift+R**.

No requiere ejecutar SQL ni cambiar Code.gs, index-gerencia.html o lector.html. La página publicada solo incorpora estos cambios después de actualizar esos dos archivos y la versión de la implementación.
