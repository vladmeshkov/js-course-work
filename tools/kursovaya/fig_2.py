#!/usr/bin/env python3
"""Рисунки раздела 2 в оформлении образца записки.

Блок-схемы по ГОСТ 19.701-90: терминатор, процесс, предопределённый процесс, данные, решение,
граница цикла (начало: срезаны верхние углы, конец: нижние), соединитель для переноса на соседнюю
колонку. Основное направление потока сверху вниз и слева направо, у решения подписаны выходы
«Да» и «Нет», ветви сходятся линиями слияния.
SVG пишутся в docs/kursovaya/src, PNG: node svg2png.cjs вход.svg выход.png 2.
Использование: python3 fig_2.py
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs', 'kursovaya', 'src')
FONT = "font-family='Arial, Liberation Sans, Helvetica, sans-serif'"
LW = 1.4
BW, BH = 150, 62        # блок 5:2, как в образце
DW, DH = 176, 90        # решение
TW, TH = 128, 44        # терминатор
CR = 18                 # радиус соединителя


def esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class Svg:
    def __init__(self, w, h, size=13):
        self.w, self.h, self.size = w, h, size
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
                      f'<rect x="0" y="0" width="{w}" height="{h}" fill="white"/>',
                      '<defs><marker id="a" markerWidth="9" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="userSpaceOnUse">'
                      '<path d="M0,0 L9,4 L0,8 z" fill="#000"/></marker></defs>']

    def add(self, s):
        self.parts.append(s)

    def text(self, cx, cy, lines, size=None, bold=False, anchor='middle'):
        size = size or self.size
        lh = size + 3
        y0 = cy - (len(lines) - 1) * lh / 2
        w = 'bold' if bold else 'normal'
        for i, line in enumerate(lines):
            self.add(f"<text x='{cx}' y='{y0 + i * lh + size * 0.36:.1f}' text-anchor='{anchor}' font-size='{size}' font-weight='{w}' {FONT}>{esc(line)}</text>")

    def label(self, x, y, t):
        self.add(f"<text x='{x}' y='{y}' font-size='{self.size - 1}' {FONT}>{t}</text>")

    def line(self, pts, arrow=False):
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        m = " marker-end='url(#a)'" if arrow else ''
        self.add(f"<path d='{d}' fill='none' stroke='#000' stroke-width='{LW}'{m}/>")

    # символы ГОСТ 19.701-90 (cx, верх)
    def process(self, cx, y, lines, w=BW, h=BH):
        self.add(f"<rect x='{cx - w / 2}' y='{y}' width='{w}' height='{h}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + h / 2, lines)
        return y + h

    def predefined(self, cx, y, lines, w=BW, h=BH):
        self.process(cx, y, lines, w, h)
        for dx in (-w / 2 + 9, w / 2 - 9):
            self.line([(cx + dx, y), (cx + dx, y + h)])
        return y + h

    def data(self, cx, y, lines, w=BW + 34, h=BH):
        s = 14
        x = cx - w / 2
        self.add(f"<polygon points='{x + s},{y} {x + w},{y} {x + w - s},{y + h} {x},{y + h}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + h / 2, lines)
        return y + h

    def terminator(self, cx, y, lines):
        self.add(f"<rect x='{cx - TW / 2}' y='{y}' width='{TW}' height='{TH}' rx='{TH / 2}' ry='{TH / 2}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + TH / 2, lines)
        return y + TH

    def decision(self, cx, y, lines, w=DW, h=DH):
        cy = y + h / 2
        self.add(f"<polygon points='{cx},{y} {cx + w / 2},{cy} {cx},{y + h} {cx - w / 2},{cy}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, cy, lines)
        return cy

    def loop(self, cx, y, lines, end=False, w=BW + 10, h=BH):
        c = 14
        x = cx - w / 2
        if end:
            pts = f'{x},{y} {x + w},{y} {x + w},{y + h - c} {x + w - c},{y + h} {x + c},{y + h} {x},{y + h - c}'
        else:
            pts = f'{x + c},{y} {x + w - c},{y} {x + w},{y + c} {x + w},{y + h} {x},{y + h} {x},{y + c}'
        self.add(f"<polygon points='{pts}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + h / 2, lines)
        return y + h

    def connector(self, cx, cy, n):
        self.add(f"<circle cx='{cx}' cy='{cy}' r='{CR}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, cy, [str(n)])

    def down(self, cx, y1, y2):
        self.line([(cx, y1), (cx, y2)], arrow=True)
        return y2

    def save(self, name):
        self.parts.append('</svg>')
        path = os.path.join(SRC, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(self.parts))
        print(path)


# ---------------- раскладка блок-схем ----------------
# Узлы: ('term', строки) ('proc', строки) ('pred', строки) ('data', строки) ('loop', строки) ('loopend', строки)
# ('in', n) – входной соединитель; ('exit', n) – выходной соединитель (поток в этой ветви заканчивается);
# ('if', условие, ветвь_да, ветвь_нет) – решение: «Да» влево, «Нет» вправо, обе ветви уходят вниз
# и закрываются горизонтальной линией слияния, от её середины поток продолжается вниз по оси;
# ('par', [ветви]) – несколько входящих потоков рядом, сходятся в одну линию.
G = 26          # промежуток между блоками
DROP = 24       # спуск ветви от уровня вершины решения до первого блока
SIDE = 22       # минимальный вынос оси ветви за вершину ромба


def node_h(n):
    k = n[0]
    if k == 'term':
        return TH
    if k in ('in', 'exit'):
        return 2 * CR
    if k in ('proc', 'pred', 'data', 'loop', 'loopend'):
        return BH if len(n[1]) <= 2 else BH + 14
    raise ValueError(k)


def node_half(n):
    k = n[0]
    if k == 'term':
        return TW / 2
    if k in ('in', 'exit'):
        return CR
    if k == 'data':
        return (BW + 34) / 2
    if k in ('loop', 'loopend'):
        return (BW + 10) / 2
    return BW / 2


def measure(seq):
    """(левый вынос, правый вынос, высота, поток закончился)."""
    L = R = 0
    H = 0
    ended = False
    for i, n in enumerate(seq):
        if i:
            H += G
        if n[0] == 'if':
            m = measure_if(n)
            L, R = max(L, m['L']), max(R, m['R'])
            H += m['H']
            ended = m['ended']
        elif n[0] == 'par':
            m = measure_par(n)
            L, R = max(L, m['L']), max(R, m['R'])
            H += m['H']
        else:
            h = node_half(n)
            L, R = max(L, h), max(R, h)
            H += node_h(n)
            if n[0] == 'exit' or (n[0] == 'term' and i == len(seq) - 1 and i > 0):
                ended = True
    return L, R, H, ended


def measure_if(n):
    _, cond, yes, no = n
    dw = DW + (14 if len(cond) > 2 else 0)
    dh = DH + (12 if len(cond) > 2 else 0)
    yl, yr, yh, ye = measure(yes) if yes else (0, 0, 0, False)
    nl, nr, nh, ne = measure(no) if no else (0, 0, 0, False)
    # оси ветвей: не ближе вершин ромба, блоки двух ветвей не пересекаются
    offL = max(dw / 2, yr + 16)
    offR = max(dw / 2, nl + 16)
    body = max(yh, nh)
    ended = ye and ne
    # ромб, спуск от его нижней вершины до первых блоков ветвей, ветви, линия слияния
    H = dh + G + body + (0 if ended else 26)
    return dict(dw=dw, dh=dh, offL=offL, offR=offR, L=max(dw / 2, offL + yl), R=max(dw / 2, offR + nr),
                H=H, body=body, ended=ended, yh=yh, nh=nh, ye=ye, ne=ne)


def measure_par(n):
    lanes = [measure(x) for x in n[1]]
    gap = 30
    widths = [l + r for l, r, h, e in lanes]
    total = sum(widths) + gap * (len(lanes) - 1)
    body = max(h for l, r, h, e in lanes)
    return dict(lanes=lanes, total=total, L=total / 2, R=total / 2, H=body + 26, body=body)


def draw_node(s, n, cx, y):
    k = n[0]
    h = node_h(n)
    if k == 'term':
        s.terminator(cx, y, n[1])
    elif k == 'proc':
        s.process(cx, y, n[1], h=h)
    elif k == 'pred':
        s.predefined(cx, y, n[1], h=h)
    elif k == 'data':
        s.data(cx, y, n[1], h=h)
    elif k == 'loop':
        s.loop(cx, y, n[1], h=h)
    elif k == 'loopend':
        s.loop(cx, y, n[1], end=True, h=h)
    elif k in ('in', 'exit'):
        s.connector(cx, y + CR, n[1])
    return y + h


def draw(s, seq, cx, y, enter=False):
    """Рисует последовательность от y вниз. enter: к первому узлу ведёт входящая линия сверху (уже нарисована до y).
    Возвращает y конца потока (нижняя точка, откуда идёт линия дальше)."""
    for i, n in enumerate(seq):
        if i or enter:
            s.line([(cx, y), (cx, y + G)], arrow=n[0] not in ('if',) or True)
            y += G
        if n[0] == 'if':
            y = draw_if(s, n, cx, y)
        elif n[0] == 'par':
            y = draw_par(s, n, cx, y)
        else:
            y = draw_node(s, n, cx, y)
    return y


def draw_branch(s, seq, bx, cy, ystart, merge):
    """Ветвь решения: от уровня вершины ромба вниз. Пустая ветвь – линия до уровня слияния."""
    if not seq:
        if merge is not None:
            s.line([(bx, cy), (bx, merge)])
        return
    s.line([(bx, cy), (bx, ystart)], arrow=True)
    yend = draw(s, seq, bx, ystart)
    _, _, _, ended = measure(seq)
    if not ended and merge is not None:
        s.line([(bx, yend), (bx, merge)])


def draw_if(s, n, cx, y):
    m = measure_if(n)
    _, cond, yes, no = n
    cy = s.decision(cx, y, cond, w=m['dw'], h=m['dh'])
    lx, rx = cx - m['offL'], cx + m['offR']
    s.line([(cx - m['dw'] / 2, cy), (lx, cy)])
    s.label(cx - m['dw'] / 2 - 24, cy - 7, 'Да')
    s.line([(cx + m['dw'] / 2, cy), (rx, cy)])
    s.label(cx + m['dw'] / 2 + 4, cy - 7, 'Нет')
    ystart = y + m['dh'] + G
    merge = None if m['ended'] else ystart + m['body'] + 26
    draw_branch(s, yes, lx, cy, ystart, merge)
    draw_branch(s, no, rx, cy, ystart, merge)
    if m['ended']:
        return ystart + m['body']
    # линия слияния закрывает обе ветви; ветвь, ушедшая в соединитель, в слиянии не участвует
    xs = [x for x, e in ((lx, m['ye']), (rx, m['ne'])) if not e] + [cx]
    s.line([(min(xs), merge), (max(xs), merge)])
    return merge


def draw_par(s, n, cx, y):
    m = measure_par(n)
    x = cx - m['total'] / 2
    merge = y + m['body'] + 26
    ends = []
    for seq, (l, r, h, e) in zip(n[1], m['lanes']):
        ax = x + l
        yend = draw(s, seq, ax, y)
        s.line([(ax, yend), (ax, merge)])
        ends.append(ax)
        x += l + r + 30
    s.line([(min(ends + [cx]), merge), (max(ends + [cx]), merge)])
    return merge


def chart(name, columns, colgap=60, margin=20):
    """columns: список последовательностей, каждая колонка рисуется сверху вниз."""
    ms = [measure(c) for c in columns]
    W = margin * 2 + 30 + sum(l + r for l, r, h, e in ms) + colgap * (len(ms) - 1)
    H = margin * 2 + max(h for l, r, h, e in ms)
    s = Svg(int(W), int(H))
    x = margin
    for c, (l, r, h, e) in zip(columns, ms):
        draw(s, c, x + l, margin)
        x += l + r + colgap
    s.save(name)


def flow_transfer():
    """Перевод клиенту банка: createTransfer, confirmTransfer, executeIntentIn."""
    col1 = [
        ('term', ['Начало']),
        ('data', ['Получить данные формы:', 'счета, сумма']),
        ('if', ['Данные', 'корректны?'], [('proc', ['Пересчитать сумму', 'в BYN по курсу НБ'])], [('exit', 1)]),
        ('if', ['Суточный лимит', 'превышен?'], [('exit', 1)], [('proc', ['Вычислить баллы', 'риска антифрода'])]),
        ('if', ['Баллы не ниже', 'порога', 'проверки?'],
         [('proc', ['Зарезервировать', 'сумму, открыть', 'случай антифрода']), ('data', ['Сообщить: перевод', 'на проверке']), ('exit', 2)],
         [('exit', 3)]),
    ]
    col2 = [
        ('in', 3),
        ('if', ['Нужен код', 'подтверждения?'],
         [('proc', ['Отправить', 'одноразовый код']), ('data', ['Получить код', 'от клиента']),
          ('if', ['Код', 'верен?'], [], [('exit', 1)])],
         []),
        ('pred', ['Провести перевод', 'в транзакции']),
        ('if', ['Проводка', 'выполнена?'], [('proc', ['Отметить перевод', 'проведённым,', 'уведомить стороны'])], [('exit', 1)]),
        ('exit', 4),
    ]
    col3 = [
        ('par', [[('in', 1), ('data', ['Отобразить', 'сообщение', 'об ошибке'])], [('in', 2)], [('in', 4)]]),
        ('term', ['Конец']),
    ]
    chart('flow-transfer.svg', [col1, col2, col3])


def flow_loans():
    """Обслуживание кредитов при закрытии операционного дня: processLoans."""
    col1 = [
        ('term', ['Начало']),
        ('pred', ['Выбрать активные', 'кредиты', 'с блокировкой']),
        ('loop', ['Обработка кредитов', 'Пока есть кредиты']),
        ('proc', ['Выбрать платежи', 'со сроком до', 'банковской даты']),
        ('loop', ['Обработка платежей', 'Пока есть платежи']),
        ('if', ['Платёж уже', 'просрочен?'], [('proc', ['Начислить пеню', 'за дни просрочки'])], []),
        ('if', ['Ранний платёж', 'не оплачен или', 'не хватает денег?'],
         [('proc', ['Отметить платёж', 'просроченным'])],
         [('pred', ['Списать долг,', 'проценты и пеню']), ('proc', ['Отметить платёж', 'оплаченным'])]),
        ('exit', 1),
    ]
    col2 = [
        ('in', 1),
        ('loopend', ['Обработка платежей']),
        ('if', ['Все платежи', 'погашены?'], [('proc', ['Закрыть кредит', 'и ссудный счёт'])], []),
        ('proc', ['Сохранить остаток', 'долга и дату', 'оплаты']),
        ('loopend', ['Обработка кредитов']),
        ('term', ['Конец']),
    ]
    chart('flow-loans.svg', [col1, col2], colgap=90)


def flow_deposits():
    """Начисление процентов и возврат вкладов при закрытии дня: processDeposits."""
    col1 = [
        ('term', ['Начало']),
        ('pred', ['Выбрать вклады', 'с наступившей', 'датой выплаты']),
        ('loop', ['Обработка вкладов', 'Пока есть вклады']),
        ('proc', ['Создать точку', 'сохранения']),
        ('loop', ['Обработка периодов', 'Пока дата выплаты', 'не позже даты дня']),
        ('proc', ['Рассчитать проценты', 'за период по дням']),
        ('if', ['Проценты', 'больше нуля?'],
         [('if', ['Капитализация?'], [('proc', ['Зачислить', 'проценты', 'на вклад'])], [('proc', ['Выплатить', 'проценты на', 'текущий счёт'])])],
         []),
        ('exit', 1),
    ]
    col2 = [
        ('in', 1),
        ('if', ['Наступил срок', 'вклада?'],
         [('pred', ['Вернуть вклад', 'на текущий счёт']), ('proc', ['Закрыть вклад', 'и его счёт'])],
         [('proc', ['Сохранить дату', 'и число периодов'])]),
        ('loopend', ['Обработка периодов']),
        ('if', ['Произошла', 'ошибка?'], [('proc', ['Откатить', 'к точке', 'сохранения'])], [('proc', ['Освободить', 'точку', 'сохранения'])]),
        ('loopend', ['Обработка вкладов']),
        ('term', ['Конец']),
    ]
    chart('flow-deposits.svg', [col1, col2], colgap=90)


def arch():
    """Слои обработки запроса на примере модуля переводов."""
    s = Svg(1060, 500, size=14)
    bw, bh, top = 130, 150, 120
    xs = [175, 325, 475, 625, 775]
    names = [
        ['Общие', 'проверки:', 'сессия, CSRF,', 'права, 2FA'],
        ['Маршрут:', 'адрес, метод,', 'право доступа', '', 'routes.js'],
        ['Контроллер:', 'разбор', 'запроса,', 'ответ JSON', '', 'transfer.', 'controller.js'],
        ['Сервис:', 'бизнес-', 'правила,', 'транзакции', '', 'transfer.', 'service.js'],
        ['Модель:', 'SQL-запросы', 'с параметрами', '', 'transfer.', 'model.js'],
    ]
    mid = top + bh / 2
    # браузер слева от сервера
    s.add(f"<rect x='10' y='{top + 20}' width='100' height='{bh - 40}' fill='white' stroke='#000' stroke-width='{LW}'/>")
    s.text(60, mid, ['Браузер:', 'модуль', 'страницы'])
    s.line([(110, mid), (xs[0], mid)], arrow=True)
    s.label(114, mid - 8, 'HTTPS')
    for x, lines in zip(xs, names):
        s.add(f"<rect x='{x}' y='{top}' width='{bw}' height='{bh}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        s.text(x + bw / 2, mid, lines)
    for x in xs[1:]:
        s.line([(x - 20, mid), (x, mid)], arrow=True)
    # рамка сервера приложения
    s.add(f"<rect x='{xs[0] - 12}' y='60' width='{xs[-1] + bw - xs[0] + 24}' height='420' fill='none' stroke='#000' stroke-width='1' stroke-dasharray='6 4'/>")
    s.text((xs[0] + xs[-1] + bw) / 2, 88, ['Сервер приложения (Node.js, Express)'], size=15, bold=True)
    # база данных справа: цилиндр
    cx, w, h = 990, 100, 150
    t = top
    s.add(f"<path d='M{cx - w / 2},{t + 12} L{cx - w / 2},{t + h - 12} A{w / 2},12 0 0 0 {cx + w / 2},{t + h - 12} L{cx + w / 2},{t + 12}' fill='white' stroke='#000' stroke-width='{LW}'/>")
    s.add(f"<ellipse cx='{cx}' cy='{t + 12}' rx='{w / 2}' ry='12' fill='white' stroke='#000' stroke-width='{LW}'/>")
    s.text(cx, mid + 6, ['База', 'данных', 'MySQL'])
    s.line([(xs[-1] + bw, mid), (cx - w / 2, mid)], arrow=True)
    # общие подсистемы
    yb = 350
    s.add(f"<rect x='{xs[1]}' y='{yb}' width='{xs[2] + bw - xs[1]}' height='96' fill='white' stroke='#000' stroke-width='{LW}'/>")
    s.text((xs[1] + xs[2] + bw) / 2, yb + 48, ['Двойная запись (ledger):', 'проводки Дт/Кт', 'в одной транзакции'])
    s.add(f"<rect x='{xs[3]}' y='{yb}' width='{xs[4] + bw - xs[3]}' height='96' fill='white' stroke='#000' stroke-width='{LW}'/>")
    s.text((xs[3] + xs[4] + bw) / 2, yb + 48, ['Общие подсистемы:', 'деньги, IBAN, шифрование,', 'коды, банковская дата'])
    s.line([((xs[1] + xs[2] + bw) / 2, yb), ((xs[1] + xs[2] + bw) / 2, 310), (xs[3] + 35, 310), (xs[3] + 35, top + bh)], arrow=True)
    s.line([(xs[3] + 95, yb), (xs[3] + 95, top + bh)], arrow=True)
    s.line([(xs[4] + bw / 2, yb), (xs[4] + bw / 2, top + bh)], arrow=True)
    s.save('arch-layers.svg')


if __name__ == '__main__':
    arch()
    flow_transfer()
    flow_loans()
    flow_deposits()
