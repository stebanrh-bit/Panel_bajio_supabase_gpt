# Actualizar Tareas y checklist y quitar Contactos VG

El usuario reportó vacía la pestaña Tareas y checklist. Ahora se consultan las tareas abiertas al entrar, se identifica la pestaña seleccionada y aparece un botón para crear tareas. Sin registros, la ventana explica cómo continuar. Abrir una tarea indica progreso y muestra cualquier error del servidor.

Contactos VG se retiró de la interfaz y de las referencias de regreso. El campo CSR en Vanguard continúa siendo manual. Se conservan los datos y vínculos existentes en Supabase.

## Actualización de un solo archivo

Estos pasos aplican si ya instalaste la entrega de las 49 opciones y ves Organizar turno y Guía de uso.

1. Abre [index-sitio.html actualizado](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html). Pulsa Ctrl+A y Ctrl+C.
2. En tu proyecto existente de Google Apps Script, abre **index.html**. Selecciona todo y pega el contenido completo. Guarda.
3. Abre **Implementar → Administrar implementaciones**, selecciona la implementación actual y pulsa el lápiz.
4. Elige **Nueva versión** y pulsa **Implementar**, conservando la configuración actual. Así conservas el enlace.
5. Abre tu enlace habitual y pulsa **Ctrl+Shift+R**.

Este ajuste no requiere ejecutar SQL ni cambiar Code.gs, la función de cuentas o los otros HTML.

## Repetir la prueba pendiente

Abre **Organizar turno → Tareas y checklist**. Si no hay registros, debe aparecer la explicación y **Nueva tarea de turno**. Ese botón abre el formulario habitual: crea PRUEBA CHECKLIST y asígnala a Esteban. Al regresar a Organizar turno, la tarea debe aparecer con **Abrir**. Añade los dos pasos obligatorios y comprueba que se guardan.

Pruebas locales de esta corrección: 143 pruebas del proyecto y 8 flujos de navegador con PostgreSQL efímero. Las pruebas en la implementación real continúan pendientes de esta actualización.
