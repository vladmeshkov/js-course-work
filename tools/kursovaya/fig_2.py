#!/usr/bin/env python3
"""Рисунки раздела 2 в оформлении образца записки.

Блок-схемы по ГОСТ 19.701-90 строятся по описанию алгоритма:
- все блоки (процесс, предопределённый процесс, ввод-вывод, граница цикла) одного размера, решения одного размера;
- у решения две ветви: «Да» влево, «Нет» вправо; каждая ветвь отходит от вершины ромба горизонтальным
  отрезком и затем идёт вниз;
- если обе ветви продолжают алгоритм, они закрываются линией слияния под решением, поток идёт дальше от её середины;
- ветвь ошибки содержит свой блок «Вывести ошибку: …» и уходит в соединитель; основной поток продолжается
  по своей ветви, разные ошибки в один блок не сводятся;
- все соединители сходятся только перед блоком «Конец».
SVG пишутся в docs/kursovaya/src, PNG: node svg2png.cjs вход.svg выход.png 2.
Использование: python3 fig_2.py
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs', 'kursovaya', 'src')
FONT = "font-family='Arial, Liberation Sans, Helvetica, sans-serif'"
LW = 1.4
BW, BH = 142, 64        # все блоки одного размера
DW, DH = 166, 92        # все решения одного размера
TW, TH = 142, 42        # терминатор той же ширины, что блоки
CR = 18                 # радиус соединителя
G = 26                  # расстояние между блоками
TAIL = 30               # горизонтальный отрезок ветви за вершиной ромба
OFF = DW / 2 + TAIL     # минимальный вынос оси ветви от оси решения


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

    def label(self, x, y, t, anchor='start'):
        self.add(f"<text x='{x}' y='{y}' text-anchor='{anchor}' font-size='{self.size - 1}' {FONT}>{t}</text>")

    def line(self, pts, arrow=False):
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        m = " marker-end='url(#a)'" if arrow else ''
        self.add(f"<path d='{d}' fill='none' stroke='#000' stroke-width='{LW}'{m}/>")

    # символы ГОСТ 19.701-90 (cx, верх)
    def process(self, cx, y, lines):
        self.add(f"<rect x='{cx - BW / 2}' y='{y}' width='{BW}' height='{BH}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + BH / 2, lines)
        return y + BH

    def predefined(self, cx, y, lines):
        self.process(cx, y, lines)
        for dx in (-BW / 2 + 9, BW / 2 - 9):
            self.line([(cx + dx, y), (cx + dx, y + BH)])
        return y + BH

    def data(self, cx, y, lines):
        s = 14
        x = cx - BW / 2
        self.add(f"<polygon points='{x + s},{y} {x + BW},{y} {x + BW - s},{y + BH} {x},{y + BH}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + BH / 2, lines)
        return y + BH

    def terminator(self, cx, y, lines):
        self.add(f"<rect x='{cx - TW / 2}' y='{y}' width='{TW}' height='{TH}' rx='{TH / 2}' ry='{TH / 2}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + TH / 2, lines)
        return y + TH

    def decision(self, cx, y, lines):
        cy = y + DH / 2
        self.add(f"<polygon points='{cx},{y} {cx + DW / 2},{cy} {cx},{y + DH} {cx - DW / 2},{cy}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, cy, lines)
        return cy

    def loop(self, cx, y, lines, end=False):
        c = 14
        x = cx - BW / 2
        if end:
            pts = f'{x},{y} {x + BW},{y} {x + BW},{y + BH - c} {x + BW - c},{y + BH} {x + c},{y + BH} {x},{y + BH - c}'
        else:
            pts = f'{x + c},{y} {x + BW - c},{y} {x + BW},{y + c} {x + BW},{y + BH} {x},{y + BH} {x},{y + c}'
        self.add(f"<polygon points='{pts}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + BH / 2, lines)
        return y + BH

    def connector(self, cx, y, n):
        self.add(f"<circle cx='{cx}' cy='{y + CR}' r='{CR}' fill='white' stroke='#000' stroke-width='{LW}'/>")
        self.text(cx, y + CR, [str(n)])
        return y + 2 * CR

    def save(self, name):
        self.parts.append('</svg>')
        path = os.path.join(SRC, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(self.parts))
        print(path)


# ---------------- описание алгоритма и раскладка ----------------
# ('term', строки) ('proc', строки) ('pred', строки) ('io', строки) ('loop', строки) ('loopend', строки)
# ('in', n) – входной соединитель; ('exit', n) – выходной соединитель, поток в этой ветви заканчивается;
# ('if', условие, ветвь_да, ветвь_нет); ('merge', [ветви]) – входящие соединители сходятся перед «Концом».

def size(n):
    """(полуширина, высота) простого узла."""
    k = n[0]
    if k == 'term':
        return TW / 2, TH
    if k in ('in', 'exit'):
        return CR, 2 * CR
    return BW / 2, BH


def measure(seq):
    """Габариты относительно начальной оси: L, R, высота, поток закончился, сдвиг оси к концу."""
    L = R = 0.0
    H = 0.0
    x = 0.0
    ended = False
    for i, n in enumerate(seq):
        if i:
            H += G
        if n[0] == 'if':
            m = measure_if(n)
            L, R = max(L, m['L'] - x), max(R, x + m['R'])
            H += m['H']
            x += m['shift']
            ended = m['ended']
        elif n[0] == 'merge':
            m = measure_merge(n)
            L, R = max(L, m['L'] - x), max(R, x + m['R'])
            H += m['H']
        elif n[0] == 'close':
            m = measure_close(n)
            L, R = max(L, m['L'] - x), max(R, x + m['R'])
            H += m['H']
            x += close_shift(n)
        else:
            hw, h = size(n)
            L, R = max(L, hw - x), max(R, x + hw)
            H += h
            ended = n[0] == 'exit' or (n[0] == 'term' and i > 0)
    return dict(L=L, R=R, H=H, ended=ended, shift=x)


def measure_if(n):
    _, cond, yes, no = n
    e = dict(L=0, R=0, H=0, ended=False, shift=0)
    y = measure(yes) if yes else e
    no_ = measure(no) if no else e
    offL = max(OFF, y['R'] + 24)
    offR = max(OFF, no_['L'] + 24)
    body = max(y['H'], no_['H'])
    both = not y['ended'] and not no_['ended']
    H = DH + G + body + (30 if both else 0)
    if both:
        shift = 0
    elif not y['ended']:
        shift = -offL + y['shift']
    elif not no_['ended']:
        shift = offR + no_['shift']
    else:
        shift = 0
    return dict(offL=offL, offR=offR, body=body, both=both, H=H, shift=shift,
                ended=y['ended'] and no_['ended'], ye=y, ne=no_,
                L=max(DW / 2, offL + y['L']), R=max(DW / 2, offR + no_['R']))


STEP_X, STEP_Y = 54, 44


def measure_close(n):
    """('close', [k1, k2, ...]): соединители выходов в порядке вложенности условий – от самого внутреннего.
    Первые два сливаются друг с другом, каждый следующий присоединяется ниже, на своём уровне."""
    k = len(n[1])
    width = (k - 1) * STEP_X
    H = 2 * CR + 24 + (k - 1) * STEP_Y
    return dict(L=CR, R=width + CR, H=H)


def close_shift(n):
    """Сдвиг оси после лесенки: ствол уходит вправо при каждом слиянии."""
    xs = [i * STEP_X for i in range(len(n[1]))]
    trunk = (xs[0] + xs[1]) / 2
    for x in xs[2:]:
        trunk = (trunk + x) / 2
    return trunk


def draw_close(s, n, cx, y):
    labels = n[1]
    xs = [cx + i * STEP_X for i in range(len(labels))]
    for x, lab in zip(xs, labels):
        s.connector(x, y, lab)
    top = y + 2 * CR
    # уровень 1: сливаются ветви самого внутреннего условия
    level = top + 24
    s.line([(xs[0], top), (xs[0], level)])
    s.line([(xs[1], top), (xs[1], level)])
    s.line([(xs[0], level), (xs[1], level)])
    trunk = (xs[0] + xs[1]) / 2
    # каждое внешнее условие закрывается ниже: ствол продолжается, его ветвь присоединяется справа
    for x in xs[2:]:
        nxt = level + STEP_Y
        s.line([(trunk, level), (trunk, nxt)])
        s.line([(x, top), (x, nxt)])
        s.line([(trunk, nxt), (x, nxt)])
        trunk = (trunk + x) / 2
        level = nxt
    return level, trunk


def measure_merge(n):
    lanes = [measure(x) for x in n[1]]
    gap = 22
    total = sum(m['L'] + m['R'] for m in lanes) + gap * (len(lanes) - 1)
    body = max(m['H'] for m in lanes)
    return dict(lanes=lanes, gap=gap, total=total, L=total / 2, R=total / 2, H=body + 30, body=body)


def draw_node(s, n, cx, y):
    k = n[0]
    if k == 'term':
        return s.terminator(cx, y, n[1])
    if k == 'proc':
        return s.process(cx, y, n[1])
    if k == 'pred':
        return s.predefined(cx, y, n[1])
    if k == 'io':
        return s.data(cx, y, n[1])
    if k == 'loop':
        return s.loop(cx, y, n[1])
    if k == 'loopend':
        return s.loop(cx, y, n[1], end=True)
    if k in ('in', 'exit'):
        return s.connector(cx, y, n[1])
    raise ValueError(k)


def draw(s, seq, cx, y):
    """Рисует последовательность сверху вниз от y. Возвращает (y конца, x оси в конце)."""
    for i, n in enumerate(seq):
        if i:
            s.line([(cx, y), (cx, y + G)], arrow=True)
            y += G
        if n[0] == 'if':
            y, cx = draw_if(s, n, cx, y)
        elif n[0] == 'merge':
            y = draw_merge(s, n, cx, y)
        elif n[0] == 'close':
            y, cx = draw_close(s, n, cx, y)
        else:
            y = draw_node(s, n, cx, y)
    return y, cx


def draw_if(s, n, cx, y):
    m = measure_if(n)
    _, cond, yes, no = n
    cy = s.decision(cx, y, cond)
    lx, rx = cx - m['offL'], cx + m['offR']
    ystart = y + DH + G
    bottom = ystart + m['body']
    # горизонтальные отрезки от вершин ромба и подписи выходов
    s.line([(cx - DW / 2, cy), (lx, cy)])
    s.line([(cx + DW / 2, cy), (rx, cy)])
    s.label(cx - DW / 2 - 6, cy - 7, 'Да', anchor='end')
    s.label(cx + DW / 2 + 6, cy - 7, 'Нет')
    ends = []
    for seq, bx, mm in ((yes, lx, m['ye']), (no, rx, m['ne'])):
        if not seq:
            ends.append((bx, cy))
            continue
        s.line([(bx, cy), (bx, ystart)], arrow=True)
        yend, xend = draw(s, seq, bx, ystart)
        if not mm['ended']:
            ends.append((xend, yend))
    if m['both']:
        merge = bottom + 30
        for x, ye in ends:
            s.line([(x, ye), (x, merge)])
        xs = [x for x, _ in ends] + [cx]
        s.line([(min(xs), merge), (max(xs), merge)])
        return merge, cx
    if ends:
        # одна ветвь продолжает алгоритм: поток идёт дальше по её оси
        x, ye = ends[0]
        if ye < bottom:
            s.line([(x, ye), (x, bottom)])
        return bottom, x
    return bottom, cx


def draw_merge(s, n, cx, y):
    m = measure_merge(n)
    x = cx - m['total'] / 2
    merge = y + m['body'] + 30
    xs = []
    for seq, mm in zip(n[1], m['lanes']):
        ax = x + mm['L']
        yend, xend = draw(s, seq, ax, y)
        s.line([(xend, yend), (xend, merge)])
        xs.append(xend)
        x += mm['L'] + mm['R'] + m['gap']
    s.line([(min(xs + [cx]), merge), (max(xs + [cx]), merge)])
    return merge


STACK_GAP = 50


def measure_column(col):
    """Колонка – последовательность или несколько последовательностей одна под другой (список списков)."""
    parts = col if col and isinstance(col[0], list) else [col]
    ms = [measure(p) for p in parts]
    return dict(L=max(m['L'] for m in ms), R=max(m['R'] for m in ms),
                H=sum(m['H'] for m in ms) + STACK_GAP * (len(ms) - 1), parts=parts)


def chart(name, columns, colgap=60, margin=24):
    ms = [measure_column(c) for c in columns]
    W = margin * 2 + sum(m['L'] + m['R'] for m in ms) + colgap * (len(ms) - 1)
    H = margin * 2 + max(m['H'] for m in ms)
    s = Svg(int(W), int(H))
    x = margin
    for m in ms:
        y = margin
        for p in m['parts']:
            draw(s, p, x + m['L'], y)
            y += measure(p)['H'] + STACK_GAP
        x += m['L'] + m['R'] + colgap
    s.save(name)


def err(*lines):
    return ('io', ['Вывести ошибку:', *lines])


def flow_transfer():
    """Перевод клиенту банка: createTransfer, confirmTransfer, executeIntentIn.
    Условия вложены друг в друга: продолжение алгоритма – внутри ветви, выходы нумеруются от самого
    внутреннего условия (1, 2) к внешнему (6) и закрываются лесенкой в том же порядке."""
    col1 = [
        ('term', ['Начало']),
        ('io', ['Получить данные', 'формы: счета,', 'сумма']),
        ('if', ['Счета и сумма', 'корректны?'],
         [('proc', ['Пересчитать', 'сумму в BYN', 'по курсу НБ'])],
         [err('неверные данные', 'перевода'), ('exit', 6)]),
        ('if', ['Суточный лимит', 'превышен?'],
         [err('превышен', 'суточный лимит'), ('exit', 5)],
         [('proc', ['Вычислить', 'баллы риска', 'антифрода'])]),
        ('if', ['Баллы ниже', 'порога', 'проверки?'],
         [('exit', 'А')],
         [('proc', ['Зарезервировать', 'сумму, открыть', 'случай антифрода']), ('io', ['Вывести:', 'перевод', 'на проверке']), ('exit', 4)]),
    ]
    col2 = [
        ('in', 'А'),
        ('pred', ['Запросить код', 'подтверждения,', 'если требуется']),
        ('if', ['Код верен или', 'не требуется?'],
         [('pred', ['Провести', 'перевод', 'в транзакции'])],
         [err('неверный код'), ('exit', 3)]),
        ('if', ['Проводка', 'выполнена?'],
         [('proc', ['Отметить', 'перевод', 'проведённым']), ('io', ['Вывести:', 'перевод', 'выполнен']), ('exit', 1)],
         [err('недостаточно', 'средств'), ('exit', 2)]),
    ]
    closing = [
        ('close', [1, 2, 3, 4, 5, 6]),
        ('term', ['Конец']),
    ]
    chart('flow-transfer.svg', [col1, col2, closing], colgap=30)


def flow_loans():
    """Обслуживание кредитов при закрытии операционного дня: processLoans."""
    col1 = [
        ('term', ['Начало']),
        ('pred', ['Выбрать активные', 'кредиты', 'с блокировкой']),
        ('loop', ['Обработка', 'кредитов']),
        ('proc', ['Выбрать платежи', 'со сроком до', 'банковской даты']),
        ('loop', ['Обработка', 'платежей']),
        ('if', ['Платёж уже', 'просрочен?'], [('proc', ['Начислить пеню', 'за дни просрочки'])], []),
        ('if', ['Ранний платёж', 'не оплачен', 'или мало денег?'],
         [('proc', ['Отметить платёж', 'просроченным'])],
         [('pred', ['Списать долг,', 'проценты и пеню']), ('proc', ['Отметить платёж', 'оплаченным'])]),
        ('exit', 'А'),
    ]
    col2 = [
        ('in', 'А'),
        ('loopend', ['Обработка', 'платежей']),
        ('if', ['Все платежи', 'погашены?'], [('proc', ['Закрыть кредит', 'и ссудный счёт'])], []),
        ('proc', ['Сохранить остаток', 'долга и дату', 'оплаты']),
        ('loopend', ['Обработка', 'кредитов']),
        ('term', ['Конец']),
    ]
    chart('flow-loans.svg', [col1, col2], colgap=80)


def flow_deposits():
    """Начисление процентов и возврат вкладов при закрытии дня: processDeposits."""
    col1 = [
        ('term', ['Начало']),
        ('pred', ['Выбрать вклады', 'с наступившей', 'датой выплаты']),
        ('loop', ['Обработка', 'вкладов']),
        ('proc', ['Создать точку', 'сохранения']),
        ('loop', ['Обработка периодов', 'до даты дня']),
        ('proc', ['Рассчитать', 'проценты за', 'период по дням']),
        ('if', ['Проценты', 'больше нуля?'],
         [('if', ['Капитали-', 'зация?'], [('proc', ['Зачислить', 'проценты', 'на вклад'])], [('proc', ['Выплатить', 'проценты на', 'текущий счёт'])])],
         []),
        ('exit', 'А'),
    ]
    col2 = [
        ('in', 'А'),
        ('if', ['Наступил срок', 'вклада?'],
         [('pred', ['Вернуть вклад', 'на текущий счёт']), ('proc', ['Закрыть вклад', 'и его счёт'])],
         [('proc', ['Сохранить дату', 'и число', 'периодов'])]),
        ('loopend', ['Обработка', 'периодов']),
        ('if', ['Произошла', 'ошибка?'],
         [('proc', ['Откатить', 'к точке', 'сохранения'])],
         [('proc', ['Освободить', 'точку', 'сохранения'])]),
        ('loopend', ['Обработка', 'вкладов']),
        ('term', ['Конец']),
    ]
    chart('flow-deposits.svg', [col1, col2], colgap=40)


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
