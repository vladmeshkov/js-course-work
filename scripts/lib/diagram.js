// Универсальные UML-диаграммы: одно описание, два вывода (SVG для записки и файл draw.io).
// Оформление: белые фигуры, чёрные линии, шрифт Times New Roman, как в диаграммах классов.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const FONT = 'Times New Roman';
export const FS = 16;                 // основной размер шрифта
const LH = 19;                        // высота строки

const lines = (t) => String(t).split('\n');
export const textWidth = (t, size = FS) => Math.max(...lines(t).map((l) => l.length)) * size * 0.52;

export class Diagram {
  constructor(name) {
    this.name = name;
    this.items = [];
    this.pad = 40;
  }

  add(item) { this.items.push(item); return item; }

  /** Прямоугольник (round: радиус скругления). Текст по центру, многострочный через \n. */
  rect(o) { return this.add({ t: 'rect', fill: '#fff', stroke: '#000', size: FS, round: 0, ...o }); }
  ellipse(o) { return this.add({ t: 'ellipse', fill: '#fff', stroke: '#000', size: FS, ...o }); }
  diamond(o) { return this.add({ t: 'diamond', fill: '#fff', stroke: '#000', size: FS, ...o }); }
  /** Начальное (kind 'start') и конечное ('end') состояние. */
  mark(o) { return this.add({ t: 'mark', r: 10, ...o }); }
  actor(o) { return this.add({ t: 'actor', ...o }); }
  text(o) { return this.add({ t: 'text', size: FS, anchor: 'start', ...o }); }
  /** Рамка: граница системы, дорожка, пакет. title рисуется сверху слева (или по центру: center). */
  frame(o) { return this.add({ t: 'frame', fill: 'none', stroke: '#666', dashed: true, size: FS, ...o }); }
  /** Узел развёртывания (параллелепипед). */
  node(o) { return this.add({ t: 'node', fill: '#fff', stroke: '#000', size: FS, ...o }); }
  /** Компонент UML. */
  component(o) { return this.add({ t: 'component', fill: '#fff', stroke: '#000', size: FS, ...o }); }
  /** Линия по ломаной. arrow: 'open' | 'filled' | 'hollow' | null; label: подпись; at: положение подписи. */
  line(o) { return this.add({ t: 'line', arrow: 'open', ...o }); }

  /* ---------- границы ---------- */
  bounds() {
    let w = 0; let h = 0;
    const grow = (x, y) => { w = Math.max(w, x); h = Math.max(h, y); };
    for (const i of this.items) {
      if (i.t === 'ellipse') grow(i.cx + i.rx, i.cy + i.ry);
      else if (i.t === 'diamond') grow(i.cx + i.w / 2, i.cy + i.h / 2);
      else if (i.t === 'mark') grow(i.cx + i.r, i.cy + i.r);
      else if (i.t === 'actor') grow(i.cx + 40, i.y + 100);
      else if (i.t === 'text') grow(i.x + (i.anchor === 'middle' ? textWidth(i.text, i.size) / 2 : textWidth(i.text, i.size)), i.y + 6);
      else if (i.t === 'line') { for (const p of i.pts) grow(p[0], p[1]); if (i.label) { const l = this.labelPos(i); grow(l.x + (l.anchor === 'start' ? textWidth(i.label, i.size ?? FS) : textWidth(i.label, i.size ?? FS) / 2), l.y + 6); } }
      else grow(i.x + i.w + (i.t === 'node' ? 16 : 0), i.y + i.h);
    }
    return { w: Math.ceil(w + this.pad), h: Math.ceil(h + this.pad) };
  }

  labelPos(l) {
    if (l.at) return { anchor: 'middle', ...l.at };
    const pts = l.pts; let best = 0; let len = -1;
    pts.slice(1).forEach((p, i) => { const d = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]); if (d > len) { len = d; best = i; } });
    const a = pts[best]; const b = pts[best + 1];
    const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
    const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
    return vertical ? { x: mx + 8, y: my + 5, anchor: 'start' } : { x: mx, y: my - 7, anchor: 'middle' };
  }

  /* ---------- SVG ---------- */
  svg() {
    const { w, h } = this.bounds();
    const o = [];
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}, serif">`);
    o.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    const order = ['frame', 'node', 'component', 'rect', 'ellipse', 'diamond', 'mark', 'actor'];
    for (const kind of ['frame']) for (const i of this.items) if (i.t === kind) o.push(this.itemSvg(i));
    for (const i of this.items) if (i.t === 'line') o.push(this.itemSvg(i));
    for (const i of this.items) if (i.t !== 'frame' && i.t !== 'line') o.push(this.itemSvg(i));
    void order;
    o.push('</svg>');
    return o.join('\n');
  }

  multi(text, cx, cy, size, extra = '') {
    const ls = lines(text);
    const y0 = cy - ((ls.length - 1) * LH) / 2 + size * 0.34;
    return ls.map((l, k) => `<text x="${cx}" y="${y0 + k * LH}" font-size="${size}" text-anchor="middle"${extra}>${esc(l)}</text>`).join('');
  }

  itemSvg(i) {
    const dash = i.dashed ? ' stroke-dasharray="6 4"' : '';
    switch (i.t) {
      case 'rect': return `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${i.round}" fill="${i.fill}" stroke="${i.stroke}"${dash}/>${i.text ? this.multi(i.text, i.x + i.w / 2, i.y + i.h / 2, i.size, i.bold ? ' font-weight="bold"' : '') : ''}`;
      case 'ellipse': return `<ellipse cx="${i.cx}" cy="${i.cy}" rx="${i.rx}" ry="${i.ry}" fill="${i.fill}" stroke="${i.stroke}"${dash}/>${i.text ? this.multi(i.text, i.cx, i.cy, i.size) : ''}`;
      case 'diamond': return `<polygon points="${i.cx},${i.cy - i.h / 2} ${i.cx + i.w / 2},${i.cy} ${i.cx},${i.cy + i.h / 2} ${i.cx - i.w / 2},${i.cy}" fill="${i.fill}" stroke="${i.stroke}"/>${i.text ? this.multi(i.text, i.cx, i.cy, i.size) : ''}`;
      case 'mark': return i.kind === 'start'
        ? `<circle cx="${i.cx}" cy="${i.cy}" r="${i.r}" fill="#000"/>`
        : `<circle cx="${i.cx}" cy="${i.cy}" r="${i.r}" fill="#fff" stroke="#000"/><circle cx="${i.cx}" cy="${i.cy}" r="${i.r - 4}" fill="#000"/>`;
      case 'actor': {
        const { cx, y } = i;
        return `<circle cx="${cx}" cy="${y + 11}" r="11" fill="#fff" stroke="#000"/><path d="M${cx},${y + 22} V${y + 52} M${cx - 18},${y + 32} H${cx + 18} M${cx},${y + 52} L${cx - 14},${y + 74} M${cx},${y + 52} L${cx + 14},${y + 74}" stroke="#000" fill="none"/>${this.multi(i.name, cx, y + 92, FS, ' font-weight="bold"')}`;
      }
      case 'text': return `<text x="${i.x}" y="${i.y}" font-size="${i.size}" text-anchor="${i.anchor}"${i.italic ? ' font-style="italic"' : ''}${i.bold ? ' font-weight="bold"' : ''}>${esc(i.text)}</text>`;
      case 'frame': {
        let s = `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" fill="${i.fill}" stroke="${i.stroke}"${dash}/>`;
        if (i.title) s += i.center ? `<text x="${i.x + i.w / 2}" y="${i.y + 22}" font-size="${i.size}" font-weight="bold" text-anchor="middle">${esc(i.title)}</text>` : `<text x="${i.x + 10}" y="${i.y + 22}" font-size="${i.size}" font-weight="bold">${esc(i.title)}</text>`;
        return s;
      }
      case 'node': return `<polygon points="${i.x},${i.y} ${i.x + 16},${i.y - 14} ${i.x + i.w + 16},${i.y - 14} ${i.x + i.w + 16},${i.y + i.h - 14} ${i.x + i.w},${i.y + i.h} ${i.x},${i.y + i.h}" fill="${i.fill}" stroke="${i.stroke}"/><path d="M${i.x},${i.y} H${i.x + i.w} V${i.y + i.h} M${i.x + i.w},${i.y} L${i.x + i.w + 16},${i.y - 14}" fill="none" stroke="#000"/>${i.title ? `<text x="${i.x + 10}" y="${i.y + 22}" font-size="${i.size}" font-weight="bold">${esc(i.title)}</text>` : ''}${i.text ? this.multi(i.text, i.x + i.w / 2, i.y + i.h / 2 + (i.title ? 12 : 0), i.size) : ''}`;
      case 'component': return `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" fill="${i.fill}" stroke="${i.stroke}"/><rect x="${i.x - 9}" y="${i.y + 10}" width="18" height="9" fill="#fff" stroke="#000"/><rect x="${i.x - 9}" y="${i.y + 24}" width="18" height="9" fill="#fff" stroke="#000"/>${this.multi(i.text, i.x + i.w / 2 + 6, i.y + i.h / 2, i.size)}`;
      case 'line': return this.lineSvg(i);
      default: return '';
    }
  }

  lineSvg(l) {
    const p = l.pts;
    let s = `<path d="${p.map((q, k) => `${k ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ')}" fill="none" stroke="#000"${l.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    const head = (a, b, kind) => {
      const dx = b[0] - a[0]; const dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; const ux = dx / d; const uy = dy / d;
      const L1 = [b[0] - ux * 12 - uy * 5, b[1] - uy * 12 + ux * 5]; const L2 = [b[0] - ux * 12 + uy * 5, b[1] - uy * 12 - ux * 5];
      if (kind === 'filled') return `<polygon points="${b[0]},${b[1]} ${L1[0]},${L1[1]} ${L2[0]},${L2[1]}" fill="#000" stroke="#000"/>`;
      if (kind === 'hollow') return `<polygon points="${b[0]},${b[1]} ${L1[0]},${L1[1]} ${L2[0]},${L2[1]}" fill="#fff" stroke="#000"/>`;
      return `<polyline points="${L1[0]},${L1[1]} ${b[0]},${b[1]} ${L2[0]},${L2[1]}" fill="none" stroke="#000"/>`;
    };
    if (l.arrow) s += head(p[p.length - 2], p[p.length - 1], l.arrow);
    if (l.startArrow) s += head(p[1], p[0], l.startArrow);
    if (l.label) {
      const pos = this.labelPos(l); const size = l.size ?? FS; const w = textWidth(l.label, size) + 8;
      const ls = lines(l.label);
      const rx = pos.anchor === 'middle' ? pos.x - w / 2 : pos.anchor === 'end' ? pos.x - w + 3 : pos.x - 3;
      s += `<rect x="${rx}" y="${pos.y - size}" width="${w}" height="${ls.length * LH + 3}" fill="#fff" opacity="0.92"/>`;
      s += ls.map((t, k) => `<text x="${pos.x}" y="${pos.y + k * LH}" font-size="${size}" text-anchor="${pos.anchor}"${l.italic === false ? '' : ' font-style="italic"'}>${esc(t)}</text>`).join('');
    }
    return s;
  }

  /* ---------- draw.io ---------- */
  drawio() {
    let n = 1;
    const cells = [];
    const add = (value, style, x, y, w, h) => { const id = `d${++n}`; cells.push(`<mxCell id="${id}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`); return id; };
    const base = (size, extra = '') => `html=1;whiteSpace=wrap;fontFamily=${FONT};fontSize=${size};${extra}`;
    const html = (t) => lines(t).map(esc).join('<br>');
    const items = [...this.items.filter((i) => i.t === 'frame'), ...this.items.filter((i) => i.t !== 'frame' && i.t !== 'line')];
    for (const i of items) {
      switch (i.t) {
        case 'rect': add(html(i.text ?? ''), base(i.size, `rounded=${i.round ? 1 : 0};arcSize=${Math.min(50, Math.round(i.round * 100 / Math.min(i.w, i.h)))};fillColor=${i.fill};strokeColor=${i.stroke};${i.dashed ? 'dashed=1;' : ''}${i.bold ? 'fontStyle=1;' : ''}`), i.x, i.y, i.w, i.h); break;
        case 'ellipse': add(html(i.text ?? ''), base(i.size, `ellipse;fillColor=${i.fill};strokeColor=${i.stroke};`), i.cx - i.rx, i.cy - i.ry, i.rx * 2, i.ry * 2); break;
        case 'diamond': add(html(i.text ?? ''), base(i.size, `rhombus;fillColor=${i.fill};strokeColor=${i.stroke};`), i.cx - i.w / 2, i.cy - i.h / 2, i.w, i.h); break;
        case 'mark': add('', i.kind === 'start' ? 'ellipse;fillColor=#000000;strokeColor=#000000;html=1;' : 'ellipse;shape=endState;fillColor=#000000;strokeColor=#000000;html=1;', i.cx - i.r, i.cy - i.r, i.r * 2, i.r * 2); break;
        case 'actor': add(`<b>${html(i.name)}</b>`, base(FS, 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;'), i.cx - 14, i.y, 28, 74); break;
        case 'text': add(html(i.text), base(i.size, `text;strokeColor=none;fillColor=none;align=${i.anchor === 'middle' ? 'center' : i.anchor === 'end' ? 'right' : 'left'};verticalAlign=middle;${i.italic ? 'fontStyle=2;' : ''}${i.bold ? 'fontStyle=1;' : ''}`), i.anchor === 'middle' ? i.x - 150 : i.anchor === 'end' ? i.x - 300 : i.x, i.y - 12, 300, 22); break;
        case 'frame': add(i.title ? `<b>${esc(i.title)}</b>` : '', base(i.size, `rounded=0;fillColor=none;strokeColor=${i.stroke};dashed=1;verticalAlign=top;align=${i.center ? 'center' : 'left'};spacingLeft=10;spacingTop=2;`), i.x, i.y, i.w, i.h); break;
        case 'node': add((i.title ? `<b>${esc(i.title)}</b><br>` : '') + html(i.text ?? ''), base(i.size, `shape=cube;size=16;darkOpacity=0;fillColor=${i.fill};strokeColor=${i.stroke};verticalAlign=top;`), i.x, i.y - 14, i.w + 16, i.h + 14); break;
        case 'component': add(html(i.text), base(i.size, `shape=module;align=center;fillColor=${i.fill};strokeColor=${i.stroke};jettyWidth=18;jettyHeight=9;`), i.x - 9, i.y, i.w + 9, i.h); break;
        default: break;
      }
    }
    for (const l of this.items.filter((x) => x.t === 'line')) {
      const [first, ...rest] = l.pts; const last = rest.pop();
      const end = l.arrow === 'filled' ? 'endArrow=block;endFill=1;' : l.arrow === 'hollow' ? 'endArrow=block;endFill=0;' : l.arrow === 'open' ? 'endArrow=open;endFill=0;' : 'endArrow=none;';
      const start = l.startArrow === 'filled' ? 'startArrow=block;startFill=1;' : l.startArrow === 'open' ? 'startArrow=open;startFill=0;' : '';
      const style = `html=1;rounded=0;strokeColor=#000000;${end}${start}${l.dashed ? 'dashed=1;' : ''}`;
      const id = `d${++n}`;
      cells.push(`<mxCell id="${id}" value="" style="${esc(style)}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${first[0]}" y="${first[1]}" as="sourcePoint"/><mxPoint x="${last[0]}" y="${last[1]}" as="targetPoint"/>${rest.length ? `<Array as="points">${rest.map((p) => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('')}</Array>` : ''}</mxGeometry></mxCell>`);
      if (l.label) {
        const pos = this.labelPos(l); const size = l.size ?? FS; const w = Math.ceil(textWidth(l.label, size) + 10); const h = lines(l.label).length * LH + 4;
        const x = pos.anchor === 'middle' ? Math.round(pos.x - w / 2) : pos.anchor === 'end' ? pos.x - w + 3 : pos.x - 3;
        add(html(l.label), base(size, `text;fillColor=#FFFFFF;strokeColor=none;spacing=0;align=${pos.anchor === 'middle' ? 'center' : pos.anchor === 'end' ? 'right' : 'left'};verticalAlign=middle;${l.italic === false ? '' : 'fontStyle=2;'}`), x, pos.y - size, w, h);
      }
    }
    const { w, h } = this.bounds();
    return `<diagram name="${esc(this.name)}" id="${esc(this.name.replace(/\W+/g, '_'))}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`;
  }
}
