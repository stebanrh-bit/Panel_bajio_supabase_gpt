# Comparación y adaptación del original

Se recuperó el HTML público del panel original y de sus rutas `?portal=cliente` y `?portal=gerencia`. La estructura JavaScript del panel publicado coincide con `PanelScript.html` del repositorio al comparar el árbol de sintaxis sin posiciones ni comentarios. El enlace de nuestra publicación devuelve CONNECT 403 desde Codex; ese bloqueo no permite inspeccionar su estado actual y no establece un fallo del sitio.

La entrega reemplaza la aproximación visual anterior con las plantillas, CSS, logos y JavaScript originales. El adaptador de `web/src/original/api/` conserva 97 acciones: 91 del panel interno, incluyendo las dos llamadas condicionales Seguir/Dejar de seguir, y seis de los portales. La cadena de callbacks original se conecta a Supabase; el servicio real de Google se conserva para Maps.

| Pantalla o ventana | Implementación |
| --- | --- |
| Inicio, Ahora/Mi turno, jornada, recordatorios, caja cruzada, carga por CSR y cierres | HTML y lógica originales |
| Operación: tarjetas, tabla, filtros, densidad, selección masiva, vistas guardadas y detalle | HTML y lógica originales |
| Workspace: Operación, Tracking, Comunicación, Documentos, Incidencias e Historial | Seis pestañas originales; lecturas y escrituras Supabase |
| Calendario e indicadores, SLA y exportación del reporte | Interfaz original; SLA desde el cambio pendiente más reciente |
| Pendientes, comentarios, vinculación y bitácora/histórico | Ventanas originales; transacciones, autores y versiones del servidor |
| Apartados, revisiones, estados e historial | Ventana original; conservación del expediente al retirarlo |
| Radar, Excel compartido, coordenadas, direcciones exactas y búsquedas guardadas | Interfaz original; tablas compartidas y recálculo manual Google |
| Avisos, mensajes múltiples, confirmación y selector de persona | Controles originales |
| Identidad, cambio de contraseña, clave de administración y Gestionar CSR | Diseño original; Supabase Auth y función de cuentas protegida |
| Portal Cliente: login, embarques, detalle, documentos, incidencias y avisos públicos | Plantilla original; cliente de la sesión y campos permitidos por RPC |
| Vista Gerencia: login, agrupación CSR, filtros y detalle | Plantilla original; acceso de consulta |

Las 15 ventanas principales conservan sus elementos y estilos. Los módulos originales de la raíz permanecen intactos como referencia. El JavaScript reutilizado se formateó para que pueda leerse; los adaptadores nuevos tienen comentarios en español y responsabilidades separadas.

## Cambios de funcionamiento necesarios para Supabase

- La sesión y las contraseñas pertenecen a Supabase Auth. El antiguo token de la interfaz se sustituye por un marcador; la sesión real la administra el SDK. Nunca se almacena la contraseña en localStorage.
- La administración exige una cuenta activa con rol admin y comprueba el rol en cada petición. La clave del diálogo es la contraseña personal del administrador. No se utiliza la contraseña compartida del antiguo Apps Script.
- Se mantienen las reglas Supabase existentes: admin/CSR escriben; manager consulta; clientes reciben solo cargas autorizadas; pendientes/apartados conservan sus permisos de autor. Los nombres recibidos en formularios no autorizan operaciones ni eligen el autor.
- Guardar usa la versión leída y rechaza ediciones simultáneas. Deshacer importación cancela la operación si hubo actividad posterior, para conservar los cambios del equipo. El texto del diálogo explica esta regla.
- Eliminar/cancelar retira registros de las listas visibles y conserva sus expedientes. Una incidencia retirada deja auditoría y ya no aparece en el portal.
- La categoría se valida antes de insertar y en la base. Los registros antiguos inválidos se conservan. Documentos sin información permanecen distintos de los marcados como pendientes.
- El refresco consulta marcas ligeras y descarga únicamente áreas modificadas. Las respuestas posteriores a cerrar sesión se descartan.

## Límites de la comprobación

Las capturas se comparan localmente con los mismos datos ficticios. El navegador aplica un margen máximo de 50 píxeles para variaciones de suavizado en bordes; no se cambian las posiciones, fuentes, tamaños ni colores del original. No se transfirieron cargas ni contraseñas del proyecto original.

Maps real, Supabase Auth real, el iframe Google, otros roles y las cuotas se validan después de instalar. Se conservan las dependencias originales de Inter, SheetJS, Leaflet, Nominatim y OSRM. La integración TCI con una hoja externa y los activadores de mantenimiento/archivado/certificación horaria no se instalaron en la nueva arquitectura. No se declara equivalencia de esas automatizaciones externas ni de los permisos heredados del backend Sheets.
