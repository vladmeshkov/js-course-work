#!/usr/bin/env python3
"""Единая записка: основа (zapiska-osnova.docx: титул, реферат, введение, раздел 1, список источников и т. д.)
+ разделы 2, 3, 4 и заключение, которые вставляются перед списком использованных источников.

Разделы собраны на шаблоне с теми же стилями, что у основы (идентификаторы стилей совпадают), поэтому
абзацы переносятся как есть. Меняются только ссылки на рисунки (картинки добавляются в основу заново),
номера объектов рисунков и список с тире (numId 22 шаблона -> numId 1 основы). Каждый раздел и список источников
начинаются с новой страницы (свойство заголовка), служебный sectPr разделов не переносится.
Отдельные рисунки уменьшаются по src/merge-scales.json (его подбирает fit_all.py).
Использование: python3 merge_all.py [выход.docx]   (по умолчанию docs/kursovaya/zapiska.docx)
"""
import copy, io, json, os, re, subprocess, sys, tempfile
import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
KURS = os.path.abspath(os.path.join(HERE, '..', '..', 'docs', 'kursovaya'))
PARTS = ['razdel-2.docx', 'razdel-3.docx', 'razdel-4.docx', 'zaklyuchenie.docx']
APPENDIX = 'prilozheniya.docx'           # приложения А, Б, В (build_app.py), идут после списка источников
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
DASH_SRC, DASH_DST = '22', '1'
SCALES = os.path.join(KURS, 'src', 'merge-scales.json')   # {"номер рисунка": множитель} – подбирает fit_all.py


def apply_scales(body, scales):
    """Уменьшает рисунки по номеру из подписи «Рисунок X.Y – …», которая идёт следом за абзацем с картинкой."""
    els = list(body)
    for i, el in enumerate(els):
        if el.tag != qn('w:p') or el.find('.//' + qn('w:drawing')) is None:
            continue
        num = next((m.group(1) for e in els[i + 1:i + 4] if (m := re.match(r'\s*Рисунок (\d+\.\d+) –', text_of(e)))), None)
        k = scales.get(num)
        if not k:
            continue
        for ext in list(el.iter(f'{{{WP}}}extent')) + [x for x in el.iter(f'{{{A}}}ext') if x.get('cx')]:
            ext.set('cx', str(round(int(ext.get('cx')) * k))); ext.set('cy', str(round(int(ext.get('cy')) * k)))


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(qn('w:t')))


def break_before(p):
    """Заголовок с новой страницы (свойство абзаца, а не отдельный абзац с разрывом: после полностью
    заполненной страницы отдельный разрыв дал бы пустую страницу)."""
    ppr = p.find(qn('w:pPr'))
    if ppr is None:
        ppr = OxmlElement('w:pPr'); p.insert(0, ppr)
    if ppr.find(qn('w:pageBreakBefore')) is None:
        el = OxmlElement('w:pageBreakBefore')
        st = ppr.find(qn('w:pStyle'))
        (st.addnext(el) if st is not None else ppr.insert(0, el))


def copy_part(base, name, anchor=None, docpr=[10000]):
    """Переносит тело раздела в основу перед anchor (или в конец документа); первый абзац – с новой страницы."""
    src = docx.Document(os.path.join(KURS, name))
    body = base.element.body
    first = True
    for el in src.element.body:
        if el.tag == qn('w:sectPr'):
            continue
        el = copy.deepcopy(el)
        for blip in el.iter(f'{{{A}}}blip'):
            blob = src.part.related_parts[blip.get(f'{{{R}}}embed')].blob
            rid, _ = base.part.get_or_add_image(io.BytesIO(blob))
            blip.set(f'{{{R}}}embed', rid)
        for dp in el.iter(f'{{{WP}}}docPr'):
            docpr[0] += 1; dp.set('id', str(docpr[0]))
        for nid in el.iter(qn('w:numId')):
            if nid.get(qn('w:val')) == DASH_SRC:
                nid.set(qn('w:val'), DASH_DST)
        if first and el.tag == qn('w:p'):
            break_before(el); first = False
        if anchor is not None:
            anchor.addprevious(el)
        else:
            body.find(qn('w:sectPr')).addprevious(el)


def counts(base):
    """Рисунки, таблицы и источники по собранному документу."""
    texts = [p.text.strip() for p in base.paragraphs]
    figs = {m.group(1) for t in texts if (m := re.match(r'Рисунок ([\dА-Я]+\.\d+)\s*–', t))}
    tabs = {m.group(1) for t in texts if (m := re.match(r'Таблица (\d+\.\d+)\s*–', t))}
    i = texts.index('СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ')
    j = next(k for k in range(i + 1, len(texts)) if texts[k].startswith('ПРИЛОЖЕНИЕ'))
    return len(figs), len(tabs), sum(1 for t in texts[i + 1:j] if t)


def plural(n, one, few, many):
    return one if n % 10 == 1 and n % 100 != 11 else few if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else many


def abstract(base, pages):
    """Реферат по образцу: шифр, библиографическое описание, объём, ключевые слова, цель, методология,
    результаты и область применения. Заменяет строку-заглушку после заголовка «РЕФЕРАТ»."""
    stub = next(p for p in base.paragraphs if p.text.startswith('Реферат оформляется'))
    f, t, src = counts(base)
    lines = [
        'БГУИР КП 6-05-0611-01 076 ПЗ', '',
        f'Мешков, В. Д. Дистанционное банковское обслуживание и программная поддержка действий пользователя по управлению персональными счетами : пояснительная записка к курсовому проекту / В. Д. Мешков. – Минск : БГУИР, 2026. – {pages} с.', '',
        f'Пояснительная записка {pages} с., {f} рис., {t} табл., {src} {plural(src, "источник", "источника", "источников")}, 3 приложения.', '',
        'Ключевые слова: дистанционное банковское обслуживание, интернет-банкинг, двойная запись, переводы, вклады, кредиты, оценка кредитоспособности, логистическая регрессия, ролевая модель доступа, двухфакторная аутентификация, Node.js, Express, MySQL.',
        'Цель курсового проектирования: автоматизация процессов дистанционного банковского обслуживания физических лиц для сокращения времени выполнения операций и снижения нагрузки на сотрудников банка.',
        'Методология проведения работы: базируется на принципах системного анализа и моделирования предметной области, что позволило формализовать процессы обслуживания клиента от регистрации до выдачи и погашения кредита. Для описания предметной области применялись функциональное моделирование в нотации IDEF0, информационное моделирование и унифицированный язык моделирования UML, при разработке использовались архитектурный шаблон MVC, принцип двойной записи и транзакционная обработка денежных операций, а работоспособность проверялась программными тестами и тестами бизнес-логики.',
        'Результаты работы: выполнен анализ предметной области и существующих систем дистанционного банковского обслуживания, построены функциональная, информационная и UML-модели, сформулированы функциональные требования для шести категорий пользователей. Разработано веб-приложение на Node.js, Express и MySQL, которое поддерживает более пятнадцати бизнес-операций, ведёт учёт по принципу двойной записи, оценивает кредитоспособность заёмщика логистической регрессией и защищает данные хэшированием паролей, двухфакторной аутентификацией и шифрованием. Подготовлены руководство по установке и руководство пользователя для каждой роли.',
        'Область применения результатов: охватывает дистанционное обслуживание физических лиц в банках, включая ведение счетов, переводы, оплату услуг, вклады и кредиты, а также работу сотрудников банка по проверке клиентов, рассмотрению кредитных заявок, контролю подозрительных операций и администрированию системы.',
    ]
    ppr = OxmlElement('w:pPr')
    jc = OxmlElement('w:jc'); jc.set(qn('w:val'), 'both'); ppr.append(jc)
    ind = OxmlElement('w:ind'); ind.set(qn('w:firstLine'), '709'); ppr.append(ind)
    for text in lines:
        p = OxmlElement('w:p'); p.append(copy.deepcopy(ppr))
        if text:
            r = OxmlElement('w:r'); tt = OxmlElement('w:t'); tt.text = text
            tt.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve'); r.append(tt); p.append(r)
        stub._p.addprevious(p)
    stub._p.getparent().remove(stub._p)


def assemble(out, pages):
    base = docx.Document(os.path.join(KURS, 'zapiska-osnova.docx'))
    body = base.element.body
    end = next(el for el in body if el.tag == qn('w:p') and text_of(el).strip() == 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ')
    prev = end.getprevious()            # абзац с разрывом страницы перед списком источников заменяется свойством
    if prev.tag == qn('w:p') and not text_of(prev).strip() and prev.find('.//' + qn('w:br')) is not None:
        body.remove(prev)
    break_before(end)
    for name in PARTS:
        copy_part(base, name, end)
    copy_part(base, APPENDIX)
    apply_scales(body, json.load(open(SCALES, encoding='utf-8')) if os.path.exists(SCALES) else {})
    abstract(base, pages)
    base.save(out)


def page_count(path):
    tmp = tempfile.mkdtemp()
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, path], check=True, capture_output=True)
    pdf = os.path.join(tmp, os.path.basename(path)[:-5] + '.pdf')
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    return int(re.search(r'Pages:\s+(\d+)', info).group(1))


def main(out):
    """Два прохода: сборка с числом страниц-заглушкой, подсчёт страниц по PDF, окончательная сборка."""
    assemble(out, 0)
    assemble(out, page_count(out))
    print(out)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(KURS, 'zapiska.docx'))
