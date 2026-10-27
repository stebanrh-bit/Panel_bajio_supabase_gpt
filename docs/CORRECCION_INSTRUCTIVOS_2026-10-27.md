# Guardar y buscar instructivos — versión 2026.10.27.5

Corrección del acceso «Instructivo por definir» en el detalle de una carga. Conserva Supabase, los instructivos existentes y la publicación manual en Google Apps Script.

## Qué ocurría

El editor comenzaba en Borrador y cerraba la ventana al guardar sin confirmar ese estado. El borrador sí se guardaba, pero todavía no podía aplicarse a las cargas. «Buscar instructivo aprobado» intentaba aplicar directamente la coincidencia de la base, sin presentar resultados ni explicar si solo había un borrador.

## Comportamiento actual

- El botón distingue **Guardar borrador**, **Guardar y publicar** y **Guardar pausado**, según «Uso del instructivo». La ayuda explica el efecto antes de guardar.
- El resultado confirma el nombre y el estado guardados. Un Admin puede pulsar **Revisar y publicar** para abrir el mismo borrador, conservar sus indicaciones y revisar su publicación. Abrirlo o cancelar no lo publica.
- **Buscar instructivo aprobado** solo consulta. Muestra el instructivo coincidente y sus etapas antes de ofrecer **Aplicar a esta carga**.
- Si solo hay borradores o instructivos pausados de esa ruta, se muestran con su estado y un acceso a revisión para quien pueda editarlos. Si no hay coincidencias, se explica el resultado y se ofrecen la biblioteca y la creación para esa ruta.
- Se respetan los alias explícitos de clientes, ciudades y estados normalizados, la prioridad del cliente sobre una ruta general y las coincidencias ambiguas. Supabase conserva la decisión final y los permisos. La búsqueda no amplía coincidencias a otros estados o ciudades.
- Un fallo al guardar conserva el formulario; un doble envío no duplica la solicitud. Si falla la recarga de la biblioteca después de guardar, se informa que el guardado ya se confirmó.
- Aplicar usa la versión leída de la carga: una edición posterior produce un mensaje para actualizar antes de continuar. Las excepciones particulares se conservan.
- Al crear desde una ruta de importación reconocida se presentan inicialmente sus etapas; el recorrido sigue siendo editable.

## Instalar

1. Abrir `google-apps-script/index-sitio.html` de esta entrega y copiar todo.
2. En el proyecto actual de Google Apps Script, reemplazar todo el contenido del archivo HTML **index**.
3. Guardar → **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar**.
4. Recargar el panel con **Ctrl + Shift + R**. El pie debe identificar **v2026.10.27.5**.

No requiere ejecutar SQL nuevo ni reemplazar Code.gs. Se conserva el esquema 020 existente. Un borrador anterior puede revisarse y publicarse desde la biblioteca; no es necesario capturarlo otra vez.

## Verificación

223 pruebas automáticas aprobadas, incluidas coincidencias y recorrido, reglas y permisos de PostgreSQL local. El recorrido del HTML entregable en Chromium con Supabase simulado supera 11 comprobaciones. Incluye guardado fallido y reintento, envío doble, recuperación del borrador, revisión sin publicación, publicación, búsqueda sin escritura, aplicación y conflicto de versión. La ventana de resultados se comprueba en anchos de 320, 390 y 1533 píxeles. También se verifica la conservación del correo manual, sin acceso a Gmail.

Reproducir: `node --test --test-concurrency=2 web/test/*.test.js`, `npm --prefix web run build`, `python scripts/package_site.py --check` y `node scripts/check_browser.mjs --internal-only` con la vista previa local iniciada.

Esta verificación no escribe en producción ni publica automáticamente el sitio. [Evidencia](evidencia-correccion-instructivos.json) · [Vista de la búsqueda](imagenes/instructivo-busqueda-aprobado.png).
