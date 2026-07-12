function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function svgWrap(inner, viewBox = '0 0 1000 320') {
  return `<svg viewBox="${viewBox}" class="viz-svg">${inner}</svg>`;
}

export function renderPopulationSvg(personas = []) {
  const cx = 500;
  const cy = 150;
  const radius = 100;
  const count = Math.max(personas.length, 1);
  const nodes = personas.map((persona, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius);
    const clusterClass = `cluster-${persona.cluster || 'balanced'}`;
    return `
      <g transform="translate(${x} ${y})">
        <circle r="26" class="persona-node ${clusterClass}"></circle>
        <text x="0" y="45" text-anchor="middle" class="viz-label">${esc(persona.name)}</text>
        <title>${esc(persona.note)}</title>
      </g>
    `;
  }).join('');
  const center = `
    <g transform="translate(${cx} ${cy})">
      <circle r="34" class="persona-center"></circle>
      <text x="0" y="5" text-anchor="middle" class="viz-center-label">population</text>
    </g>
  `;
  return svgWrap(center + nodes);
}

export function renderBranchSvg(branches = []) {
  const width = 1000;
  const baseY = 50;
  const gap = 52;
  const max = Math.max(...branches.map(branch => branch.score || 1), 1);
  const bars = branches.map((branch, index) => {
    const y = baseY + index * gap;
    const barWidth = Math.max(80, Math.round((branch.score / max) * 680));
    return `
      <g transform="translate(120 ${y})">
        <rect x="0" y="-18" width="${barWidth}" height="30" rx="14" class="branch-bar ${branch.rank === 'best' ? 'best' : ''}"></rect>
        <text x="12" y="2" class="viz-branch">${esc(branch.title)} · ${branch.score}</text>
        <text x="${barWidth + 18}" y="2" class="viz-mini">${esc(branch.deathReason)}</text>
      </g>
    `;
  }).join('');
  const axis = `<line x1="120" y1="20" x2="820" y2="20" class="viz-axis"></line>`;
  return svgWrap(axis + bars, '0 0 1000 340');
}

export function renderContradictionSvg(graph = { items: [] }) {
  const items = graph.items || [];
  const cx = 500;
  const cy = 150;
  const radius = 110;
  const count = Math.max(items.length, 1);
  const nodes = items.map((item, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius);
    return `
      <g transform="translate(${x} ${y})">
        <circle r="24" class="tension-node"></circle>
        <text x="0" y="42" text-anchor="middle" class="viz-label">${esc(item.label)}</text>
        <title>${esc(item.evidence)}</title>
      </g>
    `;
  }).join('');
  const center = `
    <g transform="translate(${cx} ${cy})">
      <circle r="34" class="tension-center"></circle>
      <text x="0" y="5" text-anchor="middle" class="viz-center-label">tensions</text>
    </g>
  `;
  return svgWrap(center + nodes);
}

export function renderTimelineSvg(timeline = []) {
  const rows = timeline.slice(-8);
  const items = rows.map((row, index) => {
    const y = 36 + index * 34;
    return `
      <g transform="translate(16 ${y})">
        <circle r="6" cx="0" cy="0" class="timeline-dot"></circle>
        <text x="16" y="5" class="viz-mini">${esc(row.stage)}: ${esc(row.message)}</text>
      </g>
    `;
  }).join('');
  return svgWrap(items, '0 0 1000 320');
}
