/**
 * Aloja la página del Panel Bajío. Los datos y el acceso permanecen en Supabase.
 * Este proyecto no usa Google Sheets ni el backend antiguo de la raíz.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Panel Bajío')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
