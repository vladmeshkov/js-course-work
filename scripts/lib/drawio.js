// Минимальный генератор файлов draw.io (diagrams.net): несжатый XML mxGraph.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class Page {
  constructor(name, { width = 1600, height = 1000 } = {}) {
    this.name = name;
    this.width = width;
    this.height = height;
    this.cells = [];
    this.n = 1;
  }

  id() { return `c${++this.n}`; }

  /** Фигура. Возвращает идентификатор. */
  shape({ value = '', style, x, y, w, h, parent = '1' }) {
    const id = this.id();
    this.cells.push(`<mxCell id="${id}" value="${esc(value)}" style="${esc(style)}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`);
    return id;
  }

  /** Связь между фигурами. */
  edge({ source, target, value = '', style = 'endArrow=open;html=1;', points = [] }) {
    const id = this.id();
    const pts = points.length ? `<Array as="points">${points.map((p) => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('')}</Array>` : '';
    this.cells.push(`<mxCell id="${id}" value="${esc(value)}" style="${esc(style)}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`);
    return id;
  }

  /** Связь по координатам (линии жизни на диаграмме последовательности). */
  line({ from, to, value = '', style, points = [] }) {
    const id = this.id();
    const pts = points.length ? `<Array as="points">${points.map((p) => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join('')}</Array>` : '';
    this.cells.push(`<mxCell id="${id}" value="${esc(value)}" style="${esc(style)}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${from[0]}" y="${from[1]}" as="sourcePoint"/><mxPoint x="${to[0]}" y="${to[1]}" as="targetPoint"/>${pts}</mxGeometry></mxCell>`);
    return id;
  }

  /** Класс UML: заголовок, поля, методы. */
  umlClass({ name, stereotype = '', fields = [], methods = [], x, y, w = 240, fill = '#ffffff' }) {
    const row = 18;
    const head = stereotype ? 42 : 26;
    const h = head + Math.max(fields.length, 1) * row + 8 + Math.max(methods.length, 1) * row + 8;
    const id = this.shape({
      value: stereotype ? `<<${stereotype}>>\n${name}` : name,
      style: `swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${head};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=0;fillColor=${fill};strokeColor=#333333;`,
      x, y, w, h
    });
    const cellStyle = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=nowrap;fontSize=11;';
    let cy = head;
    (fields.length ? fields : ['']).forEach((f) => { this.shape({ value: f, style: cellStyle, x: 0, y: cy, w, h: row, parent: id }); cy += row; });
    this.shape({ value: '', style: 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;', x: 0, y: cy, w, h: 8, parent: id });
    cy += 8;
    (methods.length ? methods : ['']).forEach((m) => { this.shape({ value: m, style: cellStyle, x: 0, y: cy, w, h: row, parent: id }); cy += row; });
    return { id, h };
  }

  xml() {
    return `<diagram name="${esc(this.name)}" id="${esc(this.name.replace(/\W+/g, '_'))}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${this.width}" pageHeight="${this.height}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${this.cells.join('')}</root></mxGraphModel></diagram>`;
  }
}

export const file = (pages) => `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device">${pages.map((p) => p.xml()).join('')}</mxfile>\n`;
