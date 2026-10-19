# Tema claro y controles compactos — 19 de octubre de 2026

El panel interno, Portal Cliente y Vista Gerencia comparten una paleta clara: fondo gris azulado suave, superficies blancas, texto oscuro y azul sobrio para acciones. Se retiran los brillos de neón. Verde, ámbar y rojo conservan el significado de sus avisos.

## Qué cambia

- Tema claro en Inicio, Cargas, calendario, indicadores, apartados, Radar, Histórico, expediente, formularios y Organizar turno. Los portales de cliente y gerencia usan la misma paleta.
- Los estatus conservan sus valores y utilizan colores semánticos del tema.
- Mis clientes, Vista tabla/tarjetas y Mensaje a cliente tienen altura de 32 px en escritorio y 40 px en celular. Cada control ocupa su ancho natural; los resúmenes están en filas propias y no los estiran.
- La vista tarjetas usa una rejilla compacta, menos separación interna y botones pequeños. Conserva avisos, fechas y acciones desplegables.
- Las ventanas y los controles nativos, incluidos los selectores de fecha, usan el esquema claro.

No hay cambios en datos, permisos, notificaciones, fechas de seguimiento o consultas a Supabase. Los archivos originales de la raíz se conservan como referencia histórica.

## Mantenimiento

`web/src/original/theme-light.css` contiene la paleta y sus ajustes de presentación. `main.js` y `main-portal.js` la pasan a `originalPage` como `theme`; se añade al final del encabezado para respetar los estilos históricos y mantener una sola definición compartida.

Los colores de estatus de `panel/01_shell_and_cards.js` hacen referencia a las variables del tema. No se modifican las listas de estatus ni su lógica.

## Verificación

- Compilación de las cuatro entradas y correspondencia entre HTML y ZIP.
- 152 pruebas automáticas aprobadas, sin fallos, cancelaciones u omisiones.
- Revisión de contraste de texto en 35 escenas de escritorio/celular, expediente, formularios, Organizar turno y portales; sin hallazgos en los textos revisados. Se comprueban relaciones mínimas 4.5:1 para texto normal y 3:1 para texto grande.
- Medición de los tres controles señalados: 32 px de alto en escritorio, con anchos independientes del contenido de los resúmenes.
- Regresión de navegador: campana de tres cuentas, vistas del calendario, tareas, listado sin scroll, seguimientos e importaciones CSV/XLSX/XLS, sin errores JavaScript.

[Evidencia](evidencia-tema-claro-2026-10-19.json). Datos de prueba locales; no se escriben registros en producción. Las pruebas manuales continúan canceladas.

## Actualizar Google Apps Script

Esta entrega requiere **los tres HTML** para que el tema sea consistente:

1. Copia [index-sitio.html](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html) y reemplaza **index.html** en tu proyecto Google.
2. Copia [index-cliente.html](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-cliente.html) y reemplaza **index-cliente.html**.
3. Copia [index-gerencia.html](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-gerencia.html) y reemplaza **index-gerencia.html**.
4. Guarda. Ve a **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**.
5. Recarga tu enlace habitual con **Ctrl+Shift+R**.

No requiere SQL, Code.gs ni lector.html. La implementación real de Google cambia después de copiar los archivos y publicar la nueva versión.

## Capturas

- [Panel completo](imagenes/tema-claro-panel-completo.png).
- [Inicio](imagenes/tema-claro-inicio.png).
- [Opciones compactas](imagenes/tema-claro-opciones.png).
- [Tarjetas](imagenes/tema-claro-tarjetas.png).
- [Detalle](imagenes/tema-claro-detalle.png).
- [Organizar turno](imagenes/tema-claro-organizar.png).
- [Portal Cliente](imagenes/tema-claro-client.png).
- [Gerencia](imagenes/tema-claro-manager.png).
