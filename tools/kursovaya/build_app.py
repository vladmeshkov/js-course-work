#!/usr/bin/env python3
"""Приложения пояснительной записки в оформлении образца:
А (справочное) – отчёт о проверке на заимствования (рисунок вставляется после проверки, сейчас жёлтая пометка);
Б (обязательное) – листинг кода алгоритмов, реализующих основную бизнес-логику (фрагменты берутся из исходников);
В (обязательное) – листинг скрипта генерации базы данных (db/schema.sql, собирается `npm run db:schema`).
Код набран Courier New 10 пт, одинарный интервал; перенесённая часть длинной строки получает отступ.
Использование: python3 build_app.py [выход.docx]
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from build_2 import Doc, KURS

ROOT = os.path.abspath(os.path.join(KURS, '..', '..'))

# (подпись листинга, файл, функции по порядку)
LISTINGS = [
    ('Проведение документа двойной записи', 'server/modules/ledger/ledger.service.js', ['post', 'postInTransaction']),
    ('Подтверждение и проведение перевода', 'server/modules/transfers/transfer.service.js', ['checkDailyLimit', 'confirmTransfer', 'executeIntentIn']),
    ('Расчёт аннуитетного платежа и графика платежей по кредиту', 'server/modules/loans/schedule.js', ['annuityPayment', 'buildSchedule']),
    ('Скоринговая оценка заявки на кредит', 'server/modules/loans/scoring-card.js', ['scoreApplication']),
    ('Начисление процентов по вкладам', 'server/shared/interest.js', ['interestForPeriod']),
    ('Начисление процентов и закрытие вкладов при закрытии операционного дня', 'server/modules/deposits/deposit.service.js', ['processDeposits']),
    ('Досрочное закрытие вклада с перерасчётом процентов', 'server/modules/deposits/deposit.service.js', ['quoteEarlyClose', 'closeEarly']),
    ('Закрытие операционного дня', 'server/modules/admin/eod.service.js', ['closeDay']),
]


def extract(path, name):
    """Функция вместе с JSDoc-комментарием над ней: от «/**» до закрывающей скобки тела."""
    lines = open(os.path.join(ROOT, path), encoding='utf-8').read().split('\n')
    start = next(i for i, l in enumerate(lines) if re.match(rf'(export )?(async )?function {name}\b', l))
    top = start
    if lines[start - 1].strip() == '*/':
        top = start - 1
        while not lines[top].strip().startswith('/**'):
            top -= 1
    depth, seen, end = 0, False, start
    for i in range(start, len(lines)):
        # строки и регулярные выражения в этих функциях не содержат фигурных скобок
        depth += lines[i].count('{') - lines[i].count('}')
        seen = seen or '{' in lines[i]
        if seen and depth == 0:
            end = i
            break
    return lines[top:end + 1]


class App(Doc):
    def heading(self, letter, kind, title, first=False):
        h = self._p('Heading 1')
        h.alignment = WD_ALIGN_PARAGRAPH.CENTER
        h.paragraph_format.first_line_indent = Cm(0)
        h.paragraph_format.left_indent = Cm(0)
        if not first:
            h.paragraph_format.page_break_before = True
        h.add_run(f'ПРИЛОЖЕНИЕ {letter}')
        for t in (f'({kind})', title):
            p = self._p('No Spacing'); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.add_run(t)
        self.empty('No Spacing')

    def code(self, lines):
        for line in lines:
            p = self._p('No Spacing')
            p.paragraph_format.left_indent = Cm(0.8)
            p.paragraph_format.first_line_indent = Cm(-0.8)
            r = p.add_run(line.replace('\t', '  ') if line else '')
            r.font.name = 'Courier New'; r.font.size = Pt(10)
            r._r.get_or_add_rPr().get_or_add_rFonts().set(qn('w:cs'), 'Courier New')


def build(out):
    b = App(chap=0)
    b.heading('А', 'справочное', 'Отчёт о проверке на заимствования в системе «Антиплагиат»', first=True)
    note = b._p('Normal'); note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = note.add_run('[Вставить снимок отчёта о проверке после проверки работы преподавателем]')
    r.font.highlight_color = WD_COLOR_INDEX.YELLOW
    b.empty('No Spacing')
    c = b._p('No Spacing'); c.alignment = WD_ALIGN_PARAGRAPH.CENTER; c.add_run('Рисунок А.1 – Результат проверки на заимствования')

    b.heading('Б', 'обязательное', 'Листинг кода алгоритмов, реализующих основную бизнес-логику')
    for n, (title, path, names) in enumerate(LISTINGS, 1):
        if n > 1:
            b.empty('No Spacing')
        cap = b._p('No Spacing'); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cap.paragraph_format.keep_with_next = True
        cap.add_run(f'Листинг Б.{n} – {title}')
        b.empty('No Spacing').paragraph_format.keep_with_next = True
        body = []
        for k, name in enumerate(names):
            if k:
                body.append('')
            body += extract(path, name)
        b.code(body)

    b.heading('В', 'обязательное', 'Листинг скрипта генерации базы данных')
    sql = open(os.path.join(ROOT, 'db', 'schema.sql'), encoding='utf-8').read().rstrip('\n').split('\n')
    sql[0] = '-- Полный скрипт создания базы данных (MySQL 8)'
    b.code(sql)
    b.save(out)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KURS, 'prilozheniya.docx')
    build(out)
    print(out)
