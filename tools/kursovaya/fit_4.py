#!/usr/bin/env python3
"""Подгонка раскладки раздела 4. Для каждой страницы с пустотой внизу, после которой следующая страница
начинается с рисунка («Рисунок 4.N – …»), пробует поставить пояснение перед рисунком (текст заполняет пустоту)
или уменьшить рисунок до размера пустоты (не меньше 0,55) и оставляет вариант с меньшей суммарной пустотой.
Результат: docs/kursovaya/src/layout-4.json (его читает build_4.py). Одна сборка с замером идёт около 20 с.
Использование: python3 fit_4.py [--max 30]
"""Точечная подгонка размеров рисунков раздела 4: для первой страницы с пустотой внизу, после которой
следующая страница начинается с рисунка («Рисунок 4.N – …»), уменьшает этот рисунок так, чтобы он
поместился в пустоту, и пересобирает раздел. Повторяет, пока такие страницы есть (не больше --max шагов).
Для каждой такой страницы пробует пояснение перед рисунком или уменьшение рисунка (не меньше 0,55) и оставляет лучший вариант. Результат: docs/kursovaya/src/layout-4.json (его читает build_4.py).
Использование: python3 fit_4.py [--max 40]
"""
import json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docx
import check_layout
from build_4 import AUTH, GUIDE, KURS

HERE = os.path.dirname(os.path.abspath(__file__))
LAY = os.path.join(KURS, 'src', 'layout-4.json')
KEYS = ['install'] + [x[0] for x in AUTH] + [x[0] for x in GUIDE if x[0] != 'lead']
LIMIT, CAPTION_CM, MIN_SCALE = 2.5, 2.3, 0.55


def build(path):
    subprocess.run([sys.executable, os.path.join(HERE, 'build_4.py'), path], check=True, capture_output=True)


def measure(layout, tmp):
    json.dump(layout, open(LAY, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    build(tmp)
    rows = check_layout.analyze(tmp, skip=0)
    gaps = [r for r in rows if r['gap'] > LIMIT and not r['last']]
    return round(sum(r['gap'] for r in gaps), 1), rows, [s.height.cm for s in docx.Document(tmp).inline_shapes]


def main():
    """Для каждой страницы с пустотой, после которой следующая начинается с рисунка, пробует два варианта:
    пояснение перед рисунком (mode before) и уменьшение рисунка до размера пустоты; оставляет лучший."""
    steps = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 30
    layout = json.load(open(LAY, encoding='utf-8')) if os.path.exists(LAY) else {}
    tmp = os.path.join(tempfile.mkdtemp(), 'r4.docx')
    best, rows, heights = measure(layout, tmp)
    print('исходно', best, flush=True)
    tried = set()
    for _ in range(steps):
        target = None
        for r in rows:
            m = re.match(r'Рисунок 4\.(\d+) –', r['next'] or '')
            if r['gap'] > LIMIT and not r['last'] and m and int(m.group(1)) not in tried:
                target = (r, int(m.group(1))); break
        if not target:
            break
        r, n = target
        tried.add(n)
        key, h = KEYS[n - 1], heights[n - 1]
        cur = dict(layout.get(key, {'mode': 'after', 'scale': 1.0}))
        options = [dict(cur, mode='before')]
        scale = round(cur.get('scale', 1.0) * (r['gap'] - CAPTION_CM) / h, 3)
        if MIN_SCALE <= scale < 1:
            options.append(dict(cur, scale=scale))
        for opt in options:
            trial = dict(layout, **{key: opt})
            sc, rw, hs = measure(trial, tmp)
            if sc < best - 0.05:
                best, rows, heights, layout = sc, rw, hs, trial
                print(f'рисунок 4.{n} ({key}) {opt} -> {best}', flush=True)
                break
    json.dump(layout, open(LAY, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    build(os.path.join(KURS, 'razdel-4.docx'))
    rows = check_layout.analyze(os.path.join(KURS, 'razdel-4.docx'), skip=0)
    gaps = [(r['page'], r['gap']) for r in rows if r['gap'] > LIMIT and not r['last']]
    print('итог:', len(rows) + 1, 'стр., пустоты:', gaps)

if __name__ == '__main__':
    main()
