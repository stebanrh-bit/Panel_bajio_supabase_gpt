#!/usr/bin/env python3
"""Entrega conjunta reproducible: HTML autónomo, SQL atómico y ZIP para Google."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from package_google import package_html, package_reader

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=['004_reserved_loads.sql','005_team_and_shifts.sql','006_import_archive_and_messages.sql','007_radar_and_places.sql','008_incident_category_validation.sql','009_original_interface.sql','010_google_miles_worker.sql','011_queries_and_revisions.sql','012_turn_rules_and_tasks.sql']

def combined_sql():
    parts=['-- PANEL BAJÍO: ACTUALIZACIÓN CONJUNTA 004–012.\n-- Copiar TODO a SQL Editor > New query > Run. Requiere 001, 002 y 003.\n-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.\nbegin;\n']
    for name in MIGRATIONS:
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
