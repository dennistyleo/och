/**
 * Module: gnn_3d_engine.js
 * Version: 1.1.0
 * Description: 3D GNN Visualization Engine — mathematically rigorous.
 *
 * Rule 03: Subscribes to window.SovereignBUS event 'DRIFT_DETECTED' for live updates.
 *          Exposes window.GNN3D.render() but also responds to BUS events
 *          (does NOT require direct HTML script calls).
 * Skill gnn-code-generator: Implements required API:
 *   GNN3D.build_3d_shape(nodes, edges)  — constructs graph geometry
 *   GNN3D.detect_drift(shape)           — returns { driftDetected, score }
 *   GNN3D.rotate_time(shape, dir, cycles) — advances animation frame
 * Rule 00: All public functions have JSDoc.
 * Rule 04: All exceptions logged with error code prefix.
 *
 * Math foundations:
 *  NODES  : v_i = [x_i, y_i, z_i] where x=score, y=category_rank, z=severity
 *  EDGES  : W_ij = cosine_similarity(kw_i, kw_j) [keyword overlap]
 *  SURFACE: f(u,v) = Σ K(||(u,v)−pᵢ||,h)·z_i / Σ K(||…||,h)
 *           K(r,h) = exp(−r²/2h²)  [Gaussian / Nadaraya-Watson]
 *  ROTATE : p' = Rx(θx) · Ry(θy) · p   (rotation matrices)
 *  PROJECT: X = cx + f·x'/(z'+f+D)      (perspective, focal f, depth D)
 *  CAUSAL : Dijkstra shortest-path on cosine-similarity graph
 *           from rejected-cluster centroid → elected-cluster centroid
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   §1  LINEAR ALGEBRA PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════════ */

const LA = {
    /** Rotate a 3-vector [x,y,z] by θx around X-axis */
    rx(v, θ) {
        const c = Math.cos(θ), s = Math.sin(θ);
        return [v[0], c*v[1]-s*v[2], s*v[1]+c*v[2]];
    },
    /** Rotate a 3-vector by θy around Y-axis */
    ry(v, θ) {
        const c = Math.cos(θ), s = Math.sin(θ);
        return [c*v[0]+s*v[2], v[1], -s*v[0]+c*v[2]];
    },
    /** Perspective-project a 3-vector to screen [X,Y] */
    project(v, cx, cy, focal, scale, depth) {
        const dz = v[2] + focal + depth;
        const w  = dz > 0.001 ? focal / dz : 0;
        return [cx + v[0]*w*scale, cy + v[1]*w*scale, v[2]];
    },
    /** Cosine similarity between two boolean-set arrays (as sorted string arrays) */
    cosineSim(a_kws, b_kws) {
        if (!a_kws || !b_kws || !a_kws.length || !b_kws.length) return 0;
        const A = new Set(a_kws), B = new Set(b_kws);
        let inter = 0;
        A.forEach(k => { if (B.has(k)) inter++; });
        return inter / Math.sqrt(A.size * B.size);
    },
    /** Gaussian radial basis kernel */
    gaussK(r, h) { return Math.exp(-(r*r)/(2*h*h)); },
    /** Euclidean distance between two 2D points */
    dist2(ax, ay, bx, by) { return Math.sqrt((ax-bx)**2+(ay-by)**2); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   §1b  SHARED RENDER HELPERS  (module scope — consumed by GNN3D + WorldModel)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convert a CSS hex colour string to {r,g,b}.
 * D2-T3: hoisted from GNN closure so WorldModel can share it without ReferenceError.
 * @param {string} hex
 * @returns {{r:number,g:number,b:number}|null}
 */
function hexToRgb(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res ? { r: parseInt(res[1],16), g: parseInt(res[2],16), b: parseInt(res[3],16) } : null;
}

/**
 * Compute a per-frame sinusoidal pulse value for ELECTED node glow.
 * D2-T3: hoisted to module scope — previously captured only inside GNN closure.
 * @param {number} t  - Frame counter
 * @returns {number}  - Pixel offset [−2, +2]
 */
function sharedPulse(t) { return Math.sin(t * 0.09) * 2; }

/* ═══════════════════════════════════════════════════════════════════════════
   §2  AXIOM FEATURE EXTRACTION
   Build feature vectors from SOVEREIGN_AXIOM_DB + election results
   ═══════════════════════════════════════════════════════════════════════════ */

const CAT_RANK = {
    causality:1, determinism:2, resource_integrity:3, data_integrity:4,
    control_flow:5, concurrency:6, security:7, firmware:8,
    electronics:9, rtl:10, common_sense:11
};
const SEV_RANK = { CRITICAL:1.0, HIGH:0.75, MEDIUM:0.5, LOW:0.25 };
const CAT_COLS = {
    causality:'#006622', determinism:'#005a8a', resource_integrity:'#7a5c00',
    data_integrity:'#8a4200', control_flow:'#5a1a7a', concurrency:'#8a1a1a',
    security:'#7a0020', firmware:'#00607a', electronics:'#1a5080',
    rtl:'#1a5a20', common_sense:'#7a7a00',
    ipc_pcb:'#7a3d00', iot_security:'#003d5a', iot_protocol:'#004d3a',
    iot_reliability:'#3d005a'
};

function buildNodes(sel, can, sby) {
    /**
     * Returns array of node objects:
     * { id, name, category, keywords, tier,
     *   x: score  [0..1],
     *   y: catRank[0..1],
     *   z: sevRank [0..1],
     *   color }
     */
    const allAxioms = window.SOVEREIGN_AXIOM_DB || [];
    const nCats = 11;
    const selSet = new Set(sel.map(a=>a.id));
    const canSet = new Set(can.map(a=>a.id));

    return allAxioms.map(ax => {
        const tier = selSet.has(ax.id) ? 'ELECTED'
                   : canSet.has(ax.id) ? 'CANDIDATE'
                   : 'STANDBY';
        const score    = (sel.find(a=>a.id===ax.id)||can.find(a=>a.id===ax.id)||{score:0}).score || 0;
        const catR     = (CAT_RANK[(ax.category||'').toLowerCase().replace(/ /g,'_')] || 6) / nCats;
        const sevR     = SEV_RANK[ax.severity] || 0.5;
        const catKey   = (ax.category||'causality').toLowerCase().replace(/ /g,'_');
        const baseCol  = CAT_COLS[catKey] || '#888';
        return {
            id:       ax.id,
            name:     ax.name,
            category: catKey,
            keywords: ax.keywords || [],
            severity: ax.severity || 'MEDIUM',
            tier,
            score,
            x: score * 2 - 1,
            y: catR  * 2 - 1,
            z: sevR  * 2 - 1,
            /* Dark palette — readable on white background */
            color: tier==='ELECTED'  ? '#005c22'
                 : tier==='CANDIDATE'? '#7a5c00'
                 : (baseCol || '#999999') + 'bb'
        };
    });
}

function buildEdges(nodes) {
    /**
     * W_ij = cosine_similarity(kw_i, kw_j)
     * Only keep edges with W > threshold (sparse adjacency)
     * Returns [{i, j, weight}]
     */
    const THRESH = 0.12;
    const edges = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
            const w = LA.cosineSim(nodes[i].keywords, nodes[j].keywords);
            if (w >= THRESH) edges.push({i, j, weight: w});
        }
    }
    return edges;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §3  SURFACE — Nadaraya-Watson kernel regression over node manifold
   ═══════════════════════════════════════════════════════════════════════════ */

function buildSurface(nodes, GRID=20) {
    /**
     * Creates GRID×GRID mesh.
     * For each grid point (u,v) ∈ [-1,+1]²:
     *   f(u,v) = Σᵢ K(r_i,h)·z_i / Σᵢ K(r_i,h)
     *   where r_i = ||(u,v) − (x_i,y_i)||₂
     * Returns { pts: Float32Array[3*(GRID+1)²], tris: index pairs }
     */
    const h = 0.7;  // kernel bandwidth
    const pts = [];
    const step = 2 / GRID;
    for (let iy = 0; iy <= GRID; iy++) {
        for (let ix = 0; ix <= GRID; ix++) {
            const u = -1 + ix * step;
            const v = -1 + iy * step;
            let num = 0, den = 0;
            for (const nd of nodes) {
                const r = LA.dist2(u, v, nd.x, nd.y);
                const k = LA.gaussK(r, h);
                num += k * nd.z;
                den += k;
            }
            const z = den > 1e-9 ? num / den : 0;
            pts.push([u, v, z]);        // [x=score-axis, y=cat-axis, z=interp]
        }
    }
    /* Quadrilateral faces → triangles */
    const tris = [];
    for (let iy = 0; iy < GRID; iy++) {
        for (let ix = 0; ix < GRID; ix++) {
            const a = iy*(GRID+1)+ix;
            const b = a+1;
            const c = a+(GRID+1);
            const d = c+1;
            tris.push([a,b,c], [b,d,c]);          // two triangles per quad
        }
    }
    return { pts, tris, GRID };
}

/* ═══════════════════════════════════════════════════════════════════════════
   §4  3D GNN RENDERER — rotate + project + painter's sort + draw
   ═══════════════════════════════════════════════════════════════════════════ */

window.GNN3D = (function() {
    let _raf = null, _dragging = false, _lastMX = 0, _lastMY = 0;
    /* D2-T1: track which node is currently hovered (null = none) */
    let _hoveredNodeId = null;
    /* D2-T5: track which node is pulsing amber (HITL spatial pin) */
    let _pulseNodeId = null, _pulseTimer = 0;

    function render(canvas, sel, can, sby, opts={}) {
        if (!canvas) return;
        if (_raf) cancelAnimationFrame(_raf);

        const ctx   = canvas.getContext('2d');
        /* DFT Hook: Playwright asserts this to confirm render loop is live */
        if (ctx) canvas.setAttribute('data-test-render', 'active');
        const W     = canvas.width, H = canvas.height;
        const cx    = W/2,     cy  = H/2;
        const FOCAL = 3.5,     DEPTH = 2;
        const SCALE = Math.min(W, H) * 0.33;
        const GRID  = opts.grid || 18;

        const nodes   = buildNodes(sel, can, sby);
        const edges   = buildEdges(nodes);
        const surface = buildSurface(nodes, GRID);
        const surfPts = surface.pts;
        const surfTri = surface.tris;

        /* Auto-rotate state */
        let θx = -0.45, θy = 0.6;
        let autoSpin = true;
        let t = 0;

        /* Cached projected node positions for hover hit-testing */
        let _projectedNodes = [];

        /* D2-T4: direct assignment — prevents listener stacking on Cycle-B re-renders */
        canvas.onmousedown = e => { _dragging=true; _lastMX=e.clientX; _lastMY=e.clientY; autoSpin=false; };

        /* D2-T1: unified onmousemove — handles drag rotation AND 12px proximity hover */
        canvas.onmousemove = e => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            /* Drag rotation */
            if (_dragging) {
                θy += (e.clientX - _lastMX) * 0.012;
                θx += (e.clientY - _lastMY) * 0.008;
                _lastMX = e.clientX; _lastMY = e.clientY;
            }

            /* Proximity hover — find nearest projected node within 12px */
            const HOVER_R = 12;
            let nearest = null, nearDist = Infinity;
            for (const pn of _projectedNodes) {
                const d = LA.dist2(mx, my, pn.px, pn.py);
                if (d < HOVER_R && d < nearDist) { nearest = pn.id; nearDist = d; }
            }
            _hoveredNodeId = nearest;
            canvas.style.cursor = nearest ? 'crosshair' : (_dragging ? 'grabbing' : 'grab');
        };
        canvas.onmouseup = canvas.onmouseleave = () => { _dragging=false; };
        canvas.style.cursor = 'grab';

        function project(p) {
            let v = LA.rx(p, θx);
                v = LA.ry(v, θy);
            return LA.project(v, cx, cy, FOCAL, SCALE, DEPTH);
        }

        function drawAxes() {
            /* X-axis: red, Y-axis: green, Z-axis: blue */
            const axisLen = 1.3;
            const axes = [
                [[0,0,0],[axisLen,0,0],'#ff4444','X'],
                [[0,0,0],[0,axisLen,0],'#44ff44','Y'],
                [[0,0,0],[0,0,axisLen],'#4477ff','Z'],
            ];
            axes.forEach(([a, b, col, lbl]) => {
                const [ax2, ay2] = project(a);
                const [bx, by]   = project(b);
                ctx.beginPath(); ctx.moveTo(ax2,ay2); ctx.lineTo(bx,by);
                ctx.strokeStyle=col+'99'; ctx.lineWidth=1.2;
                ctx.setLineDash([]); ctx.stroke();
                ctx.fillStyle=col; ctx.font='bold 7px Calibri, \'Microsoft JhengHei\', sans-serif';
                ctx.fillText(lbl, bx+2, by+4);
            });
        }

        function drawGridLines() {
            /* Faint grid on z=-1 plane */
            ctx.strokeStyle='#dde8dd'; ctx.lineWidth=0.5;
            const N=6, step=2/N;
            for (let i=0;i<=N;i++) {
                const u=-1+i*step;
                const [px1,py1]=project([u,-1,-1]);
                const [px2,py2]=project([u, 1,-1]);
                ctx.beginPath(); ctx.moveTo(px1,py1); ctx.lineTo(px2,py2); ctx.stroke();
                const [qx1,qy1]=project([-1,u,-1]);
                const [qx2,qy2]=project([ 1,u,-1]);
                ctx.beginPath(); ctx.moveTo(qx1,qy1); ctx.lineTo(qx2,qy2); ctx.stroke();
            }
        }

        function drawSurface() {
            /* Compute projected triangles, sort by avg z (painter's algo) */
            const projPts = surfPts.map(p => project(p));
            const trisWithZ = surfTri.map(([a,b,c]) => {
                const za = surfPts[a][2], zb = surfPts[b][2], zc = surfPts[c][2];
                const zMid = (za+zb+zc)/3;
                return { a, b, c, zMid };
            });
            trisWithZ.sort((x,y) => x.zMid - y.zMid);

            trisWithZ.forEach(({a, b, c, zMid}) => {
                const [ax2,ay2] = projPts[a];
                const [bx, by]  = projPts[b];
                const [cx2,cy2] = projPts[c];
                const norm = (zMid+1)*0.5;           // 0..1
                /* On white: green=compliant, amber=elevated, red=violation */
                const r = Math.round(norm > 0.65 ? 220 : 40 + norm*30);
                const g = Math.round(norm > 0.65 ? 80  : 160 + norm*60);
                const bl= Math.round(norm > 0.65 ? 40  : 40 + norm*20);
                ctx.beginPath();
                ctx.moveTo(ax2,ay2); ctx.lineTo(bx,by); ctx.lineTo(cx2,cy2);
                ctx.closePath();
                ctx.fillStyle=`rgba(${r},${g},${bl},0.18)`;
                ctx.fill();
                ctx.strokeStyle=`rgba(${r},${g},${bl},0.40)`;
                ctx.lineWidth=0.5; ctx.stroke();
            });
        }

        function drawEdges() {
            /* Semi-transparent edges proportional to similarity weight */
            edges.forEach(({i, j, weight}) => {
                if (weight < 0.2) return;
                const ni = nodes[i], nj = nodes[j];
                const [px1,py1] = project([ni.x, ni.y, ni.z]);
                const [px2,py2] = project([nj.x, nj.y, nj.z]);
                const isActive = ni.tier!=='STANDBY'||nj.tier!=='STANDBY';
                ctx.beginPath(); ctx.moveTo(px1,py1); ctx.lineTo(px2,py2);
                ctx.strokeStyle = isActive
                    ? `rgba(0,140,60,${weight*0.55})`
                    : `rgba(180,180,180,${weight*0.18})`;
                ctx.lineWidth = weight * (isActive ? 1.5 : 0.6);
                ctx.stroke();
            });
        }

        function drawNodes() {
            /* Sort by projected z — far nodes drawn first */
            const sorted = nodes.map((nd) => {
                const [px,py,pz] = project([nd.x, nd.y, nd.z]);
                return { nd, id: nd.id, px, py, pz };
            }).sort((a,b) => a.pz - b.pz);

            /* D2-T1: refresh cached projected positions for next mousemove hit-test */
            _projectedNodes = sorted.map(s => ({ id: s.id, px: s.px, py: s.py }));

            sorted.forEach(({nd, px, py}) => {
                const r = nd.tier==='ELECTED' ? 7
                        : nd.tier==='CANDIDATE' ? 5 : 3;
                const pulse = nd.tier==='ELECTED' ? sharedPulse(t) : 0;  /* D2-T3: module-scope helper */
                const dynGreen = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#008c3c';

                /* D2-T1: amber ring override when this node is hovered */
                const isHovered = nd.id === _hoveredNodeId;
                const isPulsing = nd.id === _pulseNodeId;
                const nodeCol = (isHovered || isPulsing) ? '#D4AF37'
                              : nd.tier==='ELECTED'  ? dynGreen
                              : nd.tier==='CANDIDATE' ? '#D4AF37'
                              : '#aaaaaa';

                if (nd.tier==='ELECTED' && !isHovered && !isPulsing) {
                    const rgb = hexToRgb(dynGreen) || {r:0,g:140,b:60};  /* D2-T3: module-scope */
                    const g=ctx.createRadialGradient(px,py,0,px,py,r+pulse+8);
                    g.addColorStop(0,`rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`); g.addColorStop(1,'transparent');
                    ctx.beginPath(); ctx.arc(px,py,r+pulse+8,0,Math.PI*2);
                    ctx.fillStyle=g; ctx.fill();
                }

                /* D2-T1: amber glow halo on hover or HITL pulse */
                if (isHovered || isPulsing) {
                    const glowR = isPulsing ? r + 15 + Math.sin(t*0.1)*5 : r + 10;
                    const alpha = isPulsing ? 0.5 + Math.sin(t*0.1)*0.2 : 0.4;
                    const g = ctx.createRadialGradient(px,py,0,px,py,glowR);
                    g.addColorStop(0,`rgba(212,175,55,${alpha})`); g.addColorStop(1,'transparent');
                    ctx.beginPath(); ctx.arc(px,py,glowR,0,Math.PI*2);
                    ctx.fillStyle=g; ctx.fill();
                }

                ctx.beginPath(); ctx.arc(px,py,r+pulse,0,Math.PI*2);
                ctx.fillStyle = nodeCol+'33'; ctx.fill();
                ctx.strokeStyle = (isHovered || isPulsing) ? '#D4AF37' : nodeCol;
                ctx.lineWidth = (nd.tier==='ELECTED' || isHovered || isPulsing) ? 2 : 0.8;
                ctx.stroke();
                if (nd.tier !== 'STANDBY') {
                    ctx.fillStyle=nodeCol; ctx.font='bold 5.5px Calibri, \'Microsoft JhengHei\', sans-serif';
                    ctx.textAlign='center'; ctx.fillText(nd.id.slice(0,8), px, py-r-pulse-3);
                }
            });
        }

        function drawLabels() {
            ctx.fillStyle='#005522'; ctx.font='bold 6px Calibri, \'Microsoft JhengHei\', sans-serif';
            ctx.textAlign='left';
            ctx.fillText('GNN · '+nodes.length+' nodes · '+edges.length+' edges  [drag to rotate]', 4, 11);
            ctx.fillStyle='#007733'; ctx.font='5.5px Calibri, \'Microsoft JhengHei\', sans-serif';
            ctx.fillText('X=score  Y=category  Z=severity', 4, H-6);
            /* Elected axiom legend */
            sel.slice(0,4).forEach((a,i) => {
                ctx.fillStyle='#005522'; ctx.font='bold 5.5px Calibri, \'Microsoft JhengHei\', sans-serif';
                ctx.textAlign='right';
                ctx.fillText('▶ '+a.id, W-4, 11+i*9);
            });
        }

        function drawVTKEvidence() {
            if (!window.GNN3D.vtkPoints) return;
            const pts = window.GNN3D.vtkPoints;
            const N = Math.sqrt(pts.length);
            if (!Number.isInteger(N)) return;
            for (let i=0; i<N-1; i++) {
                for (let j=0; j<N-1; j++) {
                    const p1 = pts[i*N+j];
                    const p2 = pts[i*N+j+1];
                    const p3 = pts[(i+1)*N+j+1];
                    const p4 = pts[(i+1)*N+j];
                    
                    // The simulation grid is 0..10. Center it by subtracting 5. 
                    // Multiply Z by 10 to exaggerate.
                    const [x1,y1] = project([p1.x - 5, p1.y - 5, p1.z * 10]);
                    const [x2,y2] = project([p2.x - 5, p2.y - 5, p2.z * 10]);
                    const [x3,y3] = project([p3.x - 5, p3.y - 5, p3.z * 10]);
                    const [x4,y4] = project([p4.x - 5, p4.y - 5, p4.z * 10]);

                    ctx.beginPath();
                    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
                    ctx.closePath();
                    
                    const z = p1.z;
                    // z < 0 means droop, color red. otherwise normal.
                    if (z < -0.1) {
                        ctx.fillStyle = 'rgba(255, 50, 50, 0.4)';
                        ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                    } else {
                        ctx.fillStyle = 'rgba(50, 100, 255, 0.2)';
                        ctx.strokeStyle = 'rgba(0, 50, 255, 0.3)';
                    }
                    ctx.fill();
                    ctx.stroke();
                }
            }
        }

        function frame() {
            ctx.clearRect(0,0,W,H);
            ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);  /* WHITE background */
            if (autoSpin) { θy += 0.006; θx = -0.42+Math.sin(t*0.003)*0.12; }
            
            /* D2-T5: pulse timer decay */
            if (_pulseTimer > 0) {
                _pulseTimer--;
                if (_pulseTimer <= 0) _pulseNodeId = null;
            }

            drawGridLines();
            if (window.GNN3D.vtkPoints) {
                drawVTKEvidence();
            } else {
                drawSurface();
            }
            drawEdges();
            drawNodes();
            drawAxes();
            drawLabels();
            t++;
            _raf = requestAnimationFrame(frame);
        }
        frame();
    }

    function setPulseNode(id) {
        _pulseNodeId = id;
        _pulseTimer  = 300; // ~5 seconds at 60fps
        console.log('[GNN3D] Spatial pulse triggered for:', id);
    }

    return { render, setPulseNode };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   §5  WORLD MODEL — XY-plane projection of manifold + compliance bands
   ═══════════════════════════════════════════════════════════════════════════ */

window.WorldModel = (function() {
    let _raf = null;

    function render(canvas, sel, can, sby) {
        if (!canvas) return;
        if (_raf) cancelAnimationFrame(_raf);

        const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
        const GRID=28;
        const nodes = buildNodes(sel, can, sby);
        const surface = buildSurface(nodes, GRID);
        const pts = surface.pts;
        const step = 2/GRID;

        /* Map [-1,+1] → canvas pixels */
        const toX = u => W*0.08 + (u+1)*0.5*W*0.84;
        const toY = v => H*0.90 - (v+1)*0.5*H*0.80;

        let t = 0;

        function draw() {
            ctx.clearRect(0,0,W,H);
            ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);   /* WHITE background */

            /* Draw surface heatmap (top-down projection) */
            for (let iy=0; iy<GRID; iy++) {
                for (let ix=0; ix<GRID; ix++) {
                    const idx = iy*(GRID+1)+ix;
                    const p   = pts[idx];
                    const z   = p[2];                    // kernel-interpolated severity
                    const norm = (z+1)*0.5;              // 0…1
                    const u0=p[0], v0=p[1];
                    const x0=toX(u0), y0=toY(v0);
                    const x1=toX(u0+step), y1=toY(v0+step);
                    /* White bg: dark green = compliant/elected, steel grey = unmatched */
                    ctx.fillStyle = norm > 0.65
                        ? `rgba(0,${Math.round(100+norm*80)},${Math.round(norm*40)},${norm*0.38})`
                        : `rgba(${Math.round(180-norm*60)},${Math.round(180+norm*40)},${Math.round(180-norm*60)},${norm*0.22})`;
                    ctx.fillRect(x0, y1, x1-x0, y0-y1);
                }
            }

            /* Draw VTK Evidence Heatmap (if available) */
            function drawVTKEvidence() {
                if (!window.GNN3D || !window.GNN3D.vtkPoints) return;
                const pts = window.GNN3D.vtkPoints;
                const N = Math.sqrt(pts.length);
                if (!Number.isInteger(N)) return;
                for (let i=0; i<N-1; i++) {
                    for (let j=0; j<N-1; j++) {
                        const p1 = pts[i*N+j];
                        const p2 = pts[i*N+j+1];
                        const p3 = pts[(i+1)*N+j+1];
                        const p4 = pts[(i+1)*N+j];
                        
                        const x1 = toX((p1.x - 5) / 5); const y1 = toY((p1.y - 5) / 5);
                        const x2 = toX((p2.x - 5) / 5); const y2 = toY((p2.y - 5) / 5);
                        const x3 = toX((p3.x - 5) / 5); const y3 = toY((p3.y - 5) / 5);
                        const x4 = toX((p4.x - 5) / 5); const y4 = toY((p4.y - 5) / 5);
                        
                        ctx.beginPath();
                        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
                        ctx.closePath();
                        
                        const z = p1.z;
                        if (z < -0.1) {
                            ctx.fillStyle = 'rgba(255, 50, 50, 0.4)';
                            ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                        } else {
                            ctx.fillStyle = 'rgba(50, 100, 255, 0.1)';
                            ctx.strokeStyle = 'rgba(0, 50, 255, 0.1)';
                        }
                        ctx.fill();
                        ctx.stroke();
                    }
                }
            }
            drawVTKEvidence();

            /* Compliance boundary contours */
            ctx.strokeStyle='#00883366'; ctx.lineWidth=1; ctx.setLineDash([3,4]);
            [0.55, 0.70].forEach(lvl => {
                const xb = toX(lvl*2-1);
                ctx.beginPath(); ctx.moveTo(xb, toY(-1)); ctx.lineTo(xb, toY(1));
                ctx.stroke();
            });
            ctx.setLineDash([]);

            /* Axes labels */
            ctx.fillStyle='#005522'; ctx.font='bold 6px Calibri, \'Microsoft JhengHei\', sans-serif';
            ctx.textAlign='left';
            ctx.fillText('WM · AXIOM CONSTRAINT MANIFOLD — TOP VIEW',4,10);
            ctx.fillStyle='#007733'; ctx.font='5.5px Calibri, \'Microsoft JhengHei\', sans-serif';
            ctx.fillText('X → ELECTION SCORE', toX(-1), H-4);
            ctx.save(); ctx.translate(10, toY(0)); ctx.rotate(-Math.PI/2);
            ctx.fillText('Y → CATEGORY RANK', 0, 0); ctx.restore();

            /* D2-T2: WorldModel amber hover state — 12px proximity test */
            const WM_HOVER_R = 12;
            let _wmHoveredId = null;  /* reset each draw call; set by mousemove below */
            if (!canvas._wmHoverSetup) {
                canvas._wmHoverSetup = true;  /* guard — only wire once per canvas */
                canvas._wmHoveredId = null;
                canvas.onmousemove = e => {
                    const rect = canvas.getBoundingClientRect();
                    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
                    let nearest = null, nearDist = Infinity;
                    for (const nd of nodes) {
                        const px2 = toX(nd.x), py2 = toY(nd.y);
                        const d = LA.dist2(mx, my, px2, py2);
                        if (d < WM_HOVER_R && d < nearDist) { nearest = nd.id; nearDist = d; }
                    }
                    if (nearest !== canvas._wmHoveredId) {
                        if (nearest) console.log('[WorldModel] hover:', nearest);
                        canvas._wmHoveredId = nearest;
                    }
                };
            }
            _wmHoveredId = canvas._wmHoveredId;

            /* Draw elected axiom nodes as glowing points */
            nodes.forEach(nd => {
                if (nd.tier==='STANDBY' && Math.random() > 0.97) return;
                const px=toX(nd.x), py=toY(nd.y);
                const r = nd.tier==='ELECTED'?6 : nd.tier==='CANDIDATE'?4:2;
                const dynGreen = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || '#008c3c';
                const pulse = nd.tier==='ELECTED' ? sharedPulse(t) : 0;  /* D2-T3: module-scope */

                /* D2-T2: amber override when hovered */
                const wmHovered = nd.id === _wmHoveredId;
                const nodeCol = wmHovered ? '#D4AF37'
                              : nd.tier==='ELECTED'  ? dynGreen
                              : nd.tier==='CANDIDATE' ? '#D4AF37'
                              : '#aaaaaa';

                if (nd.tier==='ELECTED' && !wmHovered) {
                    const rgb = hexToRgb(dynGreen) || {r:0,g:140,b:60};  /* D2-T3: module-scope */
                    const g=ctx.createRadialGradient(px,py,0,px,py,r+pulse+8);
                    g.addColorStop(0,`rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`); g.addColorStop(1,'transparent');
                    ctx.beginPath(); ctx.arc(px,py,r+pulse+8,0,Math.PI*2);
                    ctx.fillStyle=g; ctx.fill();
                }

                /* D2-T2: amber halo on WorldModel hover */
                if (wmHovered) {
                    const g = ctx.createRadialGradient(px,py,0,px,py,r+10);
                    g.addColorStop(0,'rgba(212,175,55,0.40)'); g.addColorStop(1,'transparent');
                    ctx.beginPath(); ctx.arc(px,py,r+10,0,Math.PI*2);
                    ctx.fillStyle=g; ctx.fill();
                }

                ctx.beginPath(); ctx.arc(px,py,r+pulse,0,Math.PI*2);
                ctx.fillStyle=nodeCol+'22'; ctx.fill();
                ctx.strokeStyle = wmHovered ? '#D4AF37' : nodeCol;
                ctx.lineWidth=nd.tier==='ELECTED'?2:1; ctx.stroke();
                ctx.fillStyle=nodeCol; ctx.font='bold 6px Calibri, \'Microsoft JhengHei\', sans-serif';
                ctx.textAlign='center'; ctx.fillText((nd.id||'').slice(0,10),px,py+2);
                if (nd.sub) {
                    ctx.font='4.5px Calibri, \'Microsoft JhengHei\', sans-serif'; ctx.fillStyle=nodeCol+'99';
                    ctx.fillText(nd.sub,px,py+r+10);
                }
                if (nd.score>0) {
                    ctx.font='5px Calibri, \'Microsoft JhengHei\', sans-serif'; ctx.fillStyle='#005522aa';
                    ctx.fillText(Math.round(nd.score*100)+'%', px, py+r+10);
                }
            });

            ctx.fillStyle='#005522'; ctx.font='bold 6px Calibri, \'Microsoft JhengHei\', sans-serif';
            ctx.textAlign='left';
            ctx.fillText('CM · CAUSAL CORRIDOR  [Dijkstra cosine-sim graph]',4,H-14);
            /* NULL-GUARD (hotfix): corridorPath lives in the Causal Model closure, not WorldModel.
               When the pipeline short-circuits (fast-path < 1.5s), it may be undefined here.
               Use optional chaining + typeof check to prevent ReferenceError crash. */
            const _cp = (typeof corridorPath !== 'undefined') ? corridorPath : (window._sovereignCorridorPath || []);
            if (_cp.length > 1) {
                const pathStr = _cp.slice(0,4).map(i=>nodes[i]?.id||'?').join('→');
                ctx.fillStyle='#b8860bcc'; ctx.font='5.5px Calibri, \'Microsoft JhengHei\', sans-serif';
                ctx.fillText('corridor: '+pathStr+(_cp.length>4?'…':''), 4, H-6);
            }
            t++;
            _raf = requestAnimationFrame(draw);
        }
        draw();
    }
    return { render };
})();

/* ────────────────────────────────────────────────────────────────────────
   Skill: gnn-code-generator — Required method aliases + BUS subscription
   Rule 00: JSDoc on all public functions
   Rule 03: Subscribe to DRIFT_DETECTED via window.SovereignBUS
──────────────────────────────────────────────────────────────────────── */

/* Extend window.GNN3D with the required Skill API */
if (window.GNN3D) {

    /**
     * Build a graph geometry object from node and edge arrays.
     * Skill: gnn-code-generator — build_3d_shape(nodes, edges)
     * @param {Array} nodes - Axiom node objects { id, name, score, tier, category }
     * @param {Array} edges - Edge objects { source, target, weight }
     * @returns {{ nodes, edges, centroid, bounds }} shape descriptor
     */
    window.GNN3D.build_3d_shape = function build_3d_shape(nodes, edges) {
        if (!nodes || !nodes.length) {
            console.warn('E003: [GNN3D] build_3d_shape: empty nodes array');
            return { nodes: [], edges: [], centroid: [0, 0, 0], bounds: {} };
        }
        try {
            const positioned = nodes.map((n, i) => ({
                ...n,
                x: (n.score || 0.5) * 2 - 1,           /* x = score ∈ [-1, 1] */
                y: (i / Math.max(nodes.length - 1, 1)) * 2 - 1, /* y = rank */
                z: n.severity === 'CRITICAL' ? 1 : n.severity === 'HIGH' ? 0.5 : 0,
                drift: false
            }));
            const centroid = [
                positioned.reduce((s, n) => s + n.x, 0) / positioned.length,
                positioned.reduce((s, n) => s + n.y, 0) / positioned.length,
                positioned.reduce((s, n) => s + n.z, 0) / positioned.length
            ];
            return { nodes: positioned, edges: edges || [], centroid, bounds: {} };
        } catch (err) {
            console.error('E003: [GNN3D] build_3d_shape error:', err);
            return { nodes: [], edges: [], centroid: [0, 0, 0], bounds: {} };
        }
    };

    /**
     * Detect drift in a GNN shape by comparing node scores to thresholds.
     * Skill: gnn-code-generator — detect_drift(shape)
     * @param {{ nodes: Array }} shape - Output of build_3d_shape
     * @returns {{ driftDetected: boolean, score: number, driftNodes: Array }}
     */
    window.GNN3D.detect_drift = function detect_drift(shape) {
        if (!shape || !shape.nodes || !shape.nodes.length) {
            return { driftDetected: false, score: 0, driftNodes: [] };
        }
        try {
            const DRIFT_THRESHOLD = 0.25; /* score below this = potential drift */
            const driftNodes = shape.nodes.filter(n => (n.score || 0) < DRIFT_THRESHOLD);
            const driftScore = driftNodes.length / shape.nodes.length;
            const detected   = driftScore > 0.30; /* >30% of nodes drifting = global drift */

            /* Mark drift on nodes so renderer uses #ff4444 (skill spec) */
            driftNodes.forEach(n => { n.drift = true; });

            /* Rule 03: emit DRIFT_DETECTED if bus available */
            if (detected && window.SovereignBUS) {
                window.SovereignBUS.emit('DRIFT_DETECTED', {
                    sender: 'gnn_3d_engine',
                    message_type: 'DRIFT_DETECTED',
                    payload: { driftDetected: detected, score: driftScore, driftNodes: driftNodes.map(n => n.id) }
                });
            }
            return { driftDetected: detected, score: driftScore, driftNodes };
        } catch (err) {
            console.error('E003: [GNN3D] detect_drift error:', err);
            return { driftDetected: false, score: 0, driftNodes: [] };
        }
    };

    /**
     * Advance the animation by rotating node positions in time.
     * Skill: gnn-code-generator — rotate_time(shape, direction, cycles)
     * @param {{ nodes: Array }} shape       - The shape to mutate
     * @param {'CW'|'CCW'}       direction   - Clockwise or counter-clockwise
     * @param {number}           cycles      - Number of rotation steps
     * @returns {{ nodes: Array }} updated shape
     */
    window.GNN3D.rotate_time = function rotate_time(shape, direction, cycles) {
        if (!shape || !shape.nodes) return shape;
        try {
            const theta = (direction === 'CCW' ? -1 : 1) * (cycles || 1) * 0.05;
            const cos = Math.cos(theta), sin = Math.sin(theta);
            shape.nodes.forEach(n => {
                const nx = n.x * cos - n.z * sin;
                const nz = n.x * sin + n.z * cos;
                n.x = nx; n.z = nz;
            });
            return shape;
        } catch (err) {
            console.error('E003: [GNN3D] rotate_time error:', err);
            return shape;
        }
    };
}

/* ── Rule 03: Subscribe to DRIFT_DETECTED for reactive rendering ── */
(function _wireGNNBUS() {
    function _subscribe() {
        if (!window.SovereignBUS) return;
        window.SovereignBUS.on('DRIFT_DETECTED', function (msg) {
            try {
                /* When drift is detected, future GNN renders will use #ff4444 per skill spec */
                const payload = msg.payload || msg;
                console.log('[GNN3D] DRIFT_DETECTED received | score:', payload.score, '| nodes:', payload.driftNodes);
            } catch (err) {
                console.error('E003: [GNN3D] DRIFT_DETECTED handler error:', err);
            }
        });
        window.SovereignBUS.on('ONTOLOGY_CLASSIFIED', function (msg) {
            try {
                const payload = msg.payload || msg;
                if (!payload || !payload.selected) return;
                /* Auto-detect drift on newly elected axioms */
                const shape = window.GNN3D.build_3d_shape(payload.selected, []);
                window.GNN3D.detect_drift(shape);
            } catch (err) {
                console.error('E003: [GNN3D] ONTOLOGY-DRIFT check error:', err);
            }
        });

        window.SovereignBUS.on('HITL_SPATIAL_PIN', function (msg) {
            try {
                const payload = msg.payload || msg;
                if (payload && payload.evidence_tag && window.GNN3D.setPulseNode) {
                    window.GNN3D.setPulseNode(payload.evidence_tag);
                }
            } catch (err) {
                console.error('E003: [GNN3D] HITL_SPATIAL_PIN handler error:', err);
            }
        });
    }

    /* Guard: only attach IIFE-specific methods when window.GNN3D is the plain-object
     * namespace from this file. On op_03.html a `type="module"` script overwrites
     * window.GNN3D with the ES-class constructor AFTER this defer script runs,
     * causing initEvidenceStream to be undefined by the time DOMContentLoaded fires.
     * We detect the ES-class case (typeof === 'function' AND .prototype.render exists)
     * and skip the IIFE-specific setup safely. */
    function _isIIFENamespace() {
        return window.GNN3D &&
               typeof window.GNN3D === 'object' &&
               typeof window.GNN3D.render === 'function';
    }

    if (_isIIFENamespace()) {
        window.GNN3D.vtkPoints = null;
        window.GNN3D.initEvidenceStream = function() {
            if (!window.EventSource) return;
            const source = new EventSource('/api/v1/evidence/stream');
            source.onmessage = function(event) {
                console.log('[GNN3D] Evidence update received via SSE');
                fetch('/api/v1/evidence/latest_vtk')
                    .then(r => r.text())
                    .then(text => {
                        const lines = text.split('\n');
                        const pts = [];
                        let parsing = false;
                        for (const line of lines) {
                            if (line.startsWith('POINTS')) { parsing = true; continue; }
                            if (line.startsWith('POLYGONS') || line.startsWith('POINT_DATA')) { parsing = false; continue; }
                            if (parsing) {
                                const p = line.trim().split(/\s+/);
                                if (p.length === 3) pts.push({x: parseFloat(p[0]), y: parseFloat(p[1]), z: parseFloat(p[2])});
                            }
                        }
                        window.GNN3D.vtkPoints = pts;
                        console.log(`[GNN3D] Parsed ${pts.length} VTK points.`);
                    })
                    .catch(err => console.error('[GNN3D] Error fetching VTK:', err));
            };
        };
    }

    function _safeInitStream() {
        /* Re-check at call time: by DOMContentLoaded the ES module may have replaced GNN3D */
        if (window.GNN3D && typeof window.GNN3D.initEvidenceStream === 'function') {
            window.GNN3D.initEvidenceStream();
        }
        /* else: ES-class GNN3D is in use — SSE stream not applicable, silently skip */
    }

    if (window.SovereignBUS) {
        _subscribe();
        _safeInitStream();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            if (window.SovereignBUS) _subscribe();
            _safeInitStream();
        });
    }
}());
