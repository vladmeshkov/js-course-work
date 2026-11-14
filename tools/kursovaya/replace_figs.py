#!/usr/bin/env python3
"""Заменяет рисунки UML в основе записки (zapiska-osnova.docx) на новые PNG из docs/kursovaya
(после `npm run uml:classes`, `npm run uml:views` и svg2png.cjs). Рисунок ищется по подписи
«Рисунок 1.N – …»; ширина на странице сохраняется, высота пересчитывается по пропорциям нового файла.
Использование: python3 replace_figs.py
"""
import io, os, re
import docx
from docx.oxml.ns import qn
from PIL import Image

KURS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'kursovaya'))
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
FIGS = {'1.11': 'class-domain', '1.12': 'class-services', '1.13': 'view-uc', '1.14': 'view-seq-loan',
        '1.15': 'view-components', '1.16': 'view-act-loan', '1.17': 'view-deployment', '1.18': 'view-st-loan'}


def main():
    path = os.path.join(KURS, 'zapiska-osnova.docx')
    d = docx.Document(path)
    els = list(d.element.body)
    for i, el in enumerate(els):
        t = ''.join(x.text or '' for x in el.iter(qn('w:t'))).strip()
        m = re.match(r'Рисунок (1\.\d+)\s', t)
        if not m or m.group(1) not in FIGS:
            continue
        pic = next(e for e in reversed(els[max(0, i - 4):i]) if e.find('.//' + qn('w:drawing')) is not None)
        png = os.path.join(KURS, FIGS[m.group(1)] + '.png')
        rid, _ = d.part.get_or_add_image(io.BytesIO(open(png, 'rb').read()))
        for blip in pic.iter(f'{{{A}}}blip'):
            blip.set(f'{{{R}}}embed', rid)
        w, h = Image.open(png).size
        for ext in list(pic.iter(f'{{{WP}}}extent')) + [x for x in pic.iter(f'{{{A}}}ext') if x.get('cx')]:
            ext.set('cy', str(round(int(ext.get('cx')) * h / w)))
        print(m.group(1), FIGS[m.group(1)], f'{int(next(pic.iter(f"{{{WP}}}extent")).get("cy")) / 360000:.1f} см')
    d.save(path)


if __name__ == '__main__':
    main()
