#!/usr/bin/env python3
"""SVG-рисунки раздела 2 (fig_2.py) -> редактируемый файл draw.io: каждый блок, линия и надпись становится
отдельной фигурой draw.io. Поддерживаются элементы, из которых строятся рисунки: rect, circle, ellipse,
polygon (ромб решения, параллелограмм ввода-вывода, граница цикла), path из M/L (линии, стрелка marker-end)
и text.
Использование: python3 svg2drawio.py выход.drawio имя_страницы=файл.svg ...
"""
import html, re, sys
import xml.etree.ElementTree as ET

NS = '{http://www.w3.org/2000/svg}'


def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def stroke_style(el):
    sw = num(el.get('stroke-width'), 1)
    stroke = el.get('stroke', '#000000')
    fill = el.get('fill', 'none')
    return (f"strokeColor={'none' if stroke == 'none' else stroke};strokeWidth={sw};"
            f"fillColor={'none' if fill in ('none', None) else ('#FFFFFF' if fill == 'white' else fill)};")


class Page:
    def __init__(self, name):
        self.name, self.cells, self.n = name, [], 1

    def nid(self):
        self.n += 1
        return f'c{self.n}'

    def vertex(self, style, x, y, w, h, value=''):
        self.cells.append(f'<mxCell id="{self.nid()}" value="{html.escape(value)}" style="{html.escape(style)}" vertex="1" parent="1">'
                          f'<mxGeometry x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" as="geometry"/></mxCell>')

    def edge(self, style, pts):
        (sx, sy), (tx, ty) = pts[0], pts[-1]
        mid = ''.join(f'<mxPoint x="{x:.1f}" y="{y:.1f}"/>' for x, y in pts[1:-1])
        self.cells.append(f'<mxCell id="{self.nid()}" value="" style="{html.escape(style)}" edge="1" parent="1">'
                          f'<mxGeometry relative="1" as="geometry"><mxPoint x="{sx:.1f}" y="{sy:.1f}" as="sourcePoint"/>'
                          f'<mxPoint x="{tx:.1f}" y="{ty:.1f}" as="targetPoint"/>'
                          + (f'<Array as="points">{mid}</Array>' if mid else '') + '</mxGeometry></mxCell>')

    def xml(self, w, h):
        return (f'<diagram name="{html.escape(self.name)}" id="{html.escape(self.name)}"><mxGraphModel dx="1200" dy="900" grid="0" gridSize="10" '
                f'guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{int(w)}" pageHeight="{int(h)}" math="0" shadow="0">'
                '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' + ''.join(self.cells) + '</root></mxGraphModel></diagram>')


def polygon(page, el, pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    base = stroke_style(el) + 'html=0;whiteSpace=wrap;'
    if len(pts) == 4 and abs(pts[0][0] - pts[2][0]) < 1 and abs(pts[1][1] - pts[3][1]) < 1:
        page.vertex('rhombus;' + base, x0, y0, w, h)                       # решение
    elif len(pts) == 4 and abs(pts[0][1] - pts[1][1]) < 1 and abs(pts[2][1] - pts[3][1]) < 1:
        skew = abs(pts[0][0] - pts[3][0])
        page.vertex(f'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size={skew:.1f};' + base, x0, y0, w, h)
    elif len(pts) in (5, 6):
        # граница цикла: срезаны верхние углы (начало) или нижние (конец, отражение по вертикали)
        cut_top = not any(abs(p[1] - y0) < 1 and abs(p[0] - x0) < 1 for p in pts)
        page.vertex('shape=loopLimit;whiteSpace=wrap;' + ('' if cut_top else 'flipV=1;') + base, x0, y0, w, h)
    else:
        page.edge(stroke_style(el) + 'endArrow=none;html=1;rounded=0;', pts + [pts[0]])


def convert(name, path):
    root = ET.parse(path).getroot()
    W, H = num(root.get('width')), num(root.get('height'))
    page = Page(name)
    for el in root.iter():
        tag = el.tag.replace(NS, '')
        if tag in ('svg', 'defs', 'marker') or el in list(root.iter(NS + 'marker')):
            continue
        if tag == 'path' and any(el in list(m.iter()) for m in root.iter(NS + 'marker')):
            continue                                                     # наконечник стрелки внутри marker
        if tag == 'rect':
            x, y, w, h = (num(el.get(k)) for k in ('x', 'y', 'width', 'height'))
            if w >= W - 1 and h >= H - 1:
                continue                                                 # белый фон рисунка
            rx = num(el.get('rx'))
            r = f'rounded=1;arcSize={min(50, rx / max(1, min(w, h)) * 100):.0f};' if rx else 'rounded=0;'
            dash = 'dashed=1;' if el.get('stroke-dasharray') else ''
            page.vertex(r + dash + stroke_style(el) + 'html=0;whiteSpace=wrap;', x, y, w, h)
        elif tag in ('circle', 'ellipse'):
            cx, cy = num(el.get('cx')), num(el.get('cy'))
            rx = num(el.get('r')) if tag == 'circle' else num(el.get('rx'))
            ry = num(el.get('r')) if tag == 'circle' else num(el.get('ry'))
            page.vertex('ellipse;' + stroke_style(el) + 'html=0;', cx - rx, cy - ry, 2 * rx, 2 * ry)
        elif tag == 'polygon':
            nums = [num(v) for v in re.split(r'[\s,]+', el.get('points').strip())]
            polygon(page, el, list(zip(nums[::2], nums[1::2])))
        elif tag == 'path':
            d = el.get('d')
            pts = [(num(a), num(b)) for a, b in re.findall(r'[ML]\s*([-\d.]+)[ ,]([-\d.]+)', d)]
            if len(pts) < 2:
                continue
            closed = d.strip().lower().endswith('z')
            if closed:
                pts.append(pts[0])
            arrow = 'endArrow=block;endFill=1;endSize=7;' if el.get('marker-end') else 'endArrow=none;'
            dash = 'dashed=1;' if el.get('stroke-dasharray') else ''
            page.edge(stroke_style(el) + arrow + dash + 'html=1;rounded=0;', pts)
        elif tag == 'text':
            t = ''.join(el.itertext())
            if not t.strip():
                continue
            size = num(el.get('font-size'), 13)
            x, y = num(el.get('x')), num(el.get('y'))
            anchor = el.get('text-anchor', 'start')
            w = max(20, len(t) * size * 0.6 + 6)
            x0 = x - w / 2 if anchor == 'middle' else (x - w if anchor == 'end' else x - 2)
            align = {'middle': 'center', 'end': 'right'}.get(anchor, 'left')
            style = (f'text;html=0;align={align};verticalAlign=middle;spacing=0;fontFamily=Arial;fontSize={size:g};'
                     f"fontStyle={(1 if el.get('font-weight') == 'bold' else 0) + (2 if el.get('font-style') == 'italic' else 0)};"
                     'fillColor=none;strokeColor=none;')
            page.vertex(style, x0, y - size * 0.95, w, size * 1.3, t)
    return page.xml(W, H)


if __name__ == '__main__':
    out, items = sys.argv[1], sys.argv[2:]
    pages = [convert(*it.split('=', 1)) for it in items]
    open(out, 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net">' + ''.join(pages) + '</mxfile>\n')
    print(out, len(pages), 'стр.')
