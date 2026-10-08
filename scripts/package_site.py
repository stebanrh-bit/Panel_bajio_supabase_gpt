#!/usr/bin/env python3
"""Entrega conjunta reproducible: HTML autónomo, SQL atómico y ZIP para Google."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from package_google import package_html

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=['004_reserved_loads.sql','005_team_and_shifts.sql','006_import_archive_and_messages.sql','007_radar_and_places.sql','008_incident_category_validation.sql','009_original_interface.sql']

def combined_sql():
    parts=['-- PANEL BAJÍO: ACTUALIZACIÓN CONJUNTA 004–009.\n-- Copiar TODO a SQL Editor > New query > Run. Requiere 001, 002 y 003.\n-- Conserva cargas, usuarios y expedientes; cualquier fallo revierte la actualización.\nbegin;\n']
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
        ROOT/'google-apps-script/index-sitio.html':package_html(lambda path:(ROOT/'web/dist'/path).read_text()),
    }
    for path,content in targets.items():
        if args.check:
            if not path.exists() or path.read_text()!=content: raise SystemExit('Entrega desactualizada: '+str(path.relative_to(ROOT)))
        else: path.write_text(content)
    files={
        'index.html':ROOT/'google-apps-script/index-sitio.html',
        'panel-accounts/index.ts':ROOT/'supabase/functions/panel-accounts/index.ts',
        'COMPARACION_ORIGINAL.md':ROOT/'docs/COMPARACION_ORIGINAL.md',
        'VALIDACION_SITIO.md':ROOT/'docs/VALIDACION_SITIO.md',
        'Code.gs':ROOT/'google-apps-script/Code-sitio.gs',
        'appsscript.json':ROOT/'google-apps-script/appsscript.json',
        'actualizar_sitio.sql':ROOT/'supabase/actualizar_sitio.sql',
        'INSTALAR_SITIO.md':ROOT/'docs/INSTALAR_SITIO.md',
        'PRUEBAS_FINALES.md':ROOT/'docs/PRUEBAS_FINALES.md',
        'imagenes/panel-home.png':ROOT/'docs/imagenes/panel-home.png',
        'imagenes/panel-operation.png':ROOT/'docs/imagenes/panel-operation.png',
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
