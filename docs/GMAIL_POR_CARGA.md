# Gmail manual por carga — 2026.10.27.4

Esta entrega simplifica la versión anterior. No requiere Google Cloud, OAuth, secretos ni desplegar `panel-gmail`. El panel no consulta Gmail y nunca envía correos.

## Actualizar en dos pasos

Si ya tienes SQL 020 (la entrega `d3f9477`), no necesitas ejecutar SQL nuevo:

1. Copiar todo `google-apps-script/index-sitio.html` al archivo HTML `index` del proyecto actual de Apps Script.
2. Guardar y publicar una nueva versión de la implementación actual. Recargar: el pie muestra **v2026.10.27.4**.

Se conserva `Code.gs`, su cuenta propietaria, la autenticación de Supabase y el enlace actual del panel. Si no instalaste la integración anterior, omite completamente SQL 021 y la configuración OAuth. La entrega conjunta vuelve a usar 004–020. SQL 021 se conserva solo como historial de la entrega anterior; no se borran tablas ni datos que ya pudieran existir. La función Edge anterior ya no forma parte del código ni del paquete activo; si llegaste a desplegarla, puedes eliminar `panel-gmail` desde Edge Functions en Supabase y revocar su permiso en Google. Este cambio de HTML no elimina servicios remotos.

## Uso diario

En una carga, abrir **Comunicación → Gmail manual de esta carga**:

1. Guardar la liga del hilo abierto en Gmail. Se aceptan las ligas modernas de Gmail; no se consulta la API.
2. Pulsar **Preparar respuesta** e indicar remitente, Para, CC, asunto y mensaje.
3. Revisar todos los campos en la vista previa.
4. Pulsar **Copiar mensaje** y **Abrir este hilo en Gmail**.
5. En Gmail, elegir la cuenta correcta, pulsar Responder y revisar allí destinatarios, CC, asunto y texto. Enviar desde Gmail.
6. Regresar al panel, marcar **Ya envié este correo desde Gmail** y pulsar **Registrar confirmación manual**.

La dirección remitente es indicada por el usuario, no verificada por Google. Abrir un enlace usa la cuenta que esté abierta en Gmail; comprobarla antes de enviar. El mensaje no se inserta automáticamente en el hilo. Preparar o copiar no acredita un envío. El registro dice **Envío confirmado manualmente por el usuario** y guarda autor, fecha, remitente indicado, destinatarios, CC, asunto, liga y texto.

Las preparaciones se conservan solo mientras siga abierta la sesión del panel; recargar pierde las preparaciones sin confirmar. Las ligas y las confirmaciones sí se guardan en Supabase. Si cambió la carga después de preparar, actualizar y preparar otra vez antes de registrar la confirmación.

## Datos y duplicados

Se reutilizan `load_document_links`, `communications`, `ops_save_document_link` y `ops_record_manual_notice` de SQL 020. La liga se registra como documento Otro con nombre **Hilo Gmail (manual)**, por autor. El historial general de comunicación y el respaldo existente incluyen estos datos. Se conservan los permisos de la carga y de los enlaces: no se crean enlaces públicos ni se comparte el acceso a la cuenta Google.

El compositor bloquea doble clic. El adaptador serializa confirmaciones, consulta el historial y evita registrar dos veces un mensaje idéntico con los mismos campos y liga. La versión de la carga impide que dos pestañas con la misma preparación registren confirmaciones simultáneas. Si se pierde la respuesta de Supabase, Actualizar recupera el registro y evita repetirlo. El panel no puede impedir que alguien envíe dos correos directamente en Gmail ni comprobar que lo haya enviado realmente.

El registro manual utiliza el mismo indicador de cliente avisado que el resto de las comunicaciones manuales; únicamente debe confirmarse después de enviar. WhatsApp conserva su compositor, su canal y su confirmación manual.

## Fuente y verificación

- `web/src/original/gmail/manual.js`: validación, liga y texto del registro.
- `gmail/api.js`: adaptador de SQL 020; no llama a Edge ni a Google.
- `gmail/ui.js`: preparación, revisión, copia, enlace y confirmación manual.
- `web/test/gmail*.test.js`: reglas, permisos, registro sin duplicados e interfaz con datos simulados. Las pruebas de SQL 021 corresponden a la entrega histórica.
- `node scripts/check_browser.mjs --gmail-only`: recorrido del HTML entregable con Supabase simulado y Gmail bloqueado. [Evidencia](evidencia-gmail.json).

Verificación: `npm --prefix web test`, `npm --prefix web run build`, `python scripts/package_site.py` y `python scripts/package_site.py --check`. No se envían correos reales.
