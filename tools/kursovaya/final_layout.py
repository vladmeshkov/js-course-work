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


EXTRA = os.path.join(KURS, 'src', 'layout-extra.json')
BREAKS = os.path.join(KURS, 'src', 'layout-breaks.json')


def add_text(d, num, texts):
    """Дописанные абзацы перед рисунком num (после последнего абзаца текста перед ним) – заполняют пустоту
    внизу страницы, когда рисунок уходит на следующую. Оформление копируется с предыдущего абзаца."""
    import copy
    els = list(d.element.body)
    if num.startswith('^'):            # в конец главы: после последнего абзаца текста перед заголовком
        ci = next((i for i, e in enumerate(els) if e.tag == qn('w:p') and re.match(num, text_of(e).strip())), None)
        if ci is None:
            return False
        pic = ci
    elif num.startswith('T'):            # перед таблицей: после последнего абзаца текста перед её заголовком
        ci = next((i for i, e in enumerate(els) if e.tag == qn('w:p') and re.match(rf'\s*Таблица\s+{re.escape(num[1:])}\s*[–-]', text_of(e))), None)
        if ci is None:
            return False
        pic = ci
    else:
        ci = next((i for i, e in enumerate(els) if e.tag == qn('w:p') and (m := CAP.match(text_of(e))) and m.group(1) == num), None)
        if ci is None:
            return False
        pic = next(j for j in range(ci - 1, max(ci - 4, 0), -1) if els[j].find('.//' + qn('w:drawing')) is not None)
    lead = pic - 1
    while els[lead].tag == qn('w:p') and not text_of(els[lead]).strip():
        lead -= 1
    anchor = els[lead]
    for t in texts:
        p = copy.deepcopy(anchor)
        for ch in list(p):
            if ch.tag != qn('w:pPr'):
                p.remove(ch)
        for kn in p.iter(qn('w:keepNext')):
            kn.getparent().remove(kn)
        ppr = p.find(qn('w:pPr'))
        if ppr is not None and ppr.find(qn('w:numPr')) is not None:
            # после элемента списка дописанный абзац – обычный текст: без маркера и с отступом первой строки 1,25 см
            for el in ppr.findall(qn('w:numPr')) + ppr.findall(qn('w:ind')) + ppr.findall(qn('w:pStyle')):
                ppr.remove(el)
            ind = docx.oxml.OxmlElement('w:ind'); ind.set(qn('w:firstLine'), '709'); ppr.append(ind)
        r = copy.deepcopy(anchor.find(qn('w:r')))
        for ch in list(r):
            if ch.tag != qn('w:rPr'):
                r.remove(ch)
        for tag in ('w:b', 'w:i'):
            for el in r.iter(qn(tag)):
                el.getparent().remove(el)
        tt = docx.oxml.OxmlElement('w:t'); tt.text = t
        tt.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve'); r.append(tt); p.append(r)
        anchor.addnext(p); anchor = p
    return True


def apply_doc(d):
    """Переносы описаний и дописанный текст из src/layout-final.json и src/layout-extra.json."""
    moves = json.load(open(MOVES, encoding='utf-8')) if os.path.exists(MOVES) else []
    extra = json.load(open(EXTRA, encoding='utf-8')) if os.path.exists(EXTRA) else {}
    for n in moves:
        move(d, n)
    for n, texts in extra.items():
        add_text(d, n, texts)
    fix_refs(d)
    # «Продолжение таблицы» всегда начинает новую страницу: подпись не остаётся внизу предыдущей
    for p in d.element.body.iter(qn('w:p')):
        if text_of(p).strip().startswith('Продолжение таблицы'):
            ppr = p.find(qn('w:pPr'))
            if ppr is None:
                ppr = docx.oxml.OxmlElement('w:pPr'); p.insert(0, ppr)
            if ppr.find(qn('w:pageBreakBefore')) is None:
                ppr.insert(0, docx.oxml.OxmlElement('w:pageBreakBefore'))


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


def finalize(path):
    """Чистка перед выдачей: без свойств «не отрывать от следующего», «не разрывать абзац» и «с новой
    страницы» (в Word они видны чёрными квадратиками) и без неразрывных пробелов. Где абзац начинал новую
    страницу (глава, «Продолжение таблицы»), в его начало ставится обычный разрыв страницы."""
    d = docx.Document(path)
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    body = d.element.body
    for p in body.iter(qn('w:p')):
        ppr = p.find(qn('w:pPr'))
        if ppr is None:
            continue
        pb = ppr.find(qn('w:pageBreakBefore'))
        for tag in ('w:keepNext', 'w:keepLines', 'w:pageBreakBefore'):
            for el in ppr.findall(qn(tag)):
                ppr.remove(el)
        if pb is not None and p.getprevious() is not None:
            r = docx.oxml.OxmlElement('w:r'); br = docx.oxml.OxmlElement('w:br'); br.set(qn('w:type'), 'page'); r.append(br)
            ppr.addnext(r)
    # те же свойства в стилях (у заголовков «не отрывать от следующего» задано стилем)
    for st in d.styles.element.iter(qn('w:style')):
        ppr = st.find(qn('w:pPr'))
        if ppr is not None:
            for tag in ('w:keepNext', 'w:keepLines', 'w:pageBreakBefore'):
                for el in ppr.findall(qn(tag)):
                    ppr.remove(el)
    # заголовки и подписи таблиц, которые иначе оказались бы внизу страницы, начинаются с разрыва страницы
    breaks = json.load(open(BREAKS, encoding='utf-8')) if os.path.exists(BREAKS) else []
    for p in body.iter(qn('w:p')):
        t = re.sub(r'\s+', '', text_of(p))
        if t and any(t.startswith(re.sub(r'\s+', '', b)) for b in breaks) and p.find('.//' + qn('w:br')) is None:
            r = docx.oxml.OxmlElement('w:r'); br = docx.oxml.OxmlElement('w:br'); br.set(qn('w:type'), 'page'); r.append(br)
            ppr = p.find(qn('w:pPr'))
            if ppr is not None:
                ppr.addnext(r)
            else:
                p.insert(0, r)
    for t in body.iter(qn('w:t')):
        if t.text and any(c in t.text for c in '\xa0   '):
            t.text = re.sub('[\xa0   ]', ' ', t.text)
    d.save(path)


INTRO = {
    '1.13': ('Функции системы с точки зрения внешних участников описывает диаграмма вариантов использования.', 'Диаграмма вариантов использования приведена на рисунке 1.13.'),
    '1.14': ('Последовательность подачи заявки на кредит описывает диаграмма последовательности.', 'Диаграмма последовательности приведена на рисунке 1.14.'),
    '1.15': ('Структуру программного средства описывает диаграмма компонентов.', 'Диаграмма компонентов приведена на рисунке 1.15.'),
    '1.16': ('Порядок действий и их распределение между участниками описывает диаграмма деятельности.', 'Диаграмма деятельности приведена на рисунке 1.16.'),
    '1.17': ('Размещение программного средства на оборудовании описывает диаграмма развёртывания.', 'Диаграмма развёртывания приведена на рисунке 1.17.'),
    '1.18': ('Состояния заявки на кредит описывает диаграмма состояний, названия состояний на ней совпадают со значениями поля статуса в базе данных.', 'Диаграмма состояний приведена на рисунке 1.18.'),
}
SENT = re.compile(r'(?<=[.!?])\s+(?=[А-ЯЁA-Z«])')


def set_text(p, text):
    """Новый текст абзаца без рисунков: формат первой руны сохраняется."""
    runs = p.findall(qn('w:r'))
    first = runs[0]
    for r in runs[1:]:
        p.remove(r)
    for ch in list(first):
        if ch.tag != qn('w:rPr'):
            first.remove(ch)
    t = docx.oxml.OxmlElement('w:t'); t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve'); first.append(t)


def fix_refs(d):
    """Ссылка на рисунок – в абзаце непосредственно перед рисунком и с подводкой: ссылки в скобках переписываются
    («… на диаграмме компонентов (рисунок 1.15)» -> «…, приведённой на рисунке 1.15»), а предложение со ссылкой,
    оказавшееся выше перенесённого описания или дописанного текста, переносится в конец абзаца перед рисунком."""
    body = d.element.body
    for p in body.iter(qn('w:p')):
        t = text_of(p)
        if re.search(r'\(рисун\w*\s+\d+\.\d+\)', t) and p.find('.//' + qn('w:drawing')) is None:
            set_text(p, re.sub(r'\s*\(рисун\w*\s+(\d+\.\d+)\)', r', приведённой на рисунке \1', t))
    els = list(body)
    for i, e in enumerate(els):
        m = CAP.match(text_of(e)) if e.tag == qn('w:p') else None
        if not m:
            continue
        num = m.group(1)
        ref = re.compile(r'рисун\w*\s+(?:[\d.]+\s*(?:,|и)\s*)*' + re.escape(num) + r'(?![\d])')
        pic = next((j for j in range(i - 1, max(i - 4, 0), -1) if els[j].find('.//' + qn('w:drawing')) is not None), None)
        if pic is None:
            continue
        last = pic - 1
        while last > 0 and els[last].tag == qn('w:p') and not text_of(els[last]).strip():
            last -= 1
        if ref.search(text_of(els[last])):
            continue
        # абзац со ссылкой выше в том же блоке (до предыдущей подписи, заголовка или таблицы)
        k = last - 1
        while k > 0 and els[k].tag == qn('w:p') and not CAP.match(text_of(els[k])) and els[k].find('.//' + qn('w:drawing')) is None \
                and not re.match(r'\s*(\d+(\.\d+)?\s*[А-ЯЁ]|Таблица|Продолжение)', text_of(els[k])):
            if ref.search(text_of(els[k])):
                break
            k -= 1
        src = els[k]
        if not ref.search(text_of(src)):
            continue
        if num in INTRO:                 # вводный абзац остаётся без ссылки, ссылка – в конце абзаца перед рисунком
            set_text(src, INTRO[num][0])
            set_text(els[last], text_of(els[last]).rstrip() + ' ' + INTRO[num][1])
            continue
        parts = SENT.split(text_of(src).strip())
        sent = next(s for s in parts if ref.search(s))
        rest = ' '.join(s for s in parts if s is not sent).strip()
        if rest:
            set_text(src, rest)
        else:
            src.getparent().remove(src)
        set_text(els[last], text_of(els[last]).rstrip() + ' ' + sent)
