# Mantenimiento manual

Estos SQL no son migraciones y no se ejecutan durante la instalación, actualización o inicio del sitio.

La limpieza del **19 de octubre de 2026** conserva únicamente **846071, 846072, 846069, 845562, 845112 y 846079**. Usar [03_eliminar_excepto_6_2026-10-19.sql](03_eliminar_excepto_6_2026-10-19.sql), con las [instrucciones y alcance](../../docs/LIMPIEZA_CARGAS_2026-10-19.md). Requiere el esquema actualizado hasta la migración 012. El archivo contiene toda la operación en un solo bloque y no depende de ejecutar otros SQL primero.

Como referencia histórica, la limpieza del 15 de octubre de 2026 conserva una lista fija de 64 cargas autorizadas entonces por el usuario. Esa lista corresponde a otra solicitud: no usarla para la limpieza de seis cargas.

[Alcance, lista e instrucciones completas](../../docs/LIMPIEZA_CARGAS_2026-10-15.md).
