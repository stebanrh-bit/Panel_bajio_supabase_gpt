# Conservar 64 cargas y eliminar las demás

Limpieza puntual solicitada por Esteban el 15 de octubre de 2026. Los archivos ya contienen los **64 números únicos** de su lista, incluido **844090**, que estaba en la segunda columna. No requieren editar identificadores.

Este procedimiento se ejecuta manualmente en **Supabase → SQL Editor** con el rol **postgres**. No es una migración ni una actualización de Google Apps Script. Los archivos de mantenimiento no se incluyen en la instalación ni se ejecutan al arrancar el sitio.

## Corrección del error «relation pb_conservar does not exist»

Ese error indica que una sentencia no pudo encontrar la tabla temporal; por sí solo no permite identificar qué parte se envió o qué ocurrió antes. La versión actual de borrado crea, consulta y retira sus objetos temporales dentro de un único bloque `DO $limpieza$ … $limpieza$;`. La consulta final solo lee `public.loads`. La vista previa usa WITH y no crea tablas temporales.

Si un intento anterior dejó una transacción abierta o en error, ejecuta primero `ROLLBACK;` en SQL Editor. Esto no revierte cambios que ya se hubieran confirmado. Después usa una consulta nueva, reemplaza todo su contenido por el archivo actualizado y ejecuta el bloque completo. El editor puede ejecutar solo el texto seleccionado: antes de pulsar Run, quita cualquier selección parcial.

## Paso 1: consultar el alcance

1. Abre [01_vista_previa_conservar_64.sql](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/supabase/maintenance/01_vista_previa_conservar_64.sql).
2. Copia **todo el archivo**, abre **SQL Editor → New query**, pégalo y pulsa **Run**.
3. En Results, verifica que **Cargas encontradas, con todos sus datos = 64** y **Faltantes de tu lista = 0**. La fila de faltantes muestra los números ausentes si los hubiera.
4. Las filas ELIMINAR muestran las cantidades que se borrarían por tipo de registro. Esta versión es una sola consulta de lectura con WITH: no usa tablas temporales ni cambia los datos del panel.

## Paso 2: efectuar el borrado

1. Abre [02_eliminar_excepto_64.sql](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/supabase/maintenance/02_eliminar_excepto_64.sql).
2. Copia **todo el archivo**, pégalo en otra **New query** y pulsa **Run**. Durante la operación evita hacer otras importaciones o ediciones.
3. El resultado final debe indicar **Cargas actuales en la base** y **cargas_conservadas = 64**, junto con sus números.
4. Actualiza el panel con **Ctrl+Shift+R**. No necesitas publicar otra versión del HTML ni modificar Code.gs.

**El segundo archivo elimina definitivamente las demás cargas y sus registros asociados; no las mueve al archivo.** El bloque DO ejecuta toda la operación como una sola sentencia. Un error revierte sus cambios; terminar correctamente confirma el borrado cuando se usa autocommit.

Si falta cualquiera de las cargas autorizadas, el SQL se detiene. Si hay un error de ejecución, no ejecutes fragmentos para continuar: los cambios del bloque no se confirman. Ejecuta `ROLLBACK;` antes de reintentar y revisa el mensaje que produjo el fallo.

## Qué conserva exactamente

- Las 64 cargas, incluidos estados, fechas, trailer, unidad, recordatorios, documentos y cualquier otro campo existente. También conserva las archivadas que estén en la lista.
- Sus comentarios, incidencias —incluidas las retiradas—, historial, comunicaciones, seguidores, tareas vinculadas e historiales de esas tareas.
- Solicitudes vinculadas a las cargas protegidas, con sus comentarios e historial.
- Apartados relacionados con una carga protegida, con su historial. Si un apartado combina referencias protegidas y descartadas, permanece completo. Reconoce los números separados por texto o signos en `own_load`.
- Filas de importación de las cargas protegidas y metadatos de los lotes que las contienen; eventos administrativos relacionados con ellas.
- Contenido y orden de sus filas dentro de archivos Radar compartidos.
- Cuentas, perfiles, asignaciones de clientes, accesos del portal, plantillas, preferencias y cierres de turno; ubicaciones, rutas y configuración del proceso Google.
- Tareas y solicitudes generales sin carga, y apartados externos sin relación con las cargas que se eliminan.

Las referencias de texto libre dentro de una carga conservada tampoco se reescriben, aunque mencionen una carga eliminada. Los cierres de turno y registros administrativos generales permanecen como estaban.

## Qué elimina

- Todas las otras filas de `public.loads`, independientemente de estatus o de si están archivadas.
- Comentarios, incidencias, historial, comunicaciones y seguidores de esas cargas.
- Sus tareas vinculadas y solicitudes vinculadas, con los comentarios e historiales dependientes.
- Apartados relacionados con las cargas descartadas cuando no tienen relación con una de las 64 protegidas, e historial de esos apartados.
- Instantáneas de importación cuyo número no esté en la lista, incluso si la carga ya no existe. Retira lotes sin cargas protegidas y sus eventos específicos; los lotes mixtos permanecen.
- Filas Radar que identifiquen exactamente una carga eliminada. Conserva filas externas independientes. Retira fuentes antiguas que queden vacías y oculta el Radar actual si se queda sin filas.

No se hacen búsquedas de texto para borrar comentarios o cierres solo porque contengan un número. Las relaciones se determinan mediante claves y campos de referencia del esquema.

## Lista autorizada

| | | | | | | | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 839445 | 839453 | 839454 | 839995 | 839996 | 839997 | 839998 | 839994 |
| 840598 | 840600 | 840720 | 840721 | 840722 | 840723 | 841140 | 841431 |
| 841757 | 841758 | 842233 | 842232 | 841947 | 842234 | 842382 | 842362 |
| 842386 | 842908 | 842909 | 842910 | 843065 | 843444 | 843196 | 843847 |
| 843855 | 843106 | 844224 | 844223 | 843107 | 843108 | 843121 | 843122 |
| 845121 | 845120 | 845704 | 845309 | 844408 | 845690 | 845515 | 845122 |
| 845941 | 845942 | 845943 | 845517 | 845709 | 845496 | 845516 | 845520 |
| 843516 | 845679 | 844304 | 844745 | 845667 | 844090 | 845562 | 845112 |

## Verificación y límites

**Resultado local de la versión corregida:** 10 comprobaciones específicas aprobadas; suite completa con 118 pruebas aprobadas, 0 fallidas y 0 omitidas. Incluye la ejecución del bloque por separado con autocommit y la comprobación de que la consulta final funciona después de desaparecer las tablas temporales.

Los archivos se prueban con las diez migraciones del repositorio en PostgreSQL local (PGlite), con datos ficticios. No se ha leído ni modificado el proyecto Supabase del usuario durante esta preparación.

Las pruebas comparan los valores completos de los registros, no solo sus cantidades. Cubren la lista exacta; vista previa sin cambios y cantidades equivalentes al borrado real; error por carga ausente; error de una clave foránea no prevista después de borrar hijos; intento de un trigger de modificar una carga protegida; conservación de registros compartidos y generales; Radar vacío; repetición sin cambiar fechas, autores ni datos.

El SQL comprueba de nuevo los registros protegidos dentro de la transacción. Si cambió cualquiera de ellos, lanza una excepción antes de terminar el bloque. Respeta claves foráneas y triggers; una dependencia desconocida causa un error y evita confirmar el borrado. Los bloqueos y tiempos máximos acotan la operación, pero no sustituyen comprobar el esquema del proyecto real si difiere de las migraciones.

Para repetir las comprobaciones específicas desde la raíz del repositorio:

```bash
node --test web/test/load-cleanup.test.js
```
