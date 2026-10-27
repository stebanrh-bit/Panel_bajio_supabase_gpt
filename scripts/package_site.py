#!/usr/bin/env python3
"""Entrega conjunta reproducible: HTML autónomo, SQL atómico y ZIP para Google."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from package_google import package_html, package_reader

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=['004_reserved_loads.sql','005_team_and_shifts.sql','006_import_archive_and_messages.sql','007_radar_and_places.sql','008_incident_category_validation.sql','009_original_interface.sql','010_google_miles_worker.sql','011_queries_and_revisions.sql','012_turn_rules_and_tasks.sql','013_punctual_pending.sql','014_load_signals.sql','015_route_instructions.sql','016_personal_internal_mode.sql','017_default_arrival_status.sql','018_manual_client_messages.sql','019_personal_load_views.sql','020_personal_consolidation.sql']

def combined_sql(names=None, label='ACTUALIZACIÓN CONJUNTA 004–020', requires='001, 002 y 003'):
    parts=[f'-- PANEL BAJÍO: {label}.\n-- Copiar TODO a SQL Editor > New query > Run. Requiere {requires}.\n-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.\nbegin;\n']
    for name in (MIGRATIONS if names is None else names):
        content=(ROOT/'supabase/migrations'/name).read_text()
        lines=content.splitlines()
        starts=[index for index,line in enumerate(lines) if line.strip().lower()=='begin;']
        ends=[index for index,line in enumerate(lines) if line.strip().lower()=='commit;']
        if len(starts)!=1 or len(ends)!=1 or starts[0]>=ends[0]:
            raise ValueError('Límites de transacción inesperados: '+name)
        kept=[line for index,line in enumerate(lines) if index not in (starts[0],ends[0])]
        parts.append('\n-- Archivo: '+name+'\n'+'\n'.join(kept)+'\n')
    return '\n'.join(parts)+'\ncommit;\n'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Comprueba los archivos entregados sin escribir.')
    args=parser.parse_args()
    targets={
        ROOT/'supabase/actualizar_sitio.sql':combined_sql(),
        ROOT/'supabase/actualizar_version_personal.sql':combined_sql(['013_punctual_pending.sql','014_load_signals.sql','015_route_instructions.sql','016_personal_internal_mode.sql','017_default_arrival_status.sql','018_manual_client_messages.sql','019_personal_load_views.sql','020_personal_consolidation.sql'],'VERSIÓN PERSONAL E INSTRUCTIVOS 013–020','001 a 012'),
        ROOT/'supabase/actualizar_consolidacion_personal.sql':combined_sql(['020_personal_consolidation.sql'],'CONSOLIDACIÓN PERSONAL R01–R20','001 a 019'),
        ROOT/'supabase/actualizar_cargas_y_mensajes.sql':combined_sql(['017_default_arrival_status.sql','018_manual_client_messages.sql'],'ESTATUS INICIAL Y MENSAJES MANUALES 017–018','001 a 016'),
        ROOT/'supabase/actualizar_senalamientos.sql':combined_sql(['013_punctual_pending.sql','014_load_signals.sql'],'PENDIENTES PUNTUALES Y SEÑALAMIENTOS 013–014','001 a 012'),
        ROOT/'google-apps-script/index-sitio.html':package_html(lambda path:(ROOT/'web/dist/internal'/path).read_text()),
    }
    for view,label in [('client','cliente'),('manager','gerencia')]:
        targets[ROOT/('google-apps-script/index-'+label+'.html')]=package_html(lambda path,v=view:(ROOT/'web/dist'/v/path).read_text())
    targets[ROOT/'google-apps-script/lector.html']=package_reader((ROOT/'web/dist/reader/lector.js').read_text())
    for path,content in targets.items():
        if args.check:
            if not path.exists() or path.read_text()!=content: raise SystemExit('Entrega desactualizada: '+str(path.relative_to(ROOT)))
        else: path.write_text(content)
    files={
        'GMAIL_POR_CARGA.md':ROOT/'docs/GMAIL_POR_CARGA.md',
        'evidencia-gmail.json':ROOT/'docs/evidencia-gmail.json',
        'index-cliente.html':ROOT/'google-apps-script/index-cliente.html',
        'index-gerencia.html':ROOT/'google-apps-script/index-gerencia.html',
        'lector.html':ROOT/'google-apps-script/lector.html',
        'index.html':ROOT/'google-apps-script/index-sitio.html',
        'panel-accounts/index.ts':ROOT/'supabase/functions/panel-accounts/index.ts',
        'COMPARACION_ORIGINAL.md':ROOT/'docs/COMPARACION_ORIGINAL.md',
        'VALIDACION_SITIO.md':ROOT/'docs/VALIDACION_SITIO.md',
        'REVISION_COMPLETA_2026-10-14.md':ROOT/'docs/REVISION_COMPLETA_2026-10-14.md',
        'ADMINISTRADOR_Y_CSR.md':ROOT/'docs/ADMINISTRADOR_Y_CSR.md',
        'INICIO_Y_RECORDATORIOS.md':ROOT/'docs/INICIO_Y_RECORDATORIOS.md',
        'MEJORAS_USABILIDAD.md':ROOT/'docs/MEJORAS_USABILIDAD.md',
        'AUDITORIA_OPTIMIZACION_2026-10-15.md':ROOT/'docs/AUDITORIA_OPTIMIZACION_2026-10-15.md',
        'OPCIONES_PORTAL_2026-10-15.json':ROOT/'docs/OPCIONES_PORTAL_2026-10-15.json',
        'evidencia-auditoria-2026-10-15.json':ROOT/'docs/evidencia-auditoria-2026-10-15.json',
        'Code.gs':ROOT/'google-apps-script/Code-sitio.gs',
        'appsscript.json':ROOT/'google-apps-script/appsscript.json',
        '010_google_miles_worker.sql':ROOT/'supabase/migrations/010_google_miles_worker.sql',
        'MILLAS_GOOGLE_AUTOMATICAS.md':ROOT/'docs/MILLAS_GOOGLE_AUTOMATICAS.md',
        'actualizar_sitio.sql':ROOT/'supabase/actualizar_sitio.sql',
        '013_punctual_pending.sql':ROOT/'supabase/migrations/013_punctual_pending.sql',
        '014_load_signals.sql':ROOT/'supabase/migrations/014_load_signals.sql',
        '015_route_instructions.sql':ROOT/'supabase/migrations/015_route_instructions.sql',
        '016_personal_internal_mode.sql':ROOT/'supabase/migrations/016_personal_internal_mode.sql',
        '017_default_arrival_status.sql':ROOT/'supabase/migrations/017_default_arrival_status.sql',
        '018_manual_client_messages.sql':ROOT/'supabase/migrations/018_manual_client_messages.sql',
        '019_personal_load_views.sql':ROOT/'supabase/migrations/019_personal_load_views.sql',
        '020_personal_consolidation.sql':ROOT/'supabase/migrations/020_personal_consolidation.sql',
        'actualizar_consolidacion_personal.sql':ROOT/'supabase/actualizar_consolidacion_personal.sql',
        'evidencia-consolidacion-personal.json':ROOT/'docs/evidencia-consolidacion-personal.json',
        'imagenes/consolidacion-personal-inicio.png':ROOT/'docs/imagenes/consolidacion-personal-inicio.png',
        'imagenes/consolidacion-personal-movil.png':ROOT/'docs/imagenes/consolidacion-personal-movil.png',
        'CORRECCION_FECHAS_CALENDARIO_2026-10-27.md':ROOT/'docs/CORRECCION_FECHAS_CALENDARIO_2026-10-27.md',
        'evidencia-calendario-fechas-2026-10-27.json':ROOT/'docs/evidencia-calendario-fechas-2026-10-27.json',
        'imagenes/calendario-fechas-corregidas.png':ROOT/'docs/imagenes/calendario-fechas-corregidas.png',
        'imagenes/calendario-fechas-corregidas-movil.png':ROOT/'docs/imagenes/calendario-fechas-corregidas-movil.png',
        'CONSOLIDACION_PERSONAL_2026-10-27.md':ROOT/'docs/CONSOLIDACION_PERSONAL_2026-10-27.md',
        'MOSTRAR_CONFIGURABLE.md':ROOT/'docs/MOSTRAR_CONFIGURABLE.md',
        'evidencia-mostrar-configurable.json':ROOT/'docs/evidencia-mostrar-configurable.json',
        'actualizar_cargas_y_mensajes.sql':ROOT/'supabase/actualizar_cargas_y_mensajes.sql',
        'actualizar_version_personal.sql':ROOT/'supabase/actualizar_version_personal.sql',
        'VERSION_PERSONAL_E_INSTRUCTIVOS.md':ROOT/'docs/VERSION_PERSONAL_E_INSTRUCTIVOS.md',
        'evidencia-version-personal-instructivos.json':ROOT/'docs/evidencia-version-personal-instructivos.json',
        'imagenes/version-personal-instructivos.png':ROOT/'docs/imagenes/version-personal-instructivos.png',
        'imagenes/instructivo-que-hacer.png':ROOT/'docs/imagenes/instructivo-que-hacer.png',
        'actualizar_senalamientos.sql':ROOT/'supabase/actualizar_senalamientos.sql',
        'SENALAMIENTOS_CARGAS.md':ROOT/'docs/SENALAMIENTOS_CARGAS.md',
        'evidencia-senalamientos.json':ROOT/'docs/evidencia-senalamientos.json',
        'imagenes/senalamientos-listado.png':ROOT/'docs/imagenes/senalamientos-listado.png',
        'imagenes/senalamientos-selector.png':ROOT/'docs/imagenes/senalamientos-selector.png',
        'imagenes/senalamientos-movil.png':ROOT/'docs/imagenes/senalamientos-movil.png',
        'LICENCIA_ICONOS_LUCIDE.txt':ROOT/'docs/LICENCIA_ICONOS_LUCIDE.txt',
        'PENDIENTES_PUNTUALES.md':ROOT/'docs/PENDIENTES_PUNTUALES.md',
        'evidencia-pendientes-puntuales.json':ROOT/'docs/evidencia-pendientes-puntuales.json',
        'imagenes/pendientes-puntuales-inicio.png':ROOT/'docs/imagenes/pendientes-puntuales-inicio.png',
        'imagenes/pendiente-puntual-detalle.png':ROOT/'docs/imagenes/pendiente-puntual-detalle.png',
        'ENTREGA_49_OPCIONES.md':ROOT/'docs/ENTREGA_49_OPCIONES.md',
        'MANUAL_POR_ROL.md':ROOT/'docs/MANUAL_POR_ROL.md',
        'CODIGO_ACTIVO.md':ROOT/'docs/CODIGO_ACTIVO.md',
        'IMPLEMENTACION_49_OPCIONES.json':ROOT/'docs/IMPLEMENTACION_49_OPCIONES.json',
        'evidencia-consultas-49.json':ROOT/'docs/evidencia-consultas-49.json',
        'evidencia-organizacion-49.json':ROOT/'docs/evidencia-organizacion-49.json',
        'evidencia-visual-49.json':ROOT/'docs/evidencia-visual-49.json',
        'evidencia-entrega-49.json':ROOT/'docs/evidencia-entrega-49.json',
        'VALIDACION_49_OPCIONES.md':ROOT/'docs/VALIDACION_49_OPCIONES.md',
        'CORRECCION_TAREAS_2026-10-16.md':ROOT/'docs/CORRECCION_TAREAS_2026-10-16.md',
        'CORRECCION_RADAR_LECTOR_2026-10-16.md':ROOT/'docs/CORRECCION_RADAR_LECTOR_2026-10-16.md',
        'LISTADO_SIN_SCROLL_2026-10-16.md':ROOT/'docs/LISTADO_SIN_SCROLL_2026-10-16.md',
        'DISENO_PLAN_Y_TURNO_2026-10-16.md':ROOT/'docs/DISENO_PLAN_Y_TURNO_2026-10-16.md',
        'CAMPANA_PERSONAL_Y_PLAN_COMPACTO_2026-10-16.md':ROOT/'docs/CAMPANA_PERSONAL_Y_PLAN_COMPACTO_2026-10-16.md',
        'TEMA_CLARO_2026-10-19.md':ROOT/'docs/TEMA_CLARO_2026-10-19.md',
        'PICKUP_Y_COLORES_CALENDARIO.md':ROOT/'docs/PICKUP_Y_COLORES_CALENDARIO.md',
        'ORDEN_MANUAL_CARGAS_2026-10-22.md':ROOT/'docs/ORDEN_MANUAL_CARGAS_2026-10-22.md',
        'COLORES_Y_HORA_TAREAS_2026-10-22.md':ROOT/'docs/COLORES_Y_HORA_TAREAS_2026-10-22.md',
        'evidencia-colores-tareas-2026-10-22.json':ROOT/'docs/evidencia-colores-tareas-2026-10-22.json',
        'evidencia-orden-manual-2026-10-22.json':ROOT/'docs/evidencia-orden-manual-2026-10-22.json',
        'imagenes/cargas-orden-manual-2026-10-22.png':ROOT/'docs/imagenes/cargas-orden-manual-2026-10-22.png',
        'evidencia-pickup-calendario.json':ROOT/'docs/evidencia-pickup-calendario.json',
        'evidencia-tema-claro-2026-10-19.json':ROOT/'docs/evidencia-tema-claro-2026-10-19.json',
        'imagenes/tema-claro-panel-completo.png':ROOT/'docs/imagenes/tema-claro-panel-completo.png',
        'imagenes/tema-claro-inicio.png':ROOT/'docs/imagenes/tema-claro-inicio.png',
        'imagenes/tema-claro-opciones.png':ROOT/'docs/imagenes/tema-claro-opciones.png',
        'imagenes/tema-claro-tarjetas.png':ROOT/'docs/imagenes/tema-claro-tarjetas.png',
        'imagenes/tema-claro-detalle.png':ROOT/'docs/imagenes/tema-claro-detalle.png',
        'imagenes/tema-claro-organizar.png':ROOT/'docs/imagenes/tema-claro-organizar.png',
        'imagenes/tema-claro-client.png':ROOT/'docs/imagenes/tema-claro-client.png',
        'imagenes/tema-claro-manager.png':ROOT/'docs/imagenes/tema-claro-manager.png',
        'VISTA_SENCILLA_2026-10-19.md':ROOT/'docs/VISTA_SENCILLA_2026-10-19.md',
        'evidencia-vista-sencilla-2026-10-19.json':ROOT/'docs/evidencia-vista-sencilla-2026-10-19.json',
        'imagenes/cargas-vista-simple.png':ROOT/'docs/imagenes/cargas-vista-simple.png',
        'imagenes/cargas-vista-simple-movil.png':ROOT/'docs/imagenes/cargas-vista-simple-movil.png',
        'CALENDARIO_TAREAS_Y_LISTADO_2026-10-16.md':ROOT/'docs/CALENDARIO_TAREAS_Y_LISTADO_2026-10-16.md',
        'evidencia-calendario-tareas-2026-10-16.json':ROOT/'docs/evidencia-calendario-tareas-2026-10-16.json',
        'imagenes/calendario-vista-agenda.png':ROOT/'docs/imagenes/calendario-vista-agenda.png',
        'imagenes/calendario-vista-week.png':ROOT/'docs/imagenes/calendario-vista-week.png',
        'imagenes/calendario-vista-list.png':ROOT/'docs/imagenes/calendario-vista-list.png',
        'imagenes/cargas-origen-comentarios.png':ROOT/'docs/imagenes/cargas-origen-comentarios.png',
        'imagenes/seguimiento-estado.png':ROOT/'docs/imagenes/seguimiento-estado.png',
        'REVISION_GENERAL_2026-10-16.md':ROOT/'docs/REVISION_GENERAL_2026-10-16.md',
        'evidencia-revision-general-2026-10-16.json':ROOT/'docs/evidencia-revision-general-2026-10-16.json',
        'evidencia-campana-plan-2026-10-16.json':ROOT/'docs/evidencia-campana-plan-2026-10-16.json',
        'imagenes/plan-del-dia-compacto.png':ROOT/'docs/imagenes/plan-del-dia-compacto.png',
        'imagenes/plan-compacto-movil.png':ROOT/'docs/imagenes/plan-compacto-movil.png',
        'evidencia-diseno-plan-turno-2026-10-16.json':ROOT/'docs/evidencia-diseno-plan-turno-2026-10-16.json',
        'imagenes/plan-del-dia-nuevo.png':ROOT/'docs/imagenes/plan-del-dia-nuevo.png',
        'imagenes/plan-del-dia-movil.png':ROOT/'docs/imagenes/plan-del-dia-movil.png',
        'imagenes/agenda-semanal-nueva.png':ROOT/'docs/imagenes/agenda-semanal-nueva.png',
        'imagenes/agenda-semanal-movil.png':ROOT/'docs/imagenes/agenda-semanal-movil.png',
        'imagenes/organizar-turno-nuevo.png':ROOT/'docs/imagenes/organizar-turno-nuevo.png',
        'imagenes/organizar-turno-movil.png':ROOT/'docs/imagenes/organizar-turno-movil.png',
        'evidencia-listado-sin-scroll-2026-10-16.json':ROOT/'docs/evidencia-listado-sin-scroll-2026-10-16.json',
        'evidencia-radar-lector-2026-10-16.json':ROOT/'docs/evidencia-radar-lector-2026-10-16.json',
        'imagenes/organizar-turno.png':ROOT/'docs/imagenes/organizar-turno.png',
        'INSTALAR_SITIO.md':ROOT/'docs/INSTALAR_SITIO.md',
        'PRUEBAS_FINALES.md':ROOT/'docs/PRUEBAS_FINALES.md',
        'imagenes/panel-home.png':ROOT/'docs/imagenes/panel-home.png',
        'imagenes/panel-operation.png':ROOT/'docs/imagenes/panel-operation.png',
        'imagenes/panel-administracion.png':ROOT/'docs/imagenes/panel-administracion.png',
        'imagenes/panel-cargas-movil.png':ROOT/'docs/imagenes/panel-cargas-movil.png',
        'imagenes/trailer-completo.png':ROOT/'docs/imagenes/trailer-completo.png',
        'imagenes/trailer-detalle-T0132.png':ROOT/'docs/imagenes/trailer-detalle-T0132.png',
        'imagenes/historial-legible.png':ROOT/'docs/imagenes/historial-legible.png',
        'imagenes/nueva-solicitud.png':ROOT/'docs/imagenes/nueva-solicitud.png',
        'imagenes/nueva-tarea.png':ROOT/'docs/imagenes/nueva-tarea.png',
        'imagenes/nueva-tarea-movil.png':ROOT/'docs/imagenes/nueva-tarea-movil.png',
        'imagenes/calendario-cliente-entrega.png':ROOT/'docs/imagenes/calendario-cliente-entrega.png',
        'imagenes/calendario-movil.png':ROOT/'docs/imagenes/calendario-movil.png',
        'imagenes/apartado-csr-vg-manual.png':ROOT/'docs/imagenes/apartado-csr-vg-manual.png',
        'importacion-prueba.csv':ROOT/'entregables/importacion-prueba.csv',
    }
    zip_path=ROOT/'entregables/panel-bajio-sitio.zip'
    if not args.check:
        with ZipFile(zip_path,'w',ZIP_DEFLATED) as archive:
            for name,path in files.items(): archive.writestr(name,path.read_bytes())
    with ZipFile(zip_path) as archive:
        if archive.testzip() is not None or set(archive.namelist())!=set(files): raise SystemExit('ZIP incompleto o dañado.')
        for name,path in files.items():
            if archive.read(name)!=path.read_bytes(): raise SystemExit('ZIP desactualizado: '+name)
    print('Entrega conjunta verificada.' if args.check else 'Entrega conjunta generada: SQL, HTML autónomo y ZIP.')

if __name__=='__main__': main()
