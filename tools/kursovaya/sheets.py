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
    names = ['Принять\nи проверить\nкредитную\nзаявку', 'Оценить\nкредито-\nспособность\nзаёмщика', 'Принять\nрешение\nо предоставлении\nкредита',
             'Оформить\nкредитный\nдоговор', 'Выдать\nкредит']
    B = []
    for i, n in enumerate(names):
        c, r = 2 + 2 * i, 2 + 2 * i
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
    # управление
    lab(135, GY + 5, 'Законодательство и нормативные\nакты НБ РБ', 'middle', 6.35)
    s.line([(135, top), (135, T(0))], arrow=True)
    s.line([(135, top + 10), (247, top + 10), (247, T(1))], arrow=True)
    lab(265, GY + 5, 'Методические\nправила скоринга', 'middle')
    s.line([(265, top), (265, T(1))], arrow=True)
    lab(390, GY + 5, 'Кредитная политика\nбанка', 'middle')
    s.line([(390, top), (390, T(2))], arrow=True)
    lab(505, GY + 5, 'Условия кредитных\nпродуктов', 'middle')
    s.line([(505, top), (505, T(3))], arrow=True)
    # входы слева
    for y, t in [(T(0) + 10, 'Кредитная заявка'), (T(0) + 30, 'Анкетные данные\nзаёмщика')]:
        s.line([(GX, y), (L(0), y)], arrow=True); lab(GX + 2, y - (4 if '\n' not in t else 11.5), t, size=6.35)
    y = T(1) + 30
    s.line([(GX, y), (L(1), y)], arrow=True); lab(GX + 2, y - 11.5, 'Сведения о счетах\nи обязательствах клиента', size=6.35)
    # стрелки между блоками
    links = [('Проверенная\nзаявка', 20, 20), ('Результат оценки\nкредитоспособности', 20, 20), ('Одобренные\nусловия кредита', 20, 20), ('Открытый\nссудный счёт', 30, 20)]
    for i, (t, a, b) in enumerate(links):
        y1, y2, xm = T(i) + a, T(i + 1) + b, R(i) + 30
        s.line([(R(i), y1), (xm, y1), (xm, y2), (L(i + 1), y2)], arrow=True)
        squiggle(xm + 1.5, y1 + 22, 8, 10)
        lab(xm + 10, y1 + 7, t)
    # выход «Подписанный кредитный договор»: наружу и управлением в J10
    yo = T(3) + 10
    s.line([(R(3), yo), (820, yo)], arrow=True); lab(818, yo - 4.5, 'Подписанный кредитный договор', 'end')
    s.line([(610, yo), (610, T(4))], arrow=True)
    for k, t in enumerate(['Зачисленные кредитные средства', 'График платежей', 'Сведения для кредитного регистра']):
        yy = T(4) + 10 + k * 10
        s.line([(R(4), yy), (820, yy)], arrow=True); lab(818, yy - 4.5, t, 'end')
    # механизмы снизу: подписи под сеткой, шины в строке L
    ylab, y1, y2 = 559, 507, 522
    lab(130, ylab, 'Программное\nсредство ДБО', 'middle')
    s.line([(130, ylab - 5), (130, D(0))], arrow=True)
    s.line([(130, y1), (610, y1)])
    for x in (250, 370, 490):
        s.line([(x, y1), (x, D([250, 370, 490].index(x) + 1))], arrow=True)
    s.line([(610, y1), (610, D(4))], arrow=True)
    lab(410, ylab, 'Кредитный\nспециалист', 'middle')
    s.line([(410, ylab - 5), (410, y2)])
    s.line([(385, y2), (625, y2)])
    for x, i in [(385, 2), (505, 3), (625, 4)]:
        s.line([(x, y2), (x, D(i))], arrow=True)
    lab(265, ylab, 'Кредитный регистр\nНБ РБ', 'middle')
    s.line([(265, ylab - 5), (265, D(1))], arrow=True)
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

    # часть 1: создание перевода (createTransfer)
    node('start', 'term', 7, 1, 'Начало')
    node('in', 'io', 7, 3, 'Получить\nданные формы:\nсчета, сумма')
    node('d1', 'dec', 7, 5, 'Данные\nкорректны?')
    node('conv', 'proc', 6, 7, 'Пересчитать\nсумму в BYN\nпо курсу НБ')
    node('e1', 'io', 8, 7, 'Вывести\nошибку:\nневерные\nданные')
    node('d2', 'dec', 6, 9, 'Лимит\nсоблюдён?')
    node('risk', 'proc', 5, 11, 'Вычислить\nбаллы риска\nантифрода')
    node('e2', 'io', 7, 11, 'Вывести\nошибку:\nпревышен\nлимит')
    node('d3', 'dec', 5, 13, 'Риск ниже\nпорога?')
    node('hold', 'proc', 6, 15, 'Зарезервировать\nсумму, открыть\nслучай\nантифрода')
    node('heldmsg', 'io', 6, 17, 'Вывести:\nперевод\nна проверке')
    node('A1', 'con', 4, 15, 'А')
    for k, c in [('x6', 8), ('x5', 7), ('x4', 6)]:
        node(k, 'con', c, 18, k[1])
    down('start', 'in'); down('in', 'd1')
    branch('d1', 'conv', 'e1'); down('conv', 'd2')
    branch('d2', 'risk', 'e2'); down('risk', 'd3')
    branch('d3', 'A1', 'hold'); down('hold', 'heldmsg')
    down('e1', 'x6'); down('e2', 'x5'); down('heldmsg', 'x4')

    # часть 2: подтверждение и проведение (confirmTransfer, executeIntentIn)
    node('A2', 'con', 11, 1, 'А')
    node('code', 'pred', 11, 3, 'Запросить\nкод\nподтверждения')
    node('d4', 'dec', 11, 5, 'Код\nверен?')
    node('post', 'pred', 10, 7, 'Провести\nперевод\nв транзакции')
    node('e3', 'io', 12, 7, 'Вывести\nошибку:\nневерный код')
    node('d5', 'dec', 10, 9, 'Проводка\nвыполнена?')
    node('done', 'proc', 9, 11, 'Отметить\nперевод\nпроведённым')
    node('e4', 'io', 11, 11, 'Вывести\nошибку:\nмало средств')
    node('ok', 'io', 9, 13, 'Вывести:\nперевод\nвыполнен')
    for k, c in [('x1', 9), ('x2', 11), ('x3', 12)]:
        node(k, 'con', c, 18, k[1])
    down('A2', 'code'); down('code', 'd4')
    branch('d4', 'post', 'e3'); down('post', 'd5')
    branch('d5', 'done', 'e4'); down('done', 'ok')
    down('ok', 'x1'); down('e4', 'x2'); down('e3', 'x3')

    # часть 3: закрытие ветвей лесенкой в порядке вложенности и конец
    for k, c, r in [('y1', 14, 1), ('y2', 15, 1), ('y3', 16, 1), ('y4', 17, 1), ('y5', 15, 6), ('y6', 15, 8)]:
        node(k, 'con', c, r, k[1])
    node('end', 'term', 14, 11, 'Конец')
    trunk = cx(14)
    s.line([bottom('y1'), topp('end')], w=LW)
    for k, ym in [('y2', cy(2)), ('y3', cy(3) + RH / 2), ('y4', cy(5)), ('y5', cy(7)), ('y6', cy(9))]:
        s.line([bottom(k), (N[k][0], ym), (trunk, ym)], w=LW, arrow=True)
    s.save('chertezh-2-algoritm')


# ------------------------------------------------------------------ плакаты 5.3
RED = '#C00000'


def poster(name, title, figs, cols, start):
    """figs: [(подзаголовок, файл)], раскладка по сетке cols колонок; подписи «Рисунок N» с номера start."""
    s = Sheet()
    s.text(W / 2, 20, title, size=13, anchor='middle', bold=True)
    s.line([(20, 30), (W - 20, 30)], w=0.6)
    s.rect(20, 38, W - 40, H - 48, sw=0.6, fill='none', stroke=RED)
    rows = (len(figs) + cols - 1) // cols
    cw, ch = (W - 60) / cols, (H - 70) / rows
    for i, (sub, path) in enumerate(figs):
        c, r = i % cols, i // cols
        x0, y0 = 30 + c * cw, 46 + r * ch
        s.text(x0 + cw / 2, y0 + 5, sub, size=6, anchor='middle')
        iw, ih = Image.open(path).size
        bw, bh = cw - 16, ch - 30
        k = min(bw / iw, bh / ih)
        w, h = iw * k, ih * k
        x, y = x0 + (cw - w) / 2, y0 + 12 + (bh - h) / 2
        s.image(path, x, y, w, h)
        s.rect(x, y, w, h, sw=0.4, fill='none', stroke='#2F5597')
        s.text(x0 + cw / 2, y + h + 9, f'Рисунок {start + i}', size=6, anchor='middle')
    s.save(name)
    return start + len(figs)


def posters():
    k = lambda f: os.path.join(KURS, f)
    n = poster('plakat-1-klassy', 'UML диаграмма классов',
               [('Диаграмма классов предметной области', k('class-domain.png')), ('Диаграмма классов слоя бизнес-логики', k('class-services.png'))], 2, 1)
    n = poster('plakat-2-modeli', 'Модели представления программного средства',
               [('Диаграмма состояний', k('view-st-loan.png')), ('Диаграмма развёртывания системы', k('view-deployment.png')),
                ('Схема базы данных', k('er-diagram.png')), ('Диаграмма последовательности', k('view-seq-loan.png'))], 2, n)
    poster('plakat-3-skrinshoty', 'Скриншоты рабочих окон программного средства',
           [('Главная страница кабинета клиента', k('fig-ui-cabinet.png')), ('Перевод между счетами', k('fig-ui-transfer.png')),
            ('Рабочее место операциониста', k('fig-ui-workplace.png')), ('Рассмотрение заявки на кредит', k('fig-ui-loan-review.png'))], 2, n)


if __name__ == '__main__':
    idef0()
    algorithm()
    posters()
