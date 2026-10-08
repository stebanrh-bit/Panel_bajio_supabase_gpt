# Esteban: administración, operación y prueba del portal

La cuenta Esteban conserva su rol **Supervisor** (admin en Supabase). Puede recibir clientes y trabajar sus cargas como CSR. No hay que cambiarle el rol ni crear otra cuenta interna.

## Activar este ajuste

Esta actualización solo cambia el HTML. La base, Code.gs y la función de cuentas ya instalados se conservan.

1. Abre [index-sitio.html completo](https://raw.githubusercontent.com/stebanrh-bit/Panel_bajio_supabase_gpt/supabase-inicial/google-apps-script/index-sitio.html) y copia todo con Ctrl+A y Ctrl+C.
2. En el proyecto Google existente, abre **index.html**, selecciona todo y pega el contenido nuevo. Guarda.
3. Abre **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**.
4. Abre el enlace habitual y actualiza con Ctrl+Shift+R.

No hace falta repetir SQL, borrar datos ni desplegar `panel-accounts` de nuevo.

## Operar tus cargas como CSR

1. Importa el archivo de cargas. Los clientes aparecerán en los selectores cuando se hayan guardado sus cargas.
2. Abre **Gestionar CSR** y entra con tu contraseña personal de Esteban.
3. En **Asignar cliente a CSR**, selecciona **Esteban**, el cliente que atenderás y pulsa **Asignar**. Repite para tus demás clientes.
4. Abre el selector **¿Quién eres?** y selecciona **Esteban · CSR**. Esta opción aparece al tener clientes asignados o cargas seguidas.
5. La vista muestra tus clientes y las cargas que sigues. Los comentarios y cambios siguen firmados por tu misma cuenta Esteban.
6. Para revisar toda la operación, selecciona **Todos (sin filtro)**. Conservas los controles administrativos en ambas vistas.

La asignación persiste al actualizar. Al iniciar sesión o recargar, la vista de Supervisor sigue siendo general; puedes volver a seleccionar Esteban · CSR cuando quieras. El filtro del selector cambia la presentación, no el rol ni los permisos de la sesión.

## Comprobar lo que ve un cliente

Utiliza una cuenta de cliente de prueba para comprobar sus permisos reales. No cambies el rol de Esteban a Cliente.

1. Desde **Gestionar CSR**, busca **Cuentas del Portal Cliente**.
2. Escribe un nombre distinto, por ejemplo **Esteban Prueba Cliente**, elige el cliente que quieres revisar, usa **esteban-prueba-cliente** como usuario y define una contraseña de al menos ocho caracteres. Guárdala en privado.
3. Pulsa **Guardar cuenta**. No requiere otro correo.
4. Abre una **ventana privada/incógnito**, para conservar tu sesión de administrador en la ventana normal.
5. Abre [Portal Cliente](https://script.google.com/macros/s/AKfycbzoOVMfiVGBU1ZWht4TcYZc2cqeBUKVeDTYsiSiEpwWIHnu_SPEnoCFKKG1AhZ6Mdjr/exec?portal=cliente) y entra con el usuario y contraseña de prueba.
6. Comprueba que solo aparecen las cargas del cliente elegido y que el portal permite consultar documentos, incidencias y avisos públicos sin mostrar datos internos.

La cuenta de prueba representa al cliente elegido; para comprobar otro cliente, administra una cuenta de prueba para ese cliente. Tu cuenta interna mantiene la administración y la operación CSR.

## Comprobaciones

La base ya admitía asignar clientes a administradores. El ajuste agrega esa posibilidad a los selectores y a la vista operativa, conservando los estilos existentes. Las pruebas PostgreSQL verifican la asignación propia, la conservación del rol admin y el rechazo de acceso al portal con ese rol. Chromium verifica la asignación desde el formulario, persistencia al recargar, vista propia y regreso a Todos, con controles administrativos disponibles.

La instalación y estas comprobaciones con cuentas reales quedan pendientes en Google. El usuario confirmó el acceso y la apariencia original antes de este ajuste y ejecutó la limpieza de datos de prueba para preparar la importación.
