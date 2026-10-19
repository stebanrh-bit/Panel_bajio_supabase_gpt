# Espacio entre filas en Cargas

Se reemplaza el botón «Tabla compacta / Tabla cómoda» por **Opciones → Espacio entre filas**, con la opción actual siempre visible:

- **Normal:** más separación para leer cada renglón.
- **Reducido:** menos separación para mostrar más cargas en la misma pantalla.

El texto mantiene su tamaño y las columnas permanecen visibles. La elección se recuerda en este navegador, usando la misma preferencia anterior. El control se oculta en Vista tarjetas y no cambia la vista, los filtros ni los datos.

El control anterior mostraba el nombre de la siguiente opción. Además, sus reglas CSS tenían menor prioridad que los estilos de la tabla sencilla, por lo que no modificaban la separación. La tabla ahora define el espacio de filas y encabezados mediante variables en `usability.css`; la clase de densidad cambia esas variables dentro del mismo ámbito. La hoja de estilos histórica permanece intacta.

## Actualizar Google Apps Script

Reemplaza **index.html** por el contenido completo de [index-sitio.html](../google-apps-script/index-sitio.html). Guarda y selecciona **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**. Recarga el panel con **Ctrl+Shift+R**. No requiere SQL ni cambios en Code.gs o los portales.

## Verificación

Se aprobaron 27 pruebas relacionadas con presentación, adaptador y usabilidad, la compilación de las cuatro entradas y la correspondencia del paquete entregable. El recorrido en Chromium comprueba que las filas cambian de altura sin modificar texto ni columnas, que la elección sobrevive a la recarga, que el control se oculta en tarjetas y que también funciona en móvil. Comprueba el listado sin scroll lateral en once anchos y conserva las comprobaciones de filtros, detalle, edición y teclado. El mismo recorrido ejecuta la revisión de contraste del tema claro.

En los datos ficticios de escritorio, una fila pasó de **62.78 px** en Normal a **46.78 px** en Reducido. La altura depende del contenido y del ancho disponible; no es un alto fijo que recorte información. Las peticiones de las pruebas se interceptan localmente y no escriben en Supabase real. Las pruebas manuales siguen canceladas.

```bash
cd web
node --test test/usability.test.js test/original-adapter.test.js test/original-layout.test.js test/optimization.test.js
```

Después de compilar, empaquetar y servir localmente `google-apps-script`:

```bash
node scripts/check_browser.mjs --simple-sheet-only
```
