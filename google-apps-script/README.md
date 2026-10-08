# Supabase como base de datos; Google Apps Script como alojamiento

Esta carpeta contiene la página del panel para servirla desde Google Apps Script. Supabase conserva la base de datos, usuarios, contraseñas, sesiones y permisos RLS. No se necesita una hoja de Google Sheets ni Netlify para este alojamiento.

La primera entrega usa la versión que el usuario ya validó (login, cargas, comentarios e incidencias). Se generó desde `entregables/panel-bajio-web.zip` y no depende de la migración SQL 002. El usuario ya desplegó esta adaptación en Google y confirmó que puede iniciar sesión y ver sus cargas. El usuario también confirmó que agregó un comentario desde Google y que se guarda. Quedan verificados el acceso, la lectura de cargas y el guardado de comentarios en el runtime Google mediante sus pruebas. No es la migración de todas las funciones del Apps Script original.

## Enlace de implementación proporcionado

El usuario proporcionó este enlace para la aplicación web:

https://script.google.com/macros/s/AKfycbzoOVMfiVGBU1ZWht4TcYZc2cqeBUKVeDTYsiSiEpwWIHnu_SPEnoCFKKG1AhZ6Mdjr/exec

El usuario confirmó en su navegador que puede iniciar sesión con su cuenta Supabase y ver las cargas existentes en esta página. La consulta y el acceso desde Google quedan verificados mediante esa prueba del usuario. El usuario también confirmó el guardado de un comentario desde Google. Los flujos verificados en Google son login, consulta de cargas y escritura de comentarios; otros flujos no se describen como probados en ese alojamiento. El acceso de comprobación desde Codex fue bloqueado por el proxy (CONNECT 403), antes de recibir una respuesta de Google; esa limitación no demuestra un fallo de la aplicación.

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

## Actualizar el mismo enlace

Tras cambiar `index.html`, usa **Implementar → Administrar implementaciones → Editar (lápiz) → Versión → Nueva versión → Implementar**. Actualiza la implementación existente para conservar su URL.

Cuando se aplique la migración 002 y se valide la segunda versión, el empaquetador también puede generar su HTML para Google:

```bash
cd /workspace/Panel_bajio_supabase_gpt
python3 scripts/package_google.py --source-zip entregables/panel-bajio-operaciones.zip
```

Para usar un build nuevo del código fuente:

```bash
cd /workspace/Panel_bajio_supabase_gpt/web
npm --cache /tmp/panel-npm-cache ci --no-audit --no-fund
npm --cache /tmp/panel-npm-cache run build
cd ..
python3 scripts/package_google.py
```

No pongas claves secret, `service_role` ni contraseñas en el HTML. La URL y clave publishable son públicas y van integradas en el bundle, como en cualquier frontend Supabase. El servidor Google solo sirve el documento; las solicitudes de datos salen del navegador hacia Supabase.
