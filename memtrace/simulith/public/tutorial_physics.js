// ── Procedural Noise Engine (Organic Motion over Randomness) ──
function hash(n) { return (Math.sin(n) * 43758.5453123) % 1; }
function noise(x) {
  const p = Math.floor(x);
  const f = x - p;
  const f2 = f * f * (3.0 - 2.0 * f);
  return hash(p) * (1.0 - f2) + hash(p + 1) * f2;
}

/**
 * Initializes a Kinetic-Art physics background for the empty states.
 * Adheres strictly to creative-physics protocol:
 * - Particle-Based Construction (Node networks)
 * - Noise over Randomness (Procedural drifting)
 * - Spring Physics over CSS (Hooke's law, stiffness, damping)
 * - Squash & Stretch based on momentum
 */
export function initTutorialPhysics(canvasId, mode) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  // If the caller already set pixel dimensions (e.g. fixed-position tree canvas), use them.
  // Otherwise walk up the DOM to find a container with real dimensions.
  const isFixed = getComputedStyle(canvas).position === 'fixed';

  const getSize = () => {
    if (isFixed) return { w: window.innerWidth, h: window.innerHeight };
    const el = canvas.parentElement;
    if (!el) return { w: window.innerWidth, h: window.innerHeight };
    let cur = el;
    while (cur && cur.clientWidth === 0 && cur.parentElement) cur = cur.parentElement;
    return { w: cur.clientWidth || window.innerWidth, h: cur.clientHeight || window.innerHeight };
  };

  let w = canvas.width;
  let h = canvas.height;

  // If width/height weren't explicitly set, fallback to getSize
  if (!w || !h || w === 300) { // 300 is the default canvas width
    const s = getSize();
    w = canvas.width  = s.w;
    h = canvas.height = s.h;
  }

  const onResize = () => {
    const s = getSize();
    w = canvas.width  = s.w;
    h = canvas.height = s.h;
  };
  window.addEventListener('resize', onResize);

  let mouse = { x: w/2, y: h/2, active: false };
  const onMouseMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = true;
  };
  const onMouseLeave = () => { mouse.active = false; };
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  const isMesh = mode === 'mesh';
  const isTree = mode === 'tree';

  // Colour palettes per mode
  const edgeColor  = isMesh ? 'rgba(76, 175, 133, 0.12)'
                   : isTree ? 'rgba(180, 180, 180, 0.14)'
                   :          'rgba(255, 152, 0, 0.12)';
  const nodeFill   = isMesh ? 'rgba(76, 175, 133, 0.9)'
                   : isTree ? 'rgba(190, 190, 190, 0.85)'
                   :          'rgba(255, 152, 0, 0.9)';
  const nodeStroke = isMesh ? 'rgba(76, 175, 133, 0.4)'
                   : isTree ? 'rgba(210, 210, 210, 0.4)'
                   :          'rgba(255, 152, 0, 0.4)';

  const nodeCount = 200;
  const nodes = [];
  
  // Seed the determinism (Initial Placement)
  for (let i = 0; i < nodeCount; i++) {
    const px = Math.random();
    const py = Math.random();
    nodes.push({
      x: px * w,
      y: py * h,
      vx: 0, vy: 0,
      pX: px,
      pY: py,
      mass: 1.5 + Math.random() * 2,
      noiseSeed: Math.random() * 1000
    });
  }

  // The Laws of Physicality parameters
  const stiffness = 0.015;
  const damping = 0.82;

  let animationFrameId;
  let time = 0;

  function render() {
    time += 0.002;
    ctx.clearRect(0, 0, w, h);
    
    // Draw Relationships (Algorithmic Drawing)
    ctx.beginPath();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 160) {
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
        }
      }
    }
    ctx.stroke();

    // Secondary Animation: Physics calculation for each node
    nodes.forEach(n => {
      const nx = (noise(n.noiseSeed + time) - 0.5) * 200;
      const ny = (noise(n.noiseSeed + 500 + time) - 0.5) * 200;
      
      let targetX = (n.pX * w) + nx;
      let targetY = (n.pY * h) + ny;

      // Reactive Communication (Mouse repel)
      if (mouse.active) {
        const mx = n.x - mouse.x;
        const my = n.y - mouse.y;
        const dist = Math.sqrt(mx*mx + my*my);
        if (dist < 150 && dist > 0) {
          const force = (150 - dist) / 150;
          targetX += (mx / dist) * force * 150;
          targetY += (my / dist) * force * 150;
        }
      }

      // Intentional Easing: Spring Physics integration
      const ax = (targetX - n.x) * stiffness;
      const ay = (targetY - n.y) * stiffness;
      
      n.vx = (n.vx + ax / n.mass) * damping;
      n.vy = (n.vy + ay / n.mass) * damping;
      
      n.x += n.vx;
      n.y += n.vy;
      
      // Mass Conservation (Squash & Stretch rendering)
      const speed = Math.sqrt(n.vx*n.vx + n.vy*n.vy);
      const angle = Math.atan2(n.vy, n.vx);
      const stretch = 1 + speed * 0.15;
      const squash = 1 / stretch;

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(angle);
      ctx.scale(stretch, squash);
      
      ctx.beginPath();
      ctx.arc(0, 0, n.mass * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = nodeFill;
      ctx.fill();
      
      // Outer rim
      ctx.beginPath();
      ctx.arc(0, 0, n.mass * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = nodeStroke;
      ctx.stroke();
      ctx.restore();
    });

    animationFrameId = requestAnimationFrame(render);
  }

  render();

  // Return a cleanup function
  return () => {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseleave', onMouseLeave);
  };
}
