#!/usr/bin/env python3
"""Доводка вёрстки единой записки без свойств «не отрывать от следующего» (в Word они видны чёрными квадратиками).
После каждой сборки по PDF LibreOffice ищутся: заголовок или подпись таблицы последней строкой страницы
(перед ними ставится разрыв страницы, src/layout-breaks.json) и подпись рисунка, оторванная от рисунка
(рисунок уменьшается на 10 %, src/merge-scales.json). За проход правится первая находка в каждой главе.
Использование: python3 polish.py [--passes 8]
"""
import json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdfplumber
import merge_all, final_layout

OUT = os.path.join(merge_all.KURS, 'zapiska.docx')


def problems(path):
    tmp = tempfile.mkdtemp()
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, path], check=True, capture_output=True)
    pdf = pdfplumber.open(os.path.join(tmp, os.path.basename(path)[:-5] + '.pdf'))
    out, chap = [], '0'
    for i, pg in enumerate(pdf.pages, 1):
        lines = {}
        for w in pg.extract_words():
            lines.setdefault(round(w['top']), []).append(w)
        body = [(y, ' '.join(w['text'] for w in sorted(lines[y], key=lambda w: w['x0']))) for y in sorted(lines)]
        body = [b for b in body if not re.fullmatch(r'\d{1,3}', b[1])]
        if not body:
            continue
        m = re.match(r'(\d)\s?[А-ЯЁ]{4,}', body[0][1])
        if m:
            chap = m.group(1)
        y, first = body[0]
        if (m := re.match(r'Рисунок\s+(\d+\.\d+)\s*–', first)) and not any(im['bottom'] <= y + 2 for im in pg.images):
            out.append((chap, 'shrink', m.group(1), i))
        last = body[-1][1]
        if re.match(r'(\d\.\d\s+[А-ЯЁ]|Таблица\s+\d+\.\d+\s*–)', last):
            out.append((chap, 'break', last[:25], i))
    return out


def main(passes=8):
    scales_path = merge_all.SCALES
    for n in range(passes):
        merge_all.main(OUT)
        found = problems(OUT)
        print('проход', n + 1, found, flush=True)
        if not found:
            break
        scales = json.load(open(scales_path, encoding='utf-8'))
        breaks = json.load(open(final_layout.BREAKS, encoding='utf-8')) if os.path.exists(final_layout.BREAKS) else []
        done = set()
        for chap, kind, what, page in found:
            if chap in done:
                continue
            done.add(chap)
            if kind == 'shrink':
                scales[what] = round(scales.get(what, 1.0) * 0.9, 3)
            else:
                # подпись «1.4 Разработка…» в тексте без пробела после номера: ищется по началу без пробелов
                breaks.append(what.split(' –')[0] if what.startswith('Таблица') else what[:20])
        json.dump(scales, open(scales_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        json.dump(breaks, open(final_layout.BREAKS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(int(sys.argv[sys.argv.index('--passes') + 1]) if '--passes' in sys.argv else 8)
