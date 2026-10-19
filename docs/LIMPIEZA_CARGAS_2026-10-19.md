# Conservar seis cargas y eliminar las demás

Solicitud del 19 de octubre de 2026: conservar **846071, 846072, 846069, 845562, 845112 y 846079** con todos sus datos. La fila vacía del mensaje no representa un identificador.

El [SQL completo](../supabase/maintenance/03_eliminar_excepto_6_2026-10-19.sql) es mantenimiento manual para el esquema con las migraciones 001 a 012. No se incluye en migraciones, instalación, inicio ni actualización del sitio.

1. En Supabase abre **SQL Editor → New query**, con el rol **postgres**.
2. Copia y pega **todo el archivo SQL**. Quita cualquier selección parcial y pulsa **Run**. Evita hacer importaciones o ediciones mientras se ejecuta.
3. El resultado debe indicar **cargas_conservadas = 6** y los seis números anteriores. Después actualiza el panel con **Ctrl+Shift+R**.

El borrado es permanente. El bloque `DO` constituye una sola sentencia y confirma sus cambios al terminar con autocommit. Si falta una carga autorizada, una clave foránea impide el borrado o cambia algún dato protegido, se revierte el bloque completo. Ante un error, no ejecutar fragmentos para continuar. Si quedó una transacción en error, ejecutar `ROLLBACK;` antes de volver a ejecutar el archivo completo.

Conserva las seis cargas, incluso si están archivadas, sus comentarios, incidencias, historial, comunicaciones, seguidores, tareas, checklist, recurrencias y alertas. También sus solicitudes vinculadas, apartados relacionados y datos de importación. Compara valores completos, incluidos fechas y autores, antes de confirmar.

Elimina las demás cargas y los registros relacionados anteriores, incluidas sus programaciones de tareas. Quita las dependencias que apuntan a tareas eliminadas sin borrar la otra tarea. Retira filas de importación no autorizadas y los lotes que no contengan cargas conservadas. De Radar retira filas cuyo identificador coincida exactamente con una carga eliminada; conserva las filas externas independientes y el orden y contenido de las filas protegidas. Retira marcas individuales de cargas inexistentes; las revisiones generales siguen informando a los navegadores de los cambios.

Conserva cuentas, permisos, clientes asignados, plantillas, configuración, mapas y cierres de turno. Las tareas y solicitudes generales sin carga y apartados externos independientes permanecen. Los lotes de importación compartidos con cargas protegidas y sus metadatos permanecen; se quitan solo sus filas descartadas. No reescribe referencias dentro de texto libre.

Si un apartado protegido está enlazado mediante `related_load` a una carga descartada, o una tarea conservada depende de una programación que habría que borrar, el SQL se detiene para evitar modificar información protegida. Una alerta de una carga conservada asociada a una tarea descartada también causa reversión mediante la comparación de datos protegidos.

Se aprobaron siete comprobaciones locales en PostgreSQL (PGlite) con las doce migraciones y datos ficticios: carga faltante, relación desconocida, recurrencia compartida, apartado incompatible, conservación exacta y repetición con autocommit. No se ejecutó el borrado en el proyecto Supabase del usuario.

```bash
cd web
node --test test/load-cleanup-six.test.js
```
