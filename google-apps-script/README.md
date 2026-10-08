# Supabase como base de datos; Google Apps Script como alojamiento

Esta carpeta contiene la página del panel para servirla desde Google Apps Script. Supabase conserva la base de datos, usuarios, contraseñas, sesiones y permisos RLS. No se necesita una hoja de Google Sheets ni Netlify para este alojamiento.

El archivo `index.html` conserva la primera entrega validada, generada desde `entregables/panel-bajio-web.zip`, sin depender de SQL 002. `index-operaciones.html` conserva la segunda entrega con alertas, documentos/POD, citas y cruce, revisiones y comunicaciones; requiere SQL 002. El usuario confirmó en Google el acceso, la lectura de cargas, comentarios persistentes, revisión de tránsito y registro de avisos que resuelve el pendiente y permanece al actualizar.

`index-pendientes.html` es la siguiente entrega: incluye las funciones operativas y agrega solicitudes sin número de carga. Requiere SQL 001, 002 y 003. Está comprobada localmente y todavía debe activarse y validarse en Google. Ninguna entrega completa todavía todos los módulos del Apps Script original.

## Enlace de implementación proporcionado

El usuario proporcionó este enlace para la aplicación web:

https://script.google.com/macros/s/AKfycbzoOVMfiVGBU1ZWht4TcYZc2cqeBUKVeDTYsiSiEpwWIHnu_SPEnoCFKKG1AhZ6Mdjr/exec

Los flujos verificados en el navegador del usuario son login, lectura de cargas, escritura de comentarios, revisión de tránsito y registro persistente de un aviso que resuelve el pendiente. Las solicitudes de la tercera entrega aún no se han probado en Google. El acceso de comprobación desde Codex fue bloqueado por el proxy (CONNECT 403), antes de recibir una respuesta de Google; esa limitación no demuestra un fallo de la aplicación.

## Crear el proyecto Google

1. Abre https://script.google.com/home e inicia sesión en Google.
2. Pulsa **Nuevo proyecto** y ponle un nombre como `Panel Bajío`.
3. En el archivo `Code.gs` que crea Google, sustituye el contenido por **el Code.gs de esta carpeta**. No uses el `Code.gs` de la raíz del repositorio: ese pertenece al backend antiguo que usa Sheets.
4. Pulsa **+ → HTML**, escribe `index` como nombre y confirma. Google agrega la extensión `.html`.
5. Borra el contenido inicial del HTML y pega todo el contenido de `google-apps-script/index.html`. Este archivo ya incluye estilos, código JavaScript y la configuración pública de Supabase; no copies las carpetas `web/` ni `assets/` al editor Google.
6. Guarda los archivos. Opcionalmente muestra el manifiesto en **Configuración del proyecto → Mostrar el archivo de manifiesto appsscript.json** y usa el JSON de esta carpeta para establecer V8 y la zona horaria de México.
7. Pulsa **Implementar → Nueva implementación**.
8. En el selector de tipo (engranaje), elige **Aplicación web**.
9. En **Ejecutar como**, elige **Yo**. En **Quién tiene acceso**, elige **Cualquier usuario** si quieres que el enlace llegue directamente al login del panel. Esto deja pública la pantalla de acceso; los datos siguen protegidos por Supabase Auth y RLS. No hace falta compartir tu base ni tu contraseña de Google.
10. Pulsa **Implementar** y completa cualquier autorización que solicite Google.
11. Copia la URL de **Aplicación web** que termina en `/exec`. Abre esa URL en el navegador, entra con tu usuario existente de Supabase y prueba crear/editar una carga y guardar comentarios e incidencias. No uses la URL de biblioteca ni el enlace `/dev` para compartir con otros.

## Qué debe comprobarse en Google

- Que aparece el login dentro de la página de Google, sin errores de módulos ni recursos que busquen `/assets/` en el servidor de Google.
- Que el mismo usuario de Supabase puede iniciar sesión y consultar los datos ya creados.
- Que nuevas cargas, comentarios e incidencias permanecen tras actualizar la página.
- Que cerrar sesión vuelve al login y que la sesión se comporta correctamente en el navegador del usuario. Apps Script sirve el HTML dentro de un iframe: las restricciones de almacenamiento de algunos navegadores requieren validación real, que no se sustituye con las pruebas locales.

## Activar la actualización operativa en Google

Esta entrega ya fue activada y el usuario confirmó la revisión de tránsito y el registro de aviso. Se comprobó además que Supabase dispone de `communications`, las columnas `last_communication_channel`/`last_communication_type` y las funciones `review_load` y `confirm_client_notice`; las solicitudes sin sesión se rechazaron. No se requiere repetir SQL para usar esta interfaz.

1. Copia todo el contenido de [index-operaciones.html](index-operaciones.html).
2. Abre el proyecto existente en Google Apps Script y sustituye **el contenido** de su archivo `index.html` por lo copiado. En el proyecto Google el archivo debe seguir llamándose `index`: `Code.gs` lo sirve con ese nombre. No crees allí un archivo llamado `index-operaciones` ni cambies `Code.gs`.
3. Guarda y abre **Implementar → Administrar implementaciones → Editar (lápiz)**.
4. En **Versión**, selecciona **Nueva versión** y pulsa **Implementar**. Actualiza la implementación existente para conservar la URL `/exec`.
5. Actualiza el navegador y comprueba que aparecen los filtros **Requieren atención** y **Pendientes de avisar**.
6. Con una carga de prueba, comprueba: cambiar a En transito programa revisión a tres horas; Descompuesta exige fecha de recordatorio; cambiar una cita marca pendiente de aviso; **Registrar aviso enviado** guarda canal y tipo y resuelve el pendiente; comentar reinicia la revisión de tránsito. El panel registra avisos que enviaste por otro medio, no envía WhatsApp ni correo por sí mismo.

La versión inicial permanece en el archivo `index.html` del repositorio como referencia; la versión nueva solo se activa en Google cuando pegues su contenido y actualices la implementación.

## Instalar solicitudes pendientes: tercera entrega

Los archivos están en la rama `supabase-inicial` del repositorio. Sigue este orden en el proyecto Supabase y el proyecto Google existentes:

1. Abre [SQL 003 completo](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/supabase/migrations/003_pending_loads.sql). Selecciona **todo** el contenido con Ctrl+A y cópialo con Ctrl+C.
2. En el Dashboard de Supabase, selecciona **Panel Bajio - supabase → SQL Editor → New query**. Pega el archivo completo y pulsa **Run**. Espera el resultado satisfactorio. No borres ni vuelvas a crear las tablas existentes. Esta migración agrega `pending_loads`, `pending_load_comments` y `pending_load_history`, sus permisos y las funciones de vínculo/cancelación.
3. Abre [HTML completo de pendientes](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-pendientes.html). Usa Ctrl+A y Ctrl+C.
4. En el proyecto Google Apps Script que ya usas, abre su archivo **index.html**, selecciona el contenido anterior y pega el HTML nuevo completo. Conserva el nombre `index` y el `Code.gs` existente. Guarda los cambios.
5. Pulsa **Implementar → Administrar implementaciones → Editar (lápiz) → Versión → Nueva versión → Implementar**. Usa la implementación existente para conservar el enlace `/exec`.
6. Actualiza tu página y abre **Solicitudes pendientes → Nueva solicitud**. Usa cliente `PRUEBA PENDIENTE`, origen/destino, una nota y una fecha estimada. Guarda y agrega un comentario. Actualiza la página y confirma que ambos siguen ahí.
7. En **Cargas**, crea una carga `PENDIENTE-001` con el mismo cliente `PRUEBA PENDIENTE`. Regresa a solicitudes, abre la creada y selecciona esa carga en **Vincular con una carga confirmada**. Al vincular se abre la carga y aparecen la nota y el comentario. La solicitud queda en **Vinculados**, sin duplicar el traslado si se intenta nuevamente.
8. Crea una segunda solicitud de prueba y usa **Cancelar solicitud**. Confirma que aparece en **Cancelados**, conservando su nota y comentarios.

Administración opera todas las solicitudes, cada CSR opera las propias y gerencia tiene lectura. El historial queda almacenado en `pending_load_history`; las pestañas de la pantalla muestran los expedientes cerrados. Los permisos y la transacción se probaron en PostgreSQL embebido con Auth simulado; falta comprobar estas acciones autenticadas en el proyecto real. No se ejecutó SQL 003 remotamente ni se modificó la implementación Google desde Codex.

El código nuevo está organizado y comentado en español en `web/src/features/pending-loads/`. El HTML de entrega se genera sin minificar, pero incluye también la biblioteca Supabase. Para cambiar la aplicación, edita sus fuentes y regenera el HTML.

## Actualizar el mismo enlace

Tras cambiar `index.html`, usa **Implementar → Administrar implementaciones → Editar (lápiz) → Versión → Nueva versión → Implementar**. Actualiza la implementación existente para conservar su URL.

Para verificar la segunda entrega conservada:

```bash
cd /workspace/Panel_bajio_supabase_gpt
python3 scripts/package_google.py --source-zip entregables/panel-bajio-operaciones.zip --output google-apps-script/index-operaciones.html --check
```

Para usar un build nuevo del código fuente:

```bash
cd /workspace/Panel_bajio_supabase_gpt/web
npm --cache /tmp/panel-npm-cache ci --no-audit --no-fund
npm --cache /tmp/panel-npm-cache run build
cd ..
python3 scripts/package_google.py --output google-apps-script/index-pendientes.html
python3 scripts/package_google.py --output google-apps-script/index-pendientes.html --check
```

No pongas claves secret, `service_role` ni contraseñas en el HTML. La URL y clave publishable son públicas y van integradas en el bundle, como en cualquier frontend Supabase. El servidor Google solo sirve el documento; las solicitudes de datos salen del navegador hacia Supabase.
