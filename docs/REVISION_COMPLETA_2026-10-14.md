# Revisión del sitio: 14 de octubre de 2026

Se revisó la entrega completa en la rama `supabase-inicial`, se ejecutaron pruebas automáticas y de navegador y se consultaron los servicios publicados sin escribir en producción. El usuario había informado que actualizó el HTML Google del ajuste de supervisor como CSR.

## Resultados

| Área | Comprobación | Resultado |
| --- | --- | --- |
| Acceso y cuentas | Sesiones, roles, contraseñas, administración y bloqueos | Pruebas locales correctas; función remota de directorio disponible |
| Cargas | Alertas, citas, revisiones, documentos, historial, versiones y conservación de cambios | Pruebas PostgreSQL e interfaz correctas |
| Incidencias | Categoría obligatoria, retirada lógica y persistencia | Correcto; vacío rechazado sin guardar |
| Pendientes y apartados | Creación, vínculo, estados, autores, historial y permisos | Pruebas locales correctas |
| Bitácora y cierres | Asignaciones, múltiples cargas, turnos, resolución y transacciones | Pruebas locales correctas |
| Supervisor/CSR | Asignación propia, selector de vista y regreso a Todos | Correcto en Chromium; conserva administración |
| Plantillas y cuenta | Preferencias personales y controles de acceso | Pruebas locales correctas |
| Calendario e indicadores | Navegación, filtros, métricas y reporte | Pruebas locales y comparación visual correctas |
| Radar y Maps | Tablas, coordenadas, rutas, validación de JWT/rol y suma de tramos | Pruebas locales correctas; Maps real pendiente en Google |
| Importación y deshacer | Archivos reales, confirmación, transacciones, versiones y protección de actividad posterior | Lectura corregida; pruebas correctas |
| Portales | Vistas cliente/gerencia, datos autorizados y bloqueo de campos internos | Pruebas locales correctas; RPC remoto deniega acceso sin sesión |
| Diseño | Escritorio, móvil y ventanas | 35 comparaciones visuales correctas; administración comprobada funcionalmente por su nuevo selector |

La suite completa terminó con **78 pruebas aprobadas, ninguna fallida u omitida**. La compilación transformó 123 módulos. El chequeo de tipos de `panel-accounts` y la comprobación de integridad del entregable pasaron. La revisión de Chromium terminó sin errores JavaScript.

## Problema encontrado y corregido

El importador reutilizado del original buscaba siempre los encabezados en la segunda fila. El CSV de prueba incluido en la entrega y un Excel sin fila de título podían no reconocer cargas. Además, el selector ofrecía solo XLS/XLSX y la conversión `!!valor` interpretaba textos como `false` o `no` como verdaderos.

Ahora se detecta el encabezado Load entre las primeras 15 filas y se aceptan CSV/XLSX/XLS. CSV y XLSX se leen con código incluido en el HTML; XLS conserva el lector original. Se mantienen ceros iniciales, fechas locales, desfases firmados y booleanos literales. Las filas sin carga se descartan antes de interpretar sus fechas; los duplicados conservan la última fila y se advierten en la vista previa. Estatus y campos manuales siguen protegidos por el servidor.

Se probaron los archivos desde el botón real y sus ventanas: cancelar no envía un guardado, una fecha inexistente no consulta la vista previa y confirmar guarda una vez y muestra las cargas tras recargar. Las peticiones de estas pruebas se interceptan y usan datos ficticios; no importaron cargas al proyecto real.

## Comprobaciones remotas

- Supabase Auth: HTTP 200.
- Directorio `panel-accounts`: HTTP 200, respuesta válida sin correos ni identificadores privados.
- Cargas, perfiles, incidencias, avisos, pendientes, apartados, turnos, asignaciones, preferencias, lugares, rutas, radar y registro de fallos de login: HTTP 401 sin sesión, con permiso de tabla denegado.
- Administración de cuentas y RPC de consulta del Portal Cliente: HTTP 401 sin sesión.
- Google `/exec`: HTTP 302 hacia accounts.google.com. Hace falta iniciar sesión en Google para revisar ese despliegue desde este entorno.

Estas peticiones no usaron contraseñas ni claves privilegiadas, no iniciaron sesión como otro usuario y no alteraron datos ni permisos.

## Activar la corrección

1. Copia [index-sitio.html completo](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html).
2. Sustituye el contenido de **index.html** en el proyecto Google existente y guarda.
3. **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar** conserva el enlace.
4. Actualiza el panel con Ctrl+Shift+R y retomamos la importación del archivo con vista previa.

Esta corrección solo requiere el HTML. No requiere SQL nuevo, volver a instalar la función de cuentas ni vaciar de nuevo la base.

La publicación Google con sesión real, la importación del archivo del usuario, las cuotas de Maps y las pruebas entre cuentas continúan pendientes. TCI externo y los activadores del backend antiguo tampoco están instalados. Estos límites impiden declarar que todo el sitio real ya está validado al 100 %.
