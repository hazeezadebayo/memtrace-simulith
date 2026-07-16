(function(){
    const canvas = document.getElementById('footerGraph');
    const ctx = canvas.getContext('2d');
    let w, h, nodes, edges, animId;

    function resize() {
        const footer = canvas.parentElement;
        w = canvas.width = footer.offsetWidth;
        h = canvas.height = footer.offsetHeight;
    }

    function initGraph() {
        const numNodes = 30;
        nodes = [];
        edges = [];
        for (let i = 0; i < numNodes; i++) {
            nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, r: 2 + Math.random() * 4 });
        }
        for (let i = 0; i < numNodes; i++) {
            for (let j = i + 1; j < numNodes; j++) {
                if (Math.random() < 0.25) {
                    const maxDist = 120 + Math.random() * 80;
                    edges.push({ from: i, to: j, maxDist, alpha: 0.08 + Math.random() * 0.12 });
                }
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        for (const e of edges) {
            const a = nodes[e.from], b = nodes[e.to];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < e.maxDist * 1.5) {
                const alpha = e.alpha * (1 - dist / (e.maxDist * 1.5));
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
        }
        for (const n of nodes) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fill();
        }
    }

    function simulate() {
        for (const n of nodes) {
            n.vx *= 0.9; n.vy *= 0.9;
        }
        for (const e of edges) {
            const a = nodes[e.from], b = nodes[e.to];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const force = (dist - e.maxDist) * 0.0004;
            const fx = (dx / dist) * force, fy = (dy / dist) * force;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
        }
        for (const n of nodes) {
            n.x += n.vx; n.y += n.vy;
            if (n.x < 0) n.x = 0;
            if (n.x > w) n.x = w;
            if (n.y < 0) n.y = 0;
            if (n.y > h) n.y = h;
        }
    }

    function loop() {
        resize();
        simulate();
        draw();
        animId = requestAnimationFrame(loop);
    }

    resize();
    initGraph();
    loop();

    window.addEventListener('resize', () => { resize(); initGraph(); });
})();
