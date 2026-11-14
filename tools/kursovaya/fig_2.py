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


def flow_transfer():
    """Перевод клиенту банка: createTransfer, confirmTransfer, executeIntentIn."""
    s = Svg(1000, 1060)
    A, AL, AR = 270, 95, 445          # колонка 1: ось, левая ветвь, полоса отказа
    B, BL, BR = 655, 530, 805         # колонка 2
    C = 900                           # колонка 3 (сообщение об ошибке)
    gap = 30

    # колонка 1
    y = s.terminator(A, 20, ['Начало'])
    y = s.down(A, y, y + gap)
    y = s.data(A, y, ['Получить данные формы:', 'счета, сумма'])
    y = s.down(A, y, y + gap)
    c1 = s.decision(A, y, ['Данные', 'корректны?'])
    s.line([(A + DW / 2, c1), (AR, c1)]); s.label(A + DW / 2 + 8, c1 - 6, 'Нет')
    y = s.down(A, y + DH, y + DH + gap); s.label(A + 6, y - 10, 'Да')
    y = s.process(A, y, ['Пересчитать сумму', 'в BYN по курсу НБ'])
    y = s.down(A, y, y + gap)
    c2 = s.decision(A, y, ['Суточный лимит', 'превышен?'])
    s.line([(A + DW / 2, c2), (AR, c2)]); s.label(A + DW / 2 + 8, c2 - 6, 'Да')
    y = s.down(A, y + DH, y + DH + gap); s.label(A + 6, y - 10, 'Нет')
    y = s.process(A, y, ['Вычислить баллы', 'риска антифрода'])
    y = s.down(A, y, y + gap)
    c3 = s.decision(A, y, ['Баллы не ниже', 'порога', 'проверки?'], w=DW + 14, h=DH + 10)
    yb = y + DH + 10
    s.line([(A - (DW + 14) / 2, c3), (AL, c3)]); s.label(A - (DW + 14) / 2 - 22, c3 - 6, 'Да')
    ya = s.down(AL, c3, c3 + 50)
    ya = s.process(AL, ya, ['Зарезервировать', 'сумму, открыть', 'случай антифрода'], h=72)
    ya = s.down(AL, ya, ya + gap)
    ya = s.data(AL, ya, ['Сообщить: перевод', 'на проверке'])
    bottom = 990
    s.down(AL, ya, bottom - CR)
    s.connector(AL, bottom, 2)
    s.down(A, yb, bottom - CR); s.label(A + 6, yb + 18, 'Нет')
    s.connector(A, bottom, 3)
    s.down(AR, c1, bottom - CR)
    s.connector(AR, bottom, 1)

    # колонка 2
    s.connector(B, 40, 3)
    y = s.down(B, 40 + CR, 40 + CR + gap)
    c4 = s.decision(B, y, ['Нужен код', 'подтверждения?'], w=DW + 10)
    s.line([(B + (DW + 10) / 2, c4), (BR, c4)]); s.label(B + (DW + 10) / 2 + 8, c4 - 6, 'Нет')
    y = s.down(B, y + DH, y + DH + gap); s.label(B + 6, y - 10, 'Да')
    y = s.process(B, y, ['Отправить', 'одноразовый код'])
    y = s.down(B, y, y + gap)
    y = s.data(B, y, ['Получить код', 'от клиента'])
    y = s.down(B, y, y + gap)
    c5 = s.decision(B, y, ['Код верен?'])
    s.line([(B - DW / 2, c5), (BL, c5)]); s.label(B - DW / 2 - 30, c5 - 6, 'Нет')
    merge = y + DH + 40
    s.line([(B, y + DH), (B, merge)]); s.label(B + 6, y + DH + 18, 'Да')
    s.line([(BR, c4), (BR, merge), (B, merge)])
    y = s.down(B, merge, merge + gap)
    y = s.predefined(B, y, ['Провести перевод', 'в транзакции'])
    y = s.down(B, y, y + gap)
    c6 = s.decision(B, y, ['Проводка', 'выполнена?'])
    s.line([(B - DW / 2, c6), (BL, c6)]); s.label(B - DW / 2 - 30, c6 - 6, 'Нет')
    y = s.down(B, y + DH, y + DH + gap); s.label(B + 6, y - 10, 'Да')
    y = s.process(B, y, ['Отметить перевод', 'проведённым,', 'уведомить стороны'], h=72)
    s.down(BL, c5, 860 - CR)
    s.connector(BL, 860, 1)

    # колонка 3: ошибка и общий конец
    s.connector(C, 40, 1)
    yc = s.down(C, 40 + CR, 40 + CR + gap)
    yc = s.data(C, yc, ['Отобразить', 'сообщение', 'об ошибке'], w=BW - 10, h=72)
    join = 960
    s.line([(B, y), (B, join)])
    s.line([(C, yc), (C, join)])
    s.line([(B, join), (C, join)])
    s.connector(BR, 860, 2)
    s.line([(BR, 860 + CR), (BR, join)])
    mid = BR
    s.down(mid, join, join + 30)
    s.terminator(mid, join + 30, ['Конец'])
    s.save('flow-transfer.svg')


def flow_loans():
    """Обслуживание кредитов при закрытии операционного дня: processLoans."""
    s = Svg(1000, 1060)
    A, AL, AR = 270, 95, 445
    B, BR = 655, 840
    gap = 30
    y = s.terminator(A, 20, ['Начало'])
    y = s.down(A, y, y + gap)
    y = s.predefined(A, y, ['Выбрать активные', 'кредиты', 'с блокировкой'], h=72)
    y = s.down(A, y, y + gap)
    y = s.loop(A, y, ['Обработка кредитов', 'Пока есть кредиты'])
    y = s.down(A, y, y + gap)
    y = s.process(A, y, ['Выбрать платежи', 'со сроком до', 'банковской даты'], h=72)
    y = s.down(A, y, y + gap)
    y = s.loop(A, y, ['Обработка платежей', 'Пока есть платежи'])
    y = s.down(A, y, y + gap)
    c1 = s.decision(A, y, ['Платёж уже', 'просрочен?'])
    s.line([(A - DW / 2, c1), (AL, c1)]); s.label(A - DW / 2 - 22, c1 - 6, 'Да')
    s.line([(A + DW / 2, c1), (AR, c1)]); s.label(A + DW / 2 + 6, c1 - 6, 'Нет')
    ya = s.down(AL, c1, c1 + 50)
    ya = s.process(AL, ya, ['Начислить пеню', 'за дни просрочки'])
    m1 = ya + 30
    s.line([(AL, ya), (AL, m1), (AR, m1), (AR, c1)])
    y = s.down(A, m1, m1 + gap)
    c2 = s.decision(A, y, ['Ранний платёж', 'не оплачен или', 'не хватает денег?'], w=DW + 30, h=DH + 20)
    s.line([(A - (DW + 30) / 2, c2), (AL, c2)]); s.label(A - (DW + 30) / 2 - 22, c2 - 6, 'Да')
    s.line([(A + (DW + 30) / 2, c2), (AR, c2)]); s.label(A + (DW + 30) / 2 + 6, c2 - 6, 'Нет')
    ya = s.down(AL, c2, c2 + 50)
    ya = s.process(AL, ya, ['Отметить платёж', 'просроченным'])
    yr = s.down(AR, c2, c2 + 50)
    yr = s.predefined(AR, yr, ['Списать долг,', 'проценты и пеню'])
    yr = s.down(AR, yr, yr + gap)
    yr = s.process(AR, yr, ['Отметить платёж', 'оплаченным'])
    m2 = yr + 30
    s.line([(AL, ya), (AL, m2), (AR, m2), (AR, yr)])
    bottom = m2 + 60
    s.down(A, m2, bottom - CR)
    s.connector(A, bottom, 1)

    s.connector(B, 40, 1)
    y = s.down(B, 40 + CR, 40 + CR + gap)
    y = s.loop(B, y, ['Обработка платежей'], end=True)
    y = s.down(B, y, y + gap)
    c3 = s.decision(B, y, ['Все платежи', 'погашены?'])
    s.line([(B + DW / 2, c3), (BR, c3)]); s.label(B + DW / 2 + 6, c3 - 6, 'Да')
    yr = s.down(BR, c3, c3 + 50)
    yr = s.process(BR, yr, ['Закрыть кредит', 'и ссудный счёт'])
    m3 = yr + 30
    s.line([(B, y + DH), (B, m3)]); s.label(B + 6, y + DH + 18, 'Нет')
    s.line([(BR, yr), (BR, m3), (B, m3)])
    y = s.down(B, m3, m3 + gap)
    y = s.process(B, y, ['Сохранить остаток', 'долга и дату', 'оплаты'], h=72)
    y = s.down(B, y, y + gap)
    y = s.loop(B, y, ['Обработка кредитов'], end=True)
    y = s.down(B, y, y + gap)
    s.terminator(B, y, ['Конец'])
    s.save('flow-loans.svg')


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
