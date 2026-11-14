// PDF (A1, 841x594 мм) и PNG-превью для листов графической части из docs/kursovaya/chertezhi/*.svg.
// Использование: node sheets2pdf.cjs   (playwright из /opt/node-tools или из проекта)
const path = require('path');
const fs = require('fs');
let pw; try { pw = require('/opt/node-tools/node_modules/playwright'); } catch { pw = require('playwright'); }
const dir = path.join(__dirname, '..', '..', 'docs', 'kursovaya', 'chertezhi');
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport: { width: 3179, height: 2245 } });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.svg'))) {
    const base = path.join(dir, f.replace('.svg', ''));
    await p.goto('file://' + path.join(dir, f));
    await p.pdf({ path: base + '.pdf', width: '841mm', height: '594mm', printBackground: true, pageRanges: '1' });
    await p.screenshot({ path: base + '.png' });
    console.log(f);
  }
  await b.close();
})();
