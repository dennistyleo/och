/**
 * Module: dashboard-animations.js
 * Version: 1.1.0
 * Description: Live canvas animations for Op-Page 1 (GNN force graph) and
 *              Op-Page 2 (Causal pulse + World Model particles).
 *
 *              FIX v1.1: Removed absolute-positioning overlay approach that
 *              caused layout drift on Op-Page 2. Canvases now fill their
 *              parent panels via measured clientWidth/clientHeight only after
 *              the panel is fully laid out — no CSS position overrides.
 *
 * Public API (called by main.js _showOpPage hook):
 *   dashAnim.startPage1()  — GNN force graph on #gnn-canvas
 *   dashAnim.startPage2()  — Causal pulse on #causal-canvas + particles on #wm-canvas
 *   dashAnim.stopAll()     — Cancel all running RAF loops
 */

const dashAnim = (() => {

  /* ── Animation handles ─────────────────────────────────────────────────── */
  let _gnnRaf    = null;
  let _causalRaf = null;
  let _wmRaf     = null;

  /* ── Palette ───────────────────────────────────────────────────────────── */
  const C_GREEN = '#00C853';
  const C_AMBER = '#ffaa33';
  const C_MINT  = '#88ff88';
  const C_BG    = '#03050a';
  const C_DIM   = 'rgba(57,255,20,0.45)';

  /* ── Safe canvas initialiser ─────────────────────────────────────────────
   * Shows the canvas, sizes it to the parent panel's CURRENT pixel size,
   * and returns {cv, ctx, W, H} — or null if the panel has no height yet.
   * Does NOT alter position/inset: HTML canvas is already inside .op-panel
   * which is position:relative, overflow:hidden.
   */
  function _initCanvas(id) {
    const cv = document.getElementById(id);
    if (!cv) return null;

    // CSS (styles.css) positions canvases as position:absolute; inset:0
    // JS only needs to set the drawing buffer resolution to match the panel
    const panel = cv.closest('.op-panel') || cv.parentElement;
    const W = panel ? panel.clientWidth  : (cv.parentElement?.clientWidth  || 400);
    const H = panel ? panel.clientHeight : (cv.parentElement?.clientHeight || 300);

    // Panel has no size yet (still display:none hierarchy) — bail out
    if (!W || !H) return null;

    cv.width  = W;
    cv.height = H;
    cv.style.display = 'block';   // reveal (was display:none in HTML)

    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    return { cv, ctx, W, H };
  }

  /* ── Resize helper — syncs canvas size to panel on window resize ───────── */
  function _onResize(id, fallback) {
    const cv = document.getElementById(id);
    if (!cv || cv.style.display === 'none') return;
    const panel = cv.closest('.op-panel') || cv.parentElement;
    if (!panel) return;
    const W = panel.clientWidth, H = panel.clientHeight;
    if (!W || !H) return;
    cv.width = W;
    cv.height = H;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     GNN FORCE GRAPH  ─  Op-Page 1 → #gnn-canvas
  ══════════════════════════════════════════════════════════════════════════ */
  function _startGNN(id='gnn-canvas') {
    const r = _initCanvas(id);
    if (!r) return;
    const { cv, ctx } = r;

    // Window resize
    window.addEventListener('resize', () => _onResize(id));

    // 5 nodes with fractional (0–1) positions, velocities
    const nodes = [
      { rx: 0.18, ry: 0.50, vx:  0.0020, vy:  0.0012, color: C_GREEN, rad: 6 },
      { rx: 0.50, ry: 0.28, vx: -0.0015, vy:  0.0018, color: C_GREEN, rad: 7 },
      { rx: 0.72, ry: 0.60, vx:  0.0012, vy: -0.0010, color: C_AMBER, rad: 8 },
      { rx: 0.33, ry: 0.72, vx: -0.0018, vy: -0.0008, color: C_GREEN, rad: 5 },
      { rx: 0.86, ry: 0.38, vx:  0.0008, vy:  0.0022, color: C_MINT,  rad: 6 },
    ];

    // Edge particles for every pair
    const edgeParts = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        edgeParts.push({ i, j, t: Math.random(), spd: 0.003 + Math.random() * 0.004 });

    function frame() {
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C_BG;
      ctx.fillRect(0, 0, W, H);

      // Update node positions — bounce at 6% margins
      nodes.forEach(n => {
        n.rx = Math.max(0.06, Math.min(0.94, n.rx + n.vx / W * 100));
        n.ry = Math.max(0.06, Math.min(0.94, n.ry + n.vy / H * 100));
        if (n.rx <= 0.06 || n.rx >= 0.94) n.vx *= -1;
        if (n.ry <= 0.06 || n.ry >= 0.94) n.vy *= -1;
      });

      // Edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].rx * W, nodes[i].ry * H);
          ctx.lineTo(nodes[j].rx * W, nodes[j].ry * H);
          ctx.strokeStyle = C_DIM;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Streaming particles on edges
      edgeParts.forEach(ep => {
        ep.t = (ep.t + ep.spd) % 1;
        const a = nodes[ep.i], b = nodes[ep.j];
        const px = (a.rx + (b.rx - a.rx) * ep.t) * W;
        const py = (a.ry + (b.ry - a.ry) * ep.t) * H;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = C_GREEN;
        ctx.shadowBlur = 8; ctx.shadowColor = C_GREEN;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Nodes
      nodes.forEach(n => {
        const nx = n.rx * W, ny = n.ry * H;
        // Glow halo
        ctx.beginPath();
        ctx.arc(nx, ny, n.rad + 3, 0, Math.PI * 2);
        ctx.strokeStyle = n.color + '44';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Filled dot
        ctx.beginPath();
        ctx.arc(nx, ny, n.rad, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowBlur = 14; ctx.shadowColor = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Caption
      ctx.font = '8px Inter, sans-serif';
      ctx.fillStyle = '#607080';
      ctx.fillText('message passing · latent iteration', 8, cv.height - 10);

      _gnnRaf = requestAnimationFrame(frame);
    }

    _gnnRaf = requestAnimationFrame(frame);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CAUSAL PULSE  ─  Op-Page 2 → #causal-canvas
  ══════════════════════════════════════════════════════════════════════════ */
  function _startCausal(id='causal-canvas') {
    const r = _initCanvas(id);
    if (!r) return;
    const { cv, ctx } = r;

    window.addEventListener('resize', () => _onResize(id));

    // Orbiting satellite nodes
    const sats = [
      { lbl: 'X₁', ang: 0,                 orb: 0.30, color: C_GREEN },
      { lbl: 'X₂', ang: Math.PI / 2,       orb: 0.28, color: C_AMBER },
      { lbl: 'X₃', ang: Math.PI,           orb: 0.32, color: C_GREEN },
      { lbl: 'X₄', ang: Math.PI * 1.5,     orb: 0.25, color: C_MINT  },
    ];
    let phase = 0;

    function frame() {
      const W = cv.width, H = cv.height;
      const cx = W / 2, cy = H / 2;
      phase += 0.025;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C_BG;
      ctx.fillRect(0, 0, W, H);

      const baseR = Math.min(W, H) * 0.20;

      // Pulsing rings
      for (let r = 0; r < 3; r++) {
        const rad = baseR + r * 14 + Math.sin(phase + r * 0.9) * 5;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(57,255,20,${0.65 - r * 0.18})`;
        ctx.lineWidth = r === 0 ? 2 : 1.2;
        ctx.stroke();
      }

      // Rotating rays
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + phase * 0.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * (baseR + 6),
                   cy + Math.sin(ang) * (baseR + 6));
        ctx.lineTo(cx + Math.cos(ang) * (baseR + 28 + Math.sin(phase * 2 + i) * 6),
                   cy + Math.sin(ang) * (baseR + 28 + Math.sin(phase * 2 + i) * 6));
        ctx.strokeStyle = 'rgba(0,200,83,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Satellites
      sats.forEach(s => {
        s.ang += 0.008;
        const orbitPx = Math.min(W, H) * s.orb;
        const sx = cx + Math.cos(s.ang) * orbitPx;
        const sy = cy + Math.sin(s.ang) * orbitPx;
        // Spoke
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = s.color + '55';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Dot
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowBlur = 10; ctx.shadowColor = s.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Label
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = '#c0d0e0';
        ctx.fillText(s.lbl, sx + 7, sy + 4);
      });

      // Central hub — pulses with phase
      const hubR = 10 + Math.sin(phase * 2) * 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
      ctx.fillStyle = C_GREEN;
      ctx.shadowBlur = 20; ctx.shadowColor = C_GREEN;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Caption
      ctx.font = '8px Inter, sans-serif';
      ctx.fillStyle = '#607080';
      ctx.textAlign = 'center';
      ctx.fillText('do-calculus · backdoor adjustment', cx, H - 10);
      ctx.textAlign = 'left';

      _causalRaf = requestAnimationFrame(frame);
    }

    _causalRaf = requestAnimationFrame(frame);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     WORLD MODEL PARTICLES  ─  Op-Page 2 → #wm-canvas
  ══════════════════════════════════════════════════════════════════════════ */
  function _startWM(id='wm-canvas') {
    const r = _initCanvas(id);
    if (!r) return;
    const { cv, ctx } = r;

    window.addEventListener('resize', () => {
      _onResize(id);
      _initParticles(cv);
    });

    const N = 80;
    let particles = [];

    function _initParticles(c) {
      const W = c.width, H = c.height;
      particles = Array.from({ length: N }, () => ({
        x:  Math.random() * W,
        y:  Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5 - 0.25,
        r:  1.5 + Math.random() * 2.5,
        a:  0.3 + Math.random() * 0.7,
        color: Math.random() < 0.7 ? C_GREEN : (Math.random() < 0.5 ? C_AMBER : C_MINT),
      }));
    }

    _initParticles(cv);

    function frame() {
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C_BG;
      ctx.fillRect(0, 0, W, H);

      // Proximity lines
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 55) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(57,255,20,${0.12 * (1 - d / 55)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Particles
      particles.forEach(p => {
        // Wrap-around movement
        p.x = ((p.x + p.vx) + W) % W;
        p.y = ((p.y + p.vy) + H + 20) % (H + 20) - 10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.a;
        ctx.shadowBlur = 5; ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      });

      // Caption
      ctx.font = '8px Inter, sans-serif';
      ctx.fillStyle = '#607080';
      ctx.fillText(`${N} particles · stochastic simulation`, 10, H - 10);

      _wmRaf = requestAnimationFrame(frame);
    }

    _wmRaf = requestAnimationFrame(frame);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════════════════ */

  /* Live data updated by matchEngine  */
  let _liveData = { gnnData: null, causalData: null, particles: null };

  /**
   * Start GNN animation on Op-Page 1.
   * Uses requestAnimationFrame after a 100ms layout settle to avoid
   * measuring a zero-height panel.
   */
  function startPage1() {
    stopAll();
    // Small delay so the panel has rendered before we measure clientHeight
    setTimeout(() => _startGNN('gnn-canvas'), 100);
  }

  /**
   * Start Causal + World Model animations on Op-Page 2.
   */
  function startPage2() {
    stopAll();
    setTimeout(() => { _startCausal('causal-canvas'); _startWM('wm-canvas'); }, 100);
  }

  /** Cancel all active animation loops and hide canvases. */
  function stopAll() {
    if (_gnnRaf)    { cancelAnimationFrame(_gnnRaf);    _gnnRaf    = null; }
    if (_causalRaf) { cancelAnimationFrame(_causalRaf); _causalRaf = null; }
    if (_wmRaf)     { cancelAnimationFrame(_wmRaf);     _wmRaf     = null; }

    // Hide canvases so video shows again if animations are stopped
    ['gnn-canvas','causal-canvas','wm-canvas','gnn-canvas-3','wm-canvas-3','causal-canvas-3'].forEach(id => {
      const cv = document.getElementById(id);
      if (cv) cv.style.display = 'none';
    });
  }

  /**
   * Start all three animations on Op-Page 3 canvases.
   */
  function startPage3() {
    stopAll();
    setTimeout(() => {
      _startGNN('gnn-canvas-3');
      _startWM('wm-canvas-3');
      _startCausal('causal-canvas-3');
    }, 100);
  }

  /**
   * Update live data from axiom matching; restarts anim on active page.
   * @param {{ gnnData, causalData, particles }} data
   */
  function updateData(data) {
    const page = parseInt(
      document.querySelector('.op-page.op-page-active')?.id?.replace('op-page-','') || '1'
    );
    if (page === 1) { setTimeout(() => _startGNN('gnn-canvas'), 80); }
    else if (page === 2) { setTimeout(() => { _startCausal('causal-canvas'); _startWM('wm-canvas'); }, 80); }
    else if (page === 3) { setTimeout(() => { _startGNN('gnn-canvas-3'); _startWM('wm-canvas-3'); _startCausal('causal-canvas-3'); }, 80); }
  }

  return { startPage1, startPage2, startPage3, stopAll, updateData };

})();

export { dashAnim };
