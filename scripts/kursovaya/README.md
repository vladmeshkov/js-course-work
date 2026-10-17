# Сборка docx для записки

Порядок: диаграммы (`npm run uml:classes`, `npm run uml:views`, `npm run er:drawio`) → PNG (`node svg2png.cjs вход.svg выход.png 2`, нужен playwright) → разделы → общий файл.

- `build_13.py шаблон.docx выход.docx` – дополнение к 1.3 (текст в `content_13.py`). Шаблон – docx черновика записки.
- `build_14.py выход.docx` – раздел 1.4 (основа `docs/kursovaya/src/er-part.docx`).
- `build_15.py выход.docx` – раздел 1.5.
- `split_tables.py вход.docx выход.docx` – «Продолжение таблицы X.X» и повтор шапки. Разбивка считается по PDF из LibreOffice, при правках запускайте заново (скрипт идемпотентен).
- `merge_zapiska.py черновик.docx выход.docx` – общий файл: разделы подставляются в оформление черновика, диаграмма вариантов использования выводится на альбомной странице.

Нужны `python-docx`, `Pillow`, `soffice` (LibreOffice) и `pdftotext` (poppler).
