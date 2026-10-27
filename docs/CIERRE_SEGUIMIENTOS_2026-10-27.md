# Cierre de pendientes y seguimientos — versión 2026.10.27.6

Los pendientes se retiran al resolver el trabajo, sin borrar el historial. Esta actualización conserva los instructivos y el correo manual de la entrega anterior.

| Tipo | Vigencia | Cómo terminarlo |
|---|---|---|
| Pendiente puntual | No tiene vencimiento automático; destaca algo que requiere atención ahora. | En el detalle o Expediente → Operación, pulsar **Marcar resuelto**. Sale de Inicio y de Pendientes puntuales; se conservan nota, autor y fecha en historial. |
| Seguimiento programado por ti | La fecha y hora indican cuándo atenderlo. Pasar la fecha lo deja pendiente. | En Expediente → Operación, pulsar **Completar seguimiento**. También puede completarse desde Inicio. Si todavía falta trabajo, cambiar fecha/hora y pulsar **Reprogramar**. |
| Revisión de tránsito | Revisión recurrente mientras la carga está En tránsito, según el intervalo configurado. | **Ya revisé (+3 h)** programa la siguiente revisión. Completar un seguimiento personal no elimina este control independiente. |

Leer un aviso o posponerlo una hora no completa un pendiente. Un seguimiento completado vuelve a mostrarse como **Sin seguimiento programado**; la acción realizada queda en el historial y puede aparecer en Atendidos recientes.

## Corrección de avisos repetidos

La campana comprobaba la vigencia de las tareas de turno, pero una revisión de carga conservada en su caché solo comprobaba que la carga siguiera perteneciendo a la cuenta. Podía permanecer visible después de completar o reprogramar el seguimiento, hasta renovar la consulta de avisos del servidor.

Ahora compara la carga y el evento con su plazo actual: completar elimina ese motivo; reprogramar invalida el aviso del plazo anterior. Las revisiones de tránsito que todavía estén pendientes siguen visibles. No se marca un trabajo como resuelto solo porque el aviso desaparezca ni se modifican otros pendientes.

Las acciones de completar conservan el registro completo confirmado por Supabase para sincronizar todas las vistas. El botón de la campana pasa de «Ya revisé» a **Completar seguimiento** para distinguirlo de la revisión recurrente.

## Actualizar

1. Copiar todo `google-apps-script/index-sitio.html` de esta entrega al archivo HTML **index** del proyecto actual de Apps Script.
2. Guardar → **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar**.
3. Recargar con **Ctrl + Shift + R**. El pie identifica **v2026.10.27.6**.

No requiere SQL nuevo ni cambiar Code.gs. No agrega una eliminación automática por tiempo.

## Verificación

225 pruebas automáticas aprobadas, incluidas vigencia de avisos, completado, reprogramación, cargas cerradas y plazos independientes. El recorrido del HTML entregable usa Supabase simulado, mantiene deliberadamente un aviso antiguo en las respuestas del servidor y verifica que deje de aparecer después del cierre y al recargar. También comprueba un rechazo del guardado y el reintento, la resolución del pendiente puntual y la conservación de la revisión de tránsito.

Reproducir: `node --test --test-concurrency=2 web/test/*.test.js`, `npm --prefix web run build`, `python scripts/package_site.py --check` y, con la vista previa local iniciada, `node scripts/check_browser.mjs --followups-only`.

[Evidencia de navegador](evidencia-cierre-seguimientos.json). No se escribe en producción ni se envían mensajes.
