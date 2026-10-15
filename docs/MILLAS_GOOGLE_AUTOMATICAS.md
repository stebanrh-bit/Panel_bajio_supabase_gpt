# Activar las millas automáticas de Google

El radar sigue calculando primero con OpenStreetMap/OSRM y guardando los trayectos en Supabase. Esta actualización permite completar los pendientes con Google Maps cada hora, aunque el panel esté cerrado. Requiere activar el proceso en tu proyecto Google: el cambio del repositorio no lo activa por sí solo.

## 1. Instalar SQL 010

1. Abre [SQL 010 completo](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/supabase/migrations/010_google_miles_worker.sql).
2. Copia todo con **Ctrl+A → Ctrl+C**.
3. En Supabase, entra en **Panel Bajio - supabase → SQL Editor → New query**.
4. Pega todo y pulsa **Run**.

Requiere SQL 001–009, ya usados por el sitio actual. Conserva las cargas, cuentas, millas OSM y millas Google existentes; se puede repetir. No vacíes tablas ni repitas SQL 001. Para una instalación nueva, `actualizar_sitio.sql` reúne 004–010 en una sola transacción.

## 2. Actualizar Google Apps Script

En el mismo proyecto que aloja tu enlace actual:

1. Reemplaza todo **Code.gs** con [Code-sitio.gs actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/Code-sitio.gs).
2. Reemplaza todo **index.html** con [index-sitio.html actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html).
3. Guarda ambos archivos. Si ya habías copiado una versión con funciones terminadas en `_` que no aparecen en el selector, reemplaza Code.gs con este archivo completo, guarda y recarga el editor. No necesitas otra hoja, otra implementación ni cambiar la función `panel-accounts`.

El `Code.gs` de la raíz del repositorio pertenece al proyecto anterior con Sheets. Para el panel actual se usa el enlace **Code-sitio.gs** de este paso.

## 3. Vincular Google con la cola de Supabase

1. En la barra superior del editor Google, abre el selector de funciones junto a **Ejecutar**.
2. Elige **prepararMillasGoogle** y pulsa **Ejecutar**. Autoriza con tu cuenta si Google lo solicita.
3. Abre **Registro de ejecución**. Copia únicamente la sentencia que empieza por `insert into public.original_google_worker_config` y termina en `;`.
4. En Supabase, abre **SQL Editor → New query**, pega esa sentencia y pulsa **Run**.

La sentencia contiene una huella de verificación, no la clave real. El secreto se genera y guarda automáticamente en las **propiedades del script de Google**. No debes copiarlo al HTML, al repositorio ni al chat. No necesitas ninguna clave `service_role`, correo o contraseña de Supabase. Repetir Preparar conserva el mismo secreto y no pierde distancias.

## 4. Activar y comprobar

1. Vuelve al editor Google. Elige **activarMillasGoogle → Ejecutar** con la cuenta que será responsable del proceso.
2. Autoriza los servicios y la creación del activador si Google lo solicita.
3. Esta función deja una ejecución **cada hora** y procesa un primer lote inmediatamente. Repetirla con la misma cuenta no duplica el activador.
4. Ejecuta **estadoMillasGoogle** y revisa el Registro de ejecución.
5. El resultado debe mostrar `triggers: 1`. La sección `queue` muestra los pendientes y completados; `lastRun` muestra el último lote.
6. En **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**, publica los archivos guardados.
7. Abre el panel y actualiza con **Ctrl+Shift+R**.

Actívalo con una sola cuenta de Google. Los activadores pertenecen a la cuenta que los crea; otra cuenta editora puede tener activadores propios que no aparecen en la primera.

| Resultado del registro | Qué significa |
| --- | --- |
| `pending` | Trayectos que todavía no tienen millas Google, incluidos los que esperan reintento o coordenadas |
| `missing_coordinates` | Pendientes sin coordenadas completas; una búsqueda que guarde ambas ubicaciones permite procesarlos |
| `completed` en `queue` | Total de trayectos con millas Google guardadas |
| `no_route` | Google no encontró una ruta; se conservan las millas OSM |
| `lastRun.status: ok` | Lote terminado correctamente; cero trabajos también es válido si no hay pendientes disponibles |
| `lastRun.status: quota` | Google limitó las consultas; se pausa y se retoma en una ejecución posterior |
| `lastRun.status: time_limit` | Se alcanzó el margen de cuatro minutos; el resto queda pendiente para otra ejecución |
| `lastRun.status: connection_error` | No se pudo leer o guardar en Supabase; revisar SQL 010 y el paso de vinculación |
| `lastRun.status: running` al ejecutar manualmente | Ya había un lote en curso; no se inicia otro. No reemplaza el resumen anterior |

Si aparece un error, comparte únicamente el mensaje o el resumen; no compartas propiedades ni claves. Para comprobar un fallo de conexión, ejecuta **estadoMillasGoogle**: muestra un error de vinculación si falta SQL 010 o la huella no coincide. Si no hay trabajos, realiza una búsqueda en el radar que produzca una ruta OSM guardada y después ejecuta **procesarMillasGoogle** una vez desde el editor.

## Qué hace el proceso

- Toma hasta **20 trayectos por ejecución**, con un margen de cuatro minutos. Las cuotas reales de Google dependen de tu cuenta y también de otros usos de Maps.
- Procesa únicamente trayectos guardados con ambas coordenadas y sin resultado Google. No vuelve a gastar consultas en los que ya tienen millas Google.
- Una reserva de diez minutos impide que dos lotes trabajen simultáneamente el mismo trayecto. Si una ejecución se interrumpe, la reserva vence y una posterior puede recuperarlo.
- Si Google agota la cuota, detiene el lote y pausa la cola. La siguiente ejecución por hora vuelve a intentarlo cuando corresponda; una cuota diaria puede seguir agotada durante varias ejecuciones.
- Los errores transitorios se reintentan con espera creciente: 1, 2, 4, 8, 16 y hasta 24 horas. Una respuesta explícita sin ruta se aparta de los reintentos automáticos.
- No borra ni cambia las millas OSM. Cuando hay resultado Google, el panel prefiere ese resultado. Si Google no encuentra ruta, el historial de búsquedas lo indica y conserva OSM; un Admin puede usar **Recalcular con Google** más adelante.
- Una corrección manual tiene prioridad sobre cualquier respuesta atrasada del lote.
- Los valores nuevos aparecen al recargar o volver a buscar. El radar conserva una caché de hasta un minuto; la búsqueda entre direcciones consulta los datos guardados nuevamente.

## Detener o diagnosticar

**desactivarMillasGoogle → Ejecutar** elimina los activadores de este proceso creados por tu cuenta. No borra resultados ni el vínculo. Para reactivarlo, usa **activarMillasGoogle**. También puedes comprobar horarios y fallos en **Activadores** y **Ejecuciones** del editor Google.

Los nombres que debes elegir en el selector no llevan guion bajo final. Estos accesos comprueban la identidad Google antes de ejecutar el mantenimiento y rechazan a visitantes anónimos y a una cuenta distinta de la que ejecuta la publicación. Conserva la implementación configurada como **Ejecutar como: Yo**, según INSTALAR_SITIO.md. El núcleo con guion bajo permanece privado. Solo los tres servicios limitados de la cola aceptan el secreto privado de este proceso. Supabase guarda su hash y mantiene la configuración fuera del acceso de las cuentas del sitio.

## Evidencia y límite de la entrega

Las pruebas locales verifican permisos de las RPC, reserva y recuperación de trabajos, pausa por cuota, conservación de OSM, resultados fuera de rango, prioridad manual y repetición de SQL. Los servicios Google simulados verifican suma de tramos, cuota, fallos de escritura, tiempo máximo, preparación sin publicar secretos y activador único.

El activador real, las autorizaciones, las cuotas y la ejecución contra tu Supabase requieren los pasos anteriores. No se han activado ni validado remotamente desde Codex.
