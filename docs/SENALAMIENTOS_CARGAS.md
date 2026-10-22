# Señalamientos de logística por carga

Debajo del número de trailer aparece **+ Señal**. Al pulsarlo se abre un selector con icono, nombre y explicación. Se pueden elegir hasta tres marcas visuales por carga, guardarlas o quitarlas. Al tener marcas, el mismo botón muestra sus iconos; al pasar el ratón o usar lector de pantalla se anuncian sus nombres. El selector también está en el detalle rápido, las tarjetas y el expediente.

| Señal | Uso |
| --- | --- |
| Atención urgente | Requiere atención inmediata. |
| En taller | Unidad en reparación o mantenimiento. |
| Retraso | Demora que se debe vigilar. |
| Documentos pendientes | Falta documentación de la carga. |
| Revisión en aduana | Dar seguimiento al despacho o revisión. |
| Carga / descarga | Operación por vigilar. |
| Cita por confirmar | Confirmar horario con planta o destinatario. |
| Carga prioritaria | Seguimiento especial. |

Las marcas se comparten con el equipo y persisten al recargar. Se retiran manualmente; no cambian el estatus de la carga, el color manual ni las fechas de las tareas. Son independientes de los pendientes puntuales y no generan envíos externos. Se conservan en el historial con nombres legibles. Admin y CSR pueden editarlas; Gerencia puede consultarlas. El portal cliente no recibe estos campos internos.

## Actualizar

1. Ejecutar **todo** `supabase/actualizar_senalamientos.sql` en Supabase → SQL Editor → New query → Run. Requiere las migraciones anteriores hasta 012. Incluye 013 (pendientes puntuales) y 014 (señalamientos), por lo que sirve también si aún no se aplicó la última entrega. Se puede ejecutar nuevamente y conserva los registros existentes. Si ya se instaló 013, también se puede ejecutar únicamente `supabase/migrations/014_load_signals.sql`.
2. Reemplazar todo `index.html` de Google Apps Script con `google-apps-script/index-sitio.html` y guardar.
3. Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar. Recargar con Ctrl + Shift + R.

Para elegir o cambiar marcas: pulsar los iconos o **+ Señal**, seleccionar y **Guardar señalamientos**. Para retirarlas todas: **Quitar todos → Guardar señalamientos**. Cancelar o Escape descarta el borrador sin escribir. El servidor debe confirmar el guardado antes de mostrar el cambio; si rechaza una versión antigua, el borrador permanece para poder consultarlo y reabrir la carga actualizada.

## Código e iconos

- `web/src/original/logistics-signals.js`: catálogo cerrado, SVG locales, validación y presentación reutilizable.
- `panel/06_events_and_sync.js`: diálogo, borrador, límite de selección y confirmación del guardado.
- `api/operations.js` y migración 014: permisos, control de versión, límites y autor/fecha establecidos desde Auth.
- Triggers de `loads`: historial y sincronización incremental existentes. No hay una consulta adicional por cada icono ni descarga externa de iconos.

Iconos [Lucide](https://lucide.dev), versión [0.468.0](https://github.com/lucide-icons/lucide/tree/0.468.0/icons): `triangle-alert`, `wrench`, `clock-alert`, `file-clock`, `shield-alert`, `forklift`, `calendar-clock`, `flag`. Licencia ISC incluida en [LICENCIA_ICONOS_LUCIDE.txt](LICENCIA_ICONOS_LUCIDE.txt) y en el código del catálogo. Se adaptan tamaño y color al tema claro; nunca se admite SVG enviado por un usuario.

## Verificación de la entrega

Las pruebas se ejecutan con PostgreSQL local y transporte Supabase simulado; no escriben en producción. La suite completa del proyecto pasó 183 comprobaciones y se agregó un caso del adaptador para conservar guardados de otros campos y rechazar un borrador de marcas cambiado por otra persona.

El navegador comprueba las ocho opciones, el límite de tres, cancelar sin escritura, error sin perder selección, guardado confirmado, persistencia, retiro, lectura de Gerencia, detalle anidado, teclado y anchos de 320 a 1920 px. La regresión revisa también el tema claro, los colores manuales, el orden de cargas, las vistas del calendario y las tareas.

Reproducir con `node --test --test-concurrency=2 web/test/*.test.js`; compilar y empaquetar con los scripts habituales. Con `google-apps-script` servido localmente en el puerto 5182, ejecutar `node scripts/check_browser.mjs --signals-only` o `--calendar-tasks-only` para incluir las pantallas relacionadas. Se requieren Chromium y las herramientas externas indicadas en el script.
