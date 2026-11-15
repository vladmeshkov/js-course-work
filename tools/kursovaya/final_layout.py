#!/usr/bin/env python3
"""Окончательная вёрстка единой записки: убирает пустоты внизу страниц внутри глав.

Пустота появляется, когда рисунок не помещается в конец страницы и уходит на следующую. Тогда абзац описания,
стоящий сразу после подписи рисунка, переносится выше рисунка (за абзац со ссылкой на него): текст заполняет
страницу, а рисунок встаёт следом. За один проход правится первая такая пустота в каждой главе, затем страницы
пересчитываются по PDF LibreOffice. Перенесённые рисунки копятся в src/layout-final.json и применяются
merge_all.py после сборки.
Использование: python3 final_layout.py [--passes 12]
"""
import json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docx
from docx.oxml.ns import qn
import check_layout

HERE = os.path.dirname(os.path.abspath(__file__))
KURS = os.path.abspath(os.path.join(HERE, '..', '..', 'docs', 'kursovaya'))
OUT = os.path.join(KURS, 'zapiska.docx')
MOVES = os.path.join(KURS, 'src', 'layout-final.json')
LIMIT = 2.5
CAP = re.compile(r'\s*Рисунок\s+(\d+\.\d+)\s*[–-]')


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(qn('w:t')))


def is_plain(el):
    """Обычный абзац текста: без рисунка, стиля заголовка и разрыва страницы."""
    if el.tag != qn('w:p') or el.find('.//' + qn('w:drawing')) is not None or not text_of(el).strip():
        return False
    st = el.find('.//' + qn('w:pStyle'))
    if st is not None and st.get(qn('w:val')).lower().startswith(('heading', '1', '2', '3')):
        return False
    return el.find('.//' + qn('w:pageBreakBefore')) is None and not CAP.match(text_of(el))


def move(d, num):
    """Переносит первый абзац описания рисунка num выше рисунка. True, если перенос выполнен."""
    els = list(d.element.body)
    ci = next((i for i, e in enumerate(els) if e.tag == qn('w:p') and (m := CAP.match(text_of(e))) and m.group(1) == num), None)
    if ci is None:
        return False
    pic = next((j for j in range(ci - 1, max(ci - 4, 0), -1) if els[j].find('.//' + qn('w:drawing')) is not None), None)
    if pic is None:
        return False
    k = ci + 1
    while k < len(els) and els[k].tag == qn('w:p') and not text_of(els[k]).strip() and els[k].find('.//' + qn('w:drawing')) is None:
        k += 1
    if k >= len(els) or not is_plain(els[k]):
        return False                     # после рисунка заголовок, таблица или другой рисунок: подраздел не должен кончаться рисунком
    after = els[k]
    nxt = k + 1
    while nxt < len(els) and els[nxt].tag == qn('w:p') and not text_of(els[nxt]).strip():
        nxt += 1
    if nxt >= len(els) or not (is_plain(els[nxt]) or els[nxt].find('.//' + qn('w:drawing')) is not None):
        return False                     # описание – последний абзац подраздела: после переноса подраздел кончался бы рисунком
    lead = pic - 1
    while lead > 0 and els[lead].tag == qn('w:p') and not text_of(els[lead]).strip():
        lead -= 1
    if not is_plain(els[lead]):
        return False
    els[lead].addnext(after)
    # «не отрывать от следующего» у абзаца со ссылкой переходит на перенесённый абзац описания
    return True


def apply(path, moves):
    d = docx.Document(path)
    done = [n for n in moves if move(d, n)]
    d.save(path)
    return done


def lo_pdf(path):
    """PDF LibreOffice по копии без «не отрывать от следующего» в таблицах (иначе LibreOffice теряет строки)."""
    tmp = tempfile.mkdtemp()
    d = docx.Document(path)
    for t in [e for e in d.element.body if e.tag == qn('w:tbl')]:
        for kn in list(t.iter(qn('w:keepNext'))):
            kn.getparent().remove(kn)
    copy = os.path.join(tmp, 'z.docx')
    d.save(copy)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, copy], check=True, capture_output=True)
    return os.path.join(tmp, 'z.pdf')


def gaps(path):
    return [r for r in check_layout.analyze(lo_pdf(path), skip=5) if r['gap'] > LIMIT]


def optimize(passes=12):
    moves = json.load(open(MOVES, encoding='utf-8')) if os.path.exists(MOVES) else []
    tried = set(moves)
    for n in range(passes):
        rows = gaps(OUT)
        done, changed = set(), False
        d = docx.Document(OUT)
        for r in rows:
            m = re.match(r'Рисунок (\d+)\.(\d+) –', r['next'] or '')
            if not m:
                continue
            chap, num = m.group(1), f'{m.group(1)}.{m.group(2)}'
            if chap in done or num in tried:
                continue
            tried.add(num)
            if move(d, num):
                moves.append(num); done.add(chap); changed = True
                print(f'проход {n + 1}: стр. {r["page"]}, пустота {r["gap"]} см, описание рисунка {num} перенесено выше', flush=True)
        if not changed:
            break
        d.save(OUT)
        json.dump(moves, open(MOVES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('итог:', [(r['page'], r['gap'], r['next'][:30]) for r in gaps(OUT)])


if __name__ == '__main__':
    optimize(int(sys.argv[sys.argv.index('--passes') + 1]) if '--passes' in sys.argv else 12)
