#!/usr/bin/env python3
"""Проверка вёрстки готового PDF: пустое место внизу страниц и что идёт на следующей странице.
Использование: python3 check_layout.py файл.pdf|файл.docx [порог_см]
Порог по умолчанию 5 см. Страницы 1 – 6 (титул, реферат, оглавление) пропускаются.
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image


def to_pdf(path):
    """docx -> pdf рядом с файлом (LibreOffice). Возвращает путь к pdf."""
    if path.endswith('.pdf'):
        return path
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', os.path.dirname(os.path.abspath(path)), path], check=True, capture_output=True)
    return path[:-5] + '.pdf'


def analyze(pdf, skip=6):
    """Список страниц с пустым местом внизу: [{'page', 'gap', 'next'}], gap в см."""
    pdf = to_pdf(pdf)
    tmp = tempfile.mkdtemp()
    subprocess.run(['pdftoppm', '-r', '50', '-png', pdf, f'{tmp}/p'], check=True)
    files = sorted(glob.glob(f'{tmp}/p-*.png'))
    px = 50 / 2.54
    texts = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout.split('\f')
    out = []
    for i, f in enumerate(files, 1):
        im = Image.open(f).convert('L')
        w, h = im.size
        bottom_cm = (h / px) - (2.0 if h > w else 1.9)
        last = 0
        for y in range(int(bottom_cm * px) - 1, -1, -1):
            if im.crop((0, y, w, y + 1)).getextrema()[0] < 200:
                last = y
                break
        nxt = texts[i].strip().split('\n')[0].strip() if i < len(texts) else ''
        out.append({'page': i, 'gap': round(bottom_cm - last / px, 1), 'next': nxt, 'landscape': w > h, 'last': i == len(files)})
    return [r for r in out if r['page'] > skip and not r['last']]


if __name__ == '__main__':
    limit = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
    rows = [r for r in analyze(sys.argv[1]) if r['gap'] > limit]
    for r in rows:
        print(f"стр. {r['page']}: пусто внизу {r['gap']} см{' (альбомная)' if r['landscape'] else ''}; дальше: {r['next'][:70]!r}")
    print('страниц с пустотой больше порога:', len(rows))
