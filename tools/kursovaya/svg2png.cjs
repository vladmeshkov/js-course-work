// SVG -> PNG для вставки в docx. Использование: node svg2png.cjs вход.svg выход.png [масштаб]
// Нужен playwright (PLAYWRIGHT_MODULE – путь к модулю, по умолчанию /opt/node-tools/node_modules/playwright) и Chromium.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const svg = fs.readFileSync(process.argv[2], 'utf8');
  const m = svg.match(/width="(\d+)" height="(\d+)"/);
  const p = await b.newPage({ viewport: { width: +m[1], height: +m[2] }, deviceScaleFactor: +(process.argv[4] || 1) });
  await p.setContent('<html><body style="margin:0">' + svg + '</body></html>');
  await p.screenshot({ path: process.argv[3] });
  await b.close();
})();
