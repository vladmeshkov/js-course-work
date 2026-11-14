#!/usr/bin/env python3
"""Подбор раскладки раздела 2 или 3: для каждого блока «текст + рисунок» по порядку пробует
положение рисунка (после первого абзаца или после всех) и уменьшение (1,0 / 0,9 / 0,8)
и оставляет вариант с наименьшей суммарной пустотой внизу страниц (порог 2,5 см).
Результат: docs/kursovaya/src/layout-N.json (его читает build_N.py).
Использование: python3 tune_2.py [--part 3] [ключи блоков – подобрать только их, остальное из layout-N.json]
"""
import json, os, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_layout

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ARGS = sys.argv[1:]
PART = '2'
if ARGS[:1] == ['--part']:
    PART, ARGS = ARGS[1], ARGS[2:]
LAY = os.path.join(ROOT, 'docs', 'kursovaya', 'src', f'layout-{PART}.json')
KEYS = {
    '2': ['func', 'arch', 'transfer', 'loans', 'deposits', 'cabinet', 'transfer-ui', 'deposit-ui', 'statement', 'workplace', 'loan-review', 'security'],
    '3': ['run'],
}[PART]
if PART == '3':
    from build_3 import SCEN
    KEYS += [x[0] for x in SCEN if x[0] != 'lead']
OPTIONS = [('after', 1.0), ('before', 1.0), ('after', 0.9), ('before', 0.9), ('after', 0.8), ('before', 0.8)] + (
    [('after', 0.7), ('before', 0.7), ('after', 0.6), ('before', 0.6)] + [(k, sc) for k in (2, 3) for sc in (1.0, 0.8, 0.7, 0.6)]
    if PART == '3' else [])
LIMIT = 2.5


def score(layout):
    json.dump(layout, open(LAY, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    tmp = tempfile.mkdtemp()
    out = os.path.join(tmp, f'r{PART}.docx')
    subprocess.run([sys.executable, os.path.join(HERE, f'build_{PART}.py'), out], check=True, capture_output=True)
    rows = check_layout.analyze(out, skip=0)
    gaps = [r['gap'] for r in rows if r['gap'] > LIMIT]
    shutil.rmtree(tmp, ignore_errors=True)
    return round(sum(gaps), 1), len(gaps)


def main():
    keys = ARGS or KEYS
    layout = json.load(open(LAY, encoding='utf-8')) if os.path.exists(LAY) and ARGS else {}
    best = score(layout)
    print('исходно', best)
    for key in keys:
        cur = layout.get(key, {'mode': 'after', 'scale': 1.0})
        opts = OPTIONS if key == 'run' or PART != '3' else [('after', 1.0), ('before', 1.0), ('after', 0.8), ('before', 0.8)]
        for mode, scale in opts:
            trial = dict(layout, **{key: {'mode': mode, 'scale': scale}})
            sc = score(trial)
            # меньшая пустота; при равенстве – крупнее рисунок
            if sc[0] < best[0] - 0.05:
                best, cur = sc, {'mode': mode, 'scale': scale}
        layout[key] = cur
        print(key, cur, best, flush=True)
    score(layout)
    print('итог', best, 'записано в', LAY)


if __name__ == '__main__':
    main()
