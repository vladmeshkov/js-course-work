// Диаграмма классов UML: одно описание, два вывода: файл draw.io и SVG (для вставки в записку).
// Оформление по образцу учебных диаграмм: белые прямоугольники, три отсека, тонкие чёрные линии, шрифт Times New Roman.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = 'Times New Roman';
const ROW = 21;
const CHAR = 7.7;
const F_NAME = 17, F_MEMBER = 14, F_STEREO = 14, F_MARK = 14, F_PKG = 16;

export class ClassDiagram {
  constructor(name, { width = 1600, height = 1200, title = '' } = {}) {
    this.name = name; this.width = width; this.height = height; this.title = title;
    this.classes = []; this.packages = []; this.edges = []; this.labels = [];
  }

  /** Класс: name, stereotype, fields[], methods[], позиция x, y (левый верхний угол). */
  addClass(c) {
    const lines = [c.name, ...(c.fields ?? []), ...(c.methods ?? [])];
    const noFields = c.fields === null;
    const w = Math.max(c.w ?? 0, Math.ceil(Math.max(...lines.map((l) => l.length)) * CHAR + 24));
    const head = c.stereotype ? 50 : 34;
    const fh = noFields ? 0 : Math.max((c.fields ?? []).length, 1) * ROW + 8;
    const noMethods = c.methods === null;
    const mh = noMethods ? 0 : Math.max((c.methods ?? []).length, 1) * ROW + 8;
    const box = { ...c, noFields, fields: c.fields ?? [], methods: c.methods ?? [], w, head, fh, mh, h: head + fh + mh };
    this.classes.push(box);
    return box;
  }

  addPackage(p) { this.packages.push(p); return p; }

  /** Связь по ломаной. kind: association | aggregation | composition | dependency. */
  addEdge(e) { this.edges.push(e); }

  label(text, x, y, opts = {}) { this.labels.push({ text, x, y, ...opts }); }

  /* ---------- SVG ---------- */
  svg() {
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" font-family="${FONT}, serif">`);
    out.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    for (const p of this.packages) {
      const tw = Math.max(140, p.title.length * 9 + 24), tx = p.x + (p.w - tw) / 2;
      out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fafafa" stroke="#666" stroke-dasharray="6 4"/>`);
      out.push(`<rect x="${tx}" y="${p.y - 26}" width="${tw}" height="26" fill="#fafafa" stroke="#666"/>`);
      out.push(`<text x="${tx + tw / 2}" y="${p.y - 8}" font-size="${F_PKG}" font-weight="bold" text-anchor="middle">${esc(p.title)}</text>`);
    }
    for (const e of this.edges) out.push(this.edgeSvg(e));
    for (const c of this.classes) {
      out.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="#fff" stroke="#000" stroke-width="1"/>`);
      let ty = c.y + 23;
      if (c.stereotype) { out.push(`<text x="${c.x + c.w / 2}" y="${c.y + 19}" font-size="${F_STEREO}" text-anchor="middle">${esc(`«${c.stereotype}»`)}</text>`); ty = c.y + 40; }
      out.push(`<text x="${c.x + c.w / 2}" y="${ty}" font-size="${F_NAME}" font-weight="bold" text-anchor="middle"${c.abstract ? ' font-style="italic"' : ''}>${esc(c.name)}</text>`);
      out.push(`<line x1="${c.x}" y1="${c.y + c.head}" x2="${c.x + c.w}" y2="${c.y + c.head}" stroke="#000"/>`);
      c.fields.forEach((f, i) => out.push(`<text x="${c.x + 8}" y="${c.y + c.head + 16 + i * ROW}" font-size="${F_MEMBER}">${esc(f)}</text>`));
      if (c.methods !== null && (c.mh > 0)) {
        out.push(`<line x1="${c.x}" y1="${c.y + c.head + c.fh}" x2="${c.x + c.w}" y2="${c.y + c.head + c.fh}" stroke="#000"/>`);
        c.methods.forEach((m, i) => out.push(`<text x="${c.x + 8}" y="${c.y + c.head + c.fh + 16 + i * ROW}" font-size="${F_MEMBER}">${esc(m)}</text>`));
      }
    }
    for (const l of this.labels) out.push(`<text x="${l.x}" y="${l.y}" font-size="${l.size ?? F_MARK}" text-anchor="${l.anchor ?? 'start'}"${l.italic ? ' font-style="italic"' : ''}>${esc(l.text)}</text>`);
    if (this.title) out.push(`<text x="${this.width / 2}" y="${this.height - 14}" font-size="14" text-anchor="middle"></text>`);
    out.push('</svg>');
    return out.join('\n');
  }

  edgeSvg(e) {
    const pts = e.points;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
    let s = `<path d="${d}" fill="none" stroke="#000" stroke-width="1"${e.kind === 'dependency' ? ' stroke-dasharray="6 4"' : ''}/>`;
    const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    if (e.kind === 'aggregation' || e.kind === 'composition') {
      const [ux, uy] = dir(pts[0], pts[1]);
      const p0 = pts[0];
      const mid = [p0[0] + ux * 10, p0[1] + uy * 10], end = [p0[0] + ux * 20, p0[1] + uy * 20];
      const nx = -uy * 6, ny = ux * 6;
      s += `<polygon points="${p0[0]},${p0[1]} ${mid[0] + nx},${mid[1] + ny} ${end[0]},${end[1]} ${mid[0] - nx},${mid[1] - ny}" fill="${e.kind === 'composition' ? '#000' : '#fff'}" stroke="#000"/>`;
    }
    if ((e.kind === 'dependency' || e.arrow) && !e.noArrow) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const [ux, uy] = dir(a, b);
      const l = [b[0] - ux * 11 - uy * 5, b[1] - uy * 11 + ux * 5], r = [b[0] - ux * 11 + uy * 5, b[1] - uy * 11 - ux * 5];
      s += `<polyline points="${l[0]},${l[1]} ${b[0]},${b[1]} ${r[0]},${r[1]}" fill="none" stroke="#000"/>`;
    }
    s += this.verbSvg(e);
    for (const m of e.marks ?? []) s += `<text x="${m.x}" y="${m.y}" font-size="${F_MARK}" text-anchor="${m.anchor ?? 'start'}"${m.italic ? ' font-style="italic"' : ''}>${esc(m.text)}</text>`;
    return s;
  }

  /** Положение подписи действия: у самого длинного отрезка связи (или e.labelSeg). */
  verbPos(e) {
    const pts = e.points; let best = 0, len = -1;
    if (e.labelSeg !== undefined) best = e.labelSeg;
    else pts.slice(1).forEach((p, i) => { const l = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]); if (l > len) { len = l; best = i; } });
    const a = pts[best], b = pts[best + 1];
    const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    return vertical ? { x: mx + 8, y: e.labelY ?? my + 5, anchor: 'start' } : { x: mx, y: my + 19, anchor: 'middle' };
  }

  verbSvg(e) {
    if (!e.label) return '';
    const v = this.verbPos(e);
    const w = e.label.length * 6.6 + 8;
    const rx = v.anchor === 'middle' ? v.x - w / 2 : v.x - 3;
    return `<rect x="${rx}" y="${v.y - 14}" width="${w}" height="19" fill="#fff" opacity="0.92"/><text x="${v.x}" y="${v.y}" font-size="${F_MARK}" font-style="italic" text-anchor="${v.anchor}">${esc(e.label)}</text>`;
  }

  /* ---------- draw.io ---------- */
  drawio() {
    let n = 1;
    const id = () => `u${++n}`;
    const cells = [];
    const add = (value, style, x, y, w, h, parent = '1') => {
      const i = id();
      cells.push(`<mxCell id="${i}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
      return i;
    };
    for (const p of this.packages) {
      add(`<b>${esc(p.title)}</b>`, `rounded=0;whiteSpace=wrap;html=1;fillColor=#FAFAFA;strokeColor=#666666;dashed=1;verticalAlign=top;align=center;spacingTop=2;fontFamily=${FONT};fontSize=${F_PKG};`, p.x, p.y - 30, p.w, p.h + 30);
    }
    const cellFont = `fontFamily=${FONT};fontSize=${F_MEMBER};`;
    for (const c of this.classes) {
      const header = c.stereotype ? `«${c.stereotype}»<br><b>${esc(c.name)}</b>` : `<b>${esc(c.name)}</b>`;
      const box = add(header, `swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=${c.head};fillColor=#FFFFFF;swimlaneFillColor=#FFFFFF;strokeColor=#000000;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;align=center;verticalAlign=middle;html=1;whiteSpace=wrap;${c.abstract ? 'fontStyle=2;' : ''}fontFamily=${FONT};fontSize=${F_NAME};`, c.x, c.y, c.w, c.h);
      const rowStyle = `text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;whiteSpace=nowrap;${cellFont}`;
      let y = c.head;
      if (!c.noFields) for (const f of (c.fields.length ? c.fields : [''])) { add(f, rowStyle, 0, y, c.w, ROW, box); y += ROW; }
      if (c.methods !== null) {
        if (!c.noFields) add('', 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#000000;', 0, y, c.w, 8, box);
        if (!c.noFields) y += 8;
        for (const m of (c.methods.length ? c.methods : [''])) { add(m, rowStyle, 0, y, c.w, ROW, box); y += ROW; }
      }
    }
    for (const e of this.edges) {
      const [first, ...rest] = e.points;
      const last = rest.pop();
      const style = [
        'html=1;rounded=0;strokeColor=#000000;strokeWidth=1;',
        e.kind === 'dependency' ? `dashed=1;${e.noArrow ? 'endArrow=none;' : 'endArrow=open;endSize=10;endFill=0;'}` : (e.arrow ? 'endArrow=open;endSize=10;endFill=0;' : 'endArrow=none;'),
        e.kind === 'composition' ? 'startArrow=diamondThin;startSize=18;startFill=1;' : e.kind === 'aggregation' ? 'startArrow=diamondThin;startSize=18;startFill=0;' : 'startArrow=none;'
      ].join('');
      const i = id();
      cells.push(`<mxCell id="${i}" value="" style="${esc(style)}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${first[0]}" y="${first[1]}" as="sourcePoint"/><mxPoint x="${last[0]}" y="${last[1]}" as="targetPoint"/>${rest.length ? `<Array as="points">${rest.map((p) => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('')}</Array>` : ''}</mxGeometry></mxCell>`);
      if (e.label) { const v = this.verbPos(e), w = Math.ceil(e.label.length * 6.8 + 10); add(e.label, `text;html=1;strokeColor=none;fillColor=#FFFFFF;align=${v.anchor === 'middle' ? 'center' : 'left'};verticalAlign=middle;fontStyle=2;spacing=0;fontFamily=${FONT};fontSize=${F_MARK};`, v.anchor === 'middle' ? Math.round(v.x - w / 2) : v.x - 3, v.y - 15, w, 20); }
      for (const m of e.marks ?? []) add(m.text, `text;html=1;strokeColor=none;fillColor=none;align=${m.anchor === 'middle' ? 'center' : 'left'};verticalAlign=middle;${m.italic ? 'fontStyle=2;' : ''}fontFamily=${FONT};fontSize=${F_MARK};`, m.anchor === 'middle' ? m.x - 40 : m.x - 2, m.y - 15, m.anchor === 'middle' ? 80 : 60, 18);
    }
    for (const l of this.labels) add(l.text, `text;html=1;strokeColor=none;fillColor=none;align=${l.anchor === 'middle' ? 'center' : 'left'};verticalAlign=middle;fontFamily=${FONT};fontSize=${l.size ?? F_MARK};`, l.anchor === 'middle' ? l.x - 150 : l.x, l.y - 15, 300, 20);
    return `<diagram name="${esc(this.name)}" id="${esc(this.name.replace(/\W+/g, '_'))}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.width}" pageHeight="${this.height}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

/* Якоря связей */
export const top = (b, t = 0.5) => [Math.round(b.x + b.w * t), b.y];
export const bottom = (b, t = 0.5) => [Math.round(b.x + b.w * t), b.y + b.h];
export const left = (b, t = 0.5) => [b.x, Math.round(b.y + b.h * t)];
export const right = (b, t = 0.5) => [b.x + b.w, Math.round(b.y + b.h * t)];
