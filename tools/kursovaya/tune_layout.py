#!/usr/bin/env python3
"""Подбор порядка блоков раздела 1.5 (и режима «рисунок – описание» или «описание – рисунок»), чтобы внизу страниц
не оставалось пустых мест. Результат записывается в docs/kursovaya/src/layout-1.5.json, его читает build_15.py.
Жадный перебор: для каждой позиции пробуются оставшиеся блоки в двух режимах, выбирается вариант с наименьшей пустотой.
Использование: python3 tune_layout.py черновик.docx
"""
import json, os, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_15, check_layout, merge_zapiska as mz, split_tables as st

KURS = build_15.KURS
JSON = os.path.join(KURS, 'src', 'layout-1.5.json')
draft = sys.argv[1]
tmp = tempfile.mkdtemp(prefix='tune_')


def write(lay):
    json.dump(lay, open(JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    build_15.build(os.path.join(KURS, 'razdel-1.5.docx'), lay)


# разбивка таблиц считается один раз: рисунки раздела 1.5 стоят после всех таблиц
write({'order': build_15.DEFAULT_ORDER, 'modes': {}})
raw = mz.assemble_raw(draft)
st.main(raw, os.path.join(tmp, 'base.docx'))
splits = dict(st.LAST_SPLITS)
os.remove(raw)


def score(lay):
    write(lay)
    raw = mz.assemble_raw(draft)
    out = os.path.join(tmp, 'e.docx')
    st.apply(raw, out, splits, False, for_lo=True)
    os.remove(raw)
    total = 0.0
    for g in check_layout.analyze(out):
        if g['next'].startswith('СПИСОК'):
            continue                      # конец основной части: список источников начинается с новой страницы
        total += max(0.0, g['gap'] - 3.0)
    return total


order_all = list(build_15.DEFAULT_ORDER)
chosen, modes = [], {}
remaining = list(order_all)
while remaining:
    best = None
    for key in remaining:
        for mode in ('A', 'B'):
            if len(remaining) == 1 and mode == 'B':
                continue                  # последний блок заканчивается описанием, а не рисунком
            lay = {'order': chosen + [key] + [k for k in remaining if k != key], 'modes': {**modes, key: mode}}
            sc = score(lay)
            print(f'  позиция {len(chosen) + 1}: {key} {mode} -> {sc:.1f}', flush=True)
            if best is None or sc < best[0] - 1e-9:
                best = (sc, key, mode)
    sc, key, mode = best
    chosen.append(key); modes[key] = mode; remaining.remove(key)
    print('выбрано', chosen, modes, 'пустота', round(sc, 1), flush=True)
final = {'order': chosen, 'modes': modes}
write(final)
print('итог', final, 'пустота', round(score(final), 1), flush=True)
write(final)
