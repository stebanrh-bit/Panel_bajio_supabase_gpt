# Publicar la interfaz original con Supabase

Esta entrega reutiliza las tres interfaces originales: panel interno, Portal Cliente y Vista Gerencia. Conserva sus estilos, logos, menú, ventanas y controles. Supabase sigue guardando los datos y las cuentas; Google Apps Script aloja las páginas y consulta Maps. No se necesita crear una hoja de Google Sheets.

La versión publicada de Google todavía no cambia hasta completar estos pasos. El código está preparado en la rama `supabase-inicial`. Las cargas y cuentas existentes se conservan.

## Archivos completos

Abre cada enlace y usa **Ctrl+A → Ctrl+C** para copiar TODO. No necesitas descargar un ZIP.

1. [Actualización SQL](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/supabase/actualizar_sitio.sql).
2. [Función de cuentas: index.ts](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/supabase/functions/panel-accounts/index.ts).
3. [Código Google: Code-sitio.gs](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/Code-sitio.gs).
4. [Página Google: index-sitio.html](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html).

El ZIP `entregables/panel-bajio-sitio.zip` contiene estos mismos archivos, las instrucciones y las capturas con datos ficticios.

## 1. Actualizar la base de datos

1. Abre Supabase y entra en **Panel Bajio - supabase**.
2. Abre **SQL Editor → New query**.
3. Copia TODO el archivo del enlace 1, desde el primer comentario hasta el último `commit;`.
4. Pégalo en la consulta nueva y pulsa **Run**.
5. Continúa cuando la consulta termine correctamente.

El archivo reúne SQL 004–009 en una sola transacción y requiere 001, 002 y 003, ya utilizados en tu panel. Se puede repetir sin borrar los registros existentes. No vuelvas a ejecutar SQL 001 y no elimines tablas. Si aparece un error, conserva la página que ya funciona y comparte únicamente el texto del error.

## 2. Instalar la función de cuentas en Supabase

La pantalla original entra con **nombre y contraseña** y permite administrar cuentas. Esta función conecta esos controles con Supabase Auth.

1. En el mismo proyecto Supabase, abre **Edge Functions**.
2. Crea una función nueva usando el editor del Dashboard. Ponle exactamente **panel-accounts**.
3. Abre su archivo **index.ts**, selecciona todo su contenido y pega TODO el archivo del enlace 2.
4. Guarda y despliega la función.
5. En la configuración de **panel-accounts**, desactiva **Verify JWT** / **Enforce JWT verification** / **Verify JWT with legacy secret**, según el nombre que muestre tu Dashboard. Guarda el ajuste.

Ese ajuste permite abrir el login antes de iniciar sesión. Las acciones privadas verifican el JWT y el rol dentro de la función; crear cuentas, restablecer contraseñas y desbloquear usuarios exige administración. La función utiliza las variables internas que Supabase proporciona automáticamente. No copies ninguna clave `service_role` al HTML ni al chat.

Para desarrolladores, el equivalente es:

```bash
supabase functions deploy panel-accounts --project-ref pwqibuunekrzfcztcfju --no-verify-jwt
```

La cuenta Esteban conserva su contraseña actual de Supabase. La contraseña para abrir **Gestionar CSR** es la de esa misma cuenta administradora. Ya no se usa una contraseña compartida en las propiedades de Google.

## 3. Copiar los archivos al proyecto Google existente

1. Abre **script.google.com** y entra al proyecto de nuestro panel.
2. Abre **Code.gs**. Selecciona todo y pega TODO el archivo del enlace 3. El nombre en Google sigue siendo **Code.gs**.
3. Abre **index.html**. Selecciona todo y pega TODO el archivo del enlace 4. El nombre en Google sigue siendo **index**.
4. Guarda ambos archivos.

La página es grande porque incluye las tres interfaces, sus logos y las bibliotecas. No copies fragmentos. El antiguo `Code.gs` de la raíz del repositorio pertenece a la versión con Sheets; para esta instalación se usa **Code-sitio.gs**.

## 4. Activar una nueva versión en el mismo enlace

1. Pulsa **Implementar → Administrar implementaciones**.
2. Selecciona la aplicación web del panel y pulsa el **lápiz**.
3. En **Versión**, selecciona **Nueva versión**.
4. Conserva **Ejecutar como: Yo** y el acceso de tu implementación actual.
5. Pulsa **Implementar**. Completa la autorización de Google si la solicita.
6. Abre tu enlace habitual terminado en **/exec** y actualiza la página.

Editar esa implementación conserva el enlace. No se usa Netlify ni se requiere mantener Codex abierto.

Si las consultas de mapas solicitan autorización y la página no muestra el diálogo, ejecuta `autorizarServiciosGoogle_` desde el editor de Apps Script, autoriza con tu cuenta y vuelve al panel.

## Las tres páginas

- **Panel interno:** tu enlace habitual `/exec`.
- **Portal Cliente:** el mismo enlace con `?portal=cliente` al final.
- **Vista Gerencia:** el mismo enlace con `?portal=gerencia` al final.

En **Gestionar CSR** puedes crear personas y asignarles una contraseña. Si no indicas correo, Supabase usa una dirección interna; la recuperación de esas cuentas la hace administración. También puedes crear/editar usuarios del Portal Cliente y configurar el acceso de la Vista Gerencia.

## Después de instalar

Seguiremos [PRUEBAS_FINALES.md](PRUEBAS_FINALES.md), una prueba por vez. Las pruebas con otras cuentas quedan para la última etapa, como acordamos. Las comprobaciones locales están en [VALIDACION_SITIO.md](VALIDACION_SITIO.md).

![Inicio original conectado a Supabase, con datos de prueba](imagenes/panel-home.png)

![Operación original conectada a Supabase, con datos de prueba](imagenes/panel-operation.png)
