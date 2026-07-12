function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const liquidDefs = `
  <defs>
    <linearGradient id="liquidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00F0FF" />
      <stop offset="100%" stop-color="#FF2E97" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
`;

function svgWrap(inner, viewBox = '0 0 1000 320') {
  return `<svg viewBox="${viewBox}" class="viz-svg">${liquidDefs}${inner}</svg>`;
}

export function renderPopulationSvg(personas = [], branchId = null) {
  const cx = 500;
  const cy = 160;
  const radius = 100;
  const count = Math.max(personas.length, 1);
  const nodes = personas.map((persona, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius);
    const cpX = cx + (x - cx) * 0.5;
    const cpY = cy + (y - cy) * 0.1;
    const clusterClass = `cluster-${persona.cluster || 'balanced'}`;
    
    let stance = 'undecided';
    if (branchId && persona.reactions) {
      const r = persona.reactions.find(x => x.branchId === branchId);
      if (r && r.stance) stance = r.stance;
    }
    
    let strokeColor = "rgba(100, 100, 100, 0.3)";
    if (stance === 'support') strokeColor = "rgba(76, 175, 80, 0.6)"; // Green
    else if (stance === 'push_back' || stance === 'push back') strokeColor = "rgba(224, 92, 92, 0.6)"; // Red
    else if (stance === 'undecided') strokeColor = "rgba(246, 211, 101, 0.6)"; // Yellow
    else if (persona.cluster === 'skeptical') strokeColor = "rgba(255, 46, 151, 0.4)";
    else if (persona.cluster === 'balanced') strokeColor = "rgba(246, 211, 101, 0.4)";
    else strokeColor = "rgba(0, 240, 255, 0.4)";

    return `
      <path d="M ${cx},${cy} Q ${cpX},${cpY} ${x},${y}" fill="none" stroke="${strokeColor}" stroke-width="3" />
      <g transform="translate(${x} ${y})">
        <circle cx="0" cy="0" r="26" class="persona-node ${clusterClass}" filter="url(#glow)"></circle>
        <text x="0" y="50" text-anchor="middle" class="viz-label" style="font-family: var(--font-mono); font-size: 0.65rem;">${esc(persona.name)}</text>
        <title>${esc(persona.note || persona.lens)}</title>
      </g>
    `;
  }).join('');
  
  const center = `
    <g transform="translate(${cx} ${cy})">
      <circle cx="0" cy="0" r="34" class="persona-center" filter="url(#glow)"></circle>
      <text x="0" y="8" text-anchor="middle" class="viz-center-label" style="font-family: var(--font-mono); font-size: 0.75rem;">JUDGE</text>
    </g>
  `;
  return svgWrap(center + nodes, '0 0 1000 320');
}

export function renderBranchSvg(branches = []) {
  const baseY = 80;
  const gap = 160;
  const max = Math.max(...branches.map(branch => branch.score || 1), 1);
  const bars = branches.map((branch, index) => {
    const y = baseY + index * gap;
    const barWidth = Math.max(100, Math.round((branch.score / max) * 680));
    return `
      <g transform="translate(120 ${y})">
        <rect x="0" y="-36" width="${barWidth}" height="72" rx="36" ry="36" class="branch-bar ${branch.rank === 'best' ? 'best' : ''}"></rect>
        <text x="40" y="10" class="viz-branch">${esc(branch.title)} [${branch.score}]</text>
        <text x="40" y="70" class="viz-mini">${esc(branch.deathReason)}</text>
      </g>
    `;
  }).join('');
  
  const viewBoxHeight = Math.max(400, baseY + branches.length * gap + 80);
  const axis = `<path d="M120,40 Q470,50 820,40" class="viz-axis" fill="none" stroke="rgba(143, 166, 214, 0.2)" stroke-width="4" stroke-linecap="round"></path>`;
  return svgWrap(axis + bars, `0 0 1000 ${viewBoxHeight}`);
}

export function renderContradictionSvg(graph = { items: [] }) {
  const items = graph.items || [];
  const cx = 500;
  const cy = 250;
  const radius = 200;
  const count = Math.max(items.length, 1);
  
  const nodes = items.map((item, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius);
    const cpX = cx + (x - cx) * 0.5;
    const cpY = cy + (y - cy) * 0.1;
    
    return `
      <path d="M ${cx},${cy} Q ${cpX},${cpY} ${x},${y}" fill="none" stroke="rgba(246, 211, 101, 0.4)" stroke-width="4" />
      <g transform="translate(${x} ${y})">
        <circle cx="0" cy="0" r="50" class="tension-node" filter="url(#glow)"></circle>
        <text x="0" y="80" text-anchor="middle" class="viz-label">${esc(item.label)}</text>
        <title>${esc(item.evidence)}</title>
      </g>
    `;
  }).join('');
  
  const center = `
    <g transform="translate(${cx} ${cy})">
      <circle cx="0" cy="0" r="70" class="tension-center" filter="url(#glow)"></circle>
      <text x="0" y="12" text-anchor="middle" class="viz-center-label">tensions</text>
    </g>
  `;
  return svgWrap(center + nodes, '0 0 1000 500');
}

export function renderTimelineSvg(timeline = []) {
  const rows = timeline.slice(-8);
  let pathD = "";
  const items = rows.map((row, index) => {
    const y = 80 + index * 80;
    const x = 50 + Math.sin(index * 0.8) * 30;
    
    if (index === 0) {
      pathD += `M ${x} ${y} `;
    } else {
      const prevY = 80 + (index - 1) * 80;
      const prevX = 50 + Math.sin((index - 1) * 0.8) * 30;
      const cpX = (x + prevX) / 2;
      pathD += `S ${cpX} ${y} ${x} ${y} `;
    }
    
    return `
      <g transform="translate(${x} ${y})">
        <circle cx="0" cy="0" r="16" fill="#00F0FF" filter="url(#glow)"></circle>
        <circle cx="0" cy="0" r="8" fill="#fff"></circle>
        <text x="40" y="10" class="viz-mini">${esc(row.stage)}: ${esc(row.message)}</text>
      </g>
    `;
  }).join('');
  
  const connectingLine = `<path d="${pathD}" fill="none" stroke="url(#liquidGrad)" stroke-width="8" stroke-linecap="round" opacity="0.6"/>`;
  const viewBoxHeight = Math.max(400, 80 + rows.length * 80 + 80);
  return svgWrap(connectingLine + items, `0 0 1000 ${viewBoxHeight}`);
}

export function renderRelationsGraphSvg(agents = [], edges = []) {
  const cx = 160;
  const cy = 160;
  const radius = 95;
  const count = Math.max(agents.length, 1);

  const agentMap = new Map();
  agents.forEach((agent, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    agentMap.set(agent.id, { agent, x, y, angle });
  });

  const PLATFORM_COLORS = {
    twitter: '#6cb2f7',
    reddit: '#ff7043',
    hn: '#ff9800',
    discord: '#9c88ff',
    market: '#66bb6a',
    facebook: '#1877F2'
  };

  const edgeElements = edges.map(edge => {
    const srcNode = agentMap.get(edge.src_agent || edge.srcAgent);
    const dstNode = agentMap.get(edge.dst_agent || edge.dstAgent);
    if (!srcNode || !dstNode) return '';

    const weight = Number(edge.weight || 0.5);
    const isPositive = weight > 0;
    const color = isPositive ? '#4caf85' : '#e05c5c';
    const strokeWidth = Math.max(1, Math.min(6, Math.abs(weight) * 3));
    const relType = esc(edge.rel_type || edge.relType || 'interacted');
    const evidence = esc(edge.evidence || '');

    return `
      <line x1="${srcNode.x}" y1="${srcNode.y}" x2="${dstNode.x}" y2="${dstNode.y}"
            stroke="${color}" stroke-width="${strokeWidth}"
            opacity="0.35" class="graph-edge" 
            data-src="${edge.src_agent || edge.srcAgent}" 
            data-dst="${edge.dst_agent || edge.dstAgent}"
            data-weight="${Math.abs(weight)}"
            data-orig-stroke-width="${strokeWidth}"
            data-rel-type="${relType}"
            data-evidence="${evidence}">
      </line>
    `;
  }).join('');

  const nodeElements = agents.map((agent, index) => {
    const node = agentMap.get(agent.id);
    if (!node) return '';

    const labelOffset = 18;
    const labelX = cx + Math.cos(node.angle) * (radius + labelOffset);
    const labelY = cy + Math.sin(node.angle) * (radius + labelOffset) + 3;
    const textAnchor = Math.cos(node.angle) > 0.05 ? 'start' : (Math.cos(node.angle) < -0.05 ? 'end' : 'middle');

    const color = PLATFORM_COLORS[agent.platform] || '#888';
    const cleanName = esc(agent.name.split('_')[0]);

    return `
      <g class="graph-node" data-agent-id="${agent.id}" style="cursor: pointer; transition: opacity 0.2s;">
        <circle cx="${node.x}" cy="${node.y}" r="6.5" fill="${color}" stroke="#000" stroke-width="1">
        </circle>
        <text x="${labelX}" y="${labelY}" text-anchor="${textAnchor}" fill="var(--text-secondary)" style="font-family: var(--font-mono); font-size: 0.5rem; font-weight: 700;">
          ${cleanName}
        </text>
      </g>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 320 320" id="relations-svg" style="width: 100%; height: 100%; max-height: 280px; overflow: visible;">
      ${edgeElements}
      ${nodeElements}
    </svg>
  `;
}

// ══════════════════════════════════════════════════════════════════
//  TREE MODE VISUALIZATIONS
// ══════════════════════════════════════════════════════════════════

export function renderTreeFlowHtml(nodes, rootState, variableLabels = {}) {
    if (!nodes || !rootState) return '';
    const varNames = Object.keys(rootState.variables || {});
    if (varNames.length === 0) return '';

    const DIRECTION_META = {
      better:  { label: '↑ Improving',  color: '#3ecfb2', bg: 'rgba(62,207,178,0.07)', border: 'rgba(62,207,178,0.25)' },
      worse:   { label: '↓ Declining',  color: '#e05c5c', bg: 'rgba(224,92,92,0.07)',  border: 'rgba(224,92,92,0.25)' },
      neutral: { label: '→ Stable',     color: '#888',    bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)' },
    };

    // Sort by magnitude of change (most impacted first)
    const varData = varNames.map(varName => {
        const values = nodes.map(n => n.variables?.[varName]).filter(v => typeof v === 'number');
        if (values.length === 0) return null;
        const mean     = values.reduce((a, b) => a + b, 0) / values.length;
        const rootVal  = rootState.variables?.[varName] ?? 0.5;
        const delta    = mean - rootVal;
        const absDelta = Math.abs(delta);
        const direction = delta > 0.04 ? 'better' : delta < -0.04 ? 'worse' : 'neutral';
        const humanName = variableLabels[varName] || varName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { varName, humanName, rootVal, mean, delta, absDelta, direction, values };
    }).filter(Boolean).sort((a, b) => b.absDelta - a.absDelta);

    const cards = varData.map(({ varName, humanName, rootVal, mean, delta, direction }) => {
        const m = DIRECTION_META[direction];
        const rootPct  = (rootVal  * 100).toFixed(0);
        const meanPct  = (mean     * 100).toFixed(0);
        const deltaPct = ((delta   * 100)).toFixed(0);
        const sign     = delta > 0 ? '+' : '';

        // Plain-English direction sentence
        const changeDesc = direction === 'neutral'
          ? `This factor stays roughly the same across all simulated paths.`
          : `Across simulated paths, this factor ${direction === 'better' ? 'tends to improve' : 'tends to decline'} by about ${sign}${deltaPct}% from where you start.`;

        const inference = rootState.inferences?.[varName];
        let inferenceHtml = '';
        if (inference) {
            const esc = str => String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            inferenceHtml = `
              <div style="margin-top:0.85rem; padding-top:0.65rem; border-top:1px solid rgba(255,255,255,0.06); font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">
                <span style="font-weight:600; color:var(--text-primary);">Why ${rootPct}%?</span> ${esc(inference.reason)} 
                <span style="display:inline-block; margin-left:0.3rem; padding:0.1rem 0.4rem; border-radius:12px; background:rgba(255,255,255,0.05); font-size:0.6rem; font-family:var(--font-mono); border:1px solid rgba(255,255,255,0.1);">${esc(inference.confidence)} Confidence</span>
              </div>
            `;
        }

        return `
        <div style="
          background:${m.bg};border:1px solid ${m.border};border-radius:8px;
          padding:0.9rem 1rem;margin-bottom:0.75rem;position:relative;overflow:hidden;
        ">
          <div style="position:absolute;top:0;left:0;width:3px;height:100%;background:${m.color};border-radius:3px 0 0 3px;"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;gap:0.5rem;flex-wrap:wrap;">
            <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">${humanName}</span>
            <span style="font-size:0.68rem;font-family:var(--font-mono);color:${m.color};padding:0.15rem 0.5rem;border:1px solid ${m.border};border-radius:20px;">${m.label}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.65rem;line-height:1.4;">${changeDesc}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <div>
              <div style="font-size:0.6rem;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:0.25rem;text-transform:uppercase;">Inferred Starting Level</div>
              <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${rootPct}%;background:#888;border-radius:3px;"></div>
              </div>
              <div style="font-size:0.68rem;font-family:var(--font-mono);color:var(--text-secondary);margin-top:0.2rem;">${rootPct}%</div>
            </div>
            <div>
              <div style="font-size:0.6rem;font-family:var(--font-mono);color:${m.color};margin-bottom:0.25rem;text-transform:uppercase;">After Simulation</div>
              <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${meanPct}%;background:${m.color};border-radius:3px;transition:width 0.6s ease;"></div>
              </div>
              <div style="font-size:0.68rem;font-family:var(--font-mono);color:${m.color};margin-top:0.2rem;">${meanPct}% <span style="opacity:0.6;">(${sign}${deltaPct}%)</span></div>
            </div>
          </div>
          ${inferenceHtml}
        </div>`;
    }).join('');

    return `
    <div style="font-size:0.62rem;font-family:var(--font-mono);color:var(--text-secondary);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:0.85rem;">
      ${varData.length} factors tracked across ${nodes.length} simulated states
    </div>
    ${cards}`;
}



export function renderTreeScatterSvg(leafNodes, stakeholderLabels = {}) {

    if (!leafNodes || leafNodes.length === 0) return '<p>No leaf nodes.</p>';

    const W = 760; const H = 440;
    const PAD = { top: 20, right: 20, bottom: 48, left: 56 };

    const keys = Object.keys(leafNodes[0].utilities || {});
    const sA = keys[0] || 'S1';
    const sB = keys[1] || 'S2';

    const pts = leafNodes.map(n => ({
        x: n.utilities?.[sA] ?? 0,
        y: n.utilities?.[sB] ?? 0,
        p: n.probability ?? 0,
        d: n.depth ?? 1,
        op: n.operator ?? '',
        id: n.id
    }));

    const scaleX = v => PAD.left + ((v + 1) / 2) * (W - PAD.left - PAD.right);
    const scaleY = v => H - PAD.bottom - ((v + 1) / 2) * (H - PAD.top - PAD.bottom);
    const dotCol  = p => { const g = Math.round(80 + 120 * p); return `rgb(40,${g},100)`; };

    const x0 = scaleX(0); const y0 = scaleY(0);
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;max-width:100%;">`;
    svg += `<line x1="${PAD.left}" y1="${H-PAD.bottom}" x2="${W-PAD.right}" y2="${H-PAD.bottom}" stroke="var(--border-color)" stroke-width="1"/>`;
    svg += `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H-PAD.bottom}" stroke="var(--border-color)" stroke-width="1"/>`;
    svg += `<line x1="${x0}" y1="${PAD.top}" x2="${x0}" y2="${H-PAD.bottom}" stroke="#444" stroke-width="0.5" stroke-dasharray="4,4"/>`;
    svg += `<line x1="${PAD.left}" y1="${y0}" x2="${W-PAD.right}" y2="${y0}" stroke="#444" stroke-width="0.5" stroke-dasharray="4,4"/>`;
    svg += `<text x="${W/2}" y="${H-8}" font-family="var(--font-mono)" font-size="11" fill="var(--text-secondary)" text-anchor="middle">${sA} Utility →</text>`;
    svg += `<text x="12" y="${H/2}" font-family="var(--font-mono)" font-size="11" fill="var(--text-secondary)" text-anchor="middle" transform="rotate(-90,12,${H/2})">${sB} Utility →</text>`;
    for (const p of pts) {
        svg += `<circle cx="${scaleX(p.x).toFixed(1)}" cy="${scaleY(p.y).toFixed(1)}"
          r="${5 + p.d * 1.2}" fill="${dotCol(p.p)}" fill-opacity="0.78"
          stroke="#9c6bff" stroke-width="1"
          class="tree-scatter-dot" data-id="${p.id}"
          data-x="${p.x.toFixed(3)}" data-y="${p.y.toFixed(3)}"
          data-p="${p.p.toFixed(3)}" data-op="${p.op}" data-sa="${sA}" data-sb="${sB}" style="cursor:pointer"/>`;
    }
    svg += `</svg>`;
    return svg;
}

export function renderTreeCausalSvg(nodes) {
    if (!nodes) return '';
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const NODE_W = 155; const NODE_H = 58;
    const COL_GAP = 72; const ROW_GAP = 18;

    const byDepth = {};
    for (const n of nodes) (byDepth[n.depth] = byDepth[n.depth] || []).push(n);
    const maxDepth = Math.max(...Object.keys(byDepth).map(Number));
    const maxRows  = Math.max(...Object.values(byDepth).map(a => a.length));

    const totalW = (maxDepth + 1) * (NODE_W + COL_GAP) + 40;
    const totalH = maxRows * (NODE_H + ROW_GAP) + 40;

    const pos = {};
    for (const [depth, arr] of Object.entries(byDepth)) {
        const d = parseInt(depth, 10);
        arr.forEach((n, i) => {
            pos[n.id] = {
                x: 20 + d * (NODE_W + COL_GAP),
                y: 20 + i * (NODE_H + ROW_GAP)
            };
        });
    }

    let svg = `<svg id="tree-svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`;
    for (const n of nodes) {
        if (!n.children) continue;
        for (const childId of n.children) {
            const p = pos[n.id]; const c = pos[childId];
            if (!p || !c) continue;
            const mx = (p.x + NODE_W + c.x) / 2;
            svg += `<path class="tree-edge" d="M${p.x+NODE_W},${p.y+NODE_H/2} C${mx},${p.y+NODE_H/2} ${mx},${c.y+NODE_H/2} ${c.x},${c.y+NODE_H/2}"/>`;
        }
    }
    for (const n of nodes) {
        const p = pos[n.id]; if (!p) continue;
        const isRoot = n.depth === 0;
        const actionLabel = (n.action_label || n.operator || 'ROOT').toUpperCase().slice(0, 22);
        const prob = ((n.probability || 0) * 100).toFixed(1);
        svg += `<g class="tree-node-g" data-nodeid="${n.id}" style="cursor:pointer">
          <rect class="tree-node-rect${isRoot?' root':''}" x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="3"/>
          <text class="tree-node-op"   x="${p.x+8}" y="${p.y+16}">${actionLabel}</text>
          <text class="tree-node-prob" x="${p.x+8}" y="${p.y+34}">${prob}%</text>
          <text class="tree-node-op"   x="${p.x+8}" y="${p.y+52}">d:${n.depth}</text>
        </g>`;
    }
    svg += `</svg>`;
    return svg;
}

export function renderTreeDrawerHtml(node, chain) {
    if (!node) return '';
    const chainHtml = chain.length > 1
        ? chain.map(n => `<span style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-secondary)">${n.action_label || n.operator ||'ROOT'}</span>`).join(' → ')
        : '<span style="font-family:var(--font-mono);font-size:.62rem">ROOT</span>';

    const utilPills = Object.entries(node.utilities || {}).map(([k, v]) => {
        const cls = v > 0.1 ? 'pos' : v < -0.1 ? 'neg' : 'neu';
        return `<span class="tree-util-pill ${cls}">${k}: ${v > 0 ? '+' : ''}${v.toFixed(2)}</span>`;
    }).join('');

    const varRows = Object.entries(node.variables || {}).map(([k, v]) => `
        <div class="tree-drawer-var-row">
          <span>${k.replace(/_/g,' ')}</span>
          <div class="tree-var-bar-wrap"><div class="tree-var-bar-fill" style="width:${(v*100).toFixed(1)}%"></div></div>
          <span style="color:#9c6bff">${v.toFixed(3)}</span>
        </div>`).join('');

    return `
      <div class="tree-drawer-section">
        <div class="tree-drawer-label">Causal Path</div>
        <div style="line-height:1.9">${chainHtml}</div>
      </div>
      <div class="tree-drawer-section">
        <div class="tree-drawer-label">State ${node.id}</div>
        <div style="font-size:.75rem"><b>Probability:</b> ${((node.probability||0)*100).toFixed(2)}%</div>
        <div style="font-size:.75rem"><b>Depth:</b> ${node.depth}</div>
        <div style="font-size:.75rem"><b>Action:</b> ${node.action_label || node.operator || 'ROOT'}</div>
      </div>
      <div class="tree-drawer-section">
        <div class="tree-drawer-label">Stakeholder Utility</div>
        <div>${utilPills || '—'}</div>
      </div>
      <div class="tree-drawer-section" style="border:none">
        <div class="tree-drawer-label">State Variables</div>
        ${varRows}
      </div>`;
}

/* ===================================================================
   renderDominantFuturesHtml
   Primary user-facing output for Tree Mode.
   Renders "Dominant Futures" — plain-English causal narrative cards.
   =================================================================== */
export function renderDominantFuturesHtml(dominantFutures, decisionSpace) {
  if (!dominantFutures || dominantFutures.length === 0) {
    return `<div style="padding:2rem;text-align:center;color:var(--text-secondary)">No futures computed.</div>`;
  }

  const SENTIMENT_COLOR  = { positive: 'rgba(76,175,133,1)',  negative: 'rgba(229,57,53,1)',   neutral: 'rgba(156,107,255,1)' };
  const SENTIMENT_BG     = { positive: 'rgba(76,175,133,0.08)', negative: 'rgba(229,57,53,0.08)', neutral: 'rgba(156,107,255,0.08)' };
  const SENTIMENT_BORDER = { positive: 'rgba(76,175,133,0.3)', negative: 'rgba(229,57,53,0.3)',  neutral: 'rgba(156,107,255,0.3)' };
  const SENTIMENT_ICON   = { positive: '↑', negative: '↓', neutral: '→' };

  const decisionSummary = decisionSpace?.decision_summary || '';

  const cardHtml = dominantFutures.map((future, idx) => {
    const sentiment   = future.sentiment || 'neutral';
    const accentColor = SENTIMENT_COLOR[sentiment]  || SENTIMENT_COLOR.neutral;
    const bgColor     = SENTIMENT_BG[sentiment]     || SENTIMENT_BG.neutral;
    const borderColor = SENTIMENT_BORDER[sentiment] || SENTIMENT_BORDER.neutral;
    const icon        = SENTIMENT_ICON[sentiment]   || '→';

    const chainHtml = (future.causal_chain || []).map((step, si) => `
      <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;">
        <span style="font-size:0.65rem;font-family:var(--font-mono);color:var(--text-secondary);min-width:1.5rem;text-align:right;">${si + 1}.</span>
        <span style="font-size:0.8rem;color:var(--text-primary);">${step.operator_label}</span>
        <span style="font-size:0.65rem;font-family:var(--font-mono);color:var(--text-secondary);margin-left:auto;">${step.probability_percent}%</span>
      </div>`).join('');

    const stakeholderHtml = (future.stakeholder_impacts || []).map((s) => {
      const impact    = s.impact || 0;
      const pillColor = impact > 0.1 ? 'rgba(76,175,133,0.2)' : impact < -0.1 ? 'rgba(229,57,53,0.2)' : 'rgba(150,150,150,0.15)';
      const textColor = impact > 0.1 ? '#4caf85' : impact < -0.1 ? '#e53935' : '#888';
      const sign      = impact > 0 ? '+' : '';
      return `<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.5rem;border-radius:20px;background:${pillColor};font-size:0.7rem;font-family:var(--font-mono);color:${textColor};">${s.stakeholder_label}<strong>${sign}${Math.round(impact * 100)}%</strong></span>`;
    }).join(' ');

    return `
    <div class="dominant-future-card" data-future-index="${idx}" style="
      position:relative;background:${bgColor};border:1px solid ${borderColor};
      border-radius:10px;padding:1.5rem;margin-bottom:1.25rem;overflow:hidden;
      transition:box-shadow 0.2s;
    ">
      <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${accentColor};border-radius:4px 0 0 4px;"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1rem;">
        <div>
          <div style="font-size:0.65rem;font-family:var(--font-mono);color:${accentColor};letter-spacing:0.08em;margin-bottom:0.3rem;text-transform:uppercase;">
            Future ${idx + 1} &nbsp;·&nbsp; ${icon} ${future.probability_label || `${future.probability_percent}%`}
          </div>
          <h3 style="margin:0;font-size:1.05rem;color:var(--text-primary);line-height:1.3;">${future.title || `Scenario ${idx + 1}`}</h3>
        </div>
        <div style="flex-shrink:0;text-align:center;background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:0.4rem 0.7rem;">
          <div style="font-size:1.2rem;font-weight:700;color:${accentColor};">${future.probability_percent}%</div>
          <div style="font-size:0.6rem;font-family:var(--font-mono);color:var(--text-secondary);">PROBABILITY</div>
        </div>
      </div>
      <p style="font-size:0.88rem;line-height:1.6;color:var(--text-primary);margin:0 0 1.25rem 0;">${future.outcome || ''}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.25rem;">
        <div style="background:rgba(229,57,53,0.06);border:1px solid rgba(229,57,53,0.18);border-radius:6px;padding:0.75rem;">
          <div style="font-size:0.65rem;font-family:var(--font-mono);color:#e53935;letter-spacing:0.06em;margin-bottom:0.35rem;text-transform:uppercase;">⚠ Main Risk</div>
          <div style="font-size:0.82rem;color:var(--text-primary);line-height:1.4;">${future.main_risk || '—'}</div>
        </div>
        <div style="background:rgba(76,175,133,0.06);border:1px solid rgba(76,175,133,0.18);border-radius:6px;padding:0.75rem;">
          <div style="font-size:0.65rem;font-family:var(--font-mono);color:#4caf85;letter-spacing:0.06em;margin-bottom:0.35rem;text-transform:uppercase;">✦ Main Upside</div>
          <div style="font-size:0.82rem;color:var(--text-primary);line-height:1.4;">${future.main_upside || '—'}</div>
        </div>
      </div>
      ${future.signal ? `<div style="background:rgba(255,152,0,0.06);border:1px solid rgba(255,152,0,0.18);border-radius:6px;padding:0.75rem;margin-bottom:1rem;">
        <div style="font-size:0.65rem;font-family:var(--font-mono);color:var(--accent-orange);letter-spacing:0.06em;margin-bottom:0.3rem;text-transform:uppercase;">◉ Signal to Watch</div>
        <div style="font-size:0.82rem;color:var(--text-primary);line-height:1.4;">${future.signal}</div>
      </div>` : ''}
      ${future.action ? `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:0.75rem;margin-bottom:1rem;">
        <div style="font-size:0.65rem;font-family:var(--font-mono);color:var(--text-secondary);letter-spacing:0.06em;margin-bottom:0.3rem;text-transform:uppercase;">→ Action You Can Take Now</div>
        <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);line-height:1.4;">${future.action}</div>
      </div>` : ''}
      <details style="margin-top:0.75rem;">
        <summary style="font-size:0.72rem;font-family:var(--font-mono);color:var(--text-secondary);cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:0.4rem;">
          <span>▸</span> Causal Chain &amp; Stakeholder Impact
        </summary>
        <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.07);">
          ${chainHtml ? `<div style="margin-bottom:0.75rem;"><div style="font-size:0.65rem;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:0.4rem;text-transform:uppercase;">Causal Steps</div>${chainHtml}</div>` : ''}
          ${stakeholderHtml ? `<div><div style="font-size:0.65rem;font-family:var(--font-mono);color:var(--text-secondary);margin-bottom:0.4rem;text-transform:uppercase;">Who is Affected</div><div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${stakeholderHtml}</div></div>` : ''}
        </div>
      </details>
    </div>`;
  }).join('');

  const summaryBlock = decisionSummary ? `
    <div style="margin-bottom:1.5rem;padding:0.85rem 1rem;background:rgba(156,107,255,0.06);border:1px solid rgba(156,107,255,0.2);border-radius:8px;">
      <div style="font-size:0.65rem;font-family:var(--font-mono);color:#9c6bff;letter-spacing:0.08em;margin-bottom:0.3rem;text-transform:uppercase;">Decision Framing</div>
      <p style="margin:0;font-size:0.88rem;color:var(--text-primary);line-height:1.5;">${decisionSummary}</p>
    </div>` : '';

  return `
  <div class="dominant-futures-panel" style="width:100%;">
    <div class="tree-section-header">
      <span>DOMINANT FUTURES</span>
      <span style="font-size:0.58rem;opacity:0.5;">${dominantFutures.length} COMPUTED PATHS</span>
    </div>
    ${summaryBlock}
    ${cardHtml}
  </div>`;
}
