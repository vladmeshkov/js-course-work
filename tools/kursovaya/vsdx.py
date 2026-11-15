"""Запись листа в формат Microsoft Visio (.vsdx, Office Open XML). Каждая фигура листа становится отдельной
фигурой Visio: линии с толщиной и стрелками, прямоугольники, многоугольники, окружности, надписи (Arial,
кегль в мм, жирный/курсив, поворот) и рисунки PNG. Файл открывается в Visio 2013+ и сохраняется как .vsd.

Примитивы (координаты в мм, начало в левом верхнем углу листа, как в SVG):
  ('poly', pts, closed, sw, stroke, fill, arrow)   ('circle', cx, cy, r, sw, fill)
  ('text', x, y, text, size, anchor, bold, italic, rotate, lh)   ('image', path, x, y, w, h)
"""
import math, os, zipfile
from xml.sax.saxutils import escape

IN = 25.4
NS = 'http://schemas.microsoft.com/office/visio/2012/main'
RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


def _hex(c):
    c = c.lstrip('#')
    return '#' + (c if len(c) == 6 else ''.join(ch * 2 for ch in c)).upper()


def _cell(n, v, u=None):
    return f'<Cell N="{n}" V="{v}"{f" U={chr(34)}{u}{chr(34)}" if u else ""}/>'


class Writer:
    def __init__(self, width_mm, height_mm):
        self.W, self.H = width_mm / IN, height_mm / IN
        self.hmm = height_mm
        self.shapes, self.media = [], []
        self.id = 0

    def _xy(self, x, y):
        return x / IN, (self.hmm - y) / IN

    def _box(self, pts):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def _nid(self):
        self.id += 1
        return self.id

    def poly(self, pts, closed=False, sw=0.35, stroke='#000', fill=None, arrow=False):
        P = [self._xy(*p) for p in pts]
        x0, y0, x1, y1 = self._box(P)
        w, h = max(x1 - x0, 1e-4), max(y1 - y0, 1e-4)
        rows = []
        for i, (x, y) in enumerate(P + ([P[0]] if closed else [])):
            rows.append(f'<Row T="{"MoveTo" if i == 0 else "LineTo"}" IX="{i + 1}">{_cell("X", f"{x - x0:.5f}", "MM")}{_cell("Y", f"{y - y0:.5f}", "MM")}</Row>')
        cells = [_cell('PinX', f'{x0 + w / 2:.5f}', 'MM'), _cell('PinY', f'{y0 + h / 2:.5f}', 'MM'),
                 _cell('Width', f'{w:.5f}', 'MM'), _cell('Height', f'{h:.5f}', 'MM'),
                 _cell('LocPinX', f'{w / 2:.5f}', 'MM'), _cell('LocPinY', f'{h / 2:.5f}', 'MM'),
                 _cell('LineWeight', f'{sw / IN:.5f}', 'MM'), _cell('LineColor', _hex(stroke)),
                 _cell('LinePattern', '1' if sw > 0 else '0'), _cell('LineCap', '0')]
        if fill:
            cells += [_cell('FillForegnd', _hex(fill)), _cell('FillPattern', '1')]
        else:
            cells += [_cell('FillPattern', '0')]
        if arrow:
            cells += [_cell('EndArrow', '13'), _cell('EndArrowSize', '2')]
        geo = f'<Section N="Geometry" IX="0">{_cell("NoFill", "0" if fill else "1")}{_cell("NoLine", "0" if sw > 0 else "1")}{"".join(rows)}</Section>'
        self.shapes.append(f'<Shape ID="{self._nid()}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">{"".join(cells)}{geo}</Shape>')

    def circle(self, cx, cy, r, sw=0.35, fill='#fff'):
        x, y = self._xy(cx, cy); R = r / IN
        cells = [_cell('PinX', f'{x:.5f}', 'MM'), _cell('PinY', f'{y:.5f}', 'MM'), _cell('Width', f'{2 * R:.5f}', 'MM'),
                 _cell('Height', f'{2 * R:.5f}', 'MM'), _cell('LocPinX', f'{R:.5f}', 'MM'), _cell('LocPinY', f'{R:.5f}', 'MM'),
                 _cell('LineWeight', f'{sw / IN:.5f}', 'MM'), _cell('FillForegnd', _hex(fill or '#fff')), _cell('FillPattern', '1' if fill else '0')]
        geo = (f'<Section N="Geometry" IX="0">{_cell("NoFill", "0" if fill else "1")}<Row T="Ellipse" IX="1">'
               f'{_cell("X", f"{R:.5f}")}{_cell("Y", f"{R:.5f}")}{_cell("A", f"{2 * R:.5f}")}{_cell("B", f"{R:.5f}")}'
               f'{_cell("C", f"{R:.5f}")}{_cell("D", f"{2 * R:.5f}")}</Row></Section>')
        self.shapes.append(f'<Shape ID="{self._nid()}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">{"".join(cells)}{geo}</Shape>')

    def text(self, x, y, t, size, anchor='start', bold=False, italic=False, rotate=None, lh=1.2, bg=None, font='Arial'):
        """Надпись: точка (x, y) – как в SVG (по горизонтали start/middle/end, по вертикали середина строки
        или середина блока для middle-v)."""
        lines = t.split('\n')
        n = len(lines)
        wmm = max(len(l) for l in lines) * size * 0.62 + 2
        hmm = n * size * lh + 0.6
        cy = y if anchor == 'middle-v' else y + (n - 1) * size * lh / 2
        if anchor in ('middle', 'middle-v'):
            cx, align = x, 1
        elif anchor == 'end':
            cx, align = x - wmm / 2, 2
        else:
            cx, align = x + wmm / 2, 0
        px, py = self._xy(cx, cy)
        w, h = wmm / IN, hmm / IN
        cells = [_cell('PinX', f'{px:.5f}', 'MM'), _cell('PinY', f'{py:.5f}', 'MM'), _cell('Width', f'{w:.5f}', 'MM'),
                 _cell('Height', f'{h:.5f}', 'MM'), _cell('LocPinX', f'{w / 2:.5f}', 'MM'), _cell('LocPinY', f'{h / 2:.5f}', 'MM'),
                 _cell('LinePattern', '0'), _cell('FillPattern', '1' if bg else '0'), _cell('FillForegnd', _hex(bg or '#fff')),
                 _cell('LeftMargin', '0'), _cell('RightMargin', '0'), _cell('TopMargin', '0'), _cell('BottomMargin', '0'),
                 _cell('VerticalAlign', '1')]
        if rotate:
            cells.append(_cell('Angle', f'{-math.radians(rotate):.6f}'))
        style = (1 if bold else 0) + (2 if italic else 0)
        char = (f'<Section N="Character"><Row IX="0">{_cell("Font", font)}{_cell("Size", f"{size * 1.0 / IN:.5f}", "MM")}'
                f'{_cell("Style", style)}{_cell("Color", "#000000")}</Row></Section>')
        para = f'<Section N="Paragraph"><Row IX="0">{_cell("HorzAlign", align)}{_cell("SpLine", f"-{lh:.2f}")}</Row></Section>'
        body = escape('\n'.join(lines))
        self.shapes.append(f'<Shape ID="{self._nid()}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">{"".join(cells)}{char}{para}<Text>{body}</Text></Shape>')

    def image(self, path, x, y, w, h):
        self.media.append(path)
        rid = f'rId{len(self.media)}'
        px, py = self._xy(x + w / 2, y + h / 2)
        W, Hh = w / IN, h / IN
        cells = [_cell('PinX', f'{px:.5f}', 'MM'), _cell('PinY', f'{py:.5f}', 'MM'), _cell('Width', f'{W:.5f}', 'MM'),
                 _cell('Height', f'{Hh:.5f}', 'MM'), _cell('LocPinX', f'{W / 2:.5f}', 'MM'), _cell('LocPinY', f'{Hh / 2:.5f}', 'MM'),
                 _cell('ImgOffsetX', '0'), _cell('ImgOffsetY', '0'), _cell('ImgWidth', f'{W:.5f}', 'MM'), _cell('ImgHeight', f'{Hh:.5f}', 'MM'),
                 _cell('LinePattern', '0'), _cell('FillPattern', '0')]
        geo = (f'<Section N="Geometry" IX="0">{_cell("NoFill", "1")}{_cell("NoLine", "1")}<Row T="RelMoveTo" IX="1">{_cell("X", 0)}{_cell("Y", 0)}</Row>'
               f'<Row T="RelLineTo" IX="2">{_cell("X", 1)}{_cell("Y", 0)}</Row><Row T="RelLineTo" IX="3">{_cell("X", 1)}{_cell("Y", 1)}</Row>'
               f'<Row T="RelLineTo" IX="4">{_cell("X", 0)}{_cell("Y", 1)}</Row><Row T="RelLineTo" IX="5">{_cell("X", 0)}{_cell("Y", 0)}</Row></Section>')
        self.shapes.append(f'<Shape ID="{self._nid()}" Type="Foreign" LineStyle="0" FillStyle="0" TextStyle="0">{"".join(cells)}{geo}'
                           f'<ForeignData ForeignType="Bitmap" CompressionType="PNG"><Rel r:id="{rid}"/></ForeignData></Shape>')

    def save(self, path, title='Лист'):
        ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
              '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>'
              '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>'
              '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>'
              '<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>'
              '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
              '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
              '</Types>')
        rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>'
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
                '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
                '</Relationships>')
        core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
                'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + escape(title) + '</dc:title><dc:creator>Мешков В.Д.</dc:creator></cp:coreProperties>')
        app = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
               '<Application>Microsoft Visio</Application></Properties>')
        doc = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><VisioDocument xmlns="{NS}" xmlns:r="{RNS}" xml:space="preserve">'
               '<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0"/>'
               '<Colors><ColorEntry IX="0" RGB="#000000"/><ColorEntry IX="1" RGB="#FFFFFF"/></Colors>'
               '<FaceNames><FaceName NameU="Arial" UnicodeRanges="-1610611969 1073750139 0 0" CharSets="1073742335 -65536" Panose="2 11 6 4 2 2 2 2 2 4" Flags="325"/>'
               '<FaceName NameU="Times New Roman" UnicodeRanges="-536859905 -1073711037 9 0" CharSets="1073742335 -65536" Panose="2 2 6 3 5 4 5 2 3 4" Flags="325"/>'
               '<FaceName NameU="Calibri" UnicodeRanges="-469750017 -1073732485 9 0" CharSets="536871327 0" Panose="2 15 5 2 2 2 4 3 2 4" Flags="325"/></FaceNames>'
               '<StyleSheets><StyleSheet ID="0" NameU="No Style" IsCustomNameU="1" Name="No Style" IsCustomName="1">'
               + ''.join(_cell(n, v) for n, v in [('EnableLineProps', 1), ('EnableFillProps', 1), ('EnableTextProps', 1), ('HideForApply', 0),
                                                  ('LineWeight', 0.01041666666666667), ('LineColor', 0), ('LinePattern', 1), ('Rounding', 0),
                                                  ('EndArrowSize', 2), ('BeginArrow', 0), ('EndArrow', 0), ('LineCap', 0), ('BeginArrowSize', 2),
                                                  ('LineColorTrans', 0), ('FillForegnd', 1), ('FillBkgnd', 0), ('FillPattern', 1),
                                                  ('FillForegndTrans', 0), ('FillBkgndTrans', 0), ('ShdwPattern', 0), ('LeftMargin', 0),
                                                  ('RightMargin', 0), ('TopMargin', 0), ('BottomMargin', 0), ('VerticalAlign', 1),
                                                  ('TextBkgnd', 0), ('TextDirection', 0)])
               + '<Section N="Character"><Row IX="0">' + _cell('Font', 'Arial') + _cell('Color', 0) + _cell('Style', 0) + _cell('Size', 0.1666666666666667)
               + '</Row></Section><Section N="Paragraph"><Row IX="0">' + _cell('HorzAlign', 1) + _cell('SpLine', -1.2) + '</Row></Section>'
               '</StyleSheet></StyleSheets></VisioDocument>')
        doc_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                    '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>'
                    '<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/></Relationships>')
        windows = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Windows ClientWidth="1600" ClientHeight="900" xmlns="{NS}" xmlns:r="{RNS}">'
                   '<Window ID="0" WindowType="Drawing" WindowState="1073741824" ClientWidth="1600" ClientHeight="900" Page="0" ViewScale="-1" ViewCenterX="0" ViewCenterY="0"/></Windows>')
        pages = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Pages xmlns="{NS}" xmlns:r="{RNS}" xml:space="preserve">'
                 f'<Page ID="0" NameU="{escape(title)}" Name="{escape(title)}"><PageSheet LineStyle="0" FillStyle="0" TextStyle="0">'
                 f'{_cell("PageWidth", f"{self.W:.5f}", "MM")}{_cell("PageHeight", f"{self.H:.5f}", "MM")}{_cell("PageScale", 1, "MM")}{_cell("DrawingScale", 1, "MM")}'
                 f'{_cell("DrawingSizeType", 0)}{_cell("DrawingScaleType", 0)}{_cell("PrintPageOrientation", 2)}'
                 f'</PageSheet><Rel r:id="rId1"/></Page></Pages>')
        pages_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                      '<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/></Relationships>')
        page = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><PageContents xmlns="{NS}" xmlns:r="{RNS}" xml:space="preserve">'
                f'<Shapes>{"".join(self.shapes)}</Shapes></PageContents>')
        page_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                     + ''.join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image{i + 1}.png"/>'
                               for i in range(len(self.media))) + '</Relationships>')
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('[Content_Types].xml', ct)
            z.writestr('_rels/.rels', rels)
            z.writestr('docProps/core.xml', core)
            z.writestr('docProps/app.xml', app)
            z.writestr('visio/document.xml', doc)
            z.writestr('visio/_rels/document.xml.rels', doc_rels)
            z.writestr('visio/windows.xml', windows)
            z.writestr('visio/pages/pages.xml', pages)
            z.writestr('visio/pages/_rels/pages.xml.rels', pages_rels)
            z.writestr('visio/pages/page1.xml', page)
            z.writestr('visio/pages/_rels/page1.xml.rels', page_rels)
            for i, m in enumerate(self.media):
                z.write(m, f'visio/media/image{i + 1}.png')
