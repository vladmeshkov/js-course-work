#!/usr/bin/env python3
"""Графическая часть (листы A1, 841x594 мм) по образцам пользователя (файлы Visio прошлого года):
  chertezh-1-idef0      – декомпозиция A0 IDEF0 «Предоставить потребительский кредит физическому лицу», шифр ПД;
  chertezh-2-algoritm   – схема алгоритма перевода клиенту банка на сетке 01–17 x A–R, шифр СА;
  plakat-1-klassy, plakat-2-modeli, plakat-3-skrinshoty – плакаты 5.3.
Пишет SVG (размеры в мм) и файл Visio .vsdx (vsdx.py) в docs/kursovaya/chertezhi; PDF и PNG делает sheets2pdf.cjs.
Использование: python3 sheets.py && node sheets2pdf.cjs
"""
import base64, math, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vsdx import Writer

HERE = os.path.dirname(os.path.abspath(__file__))
KURS = os.path.abspath(os.path.join(HERE, '..', '..', 'docs', 'kursovaya'))
OUT = os.path.join(KURS, 'chertezhi')
W, H = 841, 594
FONT = 'Arial, Liberation Sans, sans-serif'
TOPIC = 'Дистанционное банковское обслуживание и программная поддержка действий пользователя по управлению персональными счетами'


def esc(t):
    return str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


class Sheet:
    def __init__(self, width=None, height=None):
        self.W, self.H = width or W, height or H
        self.o = []
        self.v = Writer(self.W, self.H)
        self.arrow = (4.0, 1.5)       # длина и полуширина наконечника стрелки, мм

    def add(self, s):
        self.o.append(s)

    def line(self, pts, w=1.1, arrow=False, dash=False):
        d = ' '.join(f'{"M" if i == 0 else "L"}{x:.2f},{y:.2f}' for i, (x, y) in enumerate(pts))
        self.add(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{w}"{" stroke-dasharray=\"3 2\"" if dash else ""}/>')
        if arrow:  # линия доводится до основания стрелки, сама стрелка – залитый треугольник
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            L = math.hypot(x2 - x1, y2 - y1) or 1
            self.v.poly(pts[:-1] + [(x2 - (x2 - x1) / L * self.arrow[0] * 0.9, y2 - (y2 - y1) / L * self.arrow[0] * 0.9)], sw=w)
        else:
            self.v.poly(pts, sw=w)
        if arrow:
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            a = math.atan2(y2 - y1, x2 - x1); L, Wd = self.arrow
            p1 = (x2 - L * math.cos(a) + Wd * math.sin(a), y2 - L * math.sin(a) - Wd * math.cos(a))
            p2 = (x2 - L * math.cos(a) - Wd * math.sin(a), y2 - L * math.sin(a) + Wd * math.cos(a))
            self.add(f'<path d="M{x2:.2f},{y2:.2f} L{p1[0]:.2f},{p1[1]:.2f} L{p2[0]:.2f},{p2[1]:.2f} Z" fill="#000"/>')
            self.v.poly([(x2, y2), p1, p2], closed=True, sw=0, fill='#000')

    def rect(self, x, y, w, h, sw=0.35, rx=0, fill='#fff', stroke='#000'):
        if rx:  # скруглённый прямоугольник (терминатор): дуги приближаются ломаной
            r = min(rx, h / 2, w / 2); pts = []
            for cx_, cy_, a0 in [(x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)]:
                pts += [(cx_ + r * math.cos(math.radians(a0 + t * 9)), cy_ + r * math.sin(math.radians(a0 + t * 9))) for t in range(11)]
            self.v.poly(pts, closed=True, sw=sw, stroke=stroke, fill=None if fill == 'none' else fill)
        else:
            self.v.poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], closed=True, sw=sw, stroke=stroke, fill=None if fill == 'none' else fill)
        self.add(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, x, y, t, size=3.5, anchor='start', bold=False, italic=False, rotate=None, lh=1.2, font='Arial'):
        lines = t.split('\n')
        y0 = y - (len(lines) - 1) * size * lh / 2 if anchor == 'middle-v' else y
        anc = 'middle' if anchor in ('middle', 'middle-v') else anchor
        tr = f' transform="rotate({rotate} {x} {y})"' if rotate else ''
        self.v.text(x, y, t, size, anchor, bold, italic, rotate, lh, font=font)
        ff = f' font-family="{font}"' if font != 'Arial' else ''
        for i, l in enumerate(lines):
            self.add(f'<text x="{x:.2f}" y="{y0 + i * size * lh:.2f}" font-size="{size}" text-anchor="{anc}" dominant-baseline="middle"{ff}'
                     f'{" font-weight=\"bold\"" if bold else ""}{" font-style=\"italic\"" if italic else ""}{tr}>{esc(l)}</text>')

    def cell(self, x, y, code, size=3.2):
        """Код клетки сетки на верхней границе блока: белая подложка разрывает линию, как в образцах."""
        w = len(code) * size * 0.62 + 2
        self.add(f'<rect x="{x + 2:.2f}" y="{y - size / 2 - 0.3:.2f}" width="{w:.2f}" height="{size + 0.6:.2f}" fill="#fff"/>')
        self.v.poly([(x + 2, y - size / 2 - 0.3), (x + 2 + w, y - size / 2 - 0.3), (x + 2 + w, y + size / 2 + 0.3), (x + 2, y + size / 2 + 0.3)], closed=True, sw=0, fill='#fff')
        self.text(x + 3, y, code, size=size, bold=True)

    def poly(self, pts, sw=0.7, fill='#fff'):
        d = ' '.join(f'{"M" if i == 0 else "L"}{px:.2f},{py:.2f}' for i, (px, py) in enumerate(pts)) + ' Z'
        self.add(f'<path d="{d}" fill="{fill}" stroke="#000" stroke-width="{sw}"/>')
        self.v.poly(pts, closed=True, sw=sw, fill=fill)

    def circle(self, cx, cy, r, sw=0.7):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff" stroke="#000" stroke-width="{sw}"/>')
        self.v.circle(cx, cy, r, sw)

    def image(self, path, x, y, w, h):
        self.v.image(path, x, y, w, h)
        data = base64.b64encode(open(path, 'rb').read()).decode()
        self.add(f'<image x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{data}"/>')

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.W}mm" height="{self.H}mm" viewBox="0 0 {self.W} {self.H}" font-family="{FONT}">'
               f'<rect width="{self.W}" height="{self.H}" fill="#fff"/>' + ''.join(self.o) + '</svg>')
        open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8').write(svg)
        self.v.save(os.path.join(OUT, name + '.vsdx'), name)
        print(name)


# ------------------------------------------------------------------ рамка, линейка и штамп из образцов пользователя
PT = 25.4 / 72


def _font(name):
    fam = 'Times New Roman' if 'Times' in name else 'Calibri' if 'Calibri' in name else 'Arial'
    return fam, 'Bold' in name, 'Italic' in name


def template(s, pdf, keep, drop=lambda w: False):
    """Переносит с листа-образца (PDF, экспортированный из Visio пользователя) рамку, линейки и основную надпись
    один в один: те же координаты, толщины линий, шрифты и кегли. keep(x0, top, x1, bottom) отбирает объекты
    (в мм), drop(слово) убирает переменные надписи (наименование, фамилии), которые лист пишет сам."""
    import pdfplumber
    page = pdfplumber.open(pdf).pages[0].dedupe_chars()
    white = lambda c: c is not None and (c == (1,) or c == [1] or c == (1, 1, 1) or c == [1, 1, 1] or c == 1)
    for o in page.rects:
        x0, t, x1, b, lw = o['x0'] * PT, o['top'] * PT, o['x1'] * PT, o['bottom'] * PT, o['linewidth'] * PT
        if lw < 0.5 or not (keep(x0, t, x1, b) or x1 - x0 > 700):
            continue
        s.rect(x0, t, x1 - x0, b - t, sw=lw if o.get('stroke') else 0, fill='#fff' if o.get('fill') else 'none')
    for o in page.lines:
        x0, t, x1, b, lw = o['x0'] * PT, o['top'] * PT, o['x1'] * PT, o['bottom'] * PT, o['linewidth'] * PT
        # вспомогательная линия образца через весь лист (от края до края) не переносится
        if white(o.get('stroking_color')) or t < 2 or b > page.height * PT - 2 or not (keep(x0, t, x1, b) or max(x1 - x0, b - t) > 520):
            continue
        s.line([(px * PT, py * PT) for px, py in o['pts']], w=round(lw, 2))
    # перевёрнутое обозначение в графе 26: каждый знак повёрнут на 180° на своём месте
    for c in page.chars:
        x0, t, x1, b = c['x0'] * PT, c['top'] * PT, c['x1'] * PT, c['bottom'] * PT
        if c['matrix'][0] < 0 and keep(x0, t, x1, b):
            fam, bold, it = _font(c['fontname'])
            s.text((x0 + x1) / 2, (t + b) / 2, c['text'], size=round(c['size'] * PT, 2), anchor='middle', bold=bold, italic=it, rotate=180, font=fam)
    words = page.extract_words(x_tolerance=0.8, extra_attrs=['fontname', 'size', 'upright'])
    for w in words:
        x0, t, x1, b = w['x0'] * PT, w['top'] * PT, w['x1'] * PT, w['bottom'] * PT
        if not keep(x0, t, x1, b) or t < 20 or drop(dict(w, x0=x0, top=t)) or ('Times' in w['fontname'] and t > 500):
            continue
        fam, bold, it = _font(w['fontname'])
        s.text(x0, (t + b) / 2, w['text'], size=round(w['size'] * PT, 2), bold=bold, italic=it, font=fam)


def stamp_text(s, x, top, t, size, font='Arial', bold=False, italic=False, anchor='start'):
    """Надпись в основной надписи: top – верх строки, как у образца (центр строки на top + 0,55 кегля)."""
    s.text(x, top + size * 0.55, t, size=size, bold=bold, italic=italic, font=font, anchor=anchor)


# ------------------------------------------------------------------ чертёж 1: IDEF0, декомпозиция A0
REF_IDEF = os.path.join(KURS, 'src', 'ref-idef0.pdf')       # образец пользователя (экспорт из Visio)
REF_ALG = os.path.join(KURS, 'src', 'ref-algoritm.pdf')


def idef0():
    s = Sheet(840, 597)
    s.arrow = (4.2, 2.1)
    # рамка 20..836 x 8..592, графа 26, линейки 01–13 и A–L, основная надпись 651..836 x 537..592 – из образца
    keep = lambda x0, t, x1, b: b <= 52 or x1 <= 34 or (x0 >= 645 and t >= 530)
    var = lambda w: (715 <= w['x0'] <= 790 and 555 <= w['top'] <= 571) or (665 <= w['x0'] <= 700 and 560 <= w['top'] <= 571)
    template(s, REF_IDEF, keep, var)
    for i, t in enumerate(['IDEF0-модель процесса', '«Предоставить', 'потребительский кредит', 'физическому лицу»']):
        stamp_text(s, 747.5, 555.2 + i * 4.7, t, 4.23, italic=True, anchor='middle')
    stamp_text(s, 746.9, 542.4, 'ГУИР.477901.076 ПД', 6.35, font='Times New Roman', italic=True)
    stamp_text(s, 669.4, 563.1, 'Мешков В.Д.', 3.17, font='Calibri', bold=True, italic=True)
    stamp_text(s, 669.4, 568.1, 'Саблина А.И.', 3.17, font='Calibri', bold=True, italic=True)

    GX, GY, CW, RH = 40, 56.7, 60, 40              # сетка образца: блок занимает ровно одну клетку
    # блоки и стрелки повторяют рисунок 1.5 записки (декомпозиция A0)
    names = ['Принять\nи проверить\nкредитную\nзаявку', 'Оценить\nкредито-\nспособность\nзаёмщика', 'Принять\nрешение\nо предоставлении\nкредита',
             'Оформить\nкредитный\nдоговор', 'Выдать\nкредит']
    B = []
    for i, n in enumerate(names):
        c, r = 2 + 2 * i, 3 + 2 * i                 # клетки C02, E04, G06, I08, K10
        x, y = GX + (c - 1) * CW, GY + (r - 1) * RH
        B.append((x, y))
        s.rect(x, y, CW, RH, sw=1.1)
        s.text(x + CW / 2, y + RH / 2, n, size=6.35, anchor='middle-v', lh=1.22)
        s.rect(x + 5, y - 4.7, 15, 9.5, sw=0, fill='#fff')
        s.text(x + 7.7, y, f'{"ABCDEFGHIJKL"[r - 1]}{c:02d}', size=5.29, bold=True)
    L = lambda i: B[i][0]; R = lambda i: B[i][0] + CW
    T = lambda i: B[i][1]; D = lambda i: B[i][1] + RH
    lab = lambda x, y, t, a='start', size=7.07: s.text(x, y, t, size=size, anchor=a, lh=1.19)

    def squiggle(x, y, dx=7, dy=9):
        s.line([(x, y), (x + dx * 0.55, y - dy * 0.45), (x + dx * 0.45, y - dy * 0.55), (x + dx, y - dy)], w=0.76)

    top = GY + 19                                   # начало стрелок управления под подписями
    # управление: законодательство -> A1, A2, A4; правила скоринга -> A2; кредитная политика -> A3;
    # условия кредитных продуктов -> A1, A4, A5
    lab(135, GY + 5, 'Законодательство и нормативные\nакты НБ РБ', 'middle', 6.35)
    s.line([(135, top), (135, T(0))], arrow=True)
    s.line([(135, top + 12), (486, top + 12), (486, T(3))], arrow=True)
    s.line([(247, top + 12), (247, T(1))], arrow=True)
    lab(265, GY + 5, 'Методические\nправила скоринга', 'middle')
    s.line([(265, top), (265, T(1))], arrow=True)
    lab(390, GY + 5, 'Кредитная политика\nбанка', 'middle')
    s.line([(390, top), (390, T(2))], arrow=True)
    lab(508, GY + 5, 'Условия кредитных\nпродуктов', 'middle')
    s.line([(508, top), (508, T(3))], arrow=True)
    s.line([(150, top + 28), (610, top + 28), (610, T(4))], arrow=True)
    s.line([(150, top + 28), (150, T(0))], arrow=True)
    # входы слева
    for y, t in [(T(0) + 10, 'Кредитная заявка'), (T(0) + 30, 'Анкетные данные\nзаёмщика')]:
        s.line([(GX, y), (L(0), y)], arrow=True); lab(GX + 2, y - (4 if '\n' not in t else 11.5), t, size=6.35)
    y = T(1) + 30
    s.line([(GX, y), (L(1), y)], arrow=True); lab(GX + 2, y - 11.5, 'Сведения о счетах\nи обязательствах клиента', size=6.35)
    # стрелки между блоками
    links = [('Проверенная\nзаявка', 20, 20), ('Результат оценки\nкредитоспособности', 20, 20), ('Одобренные\nусловия\nкредита', 20, 20), ('Открытый\nссудный\nсчёт', 32, 20)]
    for i, (t, a, b) in enumerate(links):
        y1, y2, xm = T(i) + a, T(i + 1) + b, R(i) + 30
        s.line([(R(i), y1), (xm, y1), (xm, y2), (L(i + 1), y2)], arrow=True)
        squiggle(xm + 1.5, y1 + 22, 8, 10)
        lab(xm + 7, y1 + 7, t)
    # выходы наружу: из A4 договор и график, из A5 средства и сведения для регистра
    for k, t in enumerate(['Подписанный кредитный договор', 'График платежей']):
        yy = T(3) + 8 + k * 13
        s.line([(R(3), yy), (820, yy)], arrow=True); lab(818, yy - 4.5, t, 'end')
    for k, t in enumerate(['Зачисленные кредитные средства', 'Сведения для кредитного регистра']):
        yy = T(4) + 12 + k * 16
        s.line([(R(4), yy), (820, yy)], arrow=True); lab(818, yy - 4.5, t, 'end')
    # механизмы снизу: программное средство и кредитный специалист – ко всем блокам, кредитный регистр – к A2
    ylab, y1, y2 = 559, 507, 522
    xs_ps, xs_sp = [125, 245, 365, 485, 605], [145, 260, 385, 505, 625]
    lab(125, ylab, 'Программное\nсредство ДБО', 'middle')
    s.line([(125, ylab - 5), (125, D(0))], arrow=True)
    s.line([(125, y1), (605, y1)])
    for i in range(1, 5):
        s.line([(xs_ps[i], y1), (xs_ps[i], D(i))], arrow=True)
    lab(560, ylab, 'Кредитный\nспециалист', 'middle')
    s.line([(560, ylab - 5), (560, y2)])
    s.line([(145, y2), (625, y2)])
    for i in range(5):
        s.line([(xs_sp[i], y2), (xs_sp[i], D(i))], arrow=True)
    lab(275, ylab, 'Кредитный регистр\nНБ РБ', 'middle')
    s.line([(275, ylab - 5), (275, D(1))], arrow=True)
    s.save('chertezh-1-idef0')


# ------------------------------------------------------------------ чертёж 2: схема алгоритма на сетке
CW, RH, GX, GY = 45, 30, 45, 44       # сетка образца: колонки 01–17 по 45 мм, строки A–R по 30 мм
cx = lambda c: GX + (c - 0.5) * CW
cy = lambda r: GY + (r - 0.5) * RH
LW, BW = 0.76, 0.79                   # линии связи и контуры блоков, как в образце


def algorithm():
    s = Sheet(841, 594)
    s.arrow = (3.2, 1.1)
    keep = lambda x0, t, x1, b: b <= 45 or x1 <= 46 or (x0 >= 649 and t >= 533)
    var = lambda w: (712 <= w['x0'] <= 790 and 550 <= w['top'] <= 572) or (665 <= w['x0'] <= 700 and 558 <= w['top'] <= 567)
    template(s, REF_ALG, keep, var)
    name = [('Дистанционное банковское', True), ('обслуживание и программная', True), ('поддержка действий пользователя', True),
            ('по управлению персональными', True), ('счетами.', True), ('Алгоритм перевода клиенту банка', False)]
    for i, (t, it) in enumerate(name):
        stamp_text(s, 748, 550.6 + i * 3.8, t, 3.51, italic=it, anchor='middle')
    stamp_text(s, 745.9, 538.5, 'ГУИР.477901.076 ПД', 6.35, font='Times New Roman', italic=True)
    stamp_text(s, 668, 560, 'Мешков В.Д.', 3.17, bold=True, italic=True)
    stamp_text(s, 668, 565, 'Саблина А.И.', 3.17, bold=True, italic=True)

    N = {}

    def node(key, kind, c, r, text=''):
        x0, y0 = GX + (c - 1) * CW, GY + (r - 1) * RH      # клетка
        w, h = (CW, 17.5) if kind == 'term' else (CW, RH)
        if kind == 'term':
            y0 = y0 + RH - h if r == 1 else y0             # «Начало» прижато к низу клетки, «Конец» – к верху
        if kind == 'con':
            R_ = 7.8; xc = x0 + CW / 2; yc = y0 + RH - R_ - 0.4 if r == 1 else y0 + RH / 2
            N[key] = (xc, yc, 2 * R_, 2 * R_, kind)
            s.circle(xc, yc, R_, sw=LW)
            s.text(xc, yc, text, size=4.95, anchor='middle')
            return
        xc, yc = x0 + w / 2, y0 + h / 2
        N[key] = (xc, yc, w, h, kind)
        if kind == 'term':
            s.rect(x0, y0, w, h, rx=h / 2, sw=BW)
        elif kind == 'proc':
            s.rect(x0, y0, w, h, sw=BW)
        elif kind == 'pred':
            s.rect(x0, y0, w, h, sw=BW)
            s.line([(x0 + 4, y0), (x0 + 4, y0 + h)], w=BW); s.line([(x0 + w - 4, y0), (x0 + w - 4, y0 + h)], w=BW)
        elif kind == 'io':
            k = 5
            s.poly([(x0 + k, y0), (x0 + w, y0), (x0 + w - k, y0 + h), (x0, y0 + h)], sw=BW)
        elif kind == 'dec':
            s.poly([(xc, y0), (x0 + w, yc), (xc, y0 + h), (x0, yc)], sw=BW)
        s.text(xc, yc, text, size=4.95, anchor='middle-v', lh=1.0)
        code = f'{"ABCDEFGHIJKLMNOPQR"[r - 1]}{c:02d}'
        if kind == 'dec':                                   # у ромба код в углу клетки
            s.rect(x0, y0, 12.2, 4.5, sw=0, fill='#fff'); s.text(x0 + 2.3, y0 + 2.25, code, size=4.23, bold=True)
        else:                                               # у остальных – на верхней границе блока
            s.rect(x0 - 0.5, y0 - 2.3, 12.2, 4.5, sw=0, fill='#fff'); s.text(x0 + 1.7, y0, code, size=4.23, bold=True)

    bottom = lambda k: (N[k][0], N[k][1] + N[k][3] / 2)
    topp = lambda k: (N[k][0], N[k][1] - N[k][3] / 2)

    def down(a, b):
        s.line([bottom(a), topp(b)], w=LW)

    def branch(d, yes, no):
        x, y, w, h, _ = N[d]
        s.line([(x - w / 2, y), (N[yes][0], y), topp(yes)], w=LW)
        s.line([(x + w / 2, y), (N[no][0], y), topp(no)], w=LW)
        s.text(x - w / 2 - 4, y - 2.6, 'Да', size=4.23, anchor='end')
        s.text(x + w / 2 + 4, y - 2.6, 'Нет', size=4.23)

    # блоки, тексты и соединители повторяют рисунок блок-схемы перевода в разделе 2.4 записки
    # часть 1: создание перевода (createTransfer)
    node('start', 'term', 4, 1, 'Начало')
    node('in', 'io', 4, 3, 'Получить\nданные\nформы:\nсчета, сумма')
    node('d1', 'dec', 4, 5, 'Счета, сумма\nкорректны?')
    node('conv', 'proc', 3, 7, 'Пересчитать\nсумму в BYN\nпо курсу НБ')
    node('e1', 'io', 5, 7, 'Вывести\nошибку:\nневерные\nданные\nперевода')
    node('x6', 'con', 5, 9, '6')
    node('d2', 'dec', 3, 9, 'Лимит\nпревышен?')
    node('e2', 'io', 2, 11, 'Вывести\nошибку:\nпревышен\nсуточный\nлимит')
    node('x5', 'con', 2, 13, '5')
    node('risk', 'proc', 4, 11, 'Вычислить\nбаллы риска\nантифрода')
    node('d3', 'dec', 4, 13, 'Баллы ниже\nпорога?')
    node('A1', 'con', 3, 15, 'А')
    node('hold', 'proc', 5, 15, 'Зарезервировать\nсумму, открыть\nслучай антифрода')
    node('heldmsg', 'io', 5, 17, 'Вывести:\nперевод\nна проверке')
    node('x4', 'con', 5, 18, '4')
    down('start', 'in'); down('in', 'd1')
    branch('d1', 'conv', 'e1'); down('conv', 'd2'); down('e1', 'x6')
    branch('d2', 'e2', 'risk'); down('e2', 'x5'); down('risk', 'd3')
    branch('d3', 'A1', 'hold'); down('hold', 'heldmsg'); down('heldmsg', 'x4')

    # часть 2: подтверждение и проведение (confirmTransfer, executeIntentIn)
    node('A2', 'con', 9, 1, 'А')
    node('code', 'pred', 9, 3, 'Запросить\nкод\nподтверждения')
    node('d4', 'dec', 9, 5, 'Код\nверен?')
    node('post', 'pred', 8, 7, 'Провести\nперевод\nв транзакции')
    node('e3', 'io', 10, 7, 'Вывести\nошибку:\nневерный код')
    node('x3', 'con', 10, 9, '3')
    node('d5', 'dec', 8, 9, 'Проводка\nвыполнена?')
    node('done', 'proc', 7, 11, 'Отметить\nперевод\nпроведённым')
    node('e4', 'io', 9, 11, 'Вывести\nошибку:\nнедостаточно\nсредств')
    node('x2', 'con', 9, 13, '2')
    node('ok', 'io', 7, 13, 'Вывести:\nперевод\nвыполнен')
    node('x1', 'con', 7, 15, '1')
    down('A2', 'code'); down('code', 'd4')
    branch('d4', 'post', 'e3'); down('e3', 'x3'); down('post', 'd5')
    branch('d5', 'done', 'e4'); down('e4', 'x2'); down('done', 'ok'); down('ok', 'x1')

    # часть 3: закрытие ветвей лесенкой, как в записке: 1 и 2 сливаются, затем по очереди 3, 4, 5, 6, и конец
    for i in range(6):
        node(f'y{i + 1}', 'con', 12 + i, 1, str(i + 1))
    node('end', 'term', 16, 7, 'Конец')
    lvl = [cy(2), cy(3), cy(4), cy(5), cy(6)]          # уровни слияния в строках B–F
    drops = [GX + 11.5 * CW + CW / 2, GX + 13 * CW, GX + 14 * CW, GX + 15 * CW, cx(16)]
    s.line([bottom('y1'), (N['y1'][0], lvl[0]), (N['y2'][0], lvl[0]), bottom('y2')], w=LW)
    for k in range(1, 5):
        yk = N[f'y{k + 2}']
        s.line([(drops[k - 1], lvl[k - 1]), (drops[k - 1], lvl[k]), (yk[0], lvl[k])], w=LW)
        s.line([bottom(f'y{k + 2}'), (yk[0], lvl[k])], w=LW)
    s.line([(drops[4], lvl[4]), topp('end')], w=LW, arrow=True)
    s.save('chertezh-2-algoritm')


# ------------------------------------------------------------------ плакаты 5.3 (по образцам пользователя)
# Размеры и шрифты сняты с плакатов прошлого года (экспорт Visio): заголовок Calibri полужирный 21,87 мм
# по центру x = 429,8, бордовая линия на y = 34, рамка с тенью, подписи Arial, синие рамки рисунков.
DARK_RED, FRAME_RED, BLUE = '#770000', '#923932', '#3465A4'


def poster_base(s, title, frame_right):
    s.add(f'<line x1="0" y1="34" x2="834.6" y2="34" stroke="{DARK_RED}" stroke-width="0.3"/>')
    s.v.poly([(0, 34), (834.6, 34)], sw=0.3, stroke=DARK_RED)
    s.rect(15.5, 44.5, frame_right - 15, 525.8, sw=0, fill='#000')            # тень рамки
    s.rect(15, 44, frame_right - 15, 525.8, sw=0.3, fill='#fff', stroke=FRAME_RED)
    stamp_text(s, 429.8, 15.4, title, 21.87, font='Calibri', bold=True, anchor='middle')


def framed_image(s, path, box, crop=None):
    """Рисунок в синей рамке образца: картинка вписывается с сохранением пропорций (crop – доля по высоте/ширине)."""
    x0, y0, x1, y1 = box
    im = Image.open(path).convert('RGB')
    if crop:  # снимок экрана обрезается сверху до crop пикселей (до конца последнего целого блока)
        im = im.crop((0, 0, im.size[0], min(crop, im.size[1])))
        import tempfile; path = os.path.join(tempfile.gettempdir(), 'crop-' + os.path.basename(path)); im.save(path)
    iw, ih = im.size
    k = min((x1 - x0 - 1) / iw, (y1 - y0 - 1) / ih)
    w, h = iw * k, ih * k
    x, y = x0 + (x1 - x0 - w) / 2, y0 + (y1 - y0 - h) / 2
    s.image(path, x, y, w, h)
    s.rect(x, y, w, h, sw=0.3, fill='none', stroke=BLUE)          # рамка по краю рисунка, как в образце


def poster4(name, title, items, start):
    """Плакат с четырьмя рисунками: позиции рамок, подзаголовков и подписей – как в образце."""
    s = Sheet(841, 594)
    poster_base(s, title, 837.2)
    for i, (sub, path, box, sub_xy, cap_xy, *crop) in enumerate(items):
        framed_image(s, path, box, crop[0] if crop else None)
        stamp_text(s, sub_xy[0], sub_xy[1], sub, 14.11, anchor='middle')
        stamp_text(s, cap_xy[0], cap_xy[1], f'Рисунок {start + i}', 14.11, anchor='middle')
    s.save(name)


def posters():
    k = lambda f: os.path.join(KURS, f)
    # плакат 1: одна диаграмма классов в оформлении прошлой записки
    s = Sheet(841, 594)
    poster_base(s, 'UML диаграмма классов', 829.7)
    stamp_text(s, 422.2, 89.7, 'Диаграмма классов', 16.93, anchor='middle')
    class_diagram(s, (30, 114, 810, 535.5))
    s.rect(30, 114, 780, 421.5, sw=0.3, fill='none', stroke=BLUE)
    stamp_text(s, 419.95, 540.9, 'Рисунок 1', 16.93, anchor='middle')
    s.save('plakat-1-klassy')
    poster4('plakat-2-modeli', 'Модели представления программного средства', [
        ('Диаграмма состояний', k('view-st-loan.png'), (40, 74, 380, 244), (207.95, 56.9), (208.45, 251.7)),
        ('Диаграмма развертывания системы', k('view-deployment.png'), (425, 74, 800, 244), (619.95, 56.7), (615.6, 251.8)),
        ('Схема базы данных', k('er-diagram.png'), (40, 288.8, 380, 519), (204.95, 271.7), (204.95, 529.3)),
        ('Диаграмма последовательности', k('view-seq-loan.png'), (430, 294, 800, 519), (629.95, 271.6), (618.45, 529.3))], 2)
    poster4('plakat-3-skrinshoty', 'Скриншоты рабочих окон программного средства', [
        ('Главная страница банка', k('fig-guide-g-home.png'), (35.7, 73.2, 384.3, 279.9), (210, 59.3), (209.95, 291.7), 1385),
        ('Кабинет клиента', k('fig-guide-c-cabinet.png'), (450, 77, 799.5, 276.1), (629.2, 59.3), (640.6, 291.8), 1650),
        ('Каталог оплаты услуг', k('fig-guide-c-pay-catalog.png'), (72.9, 326, 367.1, 532), (212, 311.7), (209.95, 544.3)),
        ('Оформление кредита', k('fig-guide-c-loan-new.png'), (480, 326, 787.1, 532), (629.95, 311.8), (630, 546.8), 1717)], 6)


# ------------------------------------------------------------------ диаграмма классов (стиль прошлой записки, draw.io)
from PIL import ImageFont
_F = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 160)
_FB = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 160)
FS, ROW, HEAD = 16, 20.3, 33          # кегль, шаг строки и высота заголовка в пикселях образца


def _tw(t, bold=False):
    return (_FB if bold else _F).getlength(t) / 10


CLASSES = {
    'Role': (['-code: string', '-name: string', '-permissions: string[]'], ['+can(permission: string): boolean', '+getName(): string']),
    'User': (['-id: number', '-login: string', '-passwordHash: string', '-role: Role', '-email: string', '-totpSecret: string',
              '-failedLogins: number', '-blocked: boolean'],
             ['+login(password: string): boolean', '+enableTwoFactor(): void', '+block(): void', '+hasPermission(p: string): boolean']),
    'AuditEntry': (['-id: number', '-user: User', '-action: string', '-details: object', '-createdAt: Date'],
                   ['+getAction(): string', '+getDetails(): object']),
    'Client': (['-id: number', '-user: User', '-lastName: string', '-firstName: string', '-birthDate: Date', '-passport: string',
                '-monthlyIncome: number', '-kycStatus: KycStatus'], ['+verify(): void', '+reject(reason: string): void', '+getFullName(): string']),
    'LoanApplication': (['-id: number', '-client: Client', '-amount: number', '-termMonths: number', '-pd: number', '-status: string'],
                        ['+score(): number', '+approve(): void', '+reject(comment: string): void']),
    'Loan': (['-id: number', '-application: LoanApplication', '-account: Account', '-principalBalance: number', '-ratePercent: number'],
             ['+buildSchedule(): Installment[]', '+repay(amount: number): void', '+chargePenalty(): number']),
    'Card': (['-id: number', '-account: Account', '-last4: string', '-dailyLimit: number', '-status: string'],
             ['+block(): void', '+unblock(): void', '+setLimits(daily: number): void', '+purchase(amount: number): void']),
    'Account': (['-id: number', '-client: Client', '-iban: string', '-currency: string', '-balance: number', '-status: AccountStatus'],
                ['+open(currency: string): Account', '+close(): void', '+getBalance(): number']),
    'Deposit': (['-id: number', '-account: Account', '-amount: number', '-ratePercent: number', '-maturityDate: Date'],
                ['+accrueInterest(): number', '+closeEarly(): number']),
    'Payment': (['-id: number', '-account: Account', '-provider: string', '-requisite: string', '-amount: number', '-fee: number'],
                ['+pay(): void', '+getReceipt(): Receipt']),
    'TransferIntent': (['-id: string', '-fromAccount: Account', '-toIban: string', '-amount: number', '-fee: number', '-riskScore: number'],
                       ['+confirm(code: string): void', '+cancel(): void']),
    'Document': (['-id: number', '-type: string', '-idempotencyKey: string', '-createdAt: Date'], ['+post(): void', '+reverse(): Document']),
    'Posting': (['-id: number', '-document: Document', '-debitAccount: Account', '-creditAccount: Account', '-amount: number'],
                ['+getAmount(): number']),
}
ENUMS = {'KycStatus': ['PENDING', 'VERIFIED', 'REJECTED'], 'AccountStatus': ['ACTIVE', 'FROZEN', 'CLOSED']}
POS = {'Role': (20, 20), 'User': (20, 270), 'AuditEntry': (20, 780),
       'KycStatus': (390, 20), 'Client': (390, 180), 'LoanApplication': (390, 560), 'Loan': (390, 885),
       'Card': (750, 20), 'Account': (750, 340), 'Deposit': (750, 730), 'AccountStatus': (1040, 120),
       'Payment': (1200, 20), 'TransferIntent': (1200, 370), 'Posting': (1200, 780), 'Document': (1530, 480)}


def class_diagram(s, box):
    X0, Y0, X1, Y1 = box
    B = {}
    for n, (f, m) in CLASSES.items():
        w = max(_tw(n, True), *[_tw(t) for t in f + m]) + 16
        h = HEAD + len(f) * ROW + 8 + len(m) * ROW + 8
        B[n] = (*POS[n], w, h, f, m)
    for n, items in ENUMS.items():
        w = max(_tw('«enumeration»'), _tw(n, True), *[_tw(t) for t in items]) + 16
        B[n] = (*POS[n], w, 42 + len(items) * ROW + 8, None, items)
    cw = max(b[0] + b[2] for b in B.values()) + 20
    ch = max(b[1] + b[3] for b in B.values()) + 20
    k = min((X1 - X0 - 4) / cw, (Y1 - Y0 - 4) / ch)
    ox, oy = X0 + (X1 - X0 - cw * k) / 2, Y0 + (Y1 - Y0 - ch * k) / 2
    P = lambda x, y: (ox + x * k, oy + y * k)
    fs = FS * k
    lw = 0.35

    def text(x, y, t, bold=False, anchor='start'):
        s.text(*P(x, y), t, size=round(fs, 2), bold=bold, anchor=anchor)

    # связи (рисуются первыми, под классами)
    def L(n, side, t=0.5):
        x, y, w, h = B[n][:4]
        return {'l': (x, y + h * t), 'r': (x + w, y + h * t), 't': (x + w * t, y), 'b': (x + w * t, y + h)}[side]

    def edge(pts, kind='assoc', role=None, rpos=None, m1=None, m2=None, m1pos=None, m2pos=None):
        Q = [P(*p) for p in pts]
        if kind == 'dep':
            d = ' '.join(f'{"M" if i == 0 else "L"}{x:.2f},{y:.2f}' for i, (x, y) in enumerate(Q))
            s.add(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{lw}" stroke-dasharray="2.4 1.6"/>')
            for (ax, ay), (bx, by) in zip(Q, Q[1:]):         # пунктир в Visio – отрезками
                L_ = math.hypot(bx - ax, by - ay); n_ = max(1, int(L_ / 4))
                for j in range(n_):
                    t0, t1 = j / n_, (j + 0.6) / n_
                    s.v.poly([(ax + (bx - ax) * t0, ay + (by - ay) * t0), (ax + (bx - ax) * t1, ay + (by - ay) * t1)], sw=lw)
        else:
            d = ' '.join(f'{"M" if i == 0 else "L"}{x:.2f},{y:.2f}' for i, (x, y) in enumerate(Q))
            s.add(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{lw}"/>')
            s.v.poly(Q, sw=lw)
        if kind == 'comp':                                    # закрашенный ромб у целого (первая точка)
            (ax, ay), (bx, by) = Q[0], Q[1]
            a = math.atan2(by - ay, bx - ax); Ld, Wd = 20 * k, 6 * k
            pts_ = [(ax, ay), (ax + Ld / 2 * math.cos(a) - Wd * math.sin(a), ay + Ld / 2 * math.sin(a) + Wd * math.cos(a)),
                    (ax + Ld * math.cos(a), ay + Ld * math.sin(a)), (ax + Ld / 2 * math.cos(a) + Wd * math.sin(a), ay + Ld / 2 * math.sin(a) - Wd * math.cos(a))]
            s.poly(pts_, sw=lw, fill='#000')
        else:                                                 # открытая стрелка у конца
            (ax, ay), (bx, by) = Q[-2], Q[-1]
            a = math.atan2(by - ay, bx - ax); La, Wa = 10 * k, 5 * k
            l1 = (bx - La * math.cos(a) + Wa * math.sin(a), by - La * math.sin(a) - Wa * math.cos(a))
            l2 = (bx - La * math.cos(a) - Wa * math.sin(a), by - La * math.sin(a) + Wa * math.cos(a))
            s.add(f'<path d="M{l1[0]:.2f},{l1[1]:.2f} L{bx:.2f},{by:.2f} L{l2[0]:.2f},{l2[1]:.2f}" fill="none" stroke="#000" stroke-width="{lw}"/>')
            s.v.poly([l1, (bx, by), l2], sw=lw)
        if role:
            text(*rpos, role)
        if m1:
            text(*m1pos, m1)
        if m2:
            text(*m2pos, m2)

    for e in RELATIONS(L, B):
        edge(**e)
    # классы с тенью, как в образце
    for n, (x, y, w, h, f, m) in B.items():
        s.rect(*P(x + 4, y + 4), w * k, h * k, sw=0, fill='#C8C8C8')
        s.rect(*P(x, y), w * k, h * k, sw=lw)
        if f is None:                                         # перечисление
            text(x + w / 2, y + 14, '«enumeration»', anchor='middle')
            text(x + w / 2, y + 32, n, bold=True, anchor='middle')
            s.line([P(x, y + 42), P(x + w, y + 42)], w=lw)
            for i, t in enumerate(m):
                text(x + 7, y + 42 + 14 + i * ROW, t)
            continue
        text(x + w / 2, y + HEAD / 2 + 1, n, bold=True, anchor='middle')
        s.line([P(x, y + HEAD), P(x + w, y + HEAD)], w=lw)
        for i, t in enumerate(f):
            text(x + 7, y + HEAD + 14 + i * ROW, t)
        ym = y + HEAD + len(f) * ROW + 8
        s.line([P(x, ym), P(x + w, ym)], w=lw)
        for i, t in enumerate(m):
            text(x + 7, ym + 14 + i * ROW, t)


def RELATIONS(L, B):
    """Связи диаграммы классов: точки в пикселях холста, подписи ролей «+…» и кратности, как в образце."""
    r = []

    def add(pts, kind='assoc', role=None, rpos=None, m1=None, m1pos=None, m2=None, m2pos=None):
        r.append(dict(pts=pts, kind=kind, role=role, rpos=rpos, m1=m1, m1pos=m1pos, m2=m2, m2pos=m2pos))

    def vert(a, b, role, m1=None, m2=None, kind='assoc', dx=0):
        """Вертикальная связь от a (снизу или сверху) к b по середине общего участка по x."""
        xa, ya, wa, ha = B[a][:4]; xb, yb, wb, hb = B[b][:4]
        x = (max(xa, xb) + min(xa + wa, xb + wb)) / 2 + dx
        p, q = ((x, ya), (x, yb + hb)) if ya > yb else ((x, ya + ha), (x, yb))
        down = q[1] > p[1]
        add([p, q], kind, role, (x + 8, (p[1] + q[1]) / 2 + 5), m1, (x + 6, p[1] + (16 if down else -8)), m2, (x + 6, q[1] + (-8 if down else 16)))

    vert('User', 'Role', '+имеет', '*', '1')
    vert('AuditEntry', 'User', '+выполнил', '*', '1')
    vert('Client', 'KycStatus', '+имеет статус', kind='dep')
    vert('LoanApplication', 'Client', '+подаёт', '*', '1')
    vert('Loan', 'LoanApplication', '+по заявке', '0..1', '1')
    vert('Card', 'Account', '+привязана к', '*', '1')
    vert('Deposit', 'Account', '+размещён на', '*', '1')

    def elbow(a, sa, ta, b, sb, tb, xm, role, rpos, m1=None, m2=None, kind='assoc'):
        p, q = L(a, sa, ta), L(b, sb, tb)
        sgn = lambda pt, side: (pt[0] + (6 if side == 'r' else -16), pt[1])
        add([p, (xm, p[1]), (xm, q[1]), q], kind, role, rpos, m1, (sgn(p, sa)[0], p[1] - 6), m2, (sgn(q, sb)[0], q[1] - 6))

    u = L('User', 'r', 0.12); c = L('Client', 'l', 0.3)
    elbow('Client', 'l', 0.3, 'User', 'r', 0.12, (u[0] + c[0]) / 2, '+связан с', (u[0] + 6, u[1] + 20), '1', '1')
    c = L('Client', 'r', 0.35); ac = L('Account', 'l', 0.2)
    elbow('Client', 'r', 0.35, 'Account', 'l', 0.2, (c[0] + ac[0]) / 2 - 12, '+владеет', (c[0] + 8, c[1] + 20), '1', '*')
    lo = L('Loan', 'r', 0.3); ac = L('Account', 'l', 0.85)
    elbow('Loan', 'r', 0.3, 'Account', 'l', 0.85, (lo[0] + ac[0]) / 2 + 12, '+погашается с', (lo[0] + 8, lo[1] + 20), '*', '1')
    py = L('Payment', 'l', 0.55); ac = L('Account', 'r', 0.15)
    elbow('Payment', 'l', 0.55, 'Account', 'r', 0.15, py[0] - 25, '+списание с', (ac[0] + 22, ac[1] - 8), '*', '1')
    ti = L('TransferIntent', 'l', 0.25); ac = L('Account', 'r', 0.5)
    elbow('TransferIntent', 'l', 0.25, 'Account', 'r', 0.5, (ti[0] + ac[0]) / 2, '+со счёта', (ac[0] + 8, ac[1] + 20), '*', '1')
    ps = L('Posting', 'l', 0.3); ac = L('Account', 'r', 0.85)
    elbow('Posting', 'l', 0.3, 'Account', 'r', 0.85, ps[0] - 25, '+проводится по', (ac[0] + 8, ac[1] + 20), '*', '2')
    # Account -> AccountStatus: из верхней грани счёта вправо и вверх к перечислению
    x = L('Account', 't', 0.9)[0]; st = L('AccountStatus', 'b', 0.5)
    add([(x, L('Account', 't')[1]), (x, st[1] + 40), (st[0], st[1] + 40), st], 'dep', '+использует', (st[0] + 8, st[1] + 28))
    # платёж и перевод оформляются документом проводок; документ состоит из проводок
    dc = L('Document', 't', 0.5); py = L('Payment', 'r', 0.5)
    add([py, (dc[0], py[1]), dc], 'dep', '+оформляется', (dc[0] + 8, py[1] + 22))
    ti = L('TransferIntent', 'r', 0.5); d2 = L('Document', 'l', 0.25)
    xm = (ti[0] + d2[0]) / 2
    add([ti, (xm, ti[1]), (xm, d2[1]), d2], 'dep', '+оформляется', (ti[0] + 8, ti[1] - 8))
    db = L('Document', 'b', 0.5); ps = L('Posting', 'r', 0.4)
    add([db, (db[0], ps[1]), ps], 'comp', '+состоит из', (ps[0] + 20, ps[1] - 8), '1', (db[0] + 10, db[1] + 30), '1..*', (ps[0] + 6, ps[1] + 18))
    return r


if __name__ == '__main__':
    idef0()
    algorithm()
    posters()
