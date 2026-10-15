# Validación de la interfaz original con Supabase

Comprobaciones de la entrega de usabilidad actualizadas en Codex el 15 de octubre de 2026. No representan una actualización de la publicación Google ni ejecución remota de SQL 004–010. Las consultas remotas de la revisión fueron de lectura. [Mejoras actuales e instalación](MEJORAS_USABILIDAD.md), [revisión de usabilidad previa](REVISION_USABILIDAD_2026-10-15.md) e [informe general anterior](REVISION_COMPLETA_2026-10-14.md).

| Comprobación | Resultado |
| --- | --- |
| Panel original publicado | HTML recuperado; árbol JavaScript idéntico al `PanelScript.html` de la raíz |
| Portal Cliente y Vista Gerencia originales | Plantillas recuperadas de sus páginas publicadas |
| `npm --cache /tmp/panel-npm-cache test` | 108 pruebas aprobadas; 0 fallidas y 0 omitidas |
| `npm --cache /tmp/panel-npm-cache run build` | Compilación de 129 módulos correcta, incluyendo lector XLSX y mejoras de usabilidad |
| `deno check supabase/functions/panel-accounts/index.ts` | Tipos y dependencias correctos usando las autoridades TLS del sistema |
| Acciones de las tres interfaces | 97 acciones tienen adaptadores; incluye Seguir/Dejar de seguir |
| Chromium: comparación visual | 38 parejas de presentación prevista y entrega con datos ficticios independientes; escritorio y móvil; Inicio simplificado por petición del usuario |
| Chromium: administrador también CSR | Esteban se identifica como Admin y Abraham como Supervisor, con sus permisos conservados; asignación desde el formulario, persistencia al recargar, vista propia y Todos sin perder el rol ni los controles administrativos |
| Chromium: incidencia | Categoría vacía rechazada sin insertar; registro válido persiste al recargar |
| Chromium: revisiones y seguimientos | Plazos independientes, tránsito +3 h, completar seguimiento sin eliminar el otro plazo, próximas fechas y móvil sin desbordamiento |
| Chromium: usabilidad | Una fila por carga; Tab/Shift+Tab dentro de Comentarios y el expediente, ventanas anidadas, Escape y retorno al origen; edición desplegable con persistencia; secciones administrativas conservan borradores |
| Chromium: guardado rechazado | Respuesta 409 simulada no cambia la carga; error permanece visible más de 3 segundos y requiere descarte explícito |
| Chromium: ancho y ventanas | Cargas a 360 y 390 px, también con edición abierta; Administración dentro del alto disponible y con desplazamiento interno |
| Chromium: Trailer e historial | Identificador largo completo, edición y persistencia; campos legibles, Antes/Ahora, cero y confirmaciones; metadatos internos omitidos y contenido HTML mostrado como texto |
| Chromium: solicitudes y tareas | Tres comparaciones nuevas: secciones cerradas y formularios de alta; abrir/cerrar con teclado, preferencia al recargar, contador propio, fecha legible, validaciones y envío de campos correctos al transporte interceptado; edición conserva responsable; ventanas y Guardar accesibles a 360 y 390 px |
| Chromium: calendario semanal | Tipos exclusivos y combinación con cliente; apartados asociados y sin cliente identificado; navegación entre semanas conservando filtros; limpiar y abrir registros; teclado y móvil a 360/390 px sin desbordamiento |
| Cola Google en PostgreSQL local | Seis casos: permisos mínimos y secreto, reservas sin duplicados, recuperación de reserva vencida, cuota y reintentos, conservación OSM/sin ruta/valores inválidos, prioridad manual e instalación repetible |
| Proceso Google simulado y lectura del radar | Seis pruebas: accesos visibles del editor con comprobación de identidad, suma de tramos y escritura confirmada, parada por cuota, tiempo máximo y bloqueo, vinculación sin publicar secreto y activador único, preferencia del resultado Google guardado |
| Activador Maps real | Pendiente: instalar SQL 010, vincular hash y activar en Google según MILLAS_GOOGLE_AUTOMATICAS.md; no ejecutado contra producción |
| Chromium: salida | Cierre de sesión vuelve al selector y elimina la identidad; sin errores JavaScript |
| Chromium: archivos reales | CSV, XLSX y XLS; vista previa, cancelar sin guardar, fechas inválidas, ceros iniciales, booleanos, duplicados y persistencia al confirmar |
| Supabase remoto | Auth y directorio responden 200; 13 tablas privadas, administración de cuentas y RPC del portal rechazan peticiones sin sesión con 401 |
| Google remoto | Responde 302 hacia accounts.google.com; requiere iniciar sesión para inspeccionar la publicación |
| Entrega reproducible | SQL, HTML y ZIP se comprueban con `python3 scripts/package_site.py --check` |
| Originales de la raíz | Conservados sin modificaciones |

Las pruebas PostgreSQL usan PGlite con identidades y roles Auth simulados. Cubren lectura/escritura por rol, autor real, versiones, transacciones, repetición de migraciones, aislamiento de plantillas, datos públicos del cliente, radar y conservación de incidencias retiradas. La instalación conjunta se prueba con un fallo deliberado al final: revierte todo y conserva las cargas anteriores. Repetir la instalación conserva datos y permisos.

Las pruebas de cuentas ejecutan el manejador de la función Edge con el SDK Supabase real y transporte interceptado. Cubren acceso por nombre, privacidad del directorio, comprobación del rol administrativo, cambios de contraseña sin secretos en la auditoría, conservación de contraseña al editar un cliente, desactivación frente a retirada, bloqueo por cinco fallos y desbloqueo administrativo. Estas pruebas no autentican contra el proyecto real.

El navegador compara el HTML generado con la presentación prevista usando datos independientes equivalentes. Inicio agrupa las acciones por carga; tarjetas, Administración y cuenta se simplificaron por petición del usuario. No se declara igualdad visual con la interfaz anterior. Incluye tarjetas y tabla, seis pestañas del expediente, calendario, indicadores, radar, históricos, ventanas y los dos portales. Admite como máximo 50 píxeles de diferencia de suavizado por captura; las fuentes externas se sustituyen por la misma respuesta en ambos lados. Las capturas y resultados quedan en `/tmp/panel-original-comparison/`. Capturas de la entrega se incluyen en `docs/imagenes/` y el ZIP. El resultado JSON agrega las mediciones de ancho y de la ventana administrativa de la ejecución.

Cuatro pruebas de calendario verifican claves de cliente sin colisiones, reconocimiento exacto de carga/cliente para un apartado, ausencia de inferencias fuera del alcance y filtrado combinado sin mutar registros ni fechas.

Cuatro pruebas de historial verifican la selección de cambios operativos, creación resumida, valores falsos y cero, fechas, autor y adaptador de consulta; conservan los registros de entrada y la comprobación de acceso del personal.

Las seis pruebas de usabilidad adicionales comprueban agrupación sin mutar datos, fechas sin hora, conservación de controles y borradores entre secciones, etiquetas asociadas, errores concurrentes persistentes, montaje con encabezados anidados y eventos de guardado sin argumentos sensibles. La accesibilidad se comprueba para esos casos; no se presenta como certificación completa con lector de pantalla.

Las pruebas conservadas de los módulos anteriores verifican también importación XLSX/CSV, deshacer, archivo, pendientes, turnos y Maps. El puente Google se comprueba con servicios simulados: verifica JWT y rol antes de consumir Maps y suma todos los tramos de carretera.

El 14 de octubre se comprobó de nuevo el enlace Google tras la actualización informada por el usuario. La respuesta inicial es 302 hacia accounts.google.com: sin iniciar sesión no se puede recorrer el interior de esa publicación. Esta observación precisa el bloqueo anterior CONNECT 403; no demuestra un fallo de la aplicación. Faltan activar la corrección del importador y comprobar las operaciones con sesión real, el iframe Google, mapas, cuotas y otros roles, según [PRUEBAS_FINALES.md](PRUEBAS_FINALES.md). La cola automática de millas está preparada para Supabase y Apps Script, con [activación remota pendiente](MILLAS_GOOGLE_AUTOMATICAS.md). La integración TCI y los otros activadores del backend antiguo no se instalaron; los límites están en [COMPARACION_ORIGINAL.md](COMPARACION_ORIGINAL.md).

## Repetir la comprobación

Desde `web/`, con las variables públicas Supabase configuradas:

```bash
npm --cache /tmp/panel-npm-cache ci --no-audit --no-fund
npm --cache /tmp/panel-npm-cache test
npm --cache /tmp/panel-npm-cache run build
```

Desde la raíz del repositorio:

```bash
python3 scripts/package_site.py
python3 scripts/package_site.py --check
npm install --prefix /tmp/panel-browser-tools --cache /tmp/panel-npm-cache --no-audit --no-fund playwright-core@1.56.1 pngjs@7.0.0 deno@2.5.4
DENO_TLS_CA_STORE=system DENO_DIR=/tmp/panel-deno-cache /tmp/panel-browser-tools/node_modules/.bin/deno check supabase/functions/panel-accounts/index.ts
python3 -m http.server 5182 --bind 127.0.0.1 --directory google-apps-script
```

En otra terminal de la misma máquina, con Chromium en `/usr/bin/chromium`:

```bash
node scripts/check_browser.mjs
```

Para repetir solo los flujos de importación, usa `node scripts/check_browser.mjs --imports-only`. Para incluir el XLS antiguo con su biblioteca real:

```bash
curl --fail --location https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js --output /tmp/panel-audit-sheetjs.js
node scripts/check_browser.mjs --legacy-xls
```

La biblioteca se descarga por HTTPS sin desactivar la verificación TLS y se sirve al navegador de prueba mediante una ruta interceptada. El archivo XLS de prueba solo contiene datos ficticios. `PANEL_SHEETJS_FILE` permite indicar otra ruta de la misma biblioteca.

El servidor se utiliza solo para la comprobación interna y puede detenerse después. El script intercepta las peticiones Supabase; no escribe en producción. Las rutas se pueden configurar con `PANEL_BROWSER_TOOLS` y `PANEL_PREVIEW_URL`. Publicar Google no requiere mantener este servidor ni Codex abierto.
