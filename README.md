# Panel Bajío: Supabase y alojamiento en Google Apps Script

La entrega conjunta para Supabase y Google Apps Script está preparada en la rama `supabase-inicial`. Sigue [la instalación paso a paso](docs/INSTALAR_SITIO.md) y después [las pruebas finales, una por una](docs/PRUEBAS_FINALES.md). Los módulos nuevos deben instalarse y validarse en la página real; los archivos originales se conservan como referencia.


La base de datos y autenticación permanecen en Supabase. La página se aloja en Google Apps Script: sigue [la guía de google-apps-script](google-apps-script/README.md). No se requiere Google Sheets. El usuario confirmó en Google el acceso, la consulta de cargas y los comentarios persistentes; también confirmó la revisión de tránsito y el registro persistente de un aviso que resuelve el pendiente de comunicación. La tercera entrega, `google-apps-script/index-pendientes.html`, agrega solicitudes sin número de carga y requiere SQL 003. El usuario la activó y confirmó la vinculación: la nota y el comentario aparecen en la carga después de actualizar y la solicitud queda en Vinculados. El usuario confirmó también que la solicitud PRUEBA-002 aparece en Pendientes y que, tras cancelarla, permanece en Cancelados con su nota y comentario al actualizar. Las pruebas con otros roles siguen pendientes en el proyecto real.

La aplicación nueva está en `web/`. Los archivos Google Apps Script de la raíz se conservan como referencia y no se ejecutan en la nueva aplicación.

## Estado actual

La entrada de `web/` reutiliza las tres interfaces originales en `web/src/original/`. Sus 97 acciones se conectan a Supabase mediante adaptadores comentados. Incluye administración de cuentas Auth a través de `panel-accounts`, cargas, comentarios/incidencias, pendientes, bitácora/cierres, apartados, seguimiento, plantillas, calendario, indicadores, importación/deshacer, radar compartido y ambos portales. Consulta [la comparación y sus límites](docs/COMPARACION_ORIGINAL.md).

El proyecto existente requiere la actualización conjunta SQL 004–009, desplegar `panel-accounts` y activar la nueva versión del mismo proyecto Google. Sigue **docs/INSTALAR_SITIO.md**; no repitas SQL 001. Los módulos anteriores de `web/src/features/` permanecen como servicios reutilizables y referencia de la migración. No se ejecuta el backend Sheets de la raíz.

Auth/RLS/RPC verifican permisos y autores. Admin y CSR escriben; manager consulta; clientes reciben únicamente los campos de sus cargas autorizadas. La sesión no almacena contraseñas. Los estados y versiones conservan los expedientes y evitan sobrescrituras. Las pruebas reales entre cuentas y en Google quedan para el final, por petición del usuario.

## Referencia: crear un proyecto nuevo

El proyecto del usuario ya existe. Para actualizarlo, usar la guía de instalación enlazada arriba. Estos pasos iniciales se conservan para una instalación desde cero; después se aplica la actualización 004–009 y se instala `panel-accounts`.

1. Abre https://supabase.com y entra en Dashboard.
2. Crea una organización si no tienes una y pulsa **New project**.
3. Ponle un nombre como `panel-bajio`, genera una contraseña fuerte para la base y guárdala en tu gestor de contraseñas. Elige una región cercana y espera a que se cree.
4. En **SQL Editor**, crea una consulta y pega el contenido completo de `supabase/migrations/001_panel.sql`. Ejecútala una sola vez en el proyecto nuevo. Después ejecuta `supabase/migrations/002_load_operations.sql` y `supabase/migrations/003_pending_loads.sql`, cada archivo completo por separado. Usan transacciones. Si `001` y `002` ya están aplicadas, ejecuta únicamente `003`; no repitas `001`. Las migraciones `002` y `003` son repetibles y no eliminan los datos existentes.
5. En **Authentication → Users**, usa **Add user → Create new user** para crear tu cuenta con correo y contraseña, confirmando el correo desde el administrador cuando corresponda. No compartas esa contraseña en el chat.
6. Copia el UUID de esa cuenta y ejecuta esta consulta en SQL Editor, reemplazando el marcador por el UUID real:

   ```sql
   update public.profiles
   set role = 'admin', display_name = 'Esteban'
   where id = 'UUID-DE-TU-USUARIO';
   ```

7. Crea las demás cuentas del mismo modo y asigna `csr` (operación) o `manager` (lectura). La entrega nueva permite administrar roles desde Gestionar CSR, mediante funciones de servidor protegidas. Para un panel interno sin registro abierto, desactiva **Allow new users to sign up** en la configuración de Auth.

## 2. Conectar la aplicación

Busca **Project URL** y la clave **publishable** en el diálogo **Connect** o en **Settings → API Keys**. La clave pública/anon heredada también funciona. Nunca uses `service_role`, una clave secret ni la contraseña de la base en el frontend.

```bash
cd /workspace/Panel_bajio_supabase_gpt/web
cp .env.example .env.local
```

Edita `.env.local` localmente, o configura las variables del entorno:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU-CLAVE-PUBLICA
```

`.env.local` está ignorado por Git. Vite incorpora estos valores públicos al bundle; nunca se debe colocar ahí una credencial privada. Reinicia Vite tras modificarlos. Si el entorno cloud restringe destinos, añade el hostname exacto de tu proyecto a la lista permitida sin reemplazar los dominios existentes.

## 3. Desarrollar y validar

Requiere Node 24 (versión disponible en el entorno) y npm. Utiliza el checkout existente, sin crear worktrees para las tareas cloud.

```bash
cd /workspace/Panel_bajio_supabase_gpt/web
npm --cache /tmp/panel-npm-cache ci --no-audit --no-fund
npm --cache /tmp/panel-npm-cache test
npm --cache /tmp/panel-npm-cache run build
npm --cache /tmp/panel-npm-cache run dev -- --port 5173 --strictPort
```

La caché en `/tmp` evita depender de permisos de escritura en el directorio home. Las pruebas ejecutan la migración SQL en PostgreSQL embebido (PGlite), con un esquema Auth simulado: verifican roles, restricciones RLS, protección contra suplantar autores, historial y cuentas sin autorización. No sustituyen la integración con Supabase Auth real.

Con el proyecto conectado, valida manualmente: iniciar sesión con el administrador; crear una carga; editar el estatus; agregar comentario e incidencia; cerrar sesión; entrar como `manager` y comprobar lectura sin escritura; entrar como `pending` y comprobar que no tiene datos. La edición, las revisiones y el registro de avisos detectan cambios concurrentes mediante `updated_at`. Las fechas del formulario usan la zona horaria del navegador y se guardan con su zona horaria; al editar otro campo se conservan las fechas intactas, incluidos sus segundos. Descompuesta, En resguardo y Patio permisionario requieren recordatorio; En transito programa revisión a tres horas. Agregar un comentario o registrar un aviso reinicia esa revisión. Las reglas se aplican también en PostgreSQL, sin depender del navegador. Se listan todas las cargas activas mediante paginación; comentarios/incidencias muestran los 100 más recientes y el historial las 10 últimas fechas.

Sin variables de conexión, el panel muestra que falta configurar Supabase y no simula operaciones exitosas. El proyecto real respondió y se confirmó la estructura inicial y operativa, con rechazo de acceso sin sesión. El usuario confirmó login y persistencia de cargas, estatus, comentarios e incidencias en la primera versión Netlify. Después confirmó en Google el acceso, lectura, comentarios, revisión de tránsito y registro de avisos con persistencia al actualizar. En la tercera entrega confirmó que vincular una solicitud traslada su nota y comentario a la carga, permanecen al actualizar y la solicitud queda en Vinculados. Esas pruebas corresponden a los flujos indicados, no a todos los módulos ni roles. El usuario confirmó el alta de PRUEBA-002 y su cancelación, conservando nota y comentario en Cancelados después de actualizar. El acceso por otros roles del nuevo módulo aún requiere prueba real.

## Organización del código nuevo

Las nuevas funciones se escriben con nombres descriptivos y comentarios en español. La entrada actual separa estas responsabilidades:

- `web/src/original/main.js` y `page.js`: sesión, selección y montaje de las tres interfaces.
- `web/src/original/api/context.js`: autorización, caché, versiones y consultas comunes.
- `web/src/original/api/operations.js` y `models.js`: operaciones y formatos esperados por la UI original.
- `web/src/original/api/team.js`, `imports.js` y `radar.js`: equipo, importación y mapas.
- `supabase/functions/panel-accounts/index.ts`: cuentas Auth y controles de administración en servidor.
- `supabase/migrations/009_original_interface.sql`: preferencias, radar, bajas lógicas y permisos adicionales.

El módulo anterior de pendientes se conserva como servicio y referencia:

- `web/src/features/pending-loads/rules.js`: validación de formularios y selección de cargas compatibles.
- `web/src/features/pending-loads/service.js`: consultas Supabase, paginación y detección de versiones antiguas.
- `web/src/features/pending-loads/panel.js`: pantalla, formularios y navegación del módulo.
- `web/src/ui/html.js`: protección del HTML frente a texto ingresado por usuarios.
- `supabase/migrations/003_pending_loads.sql`: tablas, permisos, historial y operaciones transaccionales, con secciones explicadas.

El build de Vite se genera sin minificar para facilitar su lectura. El HTML de Google incluye además la biblioteca Supabase: los cambios se hacen en los archivos fuente anteriores y después se vuelve a empaquetar, evitando editar el código generado a mano.

Las pruebas de interfaz con DOM simulado detectaron una lista vacía al crear solicitudes desde Vinculados o Cancelados: el registro se guardaba, pero la pantalla mantenía el filtro anterior. El módulo ahora vuelve a Pendientes después de guardar. Esta corrección está preparada en el HTML de entrega y requiere actualizar la implementación Google para activarse; aún no está validada allí.

## Siguientes etapas

El usuario pidió dejar las pruebas manuales con otras cuentas para el final porque solo dispone de su cuenta y no tiene otro correo. Esta decisión permite continuar el desarrollo; el acceso real entre cuentas sigue pendiente de verificar. Las pruebas locales de permisos ya pasaron. Creación, vinculación y cancelación con persistencia fueron confirmadas por el usuario.

1. Instalar SQL 004–009 y `panel-accounts` en Supabase.
2. Actualizar Code.gs e index.html y activar una nueva versión del mismo enlace Google.
3. Recorrer las pruebas finales de la interfaz original, una por una.
4. Comprobar al final el acceso entre cuentas y los portales cliente/gerencia.
5. Acordar por separado la migración de datos históricos y automatizaciones externas TCI/activadores, que no están instaladas. Consultar los límites en `docs/COMPARACION_ORIGINAL.md`.

## Referencia: actualizar la versión anterior de Netlify

1. Ejecuta **solo** `supabase/migrations/002_load_operations.sql` en SQL Editor. No vuelvas a ejecutar `001_panel.sql`. Esta actualización agrega comunicaciones y funciones/activadores; no borra las cargas ni los usuarios.
2. Descarga `entregables/panel-bajio-operaciones.zip` desde GitHub y descomprímelo.
3. Abre tu sitio existente en Netlify, sección **Deploys**, y sube la carpeta que contiene `index.html` al área de despliegue manual. Así conservas la misma URL.
4. Actualiza el navegador, abre una carga y valida: cambiar a En transito agenda revisión a tres horas; cambiar a Descompuesta exige fecha; una cita modificada genera pendiente de aviso; registrar el aviso lo resuelve y deja historial con canal; comentar reinicia la revisión; modificar la fecha de cruce quita su confirmación anterior.

El ZIP inicial `entregables/panel-bajio-web.zip` corresponde a la primera versión y se conserva como referencia. El ZIP nuevo contiene solo archivos públicos de la aplicación compilada (incluida la URL y clave publishable), nunca contraseñas, claves secret o service_role.
