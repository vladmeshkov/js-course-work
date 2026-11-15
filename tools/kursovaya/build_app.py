#!/usr/bin/env python3
"""Приложения пояснительной записки в оформлении образца:
А (обязательное) – отчёт о проверке на заимствования (рисунок вставляется после проверки, сейчас жёлтая пометка);
Б (обязательное) – листинги алгоритмов, для которых в разделе 2.4 приведены схемы (перевод, кредиты, вклады);
В (обязательное) – операторы CREATE TABLE 14 таблиц ER-диаграммы (рисунок 1.10) (из db/schema.sql, `npm run db:schema`).
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
    ('Перевод клиенту банка', 'server/modules/transfers/transfer.service.js', ['createTransfer', 'confirmTransfer', 'executeIntentIn']),
    ('Обслуживание кредитов при закрытии операционного дня', 'server/modules/loans/loan.service.js', ['canPay', 'chargeInstallment', 'processLoans']),
    ('Начисление процентов и возврат вкладов', 'server/modules/deposits/deposit.service.js', ['processDeposits']),
]
# таблицы ER-диаграммы (рисунок 1.10) – в приложение В идут только они
ER_TABLES = ['roles', 'users', 'clients', 'accounts', 'documents', 'postings', 'transfer_intents', 'payments', 'cards',
             'deposit_products', 'deposits', 'loan_products', 'loan_applications', 'loans']


def er_tables_sql():
    """Операторы CREATE TABLE таблиц ER-диаграммы в порядке скрипта db/schema.sql (с комментарием над таблицей).
    Внешние ключи на справочники, которых нет на диаграмме (валюты, поставщики услуг), опускаются, чтобы листинг
    был согласован сам с собой; полный скрипт собирается командой npm run db:schema."""
    lines = open(os.path.join(ROOT, 'db', 'schema.sql'), encoding='utf-8').read().split('\n')
    out = ['-- Основные таблицы базы данных (MySQL 8), соответствуют ER-диаграмме на рисунке 1.10.',
           '-- Справочники и вспомогательные таблицы приведены в полном скрипте db/schema.sql.', '']
    i = 0
    while i < len(lines):
        m = re.match(r'CREATE TABLE (\w+) \(', lines[i])
        if m and m.group(1) in ER_TABLES:
            top = i
            while top > 0 and lines[top - 1].startswith('--') and not re.match(r'-- \d{3}_', lines[top - 1]):
                top -= 1
            end = i
            while not lines[end].rstrip().endswith(');'):
                end += 1
            body = [l for l in lines[i + 1:end]
                    if not ((r := re.search(r'REFERENCES (\w+)', l)) and r.group(1) not in ER_TABLES)]
            body = [l for l in body if l.strip()]
            # последняя строка перед «);» без запятой
            while body and body[-1].lstrip().startswith('--'):
                body.pop()
            body[-1] = body[-1].rstrip().rstrip(',')
            out += lines[top:i + 1] + body + [lines[end]] + ['']
            i = end
        i += 1
    return out[:-1]



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
    b.heading('А', 'обязательное', 'Отчёт о проверке на заимствования в системе «Антиплагиат»', first=True)
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

    b.heading('В', 'обязательное', 'Листинг скрипта генерации основных таблиц базы данных')
    b.code(er_tables_sql())
    b.save(out)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KURS, 'prilozheniya.docx')
    build(out)
    print(out)
