#!/usr/bin/env python3
"""Empaqueta el frontend estático para Google HtmlService, sin alterar el backend."""
import argparse
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
import re
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.styles = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.scripts.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.styles.append(attrs['href'])

def package_html(read):
    html = read('index.html')
    assets = Assets()
    assets.feed(html)
    if len(assets.scripts) != 1:
        raise ValueError('Se esperaba un único bundle JavaScript autónomo.')
    def content(path):
        path = path.lstrip('/')
        if '..' in PurePosixPath(path).parts or not path.startswith('assets/'):
            raise ValueError('Referencia de asset no compatible: ' + path)
        return read(path)
    js = content(assets.scripts[0])
    css = '\n'.join(content(path) for path in assets.styles)
    # Evita que una cadena literal cierre la etiqueta HTML del script o del estilo.
    js = re.sub(r'</script', r'<\\/script', js, flags=re.I)
    css = re.sub(r'</style', r'<\\/style', css, flags=re.I)
    html = re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*</script>', '', html, flags=re.I)
    html = re.sub(r'<link\b[^>]*\brel="stylesheet"[^>]*>', '', html, flags=re.I)
    html = html.replace('<head>', '<head><base target="_top">', 1)
    html = html.replace('</head>', '<style>\n' + css + '\n</style></head>', 1)
    html = html.replace('</body>', '<script type="module">\n' + js + '\n</script></body>', 1)
    html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
    return '<!-- Generado por scripts/package_google.py; los ajustes se hacen en web/. -->\n' + html

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-zip', type=Path, help='Usar un paquete validado en vez de web/dist.')
    parser.add_argument('--output', type=Path, default=ROOT/'google-apps-script'/'index.html')
    parser.add_argument('--check', action='store_true', help='Comprobar sin modificar archivos.')
    args = parser.parse_args()
    if args.source_zip:
        with ZipFile(args.source_zip) as archive:
            if archive.testzip() is not None:
                raise ValueError('El ZIP no pasó la verificación de integridad.')
            result = package_html(lambda path: archive.read(path).decode('utf-8'))
    else:
        result = package_html(lambda path: (ROOT/'web'/'dist'/path).read_text())
    if args.check:
        if not args.output.exists() or args.output.read_text() != result:
            raise SystemExit('El HTML no coincide con el paquete seleccionado.')
        print('HTML autónomo verificado; no se modificaron archivos.')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result)
        print(f'HTML autónomo generado ({len(result.encode("utf-8"))} bytes).')

if __name__ == '__main__':
    main()
