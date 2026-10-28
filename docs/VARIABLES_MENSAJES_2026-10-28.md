# Variables para mensajes y comentarios — versión 2026.10.28.2

Un catálogo compartido de 52 variables, agrupadas en siete categorías, reemplaza el menú limitado de 13 opciones. «Último comentario» aparece al principio, junto con su fecha y autor.

## Uso

- **Generar actualización para cliente:** el menú junto al mensaje inserta el dato real en la posición del cursor. No borra el resto de lo que escribiste.
- **Plantillas:** el menú inserta un marcador como `{{last_comment}}`. Al generar el mensaje se sustituye por el comentario actual de esa carga. Se conservan las plantillas anteriores y el significado de sus marcadores.
- **Comentarios:** el mismo menú está disponible en el expediente y en la ventana de comentarios de una carga. Inserta el dato real; hay que pulsar Guardar/Ingresar comentario para registrarlo. Las solicitudes sin número de carga conservan su editor habitual.

Ejemplo de plantilla:

```text
Actualización de la carga {{load_number}} · Trailer {{trailer}}
{{last_comment}}
```

La consulta de «Último comentario» recupera una sola fila de la carga seleccionada, ordenada por fecha e identificador. Respeta los permisos de Supabase. No utiliza comentarios de otra carga ni elimina saltos de línea. El texto del comentario se inserta literalmente: si contiene llaves o símbolos, no se vuelve a interpretar como otra plantilla.

Si no hay comentarios registrados se muestra **Sin comentarios registrados**. Un error de consulta conserva el texto y muestra el fallo; no afirma que no haya comentarios. Las respuestas tardías no sobrescriben lo que el usuario haya editado mientras se consultaba.

También se reconocen `{{ultimo_comentario}}` y `{{latest_comment}}` como equivalentes de `{{last_comment}}` al escribir manualmente una plantilla. Las fechas usan la hora del centro de México.

## Actualizar

1. Copiar todo `google-apps-script/index-sitio.html` de esta entrega al archivo HTML **index** de Apps Script.
2. Guardar → **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar**.
3. Recargar. El pie identifica **v2026.10.28.2**.

No requiere SQL nuevo ni cambiar Code.gs. La preparación, el envío y el registro de mensajes siguen siendo manuales.

## Fuente y comprobaciones

`web/src/original/message-variables.js` mantiene catálogo, valores, menús y sustitución en una sola pasada. La interfaz compartida los aplica en `panel/05_workspace.js`. El adaptador `getUltimoComentarioCarga` consulta solo una fila al usar datos del último comentario; los datos operativos ya cargados no agregan consultas.

Las pruebas de reglas verifican catálogo completo, texto literal, variables anteriores, fechas de México, cero, documentos y filtros de la consulta. El recorrido de navegador usa Supabase simulado y comprueba inserción en mensaje/comentarios, edición durante una respuesta tardía, nuevo comentario confirmado, guardado y recuperación de plantillas y anchos móviles.

Verificación final: 234 pruebas automáticas aprobadas y siete comprobaciones de navegador. Se comprueba también que cambiar de carga durante una consulta no inserte el comentario anterior en el nuevo expediente y que un fallo al generar conserve el borrador.

Reproducir: `node --test --test-concurrency=2 web/test/*.test.js`, `npm --prefix web run build`, `python scripts/package_site.py --check` y, con la vista previa local iniciada, `node scripts/check_browser.mjs --message-variables-only`.

[Evidencia de navegador](evidencia-variables-mensajes.json). No se escriben datos de producción ni se envían mensajes reales durante estas comprobaciones.

## Catálogo disponible

| Categoría | Variable | Marcador |
|---|---|---|
| Comentarios | Último comentario | `{{last_comment}}` |
| Comentarios | Fecha del último comentario | `{{last_comment_at}}` |
| Comentarios | Autor del último comentario | `{{last_comment_by}}` |
| Carga y cliente | Carga (texto) | `{{load}}` |
| Carga y cliente | Load (número) | `{{load_number}}` |
| Carga y cliente | Cliente | `{{customer}}` |
| Carga y cliente | Work order | `{{work_order}}` |
| Carga y cliente | Estatus | `{{status}}` |
| Carga y cliente | Etapa | `{{stage}}` |
| Ruta y unidad | Ruta completa | `{{route}}` |
| Ruta y unidad | Origen completo | `{{origin}}` |
| Ruta y unidad | Ciudad de origen | `{{origin_city}}` |
| Ruta y unidad | Estado de origen | `{{origin_state}}` |
| Ruta y unidad | Dirección de origen | `{{origin_address}}` |
| Ruta y unidad | Destino completo | `{{destination}}` |
| Ruta y unidad | Ciudad de destino | `{{dest_city}}` |
| Ruta y unidad | Estado de destino | `{{dest_state}}` |
| Ruta y unidad | Dirección de destino | `{{dest_address}}` |
| Ruta y unidad | Truck | `{{truck}}` |
| Ruta y unidad | Trailer | `{{trailer}}` |
| Ruta y unidad | Liga de tracking | `{{tracking}}` |
| Fechas | Pickup (cita) | `{{pickup}}` |
| Fechas | Recolección real | `{{pickup_actual}}` |
| Fechas | Entrega (cita) | `{{delivery}}` |
| Fechas | Entrega real (frase) | `{{delivery_actual}}` |
| Fechas | Entrega real (fecha) | `{{delivery_actual_at}}` |
| Fechas | Salida de planta (fecha guardada) | `{{departure}}` |
| Fechas | Cruce a USA (frase) | `{{crossing}}` |
| Fechas | Cruce a USA (fecha guardada) | `{{crossing_at}}` |
| Fechas | ETA / nota de llegada | `{{eta_note}}` |
| Fechas | Última actualización de la carga | `{{updated_at}}` |
| Documentos | Estado de documentación | `{{doc_status}}` |
| Documentos | BOL | `{{bol}}` |
| Documentos | DODA | `{{doda}}` |
| Documentos | Entry | `{{entry}}` |
| Documentos | Sobre de documentos | `{{sobre_listo}}` |
| Documentos | POD enviado | `{{pod_sent}}` |
| Documentos | Pedimentos | `{{pedimentos}}` |
| Documentos | Exportación | `{{exportacion}}` |
| Documentos | Importación | `{{importacion}}` |
| Documentos | Regresos | `{{regresos}}` |
| Seguimiento | Motivo de actualización (frase) | `{{reason}}` |
| Seguimiento | Motivo de actualización (texto) | `{{reason_text}}` |
| Seguimiento | Fecha del seguimiento programado | `{{next_review_at}}` |
| Seguimiento | Qué revisar en el seguimiento | `{{next_review_note}}` |
| Seguimiento | Pendiente puntual vigente | `{{punctual_note}}` |
| Seguimiento | Instrucción de la etapa | `{{instruction_action}}` |
| Seguimiento | Número de incidencias | `{{incident_count}}` |
| Millas y cargos | Millas cargadas | `{{loaded_miles}}` |
| Millas y cargos | Millas vacías | `{{empty_miles}}` |
| Millas y cargos | RPM | `{{rpm}}` |
| Millas y cargos | Cargos | `{{charges}}` |
