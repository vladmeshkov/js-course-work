"""Общие функции для сборки разделов записки в docx."""
import copy
import docx
from docx.shared import Cm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image


class Builder:
    def __init__(self, doc, body_ref, cap_ref, tcap_ref):
        self.d = doc
        self.fmt = {}
        for k, r in (('body', body_ref), ('cap', cap_ref), ('tcap', tcap_ref)):
            pf = r.paragraph_format
            self.fmt[k] = dict(alignment=pf.alignment, first=pf.first_line_indent, ls=pf.line_spacing, sa=pf.space_after,
                               sb=pf.space_before, size=r.runs[0].font.size)

    def para(self, text, kind='body'):
        f = self.fmt[kind]
        p = self.d.add_paragraph()
        pf = p.paragraph_format
        pf.alignment = f['alignment']; pf.first_line_indent = f['first']; pf.line_spacing = f['ls']
        pf.space_after = f['sa']; pf.space_before = f['sb']
        if text:
            r = p.add_run(text); r.font.name = 'Times New Roman'; r.font.size = f['size']
        return p

    def heading(self, text):
        p = self.para(text, 'body')
        p.paragraph_format.first_line_indent = Cm(1.25)
        p.paragraph_format.keep_with_next = True
        p.runs[0].font.bold = True
        return p

    def figure(self, path, caption, max_w=16.3, max_h=21.0, width=None):
        im = Image.open(path)
        w = width or max_w
        h = w * im.height / im.width
        if h > max_h:
            h = max_h; w = h * im.width / im.height
        p = self.para('', 'cap'); p.paragraph_format.keep_with_next = True
        p.add_run().add_picture(path, width=Cm(w), height=Cm(h))
        self.para(caption, 'cap')

    def table(self, title, header, rows, widths_cm):
        self.para(title, 'tcap').paragraph_format.keep_with_next = True
        t = self.d.add_table(rows=1 + len(rows), cols=len(header))
        t.style = 'Table Grid'

        def fill(cell, text, bold=False):
            cell.text = ''
            r = cell.paragraphs[0].add_run(text); r.font.name = 'Times New Roman'; r.font.size = Pt(12); r.bold = bold
            cell.paragraphs[0].paragraph_format.line_spacing = 1.0
        for j, h in enumerate(header):
            fill(t.rows[0].cells[j], h, True)
        for i, row in enumerate(rows, 1):
            for j, v in enumerate(row):
                fill(t.rows[i].cells[j], v)
        for r in t.rows:
            for j, c in enumerate(r.cells):
                c.width = Cm(widths_cm[j])
        t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
        self.para('', 'body')
        return t


def replace_in_runs(doc, old, new):
    """Замена текста только в рунах без рисунков (run.text у руны с рисунком стирает рисунок)."""
    for p in doc.paragraphs:
        for r in p.runs:
            if old in r.text and r._r.find(qn('w:drawing')) is None:
                r.text = r.text.replace(old, new)
