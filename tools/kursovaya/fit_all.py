#!/usr/bin/env python3
"""Подгонка рисунков единой записки: если страница внутри главы заканчивается пустотой, а следующая
начинается с рисунка («Рисунок X.Y – …»), этот рисунок уменьшается до размера пустоты (не меньше 0,6).
Главы начинаются с новой страницы, поэтому за один проход правится первый такой рисунок в каждой главе.
Множители копятся в docs/kursovaya/src/merge-scales.json, затем merge_all.py собирает zapiska.docx.
Использование: python3 fit_all.py [--passes 10]
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docx
from docx.oxml.ns import qn
import check_layout
import merge_all

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(merge_all.KURS, 'zapiska.docx')
LIMIT, CAPTION_CM, MIN_SCALE = 2.5, 2.3, 0.6


def heights():
    """Высота каждого рисунка (см) по номеру подписи."""
    body = docx.Document(OUT).element.body
    els, res = list(body), {}
    for i, el in enumerate(els):
        if el.tag == qn('w:p') and el.find('.//' + qn('w:drawing')) is not None:
            for e in els[i + 1:i + 4]:
                m = re.match(r'\s*Рисунок (\d+\.\d+) –', merge_all.text_of(e))
                if m:
                    res[m.group(1)] = int(next(el.iter(f'{{{merge_all.WP}}}extent')).get('cy')) / 360000
                    break
    return res


def main():
    passes = int(sys.argv[sys.argv.index('--passes') + 1]) if '--passes' in sys.argv else 10
    scales = json.load(open(merge_all.SCALES, encoding='utf-8')) if os.path.exists(merge_all.SCALES) else {}
    skip = set()
    for n in range(passes):
        json.dump(scales, open(merge_all.SCALES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        merge_all.main(OUT)
        rows = check_layout.analyze(OUT, skip=6)
        hs = heights()
        done = set()
        changed = False
        for r in rows:
            m = re.match(r'Рисунок (\d+)\.(\d+) –', r['next'] or '')
            if r['gap'] <= LIMIT or not m:
                continue
            chap, num = m.group(1), f'{m.group(1)}.{m.group(2)}'
            if chap in done or num in skip:
                continue
            if num not in hs:          # рисунок не найден рядом с подписью (например, в таблице)
                skip.add(num); continue
            k = (r['gap'] - CAPTION_CM) / hs[num]
            if k < MIN_SCALE or k >= 1:
                skip.add(num)
                if k < MIN_SCALE:
                    print(f'проход {n + 1}: рисунок {num} пришлось бы уменьшить до {k:.2f}, пропуск', flush=True)
                continue
            done.add(chap)
            scales[num] = round(scales.get(num, 1.0) * k, 3); changed = True
            print(f'проход {n + 1}: стр. {r["page"]}, пустота {r["gap"]} см, рисунок {num} -> {scales[num]}', flush=True)
        if not changed:
            break
    json.dump(scales, open(merge_all.SCALES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    merge_all.main(OUT)
    rows = check_layout.analyze(OUT, skip=6)
    print('итог:', [(r['page'], r['gap']) for r in rows if r['gap'] > LIMIT])


if __name__ == '__main__':
    main()
