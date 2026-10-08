# Arquitectura y entrega actual

Supabase guarda datos, cuentas y permisos. Google Apps Script aloja el panel interno, Portal Cliente y Vista Gerencia. La interfaz actual se reutiliza del original, con 97 acciones adaptadas a Supabase. El usuario solicita código entendible y comentado y pruebas manuales al final, una por una.

- Fuente visual: `web/src/original/`; referencias intactas en la raíz.
- Adaptadores: `web/src/original/api/`, separados en operación, equipo, importación y radar.
- Cuentas: `supabase/functions/panel-accounts/index.ts`, Supabase Auth y JWT/rol verificados en servidor.
- Datos: migraciones 001–009; actualización conjunta 004–009 conserva registros y se puede repetir.
- Google: `google-apps-script/Code-sitio.gs`, selección de las tres vistas y Maps con sesión validada.
- Entrega: `google-apps-script/index-sitio.html`, SQL y ZIP reproducibles.

[Instalación](INSTALAR_SITIO.md), [comparación y diferencias](COMPARACION_ORIGINAL.md), [validación local](VALIDACION_SITIO.md) y [pruebas reales pendientes](PRUEBAS_FINALES.md).

Construcción y comprobación automática están autorizadas. Los cambios nuevos aún deben instalarse en Supabase y Google. No se publicaron ni ejecutaron remotamente desde Codex. Conservar el enlace /exec existente, no crear Sheets ni usar Netlify. No borrar datos, introducir claves privilegiadas en el HTML ni repetir SQL 001.
