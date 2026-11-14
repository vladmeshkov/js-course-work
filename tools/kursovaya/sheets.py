#!/usr/bin/env python3
"""Графическая часть (листы A1, 841x594 мм) по образцам пользователя (файлы Visio прошлого года):
  chertezh-1-idef0      – декомпозиция A0 IDEF0 «Предоставить потребительский кредит физическому лицу», шифр ПД;
  chertezh-2-algoritm   – схема алгоритма перевода клиенту банка на сетке 01–17 x A–R, шифр СА;
  plakat-1-klassy, plakat-2-modeli, plakat-3-skrinshoty – плакаты 5.3.
Пишет SVG (размеры в мм) в docs/kursovaya/chertezhi; PDF и PNG делает sheets2pdf.cjs.
Использование: python3 sheets.py && node sheets2pdf.cjs
"""
import base64, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
KURS = os.path.abspath(os.path.join(HERE, '..', '..', 'docs', 'kursovaya'))
OUT = os.path.join(KURS, 'chertezhi')
W, H = 841, 594
FONT = 'Arial, Liberation Sans, sans-serif'
CODE = 'ГУИР.477901.014'
TOPIC = 'Дистанционное банковское обслуживание и программная поддержка действий пользователя по управлению персональными счетами'


def esc(t):
    return str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


class Sheet:
    def __init__(self):
        self.o = []

    def add(self, s):
        self.o.append(s)

    def line(self, pts, w=0.35, arrow=False, dash=False):
        d = ' '.join(f'{"M" if i == 0 else "L"}{x:.2f},{y:.2f}' for i, (x, y) in enumerate(pts))
        self.add(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{w}"{" stroke-dasharray=\"3 2\"" if dash else ""}/>')
        if arrow:
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            import math
            a = math.atan2(y2 - y1, x2 - x1); L, Wd = 3.2, 1.2
            p1 = (x2 - L * math.cos(a) + Wd * math.sin(a), y2 - L * math.sin(a) - Wd * math.cos(a))
            p2 = (x2 - L * math.cos(a) - Wd * math.sin(a), y2 - L * math.sin(a) + Wd * math.cos(a))
            self.add(f'<path d="M{x2:.2f},{y2:.2f} L{p1[0]:.2f},{p1[1]:.2f} L{p2[0]:.2f},{p2[1]:.2f} Z" fill="#000"/>')

    def rect(self, x, y, w, h, sw=0.35, rx=0, fill='#fff', stroke='#000'):
        self.add(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def text(self, x, y, t, size=3.5, anchor='start', bold=False, italic=False, rotate=None, lh=1.2):
        lines = t.split('\n')
        y0 = y - (len(lines) - 1) * size * lh / 2 if anchor == 'middle-v' else y
        anc = 'middle' if anchor in ('middle', 'middle-v') else anchor
        tr = f' transform="rotate({rotate} {x} {y})"' if rotate else ''
        for i, l in enumerate(lines):
            self.add(f'<text x="{x:.2f}" y="{y0 + i * size * lh:.2f}" font-size="{size}" text-anchor="{anc}" dominant-baseline="middle"'
                     f'{" font-weight=\"bold\"" if bold else ""}{" font-style=\"italic\"" if italic else ""}{tr}>{esc(l)}</text>')

    def image(self, path, x, y, w, h):
        data = base64.b64encode(open(path, 'rb').read()).decode()
        self.add(f'<image x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{data}"/>')

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}" font-family="{FONT}">'
               f'<rect width="{W}" height="{H}" fill="#fff"/>' + ''.join(self.o) + '</svg>')
        open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8').write(svg)
        print(name)


# ------------------------------------------------------------------ рамка и основная надпись (ГОСТ 2.104, форма 1)
def frame(s, code, title):
    s.rect(20, 5, W - 25, H - 10, sw=0.7)
    # графа 26: обозначение документа, повёрнутое на 180°
    s.rect(20, 5, 70, 14, sw=0.7)
    s.text(55, 12, code, size=5, anchor='middle', italic=True, rotate=180)
    X, Y = W - 5 - 185, H - 5 - 55
    s.rect(X, Y, 185, 55, sw=0.7)
    cols = [0, 7, 17, 40, 55, 65]
    for i in range(1, 11):
        s.line([(X, Y + i * 5), (X + 65, Y + i * 5)], w=0.7 if i in (4, 5) else 0.25)
    for c in cols[1:]:
        # граница между «Изм.» и «Лист» только в верхней части: ниже графа фамилии занимает обе колонки
        s.line([(X + c, Y), (X + c, Y + (25 if c == 7 else 55))], w=0.7)
    s.line([(X + 65, Y + 15), (X + 185, Y + 15)], w=0.7)
    s.line([(X + 65, Y + 40), (X + 185, Y + 40)], w=0.7)
    s.line([(X + 135, Y + 15), (X + 135, Y + 55)], w=0.7)
    s.line([(X + 135, Y + 20), (X + 185, Y + 20)], w=0.7)
    s.line([(X + 135, Y + 35), (X + 185, Y + 35)], w=0.7)
    for c in (150, 167):
        s.line([(X + c, Y + 15), (X + c, Y + 35)], w=0.7)
    for c in (140, 145):
        s.line([(X + c, Y + 20), (X + c, Y + 35)], w=0.25)
    s.line([(X + 155, Y + 35), (X + 155, Y + 40)], w=0.7)
    s.text(X + 125, Y + 7.5, code, size=6, anchor='middle', italic=True)
    hdr = ['Изм.', 'Лист', '№ докум.', 'Подп.', 'Дата']
    for (a, b), t in zip(zip(cols, cols[1:]), hdr):
        s.text(X + (a + b) / 2, Y + 22.5, t, size=2.6, anchor='middle', italic=True)
    for i, (role, name) in enumerate([('Разраб.', 'Мешков В.Д.'), ('Пров.', 'Саблина А.И.'), ('Т.контр.', ''), ('', ''), ('Н.контр.', ''), ('Утв.', '')]):
        s.text(X + 1, Y + 27.5 + i * 5, role, size=2.6, italic=True)
        s.text(X + 18, Y + 27.5 + i * 5, name, size=2.6, italic=True)
    s.text(X + 100, Y + 27.5, title['name'], size=3.2, anchor='middle-v', italic=True)
    s.text(X + 142.5, Y + 17.5, 'Лит.', size=2.8, anchor='middle', italic=True)
    s.text(X + 158.5, Y + 17.5, 'Масса', size=2.8, anchor='middle', italic=True)
    s.text(X + 176, Y + 17.5, 'Масштаб', size=2.8, anchor='middle', italic=True)
    s.text(X + 142.5, Y + 27.5, 'Т', size=3.5, anchor='middle')
    s.text(X + 145, Y + 37.5, 'Лист 1', size=2.8, anchor='middle', italic=True)
    s.text(X + 170, Y + 37.5, 'Листов 1', size=2.8, anchor='middle', italic=True)
    s.text(X + 160, Y + 47.5, 'Кафедра ЭИ,\nгруппа 477901', size=3.8, anchor='middle-v', italic=True)


# ------------------------------------------------------------------ чертёж 1: IDEF0, декомпозиция A0
def idef0():
    s = Sheet()
    frame(s, CODE + ' ПД', {'suffix': 'ПД', 'name': 'IDEF0-модель процесса\n«Предоставить потребительский\nкредит физическому лицу»'})
    bw, bh = 120, 56
    B = [(105 + i * 138, 112 + i * 72) for i in range(5)]
    names = ['Принять и проверить\nкредитную заявку', 'Оценить\nкредитоспособность\nзаёмщика', 'Принять решение\nо предоставлении\nкредита',
             'Оформить кредитный\nдоговор', 'Выдать кредит']
    for (x, y), n in zip(B, names):
        s.rect(x, y, bw, bh, sw=0.6)
        s.text(x + bw / 2, y + bh / 2, n, size=4.2, anchor='middle-v')
    top = lambda i: B[i][1]
    bot = lambda i: B[i][1] + bh
    left = lambda i: B[i][0]
    right = lambda i: B[i][0] + bw
    T = 52  # верхний край линий управления
    lab = lambda x, y, t, a='start': s.text(x, y, t, size=4, anchor=a)

    # управление (сверху)
    s.line([(145, T), (145, top(0))], arrow=True); lab(147, T - 9, 'Законодательство и\nнормативные акты НБ РБ')
    s.line([(145, 70), (290, 70), (290, top(1))], arrow=True)
    s.line([(320, T), (320, top(1))], arrow=True); lab(322, T - 9, 'Методические\nправила скоринга')
    s.line([(450, T), (450, top(2))], arrow=True); lab(452, T - 9, 'Кредитная политика\nбанка')
    s.line([(450, 80), (580, 80), (580, top(3))], arrow=True)
    s.line([(615, T), (615, top(3))], arrow=True); lab(617, T - 9, 'Условия кредитных\nпродуктов')
    s.line([(615, 92), (175, 92), (175, top(0))], arrow=True)
    s.line([(615, 92), (750, 92), (750, top(4))], arrow=True)
    # входы (слева)
    s.line([(35, 124), (left(0), 124)], arrow=True); lab(37, 120, 'Кредитная заявка')
    s.line([(35, 152), (left(0), 152)], arrow=True); lab(37, 145, 'Анкетные данные\nзаёмщика')
    s.line([(35, 222), (left(1), 222)], arrow=True); lab(37, 215, 'Сведения о счетах\nи обязательствах клиента')
    # выходы, переходящие на следующий блок
    links = ['Проверенная\nзаявка', 'Результат оценки\nкредитоспособности', 'Одобренные\nусловия кредита', 'Открытый\nссудный счёт']
    for i, t in enumerate(links):
        y1 = top(i) + bh / 2 if i < 3 else top(3) + 46
        xm = right(i) + 9
        y2 = top(i + 1) + bh / 2 - 8
        s.line([(right(i), y1), (xm, y1), (xm, y2), (left(i + 1), y2)], arrow=True)
        lab(xm + 2, y1 - 9, t)
    # выходы наружу
    for y, t in [(top(3) + 12, 'Подписанный кредитный договор'), (top(3) + 26, 'График платежей')]:
        s.line([(right(3), y), (830, y)], arrow=True); lab(828, y - 3, t, 'end')
    for y, t in [(top(4) + 14, 'Зачисленные\nкредитные средства'), (top(4) + 40, 'Сведения для\nкредитного регистра')]:
        s.line([(right(4), y), (830, y)], arrow=True); lab(828, y - 8, t, 'end')
    # механизмы (снизу): шины программного средства и кредитного специалиста
    yb1, yb2, ylab = 478, 490, 512
    s.line([(130, ylab - 6), (130, bot(0))], arrow=True)
    s.line([(130, yb1), (715, yb1)])
    for x, i in [(275, 1), (420, 2), (555, 3), (700, 4)]:
        s.line([(x, yb1), (x, bot(i))], arrow=True)
    lab(130, ylab, 'Программное\nсредство ДБО', 'middle')
    s.line([(640, ylab - 6), (640, yb2)])
    s.line([(640, yb2), (160, yb2), (160, bot(0))], arrow=True)
    for x, i in [(300, 1), (440, 2), (585, 3)]:
        s.line([(x, yb2), (x, bot(i))], arrow=True)
    s.line([(640, yb2), (735, yb2), (735, bot(4))], arrow=True)
    lab(640, ylab, 'Кредитный\nспециалист', 'middle')
    s.line([(340, ylab - 6), (340, bot(1))], arrow=True)
    lab(340, ylab, 'Кредитный регистр\nНБ РБ', 'middle')
    s.save('chertezh-1-idef0')


# ------------------------------------------------------------------ чертёж 2: схема алгоритма на сетке
CW, RH, GX, GY = 45, 30, 45, 40       # ширина колонки, высота строки, начало сетки
cx = lambda c: GX + (c - 0.5) * CW
cy = lambda r: GY + (r - 0.5) * RH
SIZE = {'term': (30, 11), 'proc': (38, 20), 'pred': (38, 20), 'io': (40, 20), 'dec': (40, 24), 'con': (10, 10)}


def algorithm():
    s = Sheet()
    frame(s, CODE + ' СА', {'suffix': 'СА', 'name': 'Дистанционное банковское\nобслуживание и программная\nподдержка действий пользователя\nпо управлению счетами.\nАлгоритм перевода клиенту банка'})
    # координатная сетка: номера колонок сверху, буквы строк слева
    s.line([(GX, GY - 6), (GX + 17 * CW, GY - 6)], w=0.5)
    for c in range(18):
        s.line([(GX + c * CW, GY - 8), (GX + c * CW, GY - 4)], w=0.5)
    for c in range(1, 18):
        s.text(cx(c), GY - 11, f'{c:02d}', size=3.2, anchor='middle', bold=True, italic=True)
    letters = 'ABCDEFGHIJKLMNOPQR'
    s.line([(GX - 6, GY), (GX - 6, GY + 18 * RH)], w=0.5)
    for r in range(19):
        s.line([(GX - 8, GY + r * RH), (GX - 4, GY + r * RH)], w=0.5)
    for r in range(1, 19):
        s.text(GX - 11, cy(r), letters[r - 1], size=3.2, anchor='middle', bold=True, italic=True)

    N = {}

    def node(key, kind, c, r, text=''):
        w, h = SIZE[kind]
        x, y = cx(c), cy(r)
        N[key] = (x, y, w, h, kind)
        if kind == 'term':
            s.rect(x - w / 2, y - h / 2, w, h, rx=h / 2, sw=0.45)
        elif kind == 'proc':
            s.rect(x - w / 2, y - h / 2, w, h, sw=0.45)
        elif kind == 'pred':
            s.rect(x - w / 2, y - h / 2, w, h, sw=0.45)
            s.line([(x - w / 2 + 3, y - h / 2), (x - w / 2 + 3, y + h / 2)], w=0.45)
            s.line([(x + w / 2 - 3, y - h / 2), (x + w / 2 - 3, y + h / 2)], w=0.45)
        elif kind == 'io':
            k = 4
            s.add(f'<path d="M{x - w / 2 + k},{y - h / 2} L{x + w / 2},{y - h / 2} L{x + w / 2 - k},{y + h / 2} L{x - w / 2},{y + h / 2} Z" fill="#fff" stroke="#000" stroke-width="0.45"/>')
        elif kind == 'dec':
            s.add(f'<path d="M{x},{y - h / 2} L{x + w / 2},{y} L{x},{y + h / 2} L{x - w / 2},{y} Z" fill="#fff" stroke="#000" stroke-width="0.45"/>')
        elif kind == 'con':
            s.add(f'<circle cx="{x}" cy="{y}" r="{w / 2}" fill="#fff" stroke="#000" stroke-width="0.45"/>')
        s.text(x, y, text, size=3.0 if kind != 'con' else 3.5, anchor='middle-v')

    bottom = lambda k: (N[k][0], N[k][1] + N[k][3] / 2)
    topp = lambda k: (N[k][0], N[k][1] - N[k][3] / 2)

    def down(a, b):
        s.line([bottom(a), topp(b)])

    def branch(d, yes, no):
        x, y, w, h, _ = N[d]
        s.line([(x - w / 2, y), (N[yes][0], y), topp(yes)])
        s.line([(x + w / 2, y), (N[no][0], y), topp(no)])
        s.text(x - w / 2 - 2, y - 2.5, 'Да', size=3, anchor='end')
        s.text(x + w / 2 + 2, y - 2.5, 'Нет', size=3)

    # часть 1: создание перевода (createTransfer)
    node('start', 'term', 7, 1, 'Начало')
    node('in', 'io', 7, 3, 'Получить данные\nформы: счета,\nсумма')
    node('d1', 'dec', 7, 5, 'Счета и сумма\nкорректны?')
    node('conv', 'proc', 6, 7, 'Пересчитать сумму\nв BYN по курсу\nНБ')
    node('e1', 'io', 8, 7, 'Вывести ошибку:\nневерные данные\nперевода')
    node('d2', 'dec', 6, 9, 'Суточный лимит\nсоблюдён?')
    node('risk', 'proc', 5, 11, 'Вычислить\nбаллы риска\nантифрода')
    node('e2', 'io', 7, 11, 'Вывести ошибку:\nпревышен\nсуточный лимит')
    node('d3', 'dec', 5, 13, 'Баллы ниже\nпорога\nпроверки?')
    node('hold', 'proc', 6, 15, 'Зарезервировать\nсумму, открыть\nслучай антифрода')
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
    node('code', 'pred', 11, 3, 'Запросить код\nподтверждения,\nесли требуется')
    node('d4', 'dec', 11, 5, 'Код верен или\nне требуется?')
    node('post', 'pred', 10, 7, 'Провести\nперевод\nв транзакции')
    node('e3', 'io', 12, 7, 'Вывести ошибку:\nневерный код')
    node('d5', 'dec', 10, 9, 'Проводка\nвыполнена?')
    node('done', 'proc', 9, 11, 'Отметить\nперевод\nпроведённым')
    node('e4', 'io', 11, 11, 'Вывести ошибку:\nнедостаточно\nсредств')
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
    s.line([bottom('y1'), topp('end')])
    for k, ym in [('y2', cy(2)), ('y3', cy(3) + RH / 2), ('y4', cy(5)), ('y5', cy(7)), ('y6', cy(9))]:
        s.line([bottom(k), (N[k][0], ym), (trunk, ym)], arrow=True)
    s.save('chertezh-2-algoritm')


# ------------------------------------------------------------------ плакаты 5.3
RED = '#C00000'


def poster(name, title, figs, cols, start):
    """figs: [(подзаголовок, файл)], раскладка по сетке cols колонок; подписи «Рисунок N» с номера start."""
    s = Sheet()
    s.text(W / 2, 20, title, size=13, anchor='middle', bold=True)
    s.line([(20, 30), (W - 20, 30)], w=0.6)
    s.add(f'<rect x="20" y="38" width="{W - 40}" height="{H - 48}" fill="none" stroke="{RED}" stroke-width="0.6"/>')
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
               [('Диаграмма вариантов использования', k('view-uc.png')), ('Диаграмма последовательности', k('view-seq-loan.png')),
                ('Диаграмма деятельности', k('view-act-loan.png')), ('Диаграмма состояний', k('view-st-loan.png')),
                ('Диаграмма развёртывания', k('view-deployment.png')), ('Схема базы данных', k('er-diagram.png'))], 3, n)
    poster('plakat-3-skrinshoty', 'Скриншоты рабочих окон программного средства',
           [('Главная страница кабинета клиента', k('fig-ui-cabinet.png')), ('Перевод между счетами', k('fig-ui-transfer.png')),
            ('Оформление вклада', k('fig-ui-deposit.png')), ('Выписка по счёту', k('fig-ui-statement.png')),
            ('Рабочее место операциониста', k('fig-ui-workplace.png')), ('Рассмотрение заявки на кредит', k('fig-ui-loan-review.png'))], 3, n)


if __name__ == '__main__':
    idef0()
    algorithm()
    posters()
