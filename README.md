# Panel Bajío: migración a Supabase

La aplicación nueva está en `web/`. Los archivos Google Apps Script de la raíz se conservan como referencia y no se ejecutan en la nueva aplicación.

## Estado

Implementado: acceso por correo y contraseña con Supabase Auth, roles internos, listado/búsqueda/alta/edición de cargas, comentarios, incidencias e historial automático. La segunda actualización agrega etapas del recorrido, alertas, campos de documentos/POD y cruce, citas con zona horaria, próximas revisiones, recordatorios, filtros de atención y registro de comunicaciones. Gerencia (`manager`) tiene acceso de lectura; `csr` y `admin` pueden escribir. Las cuentas nuevas quedan en `pending`, sin acceso a los datos. Los permisos se verifican en la base mediante RLS, no solo en la interfaz.

Se conservan las columnas originales de cargas. Salvo `created_at` y `updated_at`, los valores heredados se almacenan como texto para no perder códigos, ceros iniciales o formatos; la normalización de fechas, números y booleanos será una migración posterior. No se han copiado datos de Sheets ni contraseñas antiguas.

Esto todavía no reemplaza todas las funciones originales. No están migrados los portales externos, asignaciones CSR-cliente, pendientes, apartados, bitácoras y cierres de turno, plantillas, mapas/distancias, radar Excel, importación/deshacer, archivado automático ni la integración de envío de notificaciones. Los avisos de esta versión se registran después de enviarlos por otro medio; el panel no envía WhatsApp ni correo. El frontend original queda como referencia para recuperar sus pantallas y comportamiento. No se debe retirar una instalación anterior con esta primera etapa.

## 1. Crear el proyecto

1. Abre https://supabase.com y entra en Dashboard.
2. Crea una organización si no tienes una y pulsa **New project**.
3. Ponle un nombre como `panel-bajio`, genera una contraseña fuerte para la base y guárdala en tu gestor de contraseñas. Elige una región cercana y espera a que se cree.
4. En **SQL Editor**, crea una consulta y pega el contenido completo de `supabase/migrations/001_panel.sql`. Ejecútala una sola vez en el proyecto nuevo. Después ejecuta `supabase/migrations/002_load_operations.sql`. Ambos usan transacciones. Si la primera migración ya se aplicó, ejecuta únicamente la segunda; no repitas `001`. La segunda es repetible y no elimina los datos existentes.
5. En **Authentication → Users**, usa **Add user → Create new user** para crear tu cuenta con correo y contraseña, confirmando el correo desde el administrador cuando corresponda. No compartas esa contraseña en el chat.
6. Copia el UUID de esa cuenta y ejecuta esta consulta en SQL Editor, reemplazando el marcador por el UUID real:

   ```sql
   update public.profiles
   set role = 'admin', display_name = 'Esteban'
   where id = 'UUID-DE-TU-USUARIO';
   ```

7. Crea las demás cuentas del mismo modo y asigna `csr` (operación) o `manager` (lectura). No se permite cambiar roles desde el navegador. Para un panel interno sin registro abierto, desactiva **Allow new users to sign up** en la configuración de Auth.

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

Sin variables de conexión, el panel muestra que falta configurar Supabase y no simula operaciones exitosas. El proyecto real respondió y se confirmó la existencia de las cinco tablas iniciales y el bloqueo de acceso sin sesión. El usuario confirmó login y persistencia de cargas, estatus, comentarios e incidencias en https://relaxed-douhua-c9ee09.netlify.app/. Esa prueba corresponde a la primera versión. La segunda actualización y sus comunicaciones, alertas y revisiones siguen pendientes de aplicar y validar en Supabase/Netlify; sus pruebas locales usan PostgreSQL embebido.

## Siguientes etapas

1. Aplicar y validar la segunda actualización de cargas y comunicaciones contra Supabase/Netlify.
2. Completar las reglas restantes conforme se migren los módulos del backend original.
3. Implementar los módulos restantes y recuperar las pantallas originales.
4. Crear portales externos con vistas y permisos por cliente, sin exponer campos operativos internos.
5. Preparar importación de datos, tareas programadas y pruebas de regresión de todos los módulos. La primera versión fue desplegada manualmente por el usuario; la migración completa no está terminada.

## Actualizar el sitio existente a la segunda versión

1. Ejecuta **solo** `supabase/migrations/002_load_operations.sql` en SQL Editor. No vuelvas a ejecutar `001_panel.sql`. Esta actualización agrega comunicaciones y funciones/activadores; no borra las cargas ni los usuarios.
2. Descarga `entregables/panel-bajio-operaciones.zip` desde GitHub y descomprímelo.
3. Abre tu sitio existente en Netlify, sección **Deploys**, y sube la carpeta que contiene `index.html` al área de despliegue manual. Así conservas la misma URL.
4. Actualiza el navegador, abre una carga y valida: cambiar a En transito agenda revisión a tres horas; cambiar a Descompuesta exige fecha; una cita modificada genera pendiente de aviso; registrar el aviso lo resuelve y deja historial con canal; comentar reinicia la revisión; modificar la fecha de cruce quita su confirmación anterior.

El ZIP inicial `entregables/panel-bajio-web.zip` corresponde a la primera versión y se conserva como referencia. El ZIP nuevo contiene solo archivos públicos de la aplicación compilada (incluida la URL y clave publishable), nunca contraseñas, claves secret o service_role.
