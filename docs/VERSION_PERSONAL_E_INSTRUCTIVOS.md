# Versión personal e instructivos por ruta

La entrada activa es interna: Mis cargas, Mis clientes, comentarios, incidencias, radar, tareas, pendientes e instrucciones. Las vistas de Gerencia/cliente quedan retiradas. Se conserva la preparación manual de mensajes para copiarlos o abrirlos en WhatsApp y registrar su envío. Se conservan los datos históricos. Las cuentas manager/client no entran al panel actual y los RPC de los portales quedan sin permiso. La campana se usa para seguimiento interno.

## Actualizar

1. Ejecutar todo `supabase/actualizar_version_personal.sql` en SQL Editor → New query → Run. Requiere 001 a 012; incluye los señalamientos y pendientes de las entregas recientes. Conserva los registros y puede reinstalarse.
2. Reemplazar `index.html` de Google Apps Script con `google-apps-script/index-sitio.html`.
3. Reemplazar `Code.gs` con `google-apps-script/Code-sitio.gs`. Mantiene las funciones del proceso de millas; no borrar propiedades del script ni crear otros disparadores.
4. Guardar → Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar. Recargar con Ctrl + Shift + R.

Se muestran las cargas de los clientes asignados a la sesión. Admin puede revisar las asignaciones desde Administración. Los clientes capturados sin asignación quedan vinculados al usuario que los crea. Los clientes que ya tienen otro dueño conservan su asignación. Si al iniciar no aparecen cargas, revisar Clientes y asignaciones antes de importar otra vez.

Si ya está aplicada la versión personal 016, basta ejecutar `supabase/actualizar_cargas_y_mensajes.sql` y reemplazar `index.html`. `Code.gs` conserva su contenido.

## Mensajes manuales y estatus inicial

En Cargas → Mensaje a cliente se prepara un texto para varias cargas del mismo cliente. En el detalle → Notificar a cliente se prepara un mensaje individual. Se puede editar, copiar o abrir en WhatsApp y después pulsar Registrar como enviado. Solo esta confirmación registra el aviso; las cuentas externas y los envíos automáticos siguen desactivados.

Las cargas nuevas comienzan con PTE. ARRIVO en rojo, incluso al importar un archivo. Las cargas existentes conservan su estatus. Los comentarios se escriben libremente sin botones de frases sugeridas; las plantillas de mensajes al cliente permanecen disponibles.

## Crear el primer instructivo

Organizar turno → Instructivos por ruta → Abrir instructivos. Elegir una ruta ya registrada y pulsar Nueva plantilla para llenar automáticamente cliente, origen y destino. También se puede registrar una ruta manualmente. Registrar cliente (vacío = regla general), origen/estado, destino/estado y recorrido. Abrir las etapas y escribir los procedimientos reales:

- Exportación: Planta del cliente → Patio permisionario/Yarda MX → Yarda USA → Cliente final.
- Importación: Cliente de origen → Tránsito en USA → Yarda USA → Agente aduanal → Yarda MX después del cruce → Cliente final.

Cada etapa admite qué hacer, condición que requiere confirmación, procedimiento ante problemas, contacto y requisitos de documentos/cruce que el panel comprueba. Puede avisar al confirmar la etapa o a la hora de la cita elegida. Las fechas se conservan con zona y se muestran en hora del centro de México.

Guardar como Borrador para preparar/revisar; solo Admin publica y aprueba. Un instructivo publicado se asigna por cliente y ruta exactos (mayúsculas, acentos y puntuación normalizados). Si no hay uno específico, busca la ruta general. Si hay ambigüedad no se elige una regla al azar. No se incluyen procedimientos de negocio inventados ni se aprenden reglas silenciosamente de comentarios.

Al publicar se puede aplicar a las cargas actuales de esa ruta que no tengan instructivo. Las cargas que ya lo tienen conservan su versión, condiciones y excepciones. Modificar una plantilla no reescribe esas cargas. Para adoptar la versión actual, abrir el recorrido de una carga y pulsar Actualizar desde plantilla.

## Seguimiento de una carga

El detalle y el expediente muestran Qué hacer ahora. El listado resume la siguiente acción debajo del último comentario. El estatus determina la etapa; si el punto es incierto, se pide confirmarlo. Un tramo de tránsito hacia el siguiente punto se identifica como próximo punto y no como llegada confirmada. La condición de negocio requiere confirmación expresa; los documentos faltantes siguen bloqueando el paso.

Marcar atendida cierra la instrucción vigente; un cambio de etapa activa la siguiente. Se puede reabrir y guardar una Excepción de esta carga. Si cambia la ruta, se pide revisar el instructivo. Guardar caso como propuesta permite capturar lo que funcionó y revisarlo después. Si ya hay un instructivo publicado para esa ruta, el revisor puede incorporar expresamente las etapas revisadas; se conservan las demás y las versiones que ya usan las cargas. La propuesta queda marcada como Caso incorporado.

La campana solo considera cargas propias, instrucciones vigentes y fechas cumplidas. Los avisos no se repiten por editar un trailer o un campo ajeno al instructivo. El panel no envía mensajes automáticamente. Preparar o copiar un mensaje no lo marca como enviado; el usuario confirma el envío manualmente.

## Mantenimiento

Las migraciones 015/016 agregan la base de conocimiento, las instantáneas por carga, control de versión, auditoría y el alcance personal. La base de conocimiento forma parte del respaldo paginado. La migración 017 deja PTE. ARRIVO como estatus inicial de cargas nuevas y la 018 recupera los mensajes manuales con historial limitado a los clientes propios. Los expedientes y las comunicaciones históricas se conservan. Los archivos de portales entregados ahora son un mensaje estático sin login ni consulta de datos.

La lógica de decisiones inicial usa reglas aprobadas. No conecta una IA externa ni consume una API de IA. El código de presentación se mantiene en `instructions/content.js`, el editor en `instructions/ui.js` y las decisiones/autorización en SQL.

## Verificaciones

La entrega incluye comprobaciones automáticas de PostgreSQL y del recorrido de navegador de la versión interna: publicación, incorporación de casos, actualización explícita de una carga, estatus inicial y confirmación manual de avisos.

Se usan PostgreSQL local y Supabase simulado en Chromium, sin operaciones sobre producción. Las pruebas nuevas comprueban aprobación, asignación, etapas de importación/exportación, condiciones/documentos, versiones por carga, excepciones, cambios de ruta, privacidad de cargas y retiro de portales. También se comprueban avisos futuros, cierre de seguimiento y restauración de la base de conocimiento con referencias desde cargas.

Los contratos históricos de consulta compartida, señalamientos y pendientes se siguen probando hasta la migración 015; la autorización personal de 016 se comprueba por separado con las migraciones completas. Las interfaces externas de entregas anteriores quedan solo como fuentes históricas.

Reproducir: `node --test --test-concurrency=2 web/test/*.test.js`, `npm --prefix web run build`, `python scripts/package_site.py --check`. Para el navegador, servir `google-apps-script` en el puerto 5182 y ejecutar `node scripts/check_browser.mjs --internal-only`.
