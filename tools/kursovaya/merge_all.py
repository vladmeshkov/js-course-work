#!/usr/bin/env python3
"""Единая записка: основа (zapiska-osnova.docx: титул, реферат, введение, раздел 1, список источников и т. д.)
+ разделы 2, 3, 4 и заключение, которые вставляются перед списком использованных источников.

Разделы собраны на шаблоне с теми же стилями, что у основы (идентификаторы стилей совпадают), поэтому
абзацы переносятся как есть. Меняются только ссылки на рисунки (картинки добавляются в основу заново),
номера объектов рисунков и список с тире (numId 22 шаблона -> numId 1 основы). Каждый раздел и список источников
начинаются с новой страницы (свойство заголовка), служебный sectPr разделов не переносится.
Использование: python3 merge_all.py [выход.docx]   (по умолчанию docs/kursovaya/zapiska.docx)
"""
import copy, io, os, sys
import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
KURS = os.path.abspath(os.path.join(HERE, '..', '..', 'docs', 'kursovaya'))
PARTS = ['razdel-2.docx', 'razdel-3.docx', 'razdel-4.docx', 'zaklyuchenie.docx']
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
DASH_SRC, DASH_DST = '22', '1'


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


def main(out):
    base = docx.Document(os.path.join(KURS, 'zapiska-osnova.docx'))
    body = base.element.body
    end = next(el for el in body if el.tag == qn('w:p') and text_of(el).strip() == 'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ')
    prev = end.getprevious()            # абзац с разрывом страницы перед списком источников заменяется свойством
    if prev.tag == qn('w:p') and not text_of(prev).strip() and prev.find('.//' + qn('w:br')) is not None:
        body.remove(prev)
    break_before(end)
    anchor = end
    docpr = 10000
    for name in PARTS:
        src = docx.Document(os.path.join(KURS, name))
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
                docpr += 1; dp.set('id', str(docpr))
            for nid in el.iter(qn('w:numId')):
                if nid.get(qn('w:val')) == DASH_SRC:
                    nid.set(qn('w:val'), DASH_DST)
            if first and el.tag == qn('w:p'):
                break_before(el); first = False
            anchor.addprevious(el)
    base.save(out)
    print(out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(KURS, 'zapiska.docx'))
