#!/usr/bin/env python3
"""Рисунки раздела 2: схема слоёв серверного модуля (arch-layers.svg) и блок-схема алгоритма
перевода клиенту банка по ГОСТ 19.701-90 (flow-transfer.svg). SVG пишутся в docs/kursovaya/src,
PNG собирает svg2png.cjs. Использование: python3 fig_2.py
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'docs', 'kursovaya', 'src')
FONT = "font-family='Times New Roman, serif'"
INK = '#000'


def text_lines(cx, cy, lines, size=15, anchor='middle', bold=False):
    lh = size + 4
    y0 = cy - (len(lines) - 1) * lh / 2
    w = 'bold' if bold else 'normal'
    out = []
    for i, line in enumerate(lines):
        out.append(f"<text x='{cx}' y='{y0 + i * lh + size * 0.35:.1f}' text-anchor='{anchor}' font-size='{size}' font-weight='{w}' {FONT} fill='{INK}'>{line}</text>")
    return '\n'.join(out)


class Svg:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
                      f"<rect x='0' y='0' width='{w}' height='{h}' fill='white'/>",
                      "<defs><marker id='arr' markerWidth='11' markerHeight='9' refX='10' refY='4.5' orient='auto'>"
                      "<path d='M0,0 L11,4.5 L0,9 z' fill='#000'/></marker></defs>"]

    def add(self, s):
        self.parts.append(s)

    # блоки ГОСТ 19.701-90
    def process(self, x, y, w, h, lines, size=15):
        self.add(f"<rect x='{x}' y='{y}' width='{w}' height='{h}' fill='white' stroke='{INK}' stroke-width='1.6'/>")
        self.add(text_lines(x + w / 2, y + h / 2, lines, size))

    def predefined(self, x, y, w, h, lines, size=15):
        self.process(x, y, w, h, lines, size)
        self.add(f"<line x1='{x+8}' y1='{y}' x2='{x+8}' y2='{y+h}' stroke='{INK}' stroke-width='1.6'/>")
        self.add(f"<line x1='{x+w-8}' y1='{y}' x2='{x+w-8}' y2='{y+h}' stroke='{INK}' stroke-width='1.6'/>")

    def terminator(self, x, y, w, h, lines, size=15):
        r = h / 2
        self.add(f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='{r}' ry='{r}' fill='white' stroke='{INK}' stroke-width='1.6'/>")
        self.add(text_lines(x + w / 2, y + h / 2, lines, size))

    def data(self, x, y, w, h, lines, size=15):
        s = 16
        self.add(f"<polygon points='{x+s},{y} {x+w},{y} {x+w-s},{y+h} {x},{y+h}' fill='white' stroke='{INK}' stroke-width='1.6'/>")
        self.add(text_lines(x + w / 2, y + h / 2, lines, size))

    def decision(self, cx, cy, w, h, lines, size=15):
        self.add(f"<polygon points='{cx},{cy-h/2} {cx+w/2},{cy} {cx},{cy+h/2} {cx-w/2},{cy}' fill='white' stroke='{INK}' stroke-width='1.6'/>")
        self.add(text_lines(cx, cy, lines, size))

    def arrow(self, pts, label=None, lx=0, ly=0, size=14):
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        self.add(f"<path d='{d}' fill='none' stroke='{INK}' stroke-width='1.6' marker-end='url(#arr)'/>")
        if label:
            self.add(f"<text x='{lx}' y='{ly}' font-size='{size}' {FONT} fill='{INK}'>{label}</text>")

    def save(self, name):
        self.parts.append('</svg>')
        path = os.path.join(SRC, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(self.parts))
        print(path)


def arch():
    """Слои обработки запроса на примере модуля переводов."""
    W, H = 1340, 600
    s = Svg(W, H)
    s.process(15, 190, 165, 130, ['Браузер', '(клиентский', 'модуль', 'страницы)'], 16)
    s.arrow([(180, 255), (255, 255)])
    s.add(text_lines(217, 235, ['HTTPS,', 'JSON'], 13))
    s.process(255, 155, 180, 200, ['Общие проверки:', 'сессия, CSRF,', 'пользователь', 'и права,', '2FA сотрудника'], 16)
    layers = [
        ('routes.js', ['Маршрут:', 'адрес и метод,', 'проверка права']),
        ('transfer.controller.js', ['Контроллер:', 'разбор запроса,', 'ответ JSON']),
        ('transfer.service.js', ['Сервис:', 'бизнес-правила,', 'транзакции']),
        ('transfer.model.js', ['Модель:', 'SQL-запросы,', 'плейсхолдеры'])
    ]
    x = 490
    for file, lines in layers:
        s.process(x, 155, 160, 200, lines, 16)
        s.add(text_lines(x + 80, 336, [file], 13))
        s.arrow([(x - 20, 255), (x, 255)])
        x += 180
    s.process(1200, 175, 125, 160, ['База', 'данных', 'MySQL 8'], 16)
    s.arrow([(x - 20, 255), (1200, 255)])
    s.arrow([(435, 255), (490, 255)])
    # сервис двойной записи и общие подсистемы используются сервисами и моделями
    s.process(140, 470, 540, 86, ['Сервис двойной записи ledger:', 'каждая денежная операция - проводки Дт/Кт', 'одним документом в одной транзакции'], 16)
    s.arrow([(410, 470), (410, 430), (900, 430), (900, 355)])
    s.process(760, 470, 560, 86, ['Общие подсистемы server/shared:', 'деньги в копейках, номер IBAN, шифрование,', 'одноразовые коды, банковская дата, проверки полей'], 16)
    s.arrow([(1090, 470), (1090, 355)])
    s.save('arch-layers.svg')


def flow():
    """Блок-схема алгоритма перевода клиенту банка (основа чертежа 5.2)."""
    W, H = 980, 1930
    s = Svg(W, H)
    cx = 330            # ось основного потока
    kx = 680            # ось ветки подтверждения кодом
    ex = 890            # ось ветки отказа
    dw, dh = 330, 110   # размер ромба
    fails = []          # высоты, на которых ветки приходят в линию отказа

    y = 30
    s.terminator(cx - 90, y, 180, 50, ['Начало'])
    s.arrow([(cx, y + 50), (cx, y + 86)]); y += 86
    s.data(cx - 170, y, 340, 70, ['Ввод: счёт списания, счёт', 'получателя, сумма, комментарий'])
    s.arrow([(cx, y + 70), (cx, y + 106)]); y += 106
    s.process(cx - 170, y, 340, 64, ['Проверка счетов: принадлежность,', 'статус, контроль номера IBAN'])
    s.arrow([(cx, y + 64), (cx, y + 104)]); y += 104

    def decide(yy, lines, yes_right):
        """Ромб на основной оси; одна ветка уходит вправо, вторая вниз. Возвращает центр."""
        dc = yy + dh / 2
        s.decision(cx, dc, dw, dh, lines)
        right, down = ('да', 'нет') if yes_right else ('нет', 'да')
        s.arrow([(cx + dw / 2, dc), (ex, dc)], right, cx + dw / 2 + 10, dc - 10)
        fails.append(dc)
        s.arrow([(cx, dc + dh / 2), (cx, dc + dh / 2 + 40)], down, cx + 8, dc + dh / 2 + 26)
        return dc

    dc = decide(y, ['Данные', 'корректны?'], False)
    y = dc + dh / 2 + 40
    s.process(cx - 150, y, 300, 64, ['Пересчёт суммы в BYN', 'по курсу Нацбанка'])
    s.arrow([(cx, y + 64), (cx, y + 104)]); y += 104
    dc = decide(y, ['Суточный лимит', 'превышен?'], True)
    y = dc + dh / 2 + 40
    s.process(cx - 150, y, 300, 64, ['Оценка риска: сумма', 'баллов правил антифрода'])
    s.arrow([(cx, y + 64), (cx, y + 104)]); y += 104

    # антифрод: задержанный перевод уходит специалисту, алгоритм завершается
    dcA = y + dh / 2
    s.decision(cx, dcA, dw, dh, ['Баллы не ниже', 'порога проверки?'])
    s.process(kx - 145, dcA - 43, 290, 86, ['Резерв суммы (холд),', 'случай в очередь специалиста', 'по мониторингу'])
    s.arrow([(cx + dw / 2, dcA), (kx - 145, dcA)], 'да', cx + dw / 2 + 8, dcA - 14)
    s.terminator(kx - 110, dcA + 83, 220, 50, ['Ожидание решения'])
    s.arrow([(kx, dcA + 43), (kx, dcA + 83)])
    s.arrow([(cx, dcA + dh / 2), (cx, dcA + 145)], 'нет', cx + 8, dcA + dh / 2 + 26)

    # подтверждение кодом
    dcK = dcA + 145 + dh / 2
    s.decision(cx, dcK, dw + 20, dh, ['Нужен код: сумма или', 'баллы не ниже порога?'])
    joinY = dcK + dh / 2 + 220
    s.arrow([(cx, dcK + dh / 2), (cx, joinY)], 'нет', cx + 8, dcK + dh / 2 + 26)
    s.process(kx - 140, dcK - 32, 280, 64, ['Отправка одноразового', 'кода, ввод кода'])
    s.arrow([(cx + (dw + 20) / 2, dcK), (kx - 140, dcK)], 'да', cx + (dw + 20) / 2 + 8, dcK - 14)
    vdc = dcK + 32 + 44 + 48
    s.decision(kx, vdc, 300, 96, ['Код верен', '(до трёх попыток)?'])
    s.arrow([(kx, dcK + 32), (kx, vdc - 48)])
    s.arrow([(kx - 150, vdc), (cx + 60, vdc), (cx + 60, joinY)], 'да', kx - 190, vdc - 12)
    s.arrow([(kx + 150, vdc), (ex, vdc)], 'нет', kx + 155, vdc - 10)
    fails.append(vdc)

    y = joinY
    s.predefined(cx - 170, y, 340, 110, ['Транзакция: блокировка строк,', 'повторная проверка лимита', 'и остатка, проводки двойной', 'записи, комиссия банку'])
    s.arrow([(cx, y + 110), (cx, y + 150)]); y += 150
    dc = decide(y, ['Проводка', 'выполнена?'], False)
    y = dc + dh / 2 + 40
    s.process(cx - 170, y, 340, 70, ['Отметка «проведён», уведомления', 'сторонам, запись в журнал аудита'])
    s.arrow([(cx, y + 70), (cx, y + 106)]); y += 106
    s.terminator(cx - 90, y, 180, 50, ['Конец'])

    # линия отказа: от первой ветки вниз до сообщения об ошибке
    oy = y - 46
    s.add(f"<line x1='{ex}' y1='{min(fails)}' x2='{ex}' y2='{oy - 4}' stroke='{INK}' stroke-width='1.6'/>")
    s.arrow([(ex, oy - 8), (ex, oy)])
    s.data(ex - 145, oy, 290, 64, ['Сообщение об ошибке:', 'перевод не выполнен'])
    s.terminator(ex - 90, oy + 104, 180, 50, ['Конец'])
    s.arrow([(ex, oy + 64), (ex, oy + 104)])
    s.save('flow-transfer.svg')


if __name__ == '__main__':
    arch()
    flow()
