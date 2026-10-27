# Gmail por carga — 2026.10.27.3

Parte de `d3f9477`, rama `supabase-inicial`. WhatsApp conserva su compositor y confirmación manual.

## Diseño e identidad

Apps Script continúa publicado como su propietario y solo aloja el panel. **No agregar GmailApp, MailApp ni permisos de Gmail a ese proyecto.** La cuenta propietaria de Apps Script puede ser distinta de la cuenta del operador.

Cada sesión de Supabase conecta su propio Gmail mediante OAuth de Google. La pantalla de consentimiento permite elegir la cuenta y el panel muestra su dirección. Supabase sigue autenticando usuarios y comprobando rol Admin/CSR, estado activo y clientes asignados en cada operación. Conectar Google no sustituye el acceso al panel. Si se usa un Gmail distinto del correo de acceso de Supabase, el remitente visible y confirmado es siempre el Gmail seleccionado.

La función Edge `panel-gmail` conserva los refresh tokens cifrados con AES-GCM. La clave está en secretos de Supabase, separada de la base; el navegador y Apps Script nunca reciben tokens de Google ni claves privilegiadas. El callback usa estado aleatorio de un solo uso con vencimiento de diez minutos y PKCE. No redirige a destinos proporcionados por el navegador. El consentimiento solicita `gmail.readonly` y `gmail.send`: lectura para seleccionar el hilo y reconciliar resultados, envío solo por confirmación.

El respaldo completo del panel incluye las ligas y la bandeja de respuestas, con su estado persistente. Excluye las conexiones cifradas y los estados OAuth: tras restaurar una base se reconecta Gmail. Una reserva incierta restaurada conserva el bloqueo.

## Instalar

1. Ejecutar **todo** `supabase/migrations/021_gmail_per_load.sql` sobre la instalación 001–020. La entrega conjunta `actualizar_sitio.sql` también incluye 021. No ejecuta envíos ni modifica cargas existentes.
2. En un proyecto Google Cloud habilitar Gmail API y configurar la pantalla de consentimiento. Crear un cliente OAuth de tipo **Aplicación web**. Agregar como URI de redirección exacta `https://TU_PROYECTO.supabase.co/functions/v1/panel-gmail/callback`. No se necesita un origen JavaScript de Apps Script: el intercambio ocurre en Edge.
3. Configurar los usuarios de prueba de Google mientras la aplicación esté en pruebas. Para distribución general completar la publicación/verificación que Google exija para estos alcances. En modo de prueba Google puede vencer las autorizaciones y pedir reconectar.
4. En secretos de Supabase configurar `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` y `GMAIL_TOKEN_KEY`. Generar esta última con `openssl rand -base64 32` y guardarla de forma privada. No guardarla en Git ni enviarla al navegador. Rotarla requiere desconectar y reconectar las cuentas o migrar el cifrado previamente.
5. Desplegar `supabase functions deploy panel-gmail --no-verify-jwt`. El callback OAuth es público; todos los POST validan el JWT con Auth y consultan el perfil actual. `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son variables del entorno Edge, nunca del sitio.
6. Reemplazar el HTML `index` de Apps Script con `google-apps-script/index-sitio.html`, guardar y publicar una nueva versión. `Code.gs` y su modo de ejecución se conservan. El pie muestra v2026.10.27.3.

La instalación de secretos, SQL y Edge es necesaria antes de usar Gmail; una actualización del HTML por sí sola no los instala. No se desplegó ni se configuró producción durante las pruebas de esta entrega.

## Usar

En el expediente de una carga abrir **Comunicación → Gmail de esta carga**. Conectar mi Gmail abre el consentimiento de Google en otra ventana. Al terminar, cerrarla y pulsar Actualizar. La dirección conectada se muestra antes de preparar cualquier respuesta. Cambiar cuenta requiere nuevo consentimiento; Desconectar elimina el token local y los consentimientos pendientes. Para revocar también el permiso en Google, retirar la aplicación en la configuración de seguridad de la cuenta Google.

Guardar liga del hilo conserva una referencia por carga y usuario. Las ligas admitidas son `https://mail.google.com/mail/u/0/#inbox/IDENTIFICADOR` y equivalentes con `all`, `sent`, `starred` o `important`. El número de cuenta puede variar. Las ligas modernas `FMfc…` no son identificadores de la API: usar **Buscar hilo por carga**, revisar asunto/remitente y seleccionar el hilo. La búsqueda muestra hasta diez coincidencias del número exacto de carga. Al seleccionarlo se guarda una liga compatible. Si la cuenta Google abierta en otra pestaña es distinta, seleccionar allí la cuenta conectada para abrir el enlace.

Preparar respuesta pide Para, CC y texto. No supone destinatarios ni los toma silenciosamente del hilo. Usar direcciones simples separadas por comas, sin nombres. El servidor toma asunto y referencias del último mensaje no borrador, y crea una vista previa inmutable. Revisar remitente, Para, CC, asunto y mensaje; marcar la confirmación y pulsar **Confirmar y enviar**. El envío conserva el hilo mediante `threadId`, `In-Reply-To`, `References` y asunto. Un hilo sin Message-ID válido no permite preparar una respuesta.

El historial de la sección muestra las últimas 30 respuestas de esa carga y cuenta del panel, incluyendo el texto revisable, estado, fecha e identificadores de Google. No confunde un borrador con un envío confirmado. Estas respuestas no registran WhatsApp ni alteran su historial o indicadores.

## Duplicados y recuperación

La huella persistente combina cuenta remitente, carga, hilo, Para/CC ordenados, asunto y texto. Preparar el mismo contenido devuelve el mismo registro, incluso al recargar o cuando el último mensaje del hilo cambió. Un contenido ya enviado no se vuelve a enviar. Si se necesita otro aviso, preparar un mensaje distinto de manera explícita.

La reserva SQL usa bloqueo de fila y una transición atómica `prepared → sending`. Solo la solicitud que obtiene la reserva llama a Gmail. Doble clic, dos pestañas y reintentos posteriores no vuelven a llamar al proveedor. Una vista previa vence en 30 minutos; prepararla otra vez renueva únicamente un registro aún no reclamado. Cambiar el hilo o perder permisos impide reclamarlo.

Solo la respuesta exitosa de Google con ID de mensaje e hilo permite guardar `sent`. Un timeout, una caída del proceso o un fallo al guardar el resultado dejan `sending`/`uncertain`; nunca se liberan automáticamente. **Verificar envío** busca el Message-ID estable en Enviados y registra la confirmación si encuentra un único mensaje en el hilo original. Si todavía no aparece, mantiene el bloqueo: no habilita un reenvío ni declara que falló. Esta elección evita duplicados a costa de exigir revisión de los casos ambiguos. La API de Gmail no ofrece una transacción conjunta con PostgreSQL.

## Fuente y pruebas

- `web/src/original/gmail/`: adaptador, compositor y vista previa; integrado en el expediente.
- `supabase/functions/panel-gmail/`: OAuth, cifrado, reglas de respuesta y transporte inyectable.
- SQL 021: conexiones privadas, estados OAuth, hilos personales y bandeja de envíos.
- `web/test/gmail*.test.js`: pruebas con PostgreSQL embebido, interfaz DOM y Google simulado. No requieren credenciales de Google y no envían correos reales.

Ejecutar `npm --prefix web ci`, `npm --prefix web test`, `npm --prefix web run build`, `python scripts/package_site.py` y `python scripts/package_site.py --check`.

Recorrido del HTML entregable: `node scripts/check_browser.mjs --gmail-only`, con Chromium y las herramientas de navegador indicadas en `CODIGO_ACTIVO.md`. [Evidencia con datos simulados](evidencia-gmail.json).
