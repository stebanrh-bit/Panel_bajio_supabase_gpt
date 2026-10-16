# Corregir «Contenido HTML incorrecto» al cargar el documento del Radar

El mensaje reportado comienza con `Exception: Contenido HTML incorrecto` seguido del programa del lector. El lector se entregaba como JavaScript sin contenedor HTML y `HtmlService.createHtmlOutputFromFile("lector")` lo analizaba como una página antes de devolverlo al navegador.

La entrega ahora guarda el programa como JSON dentro de HTML válido. Los caracteres que podrían crear etiquetas están escapados. El navegador recupera el programa original y lo ejecuta en su Worker de lectura. La función pública `panelFileReader` existente sigue devolviendo el recurso fijo. Si hay archivos desactualizados o Google rechaza el recurso, aparece una instrucción legible, sin volcar todo el código.

## Actualizar los dos archivos de Google

1. Abre [index-sitio.html actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html), copia todo y reemplaza el contenido completo de **index.html** en tu proyecto Google Apps Script.
2. Abre [lector.html actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/lector.html), copia todo y reemplaza el contenido completo de **lector.html**. Si falta ese archivo, créalo con **+ → HTML → lector**.
3. Guarda ambos archivos. Se deben instalar juntos; cambiar solo uno deja versiones incompatibles.
4. En **Implementar → Administrar implementaciones → lápiz**, elige **Nueva versión** y pulsa **Implementar**. Conserva la implementación actual y su enlace.
5. Abre tu enlace habitual y actualiza con **Ctrl+Shift+R**.

Esta corrección requiere esos dos HTML. Code.gs, las funciones de Supabase y el esquema de la base conservan su versión actual. Continúan la captura manual del CSR de VG y la retirada de Contactos VG.

## Comprobaciones automáticas

- 145 pruebas del proyecto aprobadas. Dos pruebas nuevas cubren el contenedor HTML, Unicode, cierres de etiquetas y errores de HtmlService con reintento.
- Chromium con Workers reales, puente de Google simulado y PostgreSQL efímero: selección desde Subir Excel VanGuard, lectura de XLSX y XLS reales, dos registros guardados por archivo y recuperación desde la base después de eliminar la copia local y recargar.
- Revisión de compatibilidad del mismo lector con la importación general CSV/XLSX/XLS.
- Paquete de entrega verificado con `scripts/package_site.py --check`.

La evidencia del Radar está en [evidencia-radar-lector-2026-10-16.json](evidencia-radar-lector-2026-10-16.json). Estas comprobaciones no acceden a la cuenta de Google ni al Supabase del usuario. La ronda de pruebas manuales permanece suspendida hasta nuevo aviso.
