import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONT = path.join(root, 'assets/fonts/DejaVuSans.ttf');
const FONT_BOLD = path.join(root, 'assets/fonts/DejaVuSans-Bold.ttf');
const EMBLEM = path.join(root, 'public/img/emblem.png');
const ACCENT = '#C4490F';
const MUTED = '#6D7581';

/**
 * Создаёт PDF-документ с шапкой банка. Потом документ нужно направить в поток (doc.pipe(res)) и закончить doc.end().
 * @param {string} title заголовок документа
 * @param {string} [subtitle]
 */
export function createDocument(title, subtitle) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: title, Author: 'ТалерБанк' } });
  doc.registerFont('regular', FONT);
  doc.registerFont('bold', FONT_BOLD);
  doc.font('regular');
  doc.image(EMBLEM, 50, 44, { width: 36 });
  doc.font('bold').fontSize(16).fillColor('#151A21').text('ТалерБанк', 94, 50);
  doc.font('regular').fontSize(9).fillColor(MUTED).text('Дистанционное банковское обслуживание', 94, 70);
  doc.moveTo(50, 92).lineTo(545, 92).strokeColor(ACCENT).lineWidth(1.5).stroke();
  doc.y = 110;
  doc.x = 50;
  doc.font('bold').fontSize(18).fillColor('#151A21').text(title);
  if (subtitle) doc.font('regular').fontSize(10).fillColor(MUTED).text(subtitle);
  doc.moveDown(0.8);
  doc.fillColor('#151A21');
  return doc;
}

/** Пара «подпись: значение» на одной строке. */
export function fact(doc, label, value) {
  const y = doc.y;
  doc.font('regular').fontSize(10).fillColor(MUTED).text(label, 50, y, { width: 150, continued: false });
  doc.font('bold').fontSize(10).fillColor('#151A21').text(String(value), 205, y, { width: 340 });
  doc.moveDown(0.3);
}

/**
 * Таблица с фиксированными колонками.
 * @param {PDFKit.PDFDocument} doc
 * @param {Array<{title:string, width:number, align?:'left'|'right'}>} columns
 * @param {Array<Array<string>>} rows
 */
export function table(doc, columns, rows) {
  const left = 50;
  const drawRow = (cells, header) => {
    const y = doc.y;
    const heights = cells.map((text, i) => doc.heightOfString(String(text), { width: columns[i].width - 8, align: columns[i].align }));
    const h = Math.max(...heights) + 8;
    if (y + h > doc.page.height - 70) {
      doc.addPage();
      doc.y = 60;
      return drawRow(columns.map((c) => c.title), true);
    }
    let x = left;
    cells.forEach((text, i) => {
      doc.font(header ? 'bold' : 'regular').fontSize(header ? 9 : 9.5).fillColor(header ? MUTED : '#151A21')
        .text(String(text), x, y + 4, { width: columns[i].width - 8, align: columns[i].align ?? 'left' });
      x += columns[i].width;
    });
    doc.moveTo(left, y + h).lineTo(545, y + h).strokeColor('#E3E6EA').lineWidth(0.5).stroke();
    doc.y = y + h;
  };
  drawRow(columns.map((c) => c.title), true);
  rows.forEach((r) => drawRow(r, false));
}

/** Нижняя строка документа. */
export function footer(doc, text) {
  doc.moveDown(1.2);
  doc.font('regular').fontSize(8.5).fillColor(MUTED).text(text, 50, doc.y, { width: 495 });
}
