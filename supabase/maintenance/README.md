# Mantenimiento manual

Estos SQL no son migraciones y no se ejecutan durante la instalación, actualización o inicio del sitio.

La limpieza del 15 de octubre de 2026 conserva una lista fija de 64 cargas autorizadas por el usuario. Primero ejecutar `01_vista_previa_conservar_64.sql`; el borrado definitivo está en `02_eliminar_excepto_64.sql`.

[Alcance, lista e instrucciones completas](../../docs/LIMPIEZA_CARGAS_2026-10-15.md).
