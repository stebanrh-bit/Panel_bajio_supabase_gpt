# Inicio más claro: revisiones, avisos y tareas

Esta entrega simplifica Inicio por petición del usuario. Conserva los colores, las ventanas y las funciones; cambia la organización, las etiquetas y la orientación. No cambia las reglas de Supabase ni elimina datos.

**Actualización del 15 de octubre:** los avisos y revisiones se reúnen ahora en una sola fila por carga. Los filtros permiten ver cada tipo; las próximas fechas se despliegan dentro de esa misma fila. Consulta [las mejoras de usabilidad](MEJORAS_USABILIDAD.md) para la navegación actual.

## ¿Los recordatorios tienen vigencia?

Tienen una **fecha de vencimiento**, que indica cuándo hay que actuar. Vencer no borra el recordatorio ni lo da por resuelto.

| Tipo | Cuándo aparece por atender | Qué hacer |
| --- | --- | --- |
| Revisión de tránsito | Cada 3 horas mientras la carga está En transito | Revisar y pulsar **Ya revisé (+3 h)**. Agregar un comentario o registrar un aviso enviado también reinicia esas 3 horas |
| Recordatorio por estatus / despacho estimado | En la fecha elegida para Descompuesta, En resguardo o Patio permisionario | Revisar la situación y **Cambiar fecha**, o abrir la carga y actualizar su estatus |
| Seguimiento programado por ti | En la fecha que programaste en la carga | **Completar seguimiento** cuando hayas hecho la tarea, o cambiar su fecha desde la carga |
| Aviso de la operación | Cuando el panel detecta un cambio o una situación que requiere atención | Leerlo y registrar la acción realizada; **Ocultar aviso 1 h** solo pospone esa notificación |

Los dos plazos de una carga son independientes: revisar el tránsito no completa un seguimiento que programaste tú. Completar ese seguimiento tampoco elimina la siguiente revisión de tránsito. Las fechas usan la zona horaria del navegador.

## Cómo recorrer Inicio

1. En **Por atender**, mira primero las cargas urgentes. **Abrir carga** permite consultar el motivo y registrar la acción realizada.
2. En **Revisiones y seguimientos**, cada fila indica carga, cliente, tipo, fecha y estado. Los vencidos aparecen primero. Abre **Programados** para consultar las próximas fechas.
3. En **Avisar al cliente**, prepara la actualización, envíala por tu canal habitual y registra el aviso enviado. El panel no envía mensajes por sí mismo.
4. En **Solicitudes y tareas**, una solicitud todavía no tiene carga confirmada; una tarea es trabajo que registraste o que te asignaron.
5. Abre **Agenda y resumen de la operación** cuando necesites citas, entregas, cruces, incidencias o indicadores adicionales. Permanecen disponibles sin ocupar el primer plano.

El menú muestra nombres junto a los iconos. **¿Qué significa cada pendiente?** explica las diferencias sin salir de Inicio. Marcar un aviso como leído no completa una tarea ni cambia su fecha.

## Activar la entrega

1. Copia [index-sitio.html completo](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html).
2. En el proyecto Google existente, sustituye el contenido de **index.html** y guarda.
3. **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**.
4. Actualiza el enlace habitual con Ctrl+Shift+R.

Solo requiere el HTML: SQL, Code.gs y la función de cuentas existentes se conservan. Las cuentas y cargas del usuario no se modificaron en esta revisión.

## Validación y límites

Se prueban vencidos persistentes, fechas futuras, falta de fecha y plazos independientes. Chromium comprueba que revisar tránsito reinicia sus 3 horas y mantiene el seguimiento personal; completarlo elimina solo ese seguimiento. Las próximas fechas siguen disponibles y el menú móvil no genera desplazamiento horizontal. Se conservan las pruebas de archivos, incidencias, sesión, asignaciones y portales.

Las comparaciones internas contrastan la presentación simplificada prevista, con datos ficticios independientes, frente al HTML conectado al SDK Supabase. No representan igualdad visual con el Inicio anterior del original. Cliente y Gerencia se conservan; los originales de la raíz permanecen intactos.

Falta comprobar esta nueva entrega en Google con sesión y datos reales. El usuario confirmó que podía administrar después de actualizar la versión anterior; eso no valida automáticamente esta interfaz nueva.
