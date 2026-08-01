'use strict';
(function (G) {
  function $(id) { return document.getElementById(id); }

  /* ── Singleton engine registry keyed by container-id ──────────────────────
     Stores {renderer, ctrl, ro, rafId} for every live scene.
     destroyEngine() MUST be called before re-initialising the same container;
     otherwise the stale animate() loop keeps rendering over the new canvas
     and the stale ResizeObserver resizes the wrong (detached) renderer.
  ──────────────────────────────────────────────────────────────────────────── */
  var _engines = {};
  var _hovMesh = null;   /* currently hovered mesh — module-level so all animate() loops share it */
  var _tt = null;        /* singleton tooltip div */
  /* §7.1 ECP-HOVER-01: Universal hover = AMBER 0xFFBF00 + pulsing emissive shimmer.
     HOVER_CYAN retained as alias only for legacy references. */
  var HOVER_AMBER = 0xFFBF00;
  var HOVER_CYAN = 0xFFBF00; /* aliased to AMBER — spec §7.1 overrides prior OCM note */

  /* ── Mockup Mode Palette — Golden Ember / Electric Violet (ECP-COL-MOCK) ─── */
  var MC = {
    baseline: 0x0A192F, /* Midnight Blue — baseline topology */
    accent: 0xD89600, /* Golden Ember — animated gradient flow in Bezier edges */
    anomaly: 0x9D00D8, /* Electric Violet — concentric ring anomaly indicator */
    cf: 0x92AF92, /* Muted Sage — translucent counterfactual overlay */
    edge: 0x1E3A5F, /* Edge baseline for Bezier tubes */
  };

  /* ── Deduction Mode Color Palette (DC) ──────────────────────────────────────
     Verdict-driven colors shared across Phase 1 (GNN), Phase 2 (WM), Phase 3 (CM).
     [DFT][HM3D_DC_PALETTE] — referenced by all deduction-branch renders.        */
  var DC = {
    ALLOW:           0x00C853, /* Sovereign Green — axiom passed                  */
    REFUSE:          0xFF2244, /* Alert Red — axiom failed                        */
    UNDERDETERMINED: 0xFFB300, /* Amber — insufficient data / gap                 */
    CASCADE_SURFACE: 0xFF2244, /* Red translucent — causal corridor fill          */
    CASCADE_EDGE:    0xFF6B35, /* Orange — cascade propagation arrow              */
    SKELETON_EDGE:   0x1A2A4A, /* Dark navy — axiom→field skeleton edge           */
    CROSS_RING:      0xFFD700, /* Gold — cross-view identity ring                 */
    FIELD_NODE:      0x4FC3F7, /* Sky-blue — file-measured field values           */
  };

  /* ── Cross-View Node Identity Map ────────────────────────────────────────────
     nodeId → [{mesh, phase}]. Hovering in one panel pulses same node in others.  */
  var _DEDUCTION_CROSS_MAP = {};
  function _dcmReset() { _DEDUCTION_CROSS_MAP = {}; }
  function _dcmRegister(nodeId, mesh, phase) {
    if (!_DEDUCTION_CROSS_MAP[nodeId]) _DEDUCTION_CROSS_MAP[nodeId] = [];
    _DEDUCTION_CROSS_MAP[nodeId].push({ mesh: mesh, phase: phase });
  }
  function _dcmHighlight(nodeId, on) {
    (_DEDUCTION_CROSS_MAP[nodeId] || []).forEach(function (e) {
      if (e.mesh && e.mesh.material)
        e.mesh.material.emissiveIntensity = on ? 0.65
          : _verdictBaseIntensity(e.mesh.userData && e.mesh.userData.verdict);
    });
  }
  function _deductionNodeColor(verdict) { return DC[(verdict || '').toUpperCase()] || DC.UNDERDETERMINED; }
  function _verdictBaseIntensity(verdict) {
    var v = (verdict || '').toUpperCase();
    return v === 'REFUSE' ? 0.38 : (v === 'ALLOW' ? 0.12 : 0.24);
  }

  /* ── Seeded deterministic sphere position (stable cross-reload per axiom_id) ─ */
  function _hashSeed(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) & 0x7fffffff;
    return h;
  }
  function _seededPos(axiomId, total, radius) {
    radius = radius || 14;
    var GOLDEN = Math.PI * (3 - Math.sqrt(5));
    var modBase = Math.max(total * 3, 97);
    var seed = _hashSeed(axiomId) % modBase;
    var y = 1 - (seed / (modBase - 1)) * 2;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    return { x: Math.cos(GOLDEN * seed) * r * radius, y: y * radius * 0.6, z: Math.sin(GOLDEN * seed) * r * radius };
  }

  /* ── Gold torus ring = cross-view identity marker ────────────────────────── */
  function _makeCrossRing(scene, pos, nodeRadius) {
    var rr = nodeRadius * 1.65, tube = Math.max(0.07, nodeRadius * 0.13);
    var mat = new THREE.MeshStandardMaterial({ color: DC.CROSS_RING, emissive: DC.CROSS_RING, emissiveIntensity: 0.5, metalness: 0.55, roughness: 0.3 });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(rr, tube, 8, 24), mat);
    ring.position.set(pos.x, pos.y, pos.z);
    ring.rotation.x = Math.PI * 0.2;
    scene.add(ring);
    return ring;
  }

  function destroyEngine(cid) {
    var e = _engines[cid];
    if (!e) return;
    if (e.rafId) { cancelAnimationFrame(e.rafId); e.rafId = null; }
    if (e.domainTimer) { clearInterval(e.domainTimer); e.domainTimer = null; }
    if (e.ro) { try { e.ro.disconnect(); } catch (_) { } e.ro = null; }
    if (e.ctrl) { try { e.ctrl.dispose && e.ctrl.dispose(); } catch (_) { } e.ctrl = null; }
    /* §OP03-FIX-2: Dispose every geometry + material in the scene graph.
       Without this, switching domains leaves orphaned GPU objects and stale
       label sprites from the previous domain visible in the next render.     */
    try {
      var rootGroup = e.masterGroup || e.sceneGroup;
      if (rootGroup) {
        rootGroup.traverse(function (obj) {
          try {
            if (obj.geometry) { obj.geometry.dispose(); }
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
              } else {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
              }
            }
          } catch (_) { /* non-fatal: best-effort disposal */ }
        });
      }
    } catch (_) { /* guard against THREE not loaded */ }
    /* §OP03-FIX-2b: Purge cross-domain node identity map entries for this engine.
       Prevents DCM rings from a prior domain (e.g. Aerospace) showing inside a new
       one (e.g. FPGA) when the user hot-swaps domains without a full page reload.   */
    var _deadMeshSet = new Set();
    try {
      var rg2 = e.masterGroup || e.sceneGroup;
      if (rg2) rg2.traverse(function (obj) { if (obj.isMesh) _deadMeshSet.add(obj); });
    } catch (_) { /* ignore */ }
    Object.keys(_DEDUCTION_CROSS_MAP).forEach(function (nid) {
      _DEDUCTION_CROSS_MAP[nid] = (_DEDUCTION_CROSS_MAP[nid] || []).filter(function (entry) {
        return !_deadMeshSet.has(entry.mesh);
      });
      if (_DEDUCTION_CROSS_MAP[nid].length === 0) delete _DEDUCTION_CROSS_MAP[nid];
    });
    /* §OP03-FIX-2c: Clear hovMesh if it belonged to this engine so amber shimmer
       doesn't freeze on the next domain's animate loop. */
    if (_hovMesh && _deadMeshSet.has(_hovMesh)) { _hovMesh = null; }
    if (e.renderer) { try { e.renderer.dispose(); e.renderer.forceContextLoss(); } catch (_) { } e.renderer = null; }
    var el = $(cid);
    if (el) el.innerHTML = '';
    delete _engines[cid];
  }

  /* ── Scroll isolation: prevent wheel/touch from bubbling to page/tab switcher ──
     CRITICAL: passive:false is required so preventDefault() can be called.
     Without this, the browser still propagates the scroll event and falsely
     triggers tab-switching when the user tries to zoom the 3D graphic. ── */
  function isolateScroll(canvas) {
    canvas.addEventListener('wheel', function (e) {
      e.stopPropagation();
      e.preventDefault();
    }, { passive: false, capture: false });
    /* Block swipe-navigation on trackpad / touch devices */
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
  }

  /* ── OCM Colorimetric Palette v2 — White-Background Ink Model (ECP-COL-01) ──
     Zero emissive. Visual definition via Contact Shadows, AO, ink-like solidity.
     Reference: OCM 3D Visualization Engine Integrated Execution Guideline §3. */
  var C = {
    bg: 0x000000, /* Pure Black — scene clear color (OCM dark theme)           */
    navy: 0x0A192F, /* Baseline topology: nodes + edges                   */
    cyan: 0x00B4D8, /* Active states + selected nodes (ECP-COL-02)        */
    red: 0xD90429, /* RCA Root / Anomaly — radar ping (NO emissive glow) */
    forest: 0x2A9D8F, /* Counterfactual paths — dotted/dashed               */
    silver: 0xE9ECEF, /* Grid lines + axis rails                            */
    gold: 0xB8860B, /* Axis letter labels (ECP-AXIS-01)                   */
    /* Phase-specific (spec §1) */
    blue: 0x1565C0, /* §ECP-NODE-01: all nodes base color                 */
    green: 0x2E7D32, /* §ECP-EDGE-01: all edges                            */
    teal: 0x00B4D8, /* Active highlight → cyan                           */
    purple: 0x6A1B9A, /* Standby-tier axiom nodes                          */
    orange: 0xE65100, /* Candidate-tier axiom nodes                        */
  };

  function makeRenderer(el, w, h, bgColor) {
    el.style.overflow = 'hidden';
    /* Only force 540px for modal canvases; zone thumbnails use CSS min-height:200px */
    var isModal = el.id && el.id.indexOf('ded-modal') !== -1;
    if (isModal) el.style.minHeight = '540px';

    /* Remove loop-playing video fallbacks to prevent canvas overlap and free GPU/decoding resources */
    var videos = el.querySelectorAll ? el.querySelectorAll('video') : el.getElementsByTagName('video');
    for (var i = 0; i < videos.length; i++) {
      try {
        videos[i].pause();
        if (videos[i].parentNode) {
          videos[i].parentNode.removeChild(videos[i]);
        }
      } catch (_) {}
    }

    /* Hide standard placeholder elements */
    if (el.querySelectorAll) {
      var placeholders = el.querySelectorAll('.model-icon, .model-name, .model-status');
      for (var j = 0; j < placeholders.length; j++) {
        placeholders[j].style.display = 'none';
      }
    }

    /* bgColor: 0x000000 for dark (audit_report), 0xFFFFFF for light (OP dashboard). Default = light. */
    var _bg = (bgColor != null) ? bgColor : 0xFFFFFF;
    var r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    var initW = Math.max(w, 320), initH = Math.max(h, 220);
    r.setSize(initW, initH, true);
    r.setClearColor(_bg, 1);
    r.domElement.style.cssText = 'width:100%;height:100%;display:block;border-radius:12px;touch-action:none;user-select:none;';
    el.appendChild(r.domElement);
    var _hint = el.querySelector ? el.querySelector('.ded-thumb-hint') : null;
    if (_hint) _hint.style.display = 'none';
    isolateScroll(r.domElement);
    el.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true, capture: false });
    return r;
  }

  function makeCamera(w, h, thumbnail) {
    var c = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    /* ECP-CAM-01: Centered camera.
       thumbnail: closer Z (45) for small panels; modal: standard Z (75) */
    var zDist = thumbnail ? 45 : 75;
    c.position.set(22, 26, zDist * 0.95); // isometric 3D perspective!
    c.lookAt(0, 0, 0);
    return c;
  }

  function makeControls(camera, dom, centroid, autoRotate) {
    if (!THREE.OrbitControls) return null;
    var c = new THREE.OrbitControls(camera, dom);
    c.enableDamping  = true;
    c.dampingFactor  = 0.08;   /* smooth mobile-like inertia */
    c.enableZoom     = true;
    c.zoomSpeed      = 1.2;
    c.enablePan      = true;
    c.enableRotate   = true;
    /* Left-drag = rotate  ·  Right-drag = pan  ·  Middle = zoom */
    c.mouseButtons = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.PAN
    };
    /* Touch: 1-finger rotate, 2-finger pinch+pan */
    if (THREE.TOUCH) {
      c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    }
    c.minPolarAngle   = 0;
    c.maxPolarAngle   = Math.PI;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    var cx = centroid ? centroid.x : 0, cy = centroid ? centroid.y : 0, cz = centroid ? centroid.z : 0;
    c.target.set(cx, cy, cz);
    c.autoRotate      = autoRotate === true;
    c.autoRotateSpeed = 0.4;
    c.update();
    /* Ensure canvas receives pointer events for smooth trackpad/touch */
    if (dom) dom.style.touchAction = 'none';
    return c;
  }

  /* Axes: dark metallic gold with semantic labels aligned beside each axis */
  var _AXDEF = [
    { dir: [1, 0, 0], col: C.gold, lbl: 'X', sem: window.location.pathname.includes('ontology_medical') ? 'X-Lipids (LDL)' : 'Metabolic', perp: [0, 1, 0] },
    { dir: [0, 1, 0], col: C.gold, lbl: 'Y', sem: window.location.pathname.includes('ontology_medical') ? 'T-Temporal (BP)' : 'Renal/Hepatic', perp: [1, 0, 0] },
    { dir: [0, 0, 1], col: C.gold, lbl: 'Z', sem: window.location.pathname.includes('ontology_medical') ? 'Z-Hemodynamics (Flow)' : 'Vascular', perp: [1, 0, 0] }
  ];
  function _axSpr(text, col, fs) {
    var cv = document.createElement('canvas'); cv.width = 200; cv.height = 80;
    var c2 = cv.getContext('2d');
    /* §FIX-AXSPR-BG: clearRect first to enforce fully transparent canvas.
       Without this, the default white HTML canvas background is composited
       into the sprite texture and appears as a white box in the 3D scene. */
    c2.clearRect(0, 0, 200, 80);
    c2.shadowColor = 'rgba(0,0,0,0.85)'; c2.shadowBlur = 4;
    c2.font = 'bold ' + fs + 'px Arial'; c2.fillStyle = '#' + col.toString(16).padStart(6, '0');
    c2.fillText(text, 4, fs + 6);
    c2.shadowBlur = 0;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  }
  /* makeAxes — adds XYZ triad to 'container' (a THREE.Group or THREE.Scene).
     Pass a masterGroup here so axes move with the rest of the scene as one body. */
  function makeAxes(container, size, offset) {
    var ox = offset ? offset.x : 0, oy = offset ? offset.y : 0, oz = offset ? offset.z : 0;
    var TK = 3, TW = size / 48;
    var axGroup = new THREE.Group(); axGroup.name = 'AxesGroup';
    _AXDEF.forEach(function (a) {
      /* ── Cylinder shaft (radius 0.10) replaces THREE.Line ──
       * THREE.Line always renders at 1 CSS pixel on macOS/Metal WebGL regardless
       * of linewidth, making it invisible at small scale. A mesh cylinder always
       * has visible volume and renders correctly at any DPI. */
      var cylG = new THREE.CylinderGeometry(0.10, 0.10, size, 8);
      var cylM = new THREE.Mesh(cylG, new THREE.MeshBasicMaterial({ color: a.col, transparent: true, opacity: 0.85 }));
      /* Cylinder default is Y-up; rotate to align with axis direction */
      cylM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(a.dir[0], a.dir[1], a.dir[2]));
      cylM.position.set(ox, oy, oz); /* midpoint = centroid */
      axGroup.add(cylM);
      /* Compact arrowhead */
      var cG = new THREE.ConeGeometry(size / 70, size / 26, 8);
      var cM = new THREE.Mesh(cG, new THREE.MeshBasicMaterial({ color: a.col, transparent: true, opacity: 0.90 }));
      var tipOff = size / 2 + size / 52;
      cM.position.set(ox + a.dir[0] * tipOff, oy + a.dir[1] * tipOff, oz + a.dir[2] * tipOff);
      cM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(a.dir[0], a.dir[1], a.dir[2]));
      axGroup.add(cM);
      /* Letter label */
      var ls = _axSpr(a.lbl, a.col, 28); ls.scale.set(4, 2, 1); ls.material.opacity = 0.80; ls.material.transparent = true;
      ls.position.set(ox + a.dir[0] * (size / 2 + 6), oy + a.dir[1] * (size / 2 + 6), oz + a.dir[2] * (size / 2 + 6));
      axGroup.add(ls);
      /* Semantic label */
      var ss = _axSpr('(' + a.sem + ')', a.col, 12); ss.scale.set(8, 2, 1);
      ss.material.opacity = 0.45; ss.material.transparent = true;
      ss.position.set(ox + a.dir[0] * (size * 0.25) + a.perp[0] * TW * 4,
        oy + a.dir[1] * (size * 0.25) + a.perp[1] * TW * 4,
        oz + a.dir[2] * (size * 0.25) + a.perp[2] * TW * 4);
      axGroup.add(ss);
      /* Tick marks as small mesh cylinders */
      for (var ti = 1; ti <= TK; ti++) {
        [1, -1].forEach(function (sg) {
          var frac = ti / TK * sg;
          var px = ox + a.dir[0] * (size / 2 * frac), py = oy + a.dir[1] * (size / 2 * frac), pz = oz + a.dir[2] * (size / 2 * frac);
          var tG = new THREE.CylinderGeometry(0.06, 0.06, TW * 2.5, 6);
          var tM = new THREE.Mesh(tG, new THREE.MeshBasicMaterial({ color: a.col, transparent: true, opacity: 0.70 }));
          tM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(a.perp[0], a.perp[1], a.perp[2] || 0.001));
          tM.position.set(px, py, pz);
          axGroup.add(tM);
          var ns = _axSpr((size / 2 * frac).toFixed(0), a.col, 16); ns.scale.set(4.5, 2.2, 1);
          ns.position.set(px + a.perp[0] * TW * 5, py + a.perp[1] * TW * 5, pz + a.perp[2] * TW * 5);
          axGroup.add(ns);
        });
      }
    });
    /* Origin sphere */
    var og = new THREE.SphereGeometry(0.8, 10, 10);
    axGroup.add(new THREE.Mesh(og, new THREE.MeshBasicMaterial({ color: C.gold })));
    container.add(axGroup);
    return axGroup; /* Caller stores ref for toggle */
  }

  /* Node label sprite: name + value aligned beside sphere */
  function makeNodeLabel(name, val, color) {
    var cv = document.createElement('canvas'); cv.width = 280; cv.height = 64;
    var c2 = cv.getContext('2d');
    /* §FIX-LABEL-BG: Explicitly clear to fully transparent before drawing. */
    c2.clearRect(0, 0, 280, 64);
    var hx = '#' + color.toString(16).padStart(6, '0');
    c2.shadowColor = 'rgba(0,0,0,0.90)'; c2.shadowBlur = 5;
    c2.font = 'bold 18px Arial'; c2.fillStyle = hx; c2.fillText(name, 4, 22);
    c2.font = '14px Arial'; c2.fillStyle = hx; c2.fillText(val, 4, 42);
    c2.shadowBlur = 0;
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    spr.scale.set(14, 4, 1);
    /* T3-A: Labels hidden by default — only shown when node is hovered */
    spr.visible = false;
    return spr;
  }

  function _addAnatomyLabels(parent, shapeType) {
    function _makeAnatomyLabel(text, x, y, z) {
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      var c2 = cv.getContext('2d');
      c2.clearRect(0, 0, 256, 64);
      c2.shadowColor = 'rgba(0,0,0,0.95)'; c2.shadowBlur = 5;
      c2.font = 'bold 12px Arial'; c2.fillStyle = '#ffb529'; // Gold color
      c2.fillText('🛈 ' + text, 4, 24);
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cv),
        transparent: true,
        depthWrite: false,
        depthTest: false
      }));
      spr.scale.set(11, 2.75, 1);
      spr.position.set(x, y, z);
      parent.add(spr);
    }

    if (shapeType === 'CARDIOVASCULAR') {
      _makeAnatomyLabel('Proximal Aorta / Vessel Wall', -18, 9, 0);
      _makeAnatomyLabel('Coronary Lumen Flow', 0, 9, 1);
      _makeAnatomyLabel('Distal Capillaries', 18, 9, 0);
      _makeAnatomyLabel('Endothelial Plaque Zone', 8, -9, 0);
    } else if (shapeType === 'NEPHROLOGY') {
      _makeAnatomyLabel('Afferent Glomerular Arteriole', -18, 8, 0);
      _makeAnatomyLabel('Bowman\'s Filtration Barrier', 0, 8, 1);
      _makeAnatomyLabel('Distal Convoluted Tubule', 18, 8, 0);
    } else if (shapeType === 'ONCOLOGY') {
      _makeAnatomyLabel('Active Proliferating Rim', 0, 16, 0);
      _makeAnatomyLabel('Necrotic Tumor Core', 0, -1, 14);
      _makeAnatomyLabel('Angiogenic Blood Vessels', 16, 0, 0);
    }
  }

  /* Phase title CSS overlay */
  function addPhaseTitle(el, text, dark) {
    var d = el.querySelector('.hm3d-title');
    if (!d) {
      d = document.createElement('div'); d.className = 'hm3d-title';
      Object.assign(d.style, {
        position: 'absolute', top: '48px', left: '0', right: '0', textAlign: 'center',
        fontFamily: "Calibri,'微軟正黑體',Arial,sans-serif", fontSize: '14px', fontWeight: 'bold',
        color: dark ? '#E8EAF0' : '#0A192F',  /* white on dark bg, navy on light bg */
        background: 'transparent', pointerEvents: 'none',
        letterSpacing: '0.4px', zIndex: '12',
        textShadow: 'none'
      });
      el.style.position = 'relative'; el.appendChild(d);
    }
    d.textContent = text;
  }

  function getTooltip() {
    if (_tt) return _tt;
    _tt = document.createElement('div');
    /* §INFO-TOOLTIP: Solid high-contrast card — no backdropFilter (causes stacking
       context bugs in some browsers). Fluorescent green background guarantees readability
       with pure black text, satisfying the "24 Bug List". */
    Object.assign(_tt.style, {
      position: 'fixed',
      display:  'none',
      zIndex:   '999999',          /* max safe z-index — above any modal/overlay */
      pointerEvents: 'none',
      opacity:  '1',               /* explicit — no fade-in delay on first show   */
      background:    '#39FF14',    /* fluorescent green background */
      border:        '2px solid #000000', /* solid black border */
      borderRadius:  '10px',
      padding:       '13px 16px',
      minWidth:      '210px',
      maxWidth:      '320px',
      boxShadow:     '0 6px 32px rgba(0,0,0,0.6), 0 0 20px rgba(57,255,20,0.3)',
      fontFamily:    "Calibri,'微軟正黑體',Arial,sans-serif",
      color:         '#000000',    /* black text */
      lineHeight:    '1.55'
    });
    document.body.appendChild(_tt);
    return _tt;
  }
  /* showTT — rich hover card with black axiom ID, formula, computed vs threshold */
  function showTT(e, title, val, status, ctx, crit, formula, computed, threshold, unit) {
    var sc = crit ? '#b71c1c' : '#1b5e20'; /* High-contrast dark red / dark green */
    var safeTitle  = title  != null ? String(title)  : '—';
    var safeVal    = val    != null ? String(val)    : '—';
    var safeStatus = status != null ? String(status) : '—';
    var safeCtx    = ctx    != null ? String(ctx)    : '';
    var extra = '';
    if (formula)        extra += '<div style="font:italic 9.5pt monospace;color:#000000;margin-top:6px;border-top:1px solid rgba(0,0,0,0.22);padding-top:6px">' + formula + '</div>';
    if (computed != null) extra += '<div style="font:9pt Arial;color:#000000;margin-top:4px">Computed: <b style="color:#000000">' + computed + '</b>' + (unit ? ' ' + unit : '') + ' / Thr: <b style="color:' + sc + '">' + threshold + '</b>' + (unit ? ' ' + unit : '') + '</div>';
    var tt = getTooltip();
    tt.innerHTML =
      '<div style="font:bold 13pt Arial;color:#000000;margin-bottom:5px;letter-spacing:0.04em">' + safeTitle + '</div>' +
      '<div style="font:10.5pt Arial;color:#000000;margin-bottom:5px">' + safeVal + '</div>' +
      '<div style="display:inline-block;font:bold 8.5pt Arial;color:' + sc + ';border:1px solid ' + sc + ';border-radius:4px;padding:2px 8px;margin-bottom:6px">' + safeStatus + '</div>' +
      (safeCtx ? '<div style="font:italic 9pt Arial;color:#000000;margin-top:4px">' + safeCtx + '</div>' : '') + extra;
    tt.style.display = 'block';
    /* Clamp to viewport so card never clips off-screen */
    var x = Math.min(e.clientX + 20, window.innerWidth  - 340);
    var y = Math.min(e.clientY + 20, window.innerHeight - 220);
    if (x < 0) x = e.clientX + 20;
    if (y < 0) y = 10;
    tt.style.left = x + 'px';
    tt.style.top  = y + 'px';
  }
  function moveTT(e) {
    if (!_tt) return;
    var x = Math.min(e.clientX + 18, window.innerWidth  - 340);
    var y = Math.min(e.clientY + 18, window.innerHeight - 200);
    _tt.style.left = x + 'px'; _tt.style.top = y + 'px';
  }
  function hideTT() { if (_tt) _tt.style.display = 'none'; }

  function _resetHov(items, hov) {
    if (!hov) return;
    var ph = items.find(function (x) { return x.mesh === hov; });
    if (ph && ph.mesh.material) {
      ph.mesh.material.color.setHex(ph._oc);
      /* §FIX-RESET-HOV: MeshBasicMaterial has no .emissive — guard before access */
      if (ph.mesh.material.emissive) {
        ph.mesh.material.emissive.setHex(ph._oe);
        ph.mesh.material.emissiveIntensity = ph._oi;
      }
      if (ph.mesh.geometry.type !== 'BufferGeometry') ph.mesh.scale.setScalar(1);
    }
    _hovMesh = null;
  }
  function attachHover(canvas, camera, items, edgeMeshes, ctrlRef, overlayEl) {
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), hov = null;
    ray.params.Line = { threshold: 1.5 };
    /* Helper: find overlay panel and show/hide it */
    function _getOverlay() {
      return overlayEl ? overlayEl.querySelector('.hm3d-overlay') : null;
    }
    items.forEach(function (it) {
      it._oc = it.mesh.material.color.getHex();
      it._oe = it.mesh.material.emissive ? it.mesh.material.emissive.getHex() : 0x000000;
      it._oi = it.mesh.material.emissiveIntensity || 0;
    });
    var allMeshes = items.map(function (x) { return x.mesh; });
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width)  * 2 - 1;
      mouse.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
      camera.updateMatrixWorld(); /* §FIX-RAYCAST-01: flush stale world matrix */
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(allMeshes, false);
      if (hits.length) {
        var obj = hits[0].object, it = items.find(function (x) { return x.mesh === obj; });
        if (obj.userData && obj.userData.deduction && obj.userData.nodeId) _dcmHighlight(obj.userData.nodeId, true);
        if (it && hov !== obj) {
          _resetHov(items, hov);
          /* T3-A: Hide label on previous hovered node */
          if (hov && hov.userData && hov.userData.labelSprite) hov.userData.labelSprite.visible = false;
          hov = obj; _hovMesh = obj;
          /* §ECP-HOVER-01 §7.1: amber colour on hover */
          obj.material.color.setHex(HOVER_AMBER);
          if (obj.material.emissive) {
            obj.material.emissive.setHex(HOVER_AMBER);
            obj.material.emissiveIntensity = 1.0;
          }
          if (obj.geometry.type !== 'BufferGeometry') obj.scale.setScalar(1.28);
          /* T3-A: Show label sprite only for the hovered node */
          if (obj.userData && obj.userData.labelSprite) obj.userData.labelSprite.visible = true;
          /* Show overlay panel when a node is actually hovered */
          var _ov = _getOverlay();
          if (_ov && _ov._showOverlay) _ov._showOverlay();
          /* Pause auto-rotation so user can read the tooltip */
          var ctrl = ctrlRef && ctrlRef.ctrl;
          if (ctrl) ctrl.autoRotate = false;
          var d = it.data;
          showTT(e, d.id, d.val, d.status, d.ctx, d.crit, d.formula, d.computed, d.threshold, d.unit);
          canvas.style.cursor = 'pointer';
        } else moveTT(e);
      } else {
        if (hov && hov.userData && hov.userData.nodeId) _dcmHighlight(hov.userData.nodeId, false);
        /* T3-A: Hide label on mouse-leave */
        if (hov && hov.userData && hov.userData.labelSprite) hov.userData.labelSprite.visible = false;
        _resetHov(items, hov); hov = null; hideTT(); canvas.style.cursor = 'default';
        /* Hide overlay when no node is hovered */
        var _ov2 = _getOverlay();
        if (_ov2 && _ov2._hideOverlay) _ov2._hideOverlay();
        /* Resume auto-rotation */
        var ctrl = ctrlRef && ctrlRef.ctrl;
        if (ctrl && !ctrlRef._payload) ctrl.autoRotate = true;
      }
    });
    canvas.addEventListener('mouseleave', function () {
      if (hov && hov.userData && hov.userData.nodeId) _dcmHighlight(hov.userData.nodeId, false);
      /* T3-A: Hide label on canvas leave */
      if (hov && hov.userData && hov.userData.labelSprite) hov.userData.labelSprite.visible = false;
      _resetHov(items, hov); hov = null; hideTT(); canvas.style.cursor = 'default';
      var _ov3 = _getOverlay();
      if (_ov3 && _ov3._hideOverlay) _ov3._hideOverlay();
      var ctrl = ctrlRef && ctrlRef.ctrl;
      if (ctrl && !ctrlRef._payload) ctrl.autoRotate = true;
    });
  }



  /* ══ GEOMETRY HELPERS ════════════════════════════════════════════════════ */

  /* Explanatory Overlay Panel (Spec §4.4): Translucent Midnight Blue, white text */
  function _buildOverlayPanel(el, phaseNum, liveMode, nodeCount, edgeCount, domainName, axRef, ctrlRef) {
    var old = el.querySelector('.hm3d-overlay'); if (old) old.remove();
    var lines = {
      1: liveMode
        ? 'Phase 1 \u2014 GNN Live: ' + nodeCount + ' axiom nodes \u00b7 ' + edgeCount + ' causal links\nElected (green) \u00b7 Candidate (amber) \u00b7 Standby (steel-blue). Double-click node to lock pivot.'
        : 'Phase 1 \u2014 GNN Mockup: ' + (domainName || 'Aerospace') + ' (' + nodeCount + ' nodes)\nCross-domain demo \u2192 rotating every 5s. Left-drag orbit \u00b7 Right-drag pan \u00b7 Dbl-click node lock.',
      2: liveMode
        ? 'Phase 2 \u2014 World Model: vascular hemodynamics ideal manifold vs measured deviation\nCyan torus = ideal axiom surface \u00b7 Red nodes = deviation > 3\u03c3 from safe boundary'
        : 'Phase 2 \u2014 World Model: Axiom Safe-Volume Manifold\nX = Constraint Radius (R) \u00b7 Y = Mean Arterial Pressure \u00b7 Z = Hb level',
      3: liveMode
        ? 'Phase 3 \u2014 Causal Chain (Pearl do-calculus RCA): T=0 (onset) \u2192 root cause\nSevered edge (\u25c7) = counterfactual do(E=0) \u00b7 Dashed teal = CF branches. Escape resets pivot.'
        : 'Phase 3 \u2014 Causal Corridor: Pathogenesis Trace\nT=0 (onset) \u2192 T=\u2212N (root cause) \u00b7 Counterfactuals: dashed forest green'
    };
    var p = document.createElement('div'); p.className = 'hm3d-overlay';
    Object.assign(p.style, {
      position: 'absolute', bottom: '10px', left: '10px',
      maxWidth: '240px',                                       /* narrow: fits within zone 4-2 width */
      background: 'rgba(232,245,233,0.90)', border: '1px solid #2e7d32',
      borderRadius: '8px', padding: '8px 12px', fontFamily: 'Arial,sans-serif',
      fontSize: '11px', lineHeight: '1.5', color: '#000',
      pointerEvents: 'all', cursor: 'pointer',
      zIndex: '9100', opacity: '0', transition: 'opacity 0.35s ease'  /* above sv-pill z:9000 */
    });
    /* CTA header */
    var pCta = document.createElement('div');
    Object.assign(pCta.style, { fontWeight: 'bold', fontSize: '12px', color: '#1a5c1a', marginBottom: '4px' });
    pCta.textContent = '\uD83D\uDD0D Click to enlarge';  /* 🔍 */
    /* Short phase line */
    var shortLines = {
      1: liveMode ? 'GNN Live \u2014 ' + nodeCount + ' axiom nodes' : 'GNN Mockup \u2014 ' + (domainName || 'Aerospace') + ' \u00b7 ' + nodeCount + ' nodes',
      2: liveMode ? 'World Model \u2014 axiom manifold' : 'World Model \u2014 Safe-Volume Manifold',
      3: liveMode ? 'Causal Chain \u2014 RCA do-calculus' : 'Causal Corridor \u2014 Pathogenesis Trace'
    };
    var pSub = document.createElement('div');
    Object.assign(pSub.style, { fontSize: '10px', color: '#333', pointerEvents: 'none' });
    pSub.textContent = shortLines[phaseNum] || '';
    /* Orbit hint */
    var axHint = document.createElement('span');
    Object.assign(axHint.style, { display: 'block', fontSize: '9px', color: '#1a5c1a', fontStyle: 'italic', marginTop: '4px', pointerEvents: 'none' });
    axHint.textContent = '\u2B50 Hover node \u2192 Right-click \u2192 \u516c\u7406\u8CC7\u6599\u5EAB (Axiom Repository)';
    p.appendChild(pCta); p.appendChild(pSub); p.appendChild(axHint);
    el.style.position = 'relative'; el.appendChild(p);

    /* ── Overlay is ONLY shown when a real node is hovered.
       The idle-timer auto-show has been removed — the panel must NOT appear
       just because the cursor is stationary over the canvas.
       showOverlay() and hideOverlay() are called from attachHover / _attachEnhancedInteraction. */
    p._showOverlay = function () { p.style.opacity = '1'; };
    p._hideOverlay = function () { p.style.opacity = '0'; };

    /* Hide on cursor leave (belt-and-suspenders) */
    el.addEventListener('mouseleave', function () { p.style.opacity = '0'; });

    /* Click → open Axiom Repository (richer info modal) */
    p.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var HM3D = (typeof HealthcareMedical3D !== 'undefined') ? HealthcareMedical3D
                : ((typeof G !== 'undefined') ? G.HealthcareMedical3D : null);
      if (HM3D && HM3D.openAxiomRepoModal) HM3D.openAxiomRepoModal();
    });


    /* Left-drag = rotate, Right-drag = pan (both always active, no toggle) */
    (function applyDualGestureMode(eng) {
      var ctrl = eng && eng.ctrl;
      if (!ctrl) return;
      ctrl.enablePan    = true;
      ctrl.enableRotate = true;
      ctrl.enableZoom   = true;
      ctrl.enableDamping  = true;
      ctrl.dampingFactor  = 0.08;
      ctrl.mouseButtons = {
        LEFT:   THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT:  THREE.MOUSE.PAN
      };
      if (THREE.TOUCH) ctrl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      ctrl.minPolarAngle   = 0;
      ctrl.maxPolarAngle   = Math.PI;
      ctrl.minAzimuthAngle = -Infinity;
      ctrl.maxAzimuthAngle = Infinity;
      /* §PAN-FIX-01: Right-drag pan — translate masterGroup as a rigid body so
         meshes and grid never tear apart from each other.
         We detect genuine panning (right button held) via a mousedown flag.
         OrbitControls fires 'change' on EVERY update (including damping settle
         after rotation), so we MUST gate the translation on actual right-drag,
         not on every target delta.                                            */
      var _mg = eng.masterGroup;
      if (_mg) {
        var _isPanning = false;   /* true only while right mouse button is down */
        var _prevTgt = ctrl.target.clone();
        ctrl.domElement.addEventListener('pointerdown', function(ev) {
          if (ev.button === 2) { _isPanning = true; _prevTgt.copy(ctrl.target);
            ctrl.domElement.setAttribute('data-test-pan-state', 'panning'); /* §DFT-PAN */ }
        });
        ctrl.domElement.addEventListener('pointerup', function(ev) {
          if (ev.button === 2) { _isPanning = false;
            ctrl.domElement.setAttribute('data-test-pan-state', 'idle'); /* §DFT-PAN */ }
        });
        ctrl.domElement.addEventListener('pointerleave', function() { _isPanning = false;
            ctrl.domElement.setAttribute('data-test-pan-state', 'idle'); /* §DFT-PAN */ });
        ctrl.addEventListener('change', function () {
          if (!_isPanning) { _prevTgt.copy(ctrl.target); return; }
          var tgt = ctrl.target;
          var dx = tgt.x - _prevTgt.x, dy = tgt.y - _prevTgt.y, dz = tgt.z - _prevTgt.z;
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-6) {
            _mg.position.x += dx; _mg.position.y += dy; _mg.position.z += dz;
            /* Reset target back to origin so next pan delta is relative to zero */
            ctrl.target.set(_prevTgt.x, _prevTgt.y, _prevTgt.z);
          }
          _prevTgt.copy(ctrl.target);
        });
      }
      ctrl.update();
    }(ctrlRef));
    return p;
  }

  /* Straight tube edge: CylinderGeometry (WebGL ignores linewidth on macOS/Metal) */
  function makeTubeEdge(scene, A, B, radius, color, opacity) {
    var dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return null;
    var g = new THREE.CylinderGeometry(radius, radius, len, 6);
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: opacity }));
    m.position.set((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
    scene.add(m); return m;
  }
  /* Bezier tube edge: thick curved TubeGeometry for MOCKUP mode (Golden Ember flow) */
  function makeBezierTube(scene, A, B, radius, color, opacity) {
    var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 + Math.max(Math.abs(B.x - A.x), Math.abs(B.z - A.z)) * 0.2 + 2, mz = (A.z + B.z) / 2;
    var curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(A.x, A.y, A.z), new THREE.Vector3(mx, my, mz), new THREE.Vector3(B.x, B.y, B.z));
    var m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, radius, 6, false),
      new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: opacity }));
    scene.add(m); return m;
  }
  /* Pulsating ring for anomaly nodes — stored in pulseList for per-frame scale animation */
  function _makePulseRing(scene, pos, color, pulseList) {
    var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    var ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.3, 32), mat);
    ring.position.set(pos.x, pos.y, pos.z);
    ring.lookAt(new THREE.Vector3(pos.x, pos.y + 1, pos.z));
    scene.add(ring);
    if (pulseList) pulseList.push({ ring: ring, mat: mat, phase: Math.random() * Math.PI * 2 });
    return ring;
  }

  /* Face surface: indexed BufferGeometry — equivalent to Plotly Mesh3d(i,j,k) */
  function makeFaceSurface(scene, pts, faces, color, opacity) {
    var v = []; pts.forEach(function (p) { v.push(p.x, p.y, p.z); });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(faces); g.computeVertexNormals();
    var m1 = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.05 }));
    scene.add(m1);
    var m2 = new THREE.Mesh(g.clone(), new THREE.MeshBasicMaterial({ color: 0xD4AF37, wireframe: true, transparent: true, opacity: Math.min(opacity * 0.55, 0.22) }));
    scene.add(m2);
    return [m1, m2];
  }
  /* Causal arrow: tube body + cone arrowhead, or severed-edge variant */
  function makeCausalArrow(scene, A, B, color, opacity, isSevered) {
    var dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return;
    var dn = new THREE.Vector3(dx, dy, dz).normalize();
    if (isSevered) {
      var M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 };
      var G1 = { x: M.x - dn.x * 1.2, y: M.y - dn.y * 1.2, z: M.z - dn.z * 1.2 };
      var G2 = { x: M.x + dn.x * 1.2, y: M.y + dn.y * 1.2, z: M.z + dn.z * 1.2 };
      makeTubeEdge(scene, A, G1, 0.18, 0xD90429, 0.9);
      makeTubeEdge(scene, G2, B, 0.18, 0xD90429, 0.9);
      var gs = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshBasicMaterial({ color: 0xD90429 }));
      gs.position.set(M.x, M.y, M.z); scene.add(gs);
    } else {
      makeTubeEdge(scene, A, B, 0.18, color, opacity);
      var cg = new THREE.ConeGeometry(0.45, 1.4, 8);
      var cm = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity }));
      cm.position.set(B.x - dn.x * 0.7, B.y - dn.y * 0.7, B.z - dn.z * 0.7);
      cm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dn);
      scene.add(cm);
    }
  }
  /* Enhanced interaction: topological isolation + dynamic pivot on dblclick + Escape reset */
  function _attachEnhancedInteraction(canvas, camera, ctrl, scene, items, edges, getPayload) {
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), hov = null;
    var _lerpFrom = null, _lerpTarget = null, _lerpT = 1;
    var _activeSheaths = [], _corridorLabel = null;
    var _allMeshes = items.map(function (x) { return x.mesh; });
    /* §INFO-STOP-01: reading-lock state — all orbit controls frozen while node is hovered */
    var _infoLocked = false;
    function _isolate(idx) {
      var nb = {}; nb[idx] = true;
      edges.forEach(function (e) { if (e[0] === idx) nb[e[1]] = true; else if (e[1] === idx) nb[e[0]] = true; });
      items.forEach(function (it, i) {
        var on = !!nb[i];
        if (it.mesh.material) { it.mesh.material.opacity = on ? it._oo : (it._oo * 0.12); }
      });
    }
    function _reset() {
      items.forEach(function (it) { if (it.mesh.material) it.mesh.material.opacity = it._oo; });
    }
    function _enterInfoLock() {
      if (_infoLocked) return;
      _infoLocked = true;
      if (ctrl) { ctrl.autoRotate = false; ctrl.enablePan = false; ctrl.enableZoom = false; ctrl.enableRotate = false; }
      /* Amber cursor hint */
      canvas.style.cursor = 'crosshair';
      /* §DFT-INFO-LOCK: testability hook */
      canvas.setAttribute('data-test-info-lock', 'active');
    }
    function _exitInfoLock() {
      if (!_infoLocked) return;
      _infoLocked = false;
      if (ctrl) { ctrl.enablePan = true; ctrl.enableZoom = true; ctrl.enableRotate = true;
        if (!getPayload()) ctrl.autoRotate = true; }
      canvas.style.cursor = '';
      /* §DFT-INFO-LOCK: testability hook */
      canvas.setAttribute('data-test-info-lock', 'idle');
      canvas.setAttribute('data-test-3d-hover', 'none');
    }
    /* Store original opacities + colors. §DFT-CANVAS: seed initial test attributes */
    canvas.setAttribute('data-test-info-lock', 'idle');
    canvas.setAttribute('data-test-3d-hover', 'none');
    items.forEach(function (it) {
      it._oo = it.mesh.material ? it.mesh.material.opacity : 1;
      /* §ECP-HOVER-01: store original colour so we can restore on mouse-leave */
      it._hc = it.mesh.material && it.mesh.material.color   ? it.mesh.material.color.getHex()          : 0xffffff;
      it._he = it.mesh.material && it.mesh.material.emissive? it.mesh.material.emissive.getHex()        : 0x000000;
      it._hi = it.mesh.material ? (it.mesh.material.emissiveIntensity || 0) : 0;
    });
    canvas.addEventListener('mousemove', function (e) {
      _allMeshes = items.map(function (x) { return x.mesh; });
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      camera.updateMatrixWorld(); /* §FIX-RAYCAST-01: flush stale world matrix */
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(_allMeshes, false);
      if (hits.length) {
        var obj = hits[0].object, idx = _allMeshes.indexOf(obj);
        if (hov !== obj) {
          /* Restore previous hovered mesh to original colour */
          if (hov) {
            var phov = items.find(function (x) { return x.mesh === hov; });
            if (phov && phov.mesh.material) {
              phov.mesh.material.color.setHex(phov._hc);
              if (phov.mesh.material.emissive) phov.mesh.material.emissive.setHex(phov._he);
              phov.mesh.material.emissiveIntensity = phov._hi;
              phov.mesh.scale.setScalar(1);
            }
          }
          hov = obj; _isolate(idx);
          /* §ECP-HOVER-01 §7.1: Transfer mesh colour to AMBER on hover */
          if (obj.material) {
            obj.material.color.setHex(HOVER_AMBER);
            if (obj.material.emissive) obj.material.emissive.setHex(HOVER_AMBER);
            obj.material.emissiveIntensity = 1.0;
            obj.scale.setScalar(1.15);
          }
          var d = items[idx].data;
          showTT(e, d.id, d.val, d.status, d.ctx, d.crit, d.formula, d.computed, d.threshold, d.unit);
          /* §INFO-STOP-01: full reading lock when entering a node */
          _enterInfoLock();
          /* §DFT-HOVER: record which node is under cursor */
          canvas.setAttribute('data-test-3d-hover', d.id || String(idx));
        } else {
          moveTT(e);
        }
      } else {
        if (hov) {
          /* Restore colour on leaving node area */
          var phov2 = items.find(function (x) { return x.mesh === hov; });
          if (phov2 && phov2.mesh.material) {
            phov2.mesh.material.color.setHex(phov2._hc);
            if (phov2.mesh.material.emissive) phov2.mesh.material.emissive.setHex(phov2._he);
            phov2.mesh.material.emissiveIntensity = phov2._hi;
            phov2.mesh.scale.setScalar(1);
          }
          hov = null; _reset(); _exitInfoLock();
        }
        hideTT();
      }
    });
    canvas.addEventListener('mouseleave', function () {
      if (hov) {
        var phov3 = items.find(function (x) { return x.mesh === hov; });
        if (phov3 && phov3.mesh.material) {
          phov3.mesh.material.color.setHex(phov3._hc);
          if (phov3.mesh.material.emissive) phov3.mesh.material.emissive.setHex(phov3._he);
          phov3.mesh.material.emissiveIntensity = phov3._hi;
          phov3.mesh.scale.setScalar(1);
        }
        hov = null; _reset(); _exitInfoLock();
      }
      hideTT();
    });
    /* §AXIOM-RC-01: Right-click on a hovered node → open Axiom Repo Modal.
       A compact glassmorphic context menu appears near the cursor with one option. */
    canvas.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      _allMeshes = items.map(function (x) { return x.mesh; });
      var r = canvas.getBoundingClientRect();
      mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      camera.updateMatrixWorld(); /* §FIX-RAYCAST-01: flush stale world matrix */
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(_allMeshes, false);
      if (!hits.length) return;
      var obj = hits[0].object, idx = _allMeshes.indexOf(obj);
      var d = items[idx].data;
      var ctx = document.createElement('div');
      ctx.style.cssText = 'position:fixed; left:' + ev.clientX + 'px; top:' + ev.clientY + 'px; background:#111; border:0.5px solid #444; border-radius:4px; padding:6px; font-family:\'JetBrains Mono\',monospace; font-size:9px; color:#eee; z-index:99999; box-shadow:0 6px 16px rgba(0,0,0,0.6)';
      ctx.innerHTML = '<div style="color:var(--gold);font-weight:bold;margin-bottom:4px;border-bottom:0.5px solid #333;padding-bottom:3px">' + d.id + ' ACTIONS</div>'
        + '<div class="ctx-opt" style="cursor:pointer;padding:3px;hover:background:#222">⊙ Focus on ' + d.id + '</div>'
        + '<div class="ctx-opt" style="cursor:pointer;padding:3px;hover:background:#222">⚡ Query Telemetry Invariants</div>';
      document.body.appendChild(ctx);
      /* Auto-close on any click outside */
      function _closeCtx(ev) {
        if (!ctx.contains(ev.target)) {
          ctx.parentNode && ctx.parentNode.removeChild(ctx);
          document.removeEventListener('mousedown', _closeCtx, true);
        }
      }
      setTimeout(function() { document.addEventListener('mousedown', _closeCtx, true); }, 0);
    });
    function _startLerp(tx, ty, tz) {
      if (!ctrl) return;
      _lerpFrom = ctrl.target.clone();
      _lerpTarget = new THREE.Vector3(tx, ty, tz);
      _lerpT = 0;
    }
    canvas.addEventListener('dblclick', function (e) {
      _allMeshes = items.map(function (x) { return x.mesh; });
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      camera.updateMatrixWorld(); /* §FIX-RAYCAST-01: flush stale world matrix */
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(_allMeshes, false);
      if (hits.length) { var p = hits[0].object.position; _startLerp(p.x, p.y, p.z); }
      else _startLerp(0, 0, 0);
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { _exitInfoLock(); _startLerp(0, 0, 0); } });
    /* ── §XAI-01: Single-click node → open XAI Tutor 3D Modal ─────────────
       XAITutor3DModal is loaded by the page as a separate script tag.
       If not present this handler is a no-op (graceful degradation).
    ─────────────────────────────────────────────────────────────────────── */
    canvas.addEventListener('click', function (e) {
      _allMeshes = items.map(function (x) { return x.mesh; });
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      camera.updateMatrixWorld(); /* §FIX-RAYCAST-01: flush stale world matrix */
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(_allMeshes, false);
      
      // Cleanup existing sheaths, label, and Dual RCA HUD on any click
      if (_activeSheaths) {
        _activeSheaths.forEach(function (s) { scene.remove(s); });
        _activeSheaths = [];
      }
      if (_corridorLabel) {
        scene.remove(_corridorLabel);
        _corridorLabel = null;
      }
      var existingPanel = document.getElementById('dual-rca-panel');
      if (existingPanel && existingPanel.parentNode) {
        existingPanel.parentNode.removeChild(existingPanel);
      }
      
      var hitMesh = hits.length ? hits[0].object : null;
      var clickedIdx = hitMesh ? _allMeshes.indexOf(hitMesh) : -1;
      var isPhase3 = canvas.parentNode && (canvas.parentNode.id.indexOf('cm') !== -1 || canvas.parentNode.id.indexOf('causal') !== -1);
      
      if (isPhase3 && clickedIdx >= 0) {
        // Find chain items (marked with deduction: true in Phase 3)
        var chainItems = items.filter(function (it) { return it.mesh.userData && it.mesh.userData.deduction; });
        var clickedIdxInChain = -1;
        for (var i = 0; i < chainItems.length; i++) {
          if (chainItems[i].mesh === hitMesh) {
            clickedIdxInChain = i;
            break;
          }
        }
        
        if (clickedIdxInChain >= 0) {
          // Highlight nodes in the chain
          items.forEach(function (it) {
            var inChain = false;
            var cIdx = -1;
            for (var k = 0; k < chainItems.length; k++) {
              if (chainItems[k].mesh === it.mesh) {
                inChain = true;
                cIdx = k;
                break;
              }
            }
            if (inChain) {
              if (cIdx === clickedIdxInChain) {
                // Clicked node -> Gold
                if (it.mesh.material) {
                  it.mesh.material.color.setHex(0xFFBF00);
                  it.mesh.material.emissive.setHex(0xFFBF00);
                  it.mesh.material.emissiveIntensity = 0.9;
                  it.mesh.material.opacity = 1.0;
                }
                it.mesh.scale.set(1.6, 1.6, 1.6);
              } else if (cIdx < clickedIdxInChain) {
                // Upstream -> Green
                if (it.mesh.material) {
                  it.mesh.material.color.setHex(0x00FF88);
                  it.mesh.material.emissive.setHex(0x00FF88);
                  it.mesh.material.emissiveIntensity = 0.6;
                  it.mesh.material.opacity = 1.0;
                }
                it.mesh.scale.set(1.0, 1.0, 1.0);
              } else {
                // Downstream -> Orange
                if (it.mesh.material) {
                  it.mesh.material.color.setHex(0xFF6B35);
                  it.mesh.material.emissive.setHex(0xFF6B35);
                  it.mesh.material.emissiveIntensity = 0.6;
                  it.mesh.material.opacity = 1.0;
                }
                it.mesh.scale.set(1.0, 1.0, 1.0);
              }
            } else {
              // Dim non-chain nodes
              if (it.mesh.material) {
                it.mesh.material.opacity = 0.15;
              }
              it.mesh.scale.set(1.0, 1.0, 1.0);
            }
          });
          
          // Draw Causal Corridor Sheaths around active edges
          for (var ci = 0; ci < chainItems.length - 1; ci++) {
            var pA = chainItems[ci].mesh.position;
            var pB = chainItems[ci+1].mesh.position;
            var color = (ci < clickedIdxInChain) ? 0x00FF88 : 0xFF6B35;
            
            var dir = new THREE.Vector3().subVectors(pB, pA);
            var len = dir.length();
            var geom = new THREE.CylinderGeometry(2.2, 2.2, len, 16, 1, true);
            geom.translate(0, len / 2, 0);
            geom.rotateX(Math.PI / 2);
            var mat = new THREE.MeshBasicMaterial({
              color: color,
              wireframe: true,
              transparent: true,
              opacity: 0.12
            });
            var mesh = new THREE.Mesh(geom, mat);
            mesh.position.copy(pA);
            mesh.lookAt(pB);
            scene.add(mesh);
            _activeSheaths.push(mesh);
          }
          
          // Draw floating golden label at the center
          if (chainItems.length >= 2) {
            var pStart = chainItems[0].mesh.position;
            var pEnd = chainItems[chainItems.length - 1].mesh.position;
            var midPt = new THREE.Vector3().addVectors(pStart, pEnd).multiplyScalar(0.5);
            var lbl = makeNodeLabel("Active Causal Corridor (因果干預通道)", "Axiom Chain", 0xD4AF37);
            lbl.position.set(midPt.x, midPt.y + 7, midPt.z);
            lbl.visible = true;
            scene.add(lbl);
            _corridorLabel = lbl;
          }
          
          // Create glassmorphic HUD panel at the bottom of the canvas parent
          var container = canvas.parentNode;
          if (container) {
            var hud = document.createElement('div');
            hud.id = 'dual-rca-panel';
            Object.assign(hud.style, {
              position: 'absolute', bottom: '12px', left: '12px', right: '12px', height: '160px',
              background: 'rgba(10, 15, 30, 0.72)', backdropFilter: 'blur(16px)', webkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', padding: '16px',
              display: 'flex', color: '#fff', zIndex: '1000', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              fontFamily: "'JetBrains Mono', monospace", gap: '20px'
            });
            
            var upstreamHTML = "";
            for (var ui = 0; ui <= clickedIdxInChain; ui++) {
              var ud = chainItems[ui].data;
              upstreamHTML += '<div style="margin-bottom: 8px;">'
                + '<strong style="color: #00FF88;">' + ud.id + '</strong>'
                + (ui < clickedIdxInChain ? ' ➔ ' : '')
                + '<div style="font-size: 11px; color: #aaa; margin-top: 2px;">' + (ud.ctx || ud.name || '') + '</div>'
                + '</div>';
            }
            
            var downstreamHTML = "";
            for (var di = clickedIdxInChain; di < chainItems.length; di++) {
              var dd = chainItems[di].data;
              downstreamHTML += '<div style="margin-bottom: 8px;">'
                + '<strong style="color: #FF6B35;">' + dd.id + '</strong>'
                + (di < chainItems.length - 1 ? ' ➔ ' : '')
                + '<div style="font-size: 11px; color: #aaa; margin-top: 2px;">' + (dd.ctx || dd.name || '') + '</div>'
                + '</div>';
            }
            
            hud.innerHTML = 
              '<div style="flex: 1; display: flex; flex-direction: column;">'
                + '<div style="color: #00FF88; font-size: 11px; font-weight: bold; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 4px; margin-bottom: 8px;">◀ UPSTREAM PATHWAY ROOT CAUSES (上游因果根因)</div>'
                + '<div style="font-size: 12px; overflow-y: auto; flex: 1; line-height: 1.5; color: #e0e0e0;">' + upstreamHTML + '</div>'
              + '</div>'
              + '<div style="width: 1px; background: rgba(255,255,255,0.12); height: 100%;"></div>'
              + '<div style="flex: 1; display: flex; flex-direction: column;">'
                + '<div style="color: #FF6B35; font-size: 11px; font-weight: bold; border-bottom: 1px solid rgba(255, 107, 53, 0.2); padding-bottom: 4px; margin-bottom: 8px;">▶ DOWNSTREAM PATHWAY PROJECTED EFFECTS (下游因果預測)</div>'
                + '<div style="font-size: 12px; overflow-y: auto; flex: 1; line-height: 1.5; color: #e0e0e0;">' + downstreamHTML + '</div>'
              + '</div>'
              + '<button id="rca-close-btn" style="position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: #aaa; font-size: 16px; cursor: pointer;">✕</button>';
            
            container.appendChild(hud);
            
            var closeBtn = hud.querySelector('#rca-close-btn');
            if (closeBtn) {
              closeBtn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                _exitRCA();
              });
            }
          }
          return;
        }
      }
      
      // Default: restore all on background click
      _exitRCA();
      
      function _exitRCA() {
        if (_activeSheaths) {
          _activeSheaths.forEach(function (s) { scene.remove(s); });
          _activeSheaths = [];
        }
        if (_corridorLabel) {
          scene.remove(_corridorLabel);
          _corridorLabel = null;
        }
        var p = document.getElementById('dual-rca-panel');
        if (p && p.parentNode) p.parentNode.removeChild(p);
        
        items.forEach(function (it) {
          if (it.mesh.material) {
            it.mesh.material.color.setHex(it._hc);
            it.mesh.material.emissive.setHex(it._he);
            it.mesh.material.emissiveIntensity = it._hi;
            it.mesh.opacity = it._oo;
          }
          it.mesh.scale.set(1, 1, 1);
        });
      }
      
      // Trigger default SAA details modal (XAI Tutor 3D Modal)
      if (clickedIdx >= 0) {
        var d = items[clickedIdx].data;
        if (typeof XAITutor3DModal !== 'undefined') {
          XAITutor3DModal.open({
            id: d.id || 'Node',
            label: d.id || 'Node',
            saa_disposition: d.saa_disposition || 'PASS',
            xai_explanation: d.xai_explanation || d.ctx || '',
            delta_pct: typeof d.delta_pct === 'number' ? d.delta_pct : 0,
            extracted_value: d.extracted_value !== undefined ? d.extracted_value : d.val,
            recomputed_value: d.recomputed_value !== undefined ? d.recomputed_value : '',
            formula: d.formula || '',
            snippet: d.snippet || '',
            evidence_tag: d.evidence_tag || d.status || '',
          });
        }
      }
    });
    /* Patch ctrl.update for smooth lerp */
    if (ctrl) {
      var _ou = ctrl.update.bind(ctrl);
      ctrl.update = function () {
        if (_lerpTarget && _lerpT < 1) {
          _lerpT = Math.min(_lerpT + 0.05, 1);
          var ease = 1 - Math.pow(1 - _lerpT, 3);
          ctrl.target.lerpVectors(_lerpFrom, _lerpTarget, ease);
          if (_lerpT >= 1) _lerpTarget = null;
        }
        _ou();
      };
    }
  }

  /* ── GRID HELPER §6.4 ── gold grid floor anchoring scene ──────────────── */
  /* makeGridHelper — adds grid to 'container' (a THREE.Group or THREE.Scene).
     Pass a masterGroup so the grid pans with the rest of the scene as one body. */
  function makeGridHelper(container, centroidY, hullRadius) {
    var grid = new THREE.GridHelper(hullRadius * 3, 24, C.green, C.green);
    grid.material.transparent = true; grid.material.opacity = 0.22;
    grid.position.y = centroidY - hullRadius * 0.85;
    container.add(grid);
    return grid;
  }
  /* ══ TOPOLOGY ENGINE ══════════════════════════════════════════════════════ */

  /* buildMockupSurface §6.1 — animated morphing sphere manifold (restored).
     Returns {geo,wGeo,origPos} for per-frame _topoAnim displacement. */
  /* buildMockupSurface: domainPal optional — uses domain manifold colour when provided */
  function buildMockupSurface(scene, cx, cy, cz, domainPal, isRefuse) {
    var isMed = window.location.pathname.includes('ontology_medical') || (domainPal && domainPal.allow === 0x69F0AE);
    
    var solidColor;
    if (isRefuse) {
      solidColor = 0xFF1744; // Neon crimson for blocked/refuse
    } else {
      solidColor = isMed ? 0xD32F2F : ((domainPal && domainPal.manifold) ? domainPal.manifold : C.blue); // Red for medical, else default
    }
    
    var wireColor;
    if (isRefuse) {
      wireColor = 0xFF5252;
    } else {
      wireColor = isMed ? 0xFF8A80 : ((domainPal && domainPal.manifoldWire) ? domainPal.manifoldWire : C.blue);
    }
    
    var innerColor = isMed ? (isRefuse ? 0xB71C1C : 0xFF1744) : 0x00FFFA;
    
    // Check if we are reviewing 1150603 (multi-patient document)
    var is1150603 = false;
    try {
      var raw = localStorage.getItem('sovereign_audit_data') || '';
      if (raw.indexOf('1150603') !== -1) {
        is1150603 = true;
      }
    } catch(e) {}

    if (is1150603) {
      // Create 10 distinct offset manifolds (tubes) representing the 10 pages/patients
      for (var i = 0; i < 10; i++) {
        var offsetFactor = (i - 4.5) * 3.5;
        var offsetPoints = [
          new THREE.Vector3(-22, -8 + offsetFactor * 0.15, -2 + offsetFactor),
          new THREE.Vector3(-10, 4 + offsetFactor * 0.3, 4 - offsetFactor * 0.1),
          new THREE.Vector3(0, 10 - offsetFactor * 0.2, 0 + offsetFactor * 0.4),
          new THREE.Vector3(10, 2 + offsetFactor * 0.1, -4 - offsetFactor),
          new THREE.Vector3(22, -6 - offsetFactor * 0.4, 2 + offsetFactor * 0.2)
        ];
        var offsetPath = new THREE.CatmullRomCurve3(offsetPoints);
        var offsetGeo = new THREE.TubeGeometry(offsetPath, 32, 1.0, 8, false);
        
        var mColor = i % 2 === 0 ? 0xD32F2F : 0xFF1744;
        var offsetMesh = new THREE.Mesh(offsetGeo,
          new THREE.MeshStandardMaterial({
            color: mColor, transparent: true, opacity: 0.15,
            side: THREE.DoubleSide, metalness: 0.1, roughness: 0.6
          }));
        offsetMesh.position.set(cx, cy, cz);
        scene.add(offsetMesh);
        
        var offsetWire = new THREE.Mesh(offsetGeo,
          new THREE.MeshBasicMaterial({ color: 0xFF8A80, wireframe: true, transparent: true, opacity: 0.06 }));
        offsetWire.position.set(cx, cy, cz);
        scene.add(offsetWire);

        // Add distinct patient indicator nodes along each tube
        var indicatorGeo = new THREE.SphereGeometry(0.55, 8, 8);
        var indicatorMat = new THREE.MeshBasicMaterial({ color: 0x00FFFA, transparent: true, opacity: 0.8 });
        var indicatorMesh = new THREE.Mesh(indicatorGeo, indicatorMat);
        var tPoint = offsetPath.getPointAt(0.25 + (i * 0.05));
        indicatorMesh.position.copy(tPoint).add(new THREE.Vector3(cx, cy, cz));
        scene.add(indicatorMesh);
      }
    }

    // 1. Outer safety manifold: Aorta vascular corridor spline
    var points = [
      new THREE.Vector3(-22, -8, -2),
      new THREE.Vector3(-10, 4, 4),
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(10, 2, -4),
      new THREE.Vector3(22, -6, 2)
    ];
    var path = new THREE.CatmullRomCurve3(points);
    
    var geo = new THREE.TubeGeometry(path, 64, 7.5, 16, false);
    var origPos = Float32Array.from(geo.attributes.position.array);
    
    var solidMesh = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({
        color: solidColor, transparent: true, opacity: is1150603 ? 0.02 : 0.12, // Dim outer wall if drawing 10 manifolds
        side: THREE.DoubleSide, metalness: 0.08, roughness: 0.7
      }));
    solidMesh.position.set(cx, cy, cz);
    scene.add(solidMesh);
    
    var wGeo = geo.clone();
    var wireMesh = new THREE.Mesh(wGeo,
      new THREE.MeshBasicMaterial({ color: wireColor, wireframe: true, transparent: true, opacity: is1150603 ? 0.01 : 0.08 }));
    wireMesh.position.set(cx, cy, cz);
    scene.add(wireMesh);
    
    // 2. Inner Ingested Data Manifold: Coronary flow spline
    var innerGeo = new THREE.TubeGeometry(path, 64, 3.5, 12, false);
    var innerMat = new THREE.MeshStandardMaterial({
      color: innerColor,
      transparent: true,
      opacity: is1150603 ? 0.05 : 0.28,
      wireframe: true,
      metalness: 0.2,
      roughness: 0.5
    });
    var innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.set(cx, cy, cz);
    scene.add(innerMesh);
    
    // 3. 3D Floating labels pointing to elements
    var lbl1 = makeNodeLabel(is1150603 ? "Multi-Patient Hemodynamics (十重臨床流形)" : "Aortic Safety Wall (主動脈安全壁)", is1150603 ? "10 Patient Cohort" : "Bound Limit", 0xD4AF37);
    lbl1.position.set(cx, cy + 14, cz);
    scene.add(lbl1);
    
    var lbl2 = makeNodeLabel(is1150603 ? "Cohort Patient Status Indicators" : "Coronary Lumen Flow (冠狀動脈血流)", is1150603 ? "Verified States" : "Patient State", 0x00FFFA);
    lbl2.position.set(cx, cy - 2, cz + 4);
    scene.add(lbl2);
    
    // Bounding breach deviation indicator
    var devLine = null;
    if (isRefuse && !is1150603) {
      var lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cx, cy, cz),
        new THREE.Vector3(cx + 24, cy, cz)
      ]);
      var lineMat = new THREE.LineBasicMaterial({ color: 0xFF1744, linewidth: 2 });
      devLine = new THREE.Line(lineGeo, lineMat);
      scene.add(devLine);
    }
    
    return {
      geo: geo,
      wGeo: wGeo,
      origPos: origPos,
      innerOrigPos: Float32Array.from(innerGeo.attributes.position.array),
      outerMesh: solidMesh,
      innerMesh: innerMesh,
      devLine: devLine,
      isRefuse: isRefuse,
      cx: cx, cy: cy, cz: cz
    };
  }

  function _topoAnim(obj, t) {
    if (!obj) return;
    var pos = obj.geo.attributes.position, wp = obj.wGeo.attributes.position, orig = obj.origPos;
    
    var speedMult = obj.isRefuse ? 3.0 : 1.2;
    var amp = obj.isRefuse ? 2.5 : 1.5;
    
    for (var i = 0; i < pos.count; i++) {
      var ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
      var w = Math.sin(ox * 0.12 + t * speedMult) * Math.cos(oy * 0.10 + t * speedMult * 0.8) * Math.sin(oz * 0.15 + t * speedMult * 1.1) * amp;
      var l = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      pos.setXYZ(i, ox + ox / l * w, oy + oy / l * w, oz + oz / l * w);
      wp.setXYZ(i, ox + ox / l * w, oy + oy / l * w, oz + oz / l * w);
    }
    pos.needsUpdate = true; wp.needsUpdate = true;
    obj.geo.computeVertexNormals(); obj.wGeo.computeVertexNormals();
    
    var ipos = obj.innerMesh ? obj.innerMesh.geometry.attributes.position : null;
    var iorig = obj.innerOrigPos;
    if (ipos && iorig) {
      for (var j = 0; j < ipos.count; j++) {
        var iox = iorig[j * 3], ioy = iorig[j * 3 + 1], ioz = iorig[j * 3 + 2];
        var iw = Math.sin(iox * 0.12 + t * speedMult) * Math.cos(ioy * 0.10 + t * speedMult * 0.8) * Math.sin(ioz * 0.15 + t * speedMult * 1.1) * amp;
        var il = Math.sqrt(iox * iox + ioy * ioy + ioz * ioz) || 1;
        ipos.setXYZ(j, iox + iox / il * iw, ioy + ioy / il * iw, ioz + ioz / il * iw);
      }
      ipos.needsUpdate = true;
      obj.innerMesh.geometry.computeVertexNormals();
    }
    
    if (obj.innerMesh) {
      obj.innerMesh.rotation.x = t * 0.2;
      obj.innerMesh.rotation.y = -t * 0.3;
      var scale = 1.0 + Math.sin(t * 2.5) * 0.06;
      obj.innerMesh.scale.set(scale, scale, scale);
      
      if (obj.isRefuse) {
        var shift = Math.sin(t * 1.5) * 11.5;
        obj.innerMesh.position.set(obj.cx + shift, obj.cy, obj.cz);
        
        if (obj.devLine) {
          var lp = obj.devLine.geometry.attributes.position;
          lp.setXYZ(0, obj.cx + shift, obj.cy, obj.cz);
          var dirSign = shift >= 0 ? 1 : -1;
          lp.setXYZ(1, obj.cx + dirSign * 24, obj.cy, obj.cz);
          lp.needsUpdate = true;
        }
      }
    }
  }

  /* LIVE SPARSE (< 10): no surface — graph topology only */
  function buildSparseTopology() { return null; }

  /* LIVE MEDIUM (10–49): star-triangulated surface through CORE centroid */
  function buildMediumTopology(scene, CORE) {
    var cx = CORE.reduce(function (s, n) { return s + n.x; }, 0) / CORE.length;
    var cy = CORE.reduce(function (s, n) { return s + n.y; }, 0) / CORE.length;
    var cz = CORE.reduce(function (s, n) { return s + n.z; }, 0) / CORE.length;
    var verts = [];
    for (var i = 0; i < CORE.length; i++) {
      var j = (i + 1) % CORE.length;
      verts.push(cx, cy, cz,
        CORE[i].x, CORE[i].y, CORE[i].z,
        CORE[j].x, CORE[j].y, CORE[j].z);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    /* Light cream-gold surface — visible but non-distracting on white */
    var mat = new THREE.MeshStandardMaterial({
      color: 0xFFF3D0, emissive: 0xF0D080, emissiveIntensity: 0.04,
      transparent: true, opacity: 0.12, side: THREE.DoubleSide,
      metalness: 0.05, roughness: 0.8
    });
    scene.add(new THREE.Mesh(geo, mat));
    /* Wireframe: gold tint, very low opacity */
    var wfmat = new THREE.MeshBasicMaterial({ color: 0xD4AF37, wireframe: true, transparent: true, opacity: 0.14 });
    scene.add(new THREE.Mesh(geo.clone(), wfmat));
    return null; /* no per-frame update needed */
  }

  /* LIVE DENSE (≥ 50): Gaussian KDE voxel iso-surface — light warm volume */
  function buildDenseTopology(scene, allNodes) {
    var GRID = 14, BW = 6.0;
    /* Compute bounds */
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    allNodes.forEach(function (n) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
      if (n.z < minZ) minZ = n.z; if (n.z > maxZ) maxZ = n.z;
    });
    var pad = BW * 1.5;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad; minZ -= pad; maxZ += pad;
    var dx = (maxX - minX) / (GRID - 1), dy = (maxY - minY) / (GRID - 1), dz = (maxZ - minZ) / (GRID - 1);
    var threshold = allNodes.length * 0.025;
    var sGeo = new THREE.SphereGeometry(1, 8, 8);
    for (var ix = 0; ix < GRID; ix++) {
      for (var iy = 0; iy < GRID; iy++) {
        for (var iz = 0; iz < GRID; iz++) {
          var gx = minX + dx * ix, gy = minY + dy * iy, gz = minZ + dz * iz;
          var density = 0;
          allNodes.forEach(function (n) {
            var d2 = (n.x - gx) * (n.x - gx) + (n.y - gy) * (n.y - gy) + (n.z - gz) * (n.z - gz);
            density += Math.exp(-d2 / (2 * BW * BW));
          });
          if (density > threshold) {
            var ratio = Math.min(density / threshold, 3.0);
            /* Warm ivory-pearl volume voxels — light against white background */
            var smat = new THREE.MeshStandardMaterial({
              color: 0xF0E8C0, emissive: 0xD4AF37,
              emissiveIntensity: 0.03 + ratio * 0.02,
              transparent: true, opacity: 0.04 + ratio * 0.04,
              metalness: 0.0, roughness: 0.9
            });
            var sm = new THREE.Mesh(sGeo, smat);
            sm.position.set(gx, gy, gz);
            sm.scale.setScalar(ratio * Math.min(dx, dy, dz) * 0.8);
            scene.add(sm);
          }
        }
      }
    }
    return null;
  }

  /* Dispatcher: pick topology based on mode + density */
  function buildTopology(scene, payload, CORE, allNodes, cx, cy, cz, domainPal) {
    if (!payload) {
      /* MOCKUP: animated morphing manifold — use domain palette colour */
      return buildMockupSurface(scene, cx, cy, cz, domainPal);
    }
    /* INDUCTION MODE: AI elected axioms present.
       Standby axioms (100–136) always provide manifold density regardless of raw
       data sparsity — the ontological space defines the topology, not the file data.
       allNodes already includes elected + candidate + standby → always dense. */
    if (payload.elected && payload.elected.length > 0) {
      return buildDenseTopology(scene, allNodes);
    }
    /* PURE DATA MODE: no axiom election — fall back to density-adaptive logic */
    var totalNodes = allNodes.length;
    if (totalNodes < 10) return buildSparseTopology();
    if (totalNodes < 50) return buildMediumTopology(scene, CORE);
    return buildDenseTopology(scene, allNodes);
  }
  /* ══ END TOPOLOGY ENGINE ══════════════════════════════════════════════════ */


  /* \u2550\u2550 DEDUCTION MODE HELPERS \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     [DFT][HM3D_AX_SETS]                                                         */
  /* Domain colour palette — each set gets distinct hues so GNN/WM/CM are visually distinct */
  /* ══ DOMAIN PALETTES — completely distinct visual identities per domain ══
     FPGA:       Electric Circuit   — deep-navy/neon-green/hot-red
     AEROSPACE:  Titanium/Fire      — steel-brown/gold/blaze-orange
     HEALTHCARE: Bio/Organic        — forest-green/mint/hot-pink         */
  /* §FIX-BG-PALETTE: Domain palette bg aligned to dark navy — v2.1.0 spec */
  var _DOM_PALETTE = {
    FPGA:       { allow:0x00FF88, refuse:0xFF1744, undetermined:0x40C4FF, edge:0x2979FF, cascade:0xFFAB00,
                  bg:0x060E24, manifold:0x1A237E, manifoldWire:0x3949AB, wm:0x0D47A1, cm:0x006064 },
    AEROSPACE:  { allow:0xFFD600, refuse:0xFF6D00, undetermined:0xB0BEC5, edge:0x8D6E63, cascade:0xBF360C,
                  bg:0x060E24, manifold:0x4E342E, manifoldWire:0x795548, wm:0x37474F, cm:0x263238 },
    HEALTHCARE: { allow:0x69F0AE, refuse:0xFF4081, undetermined:0xFFAB40, edge:0x7B1FA2, cascade:0xAD1457,
                  bg:0x060E24, manifold:0x1B5E20, manifoldWire:0x388E3C, wm:0x1A237E, cm:0x004D40 }
  };
  var _DEDUCTION_AXIOM_SETS = [
    /* ── arXiv index 0: PHYSICS (default, shown first) ── */
    { id:'ARXIV_PHYSICS', label:'PHYSICS \u00b7 Sovereign Axiom Network (arXiv)', domain:'PHYSICS',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps PHYSICS axiom nodes: Noether Conservation (symmetry invariants), Bell-Tsirelson quantum entanglement bounds, Bekenstein entropy constraints. Refuse nodes indicate constraint violations in the quantum-classical boundary.',
        wm:  'World Model Phase 2 renders the Bekenstein-Entropy constraint manifold \u03a9. The surface encodes thermodynamic admissibility: S \u2264 2\u03c0RE/(\u0127c) for all candidate states. Gold rings mark cross-axiom identity preservation.',
        cm:  'Causal Model Phase 3 traces Bell-Tsirelson residual correlations. \u03a3R = E[\u03b5\u03b5T] \u2212 \u039b\u03a3X\u039bT. Corr(i,j) > 0.72 triggers HITL review: quantum non-locality cannot be classical-causally explained.'
      }
    },
    /* ── arXiv index 1: MATHEMATICS ── */
    { id:'ARXIV_MATH', label:'MATH \u00b7 Formal Proof Network (arXiv)', domain:'MATHEMATICS',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps MATHEMATICS axiom nodes: Banach Fixed-Point (contraction convergence), Goedel Completeness (proof soundness), Cramer-Rao Lower Bound (estimator optimality). Refuse nodes indicate structural inconsistency.',
        wm:  'World Model Phase 2 renders the Hahn-Banach extension constraint manifold. ||F|| = ||f|| norm-preservation defines the admissible functional space. Goedel completeness bounds the reachable proof space.',
        cm:  'Causal Model Phase 3 traces Cramer-Rao residual correlations. Var(\u03b8\u0302) \u2265 1/I(\u03b8) bounds all estimator residuals. Outliers above the bound indicate under-specified causal structure.'
      }
    },
    /* ── arXiv index 2: CS ── */
    { id:'ARXIV_CS', label:'CS \u00b7 Learning Theory Axiom Map (arXiv)', domain:'CS',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps CS axiom nodes: PAC Learning VC-dimension sample complexity, SGD convergence O(1/\u221aT), Byzantine Fault Tolerance f<n/3. Refuse nodes indicate generalization bound violations.',
        wm:  'World Model Phase 2 renders the VC-dimension hypothesis space manifold. PAC sample complexity m \u2265 (1/\u03b5)(d ln(1/\u03b5) + ln(1/\u03b4)) constrains the admissible learning region.',
        cm:  'Causal Model Phase 3 traces SGD convergence residuals. E[||\u2207f(xt)||\u00b2] \u2264 O(1/\u221aT). Byzantine nodes (f < n/3 violated) appear as outliers in the causal correlation structure.'
      }
    },
    /* ── arXiv index 3: QBIO ── */
    { id:'ARXIV_QBIO', label:'QBIO \u00b7 Biological Axiom Graph (arXiv)', domain:'QBIO',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps QBIO axiom nodes: Hardy-Weinberg allele equilibrium, Michaelis-Menten enzyme kinetics, Hodgkin-Huxley membrane dynamics. Refuse nodes indicate biological constraint violations.',
        wm:  'World Model Phase 2 renders the Lotka-Volterra predator-prey constraint manifold. dx/dt = \u03b1x \u2212 \u03b2xy; dy/dt = \u03b4xy \u2212 \u03b3y. Admissible states lie within the ecological stability ellipse.',
        cm:  'Causal Model Phase 3 traces Michaelis-Menten kinetic residuals. v = Vmax[S]/(Km+[S]). Corr(i,j) > 0.72 indicates coupled enzyme cascades requiring HITL review for pathway intervention.'
      }
    },
    /* ── arXiv index 4: QFIN ── */
    { id:'ARXIV_QFIN', label:'QFIN \u00b7 Financial Axiom Network (arXiv)', domain:'QFIN',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps QFIN axiom nodes: Black-Scholes fair value, No-Arbitrage fundamental theorem, Kelly Criterion optimal fraction. Refuse nodes flag arbitrage opportunities or Kelly over-betting.',
        wm:  'World Model Phase 2 renders the no-arbitrage constraint manifold. E^Q[X_T] \u2264 X_0 e^{rT} defines the admissible pricing surface. CVaR \u2265 VaR bounds the coherent risk region.',
        cm:  'Causal Model Phase 3 traces Kelly-CVaR residual correlations. f* = (bp \u2212 q)/b. CVaR/VaR > 1.18 triggers HITL review: tail risk exceeds expected-shortfall coherence threshold.'
      }
    },
    /* ── arXiv index 5: STAT ── */
    { id:'ARXIV_STAT', label:'STAT \u00b7 Statistical Axiom Space (arXiv)', domain:'STAT',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps STAT axiom nodes: CLT asymptotic normality, Bayes optimal posterior, Minimax risk lower bound, Bonferroni FWER control. Refuse nodes flag multiple testing violations.',
        wm:  'World Model Phase 2 renders the Bayesian posterior constraint manifold. P(\u03b8|X) \u221d P(X|\u03b8)P(\u03b8). Minimax risk floor inf sup R \u2265 \u03b5\u00b2 bounds the admissible estimator region.',
        cm:  'Causal Model Phase 3 traces Bonferroni-corrected residual correlations. \u03b1_corrected = \u03b1/m. Uncorrected p-values appearing as outliers trigger HITL statistical review.'
      }
    },
    /* ── arXiv index 6: EESS ── */
    { id:'ARXIV_EESS', label:'EESS \u00b7 Systems Axiom Graph (arXiv)', domain:'EESS',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps EESS axiom nodes: Nyquist-Shannon sampling (f_s \u2265 2B), Lyapunov asymptotic stability (V\u0307 < 0), Shannon channel capacity. Refuse nodes flag aliasing or instability violations.',
        wm:  'World Model Phase 2 renders the Lyapunov stability constraint manifold. V\u0307(x) < 0 defines the asymptotically stable region. Bode gain-phase minimum-phase constraint bounds the frequency response surface.',
        cm:  'Causal Model Phase 3 traces Nyquist-Shannon causal residuals. C = B log\u2082(1+SNR). Aliased samples (f_s < 2B) appear as spurious correlations in the causal residual structure.'
      }
    },
    /* ── arXiv index 7: ECON ── */
    { id:'ARXIV_ECON', label:'ECON \u00b7 Economic Axiom Network (arXiv)', domain:'ECON',
      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],
      narrative: {
        gnn: 'GNN Phase 1 maps ECON axiom nodes: Nash equilibrium (all finite games), Arrow impossibility (no SWF satisfies all three), Revelation principle, Pareto optimality. Refuse nodes flag mechanism failures.',
        wm:  'World Model Phase 2 renders the Pareto-Nash constraint manifold. u_i(x) \u2265 u_i(y) \u2200i defines the Pareto admissible allocation surface. Nash equilibrium fixed points appear as stable manifold nodes.',
        cm:  'Causal Model Phase 3 traces Arrow-Nash impossibility residuals. No SWF satisfies unanimity + IIA + non-dictatorship simultaneously. Paradox nodes trigger HITL mechanism design review.'
      }
    },
    /* ── Legacy domains kept for backward compatibility ── */
    { id:'FPGA_SIGNAL', label:'FPGA \u00b7 Signal Integrity', domain:'FPGA',
      palette: _DOM_PALETTE.FPGA,
      narrative: {
        gnn:  'GNN Phase 1 maps FPGA axiom nodes as a skeletal signal-integrity graph. Each sphere = one axiom gate. REFUSE nodes (cyan) indicate constraint breaches: SI-001 eye-aperture collapse drives a cascade through TH-001 (thermal budget violation). Gold torus rings mark cross-view identity.',
        wm:   'World Model Phase 2 renders the constraint manifold \u03a9. The torus surface encodes allowable (V_eye, T_j) operating space. Cyan spikes project REFUSE axioms outward from the manifold surface \u2014 spike height = deviation magnitude in \u03c3 units.',
        cm:   'Causal Model Phase 3 traces the do-calculus corridor: SI-001 \u2192 TH-001 \u2192 SYSTEM_HALT. Red corridor faces visualise the ACE = E[Y|do(X=1)]\u2212E[Y|do(X=0)] chain. Identifiability threshold \u03b8_c = 0.72.'
      },
      axioms:[
        {id:'SI-001',name:'Signal Integrity Gate',    formula:'V_{eye} \u2265 V_{th}',      verdict:'REFUSE',          computed:58.2,  threshold:100.0, unit:'mV'},
        {id:'PC-001',name:'Power Budget Gate',         formula:'P = \u03b1CV\u00b2f \u2264 P_{bud}', verdict:'ALLOW',           computed:820,   threshold:1200,  unit:'mW'},
        {id:'TH-001',name:'Thermal Budget Gate',       formula:'T_j = T_a + P\u03b8_{JA}',  verdict:'REFUSE',          computed:128.4, threshold:125.0, unit:'\u00b0C'},
        {id:'TS-001',name:'Setup-Slack Gate (WNS)',    formula:'WNS \u2265 0',               verdict:'ALLOW',           computed:0.38,  threshold:0,     unit:'ns'}],
      cascades:[['SI-001','TH-001']] },
    { id:'AEROSPACE', label:'Aerospace \u00b7 Structural', domain:'AEROSPACE',
      palette: _DOM_PALETTE.AEROSPACE,
      narrative: {
        gnn:  'GNN Phase 1 maps aerospace structural axioms. MS-001 (Mech. Stress Reserve Factor < 1.5) emits a REFUSE verdict and triggers a cascade through BK-001 (Euler buckling). Orange = critical, steel-grey = admissible. Node size encodes structural risk magnitude.',
        wm:   'World Model Phase 2 renders the \u03a9-boundary as a toroidal constraint manifold in the (\u03c3/\u03c3_y, da/dN) design space. Orange spikes project REFUSE axioms outside the safe-operating envelope \u2014 spike height = reserve-factor deficit ratio.',
        cm:   'Causal Model Phase 3 traces the structural failure corridor: MS-001 \u2192 BK-001 \u2192 STRUCTURAL_COLLAPSE. The corridor surface colour encodes the Paris-law crack propagation rate. Back-door criterion requires Z blocks all \u03c3 \u2192 failure paths.'
      },
      axioms:[
        {id:'SF-001',name:'Reserve Factor Gate',     formula:'RF = F_{ult}/F_{app} \u2265 1.5', verdict:'REFUSE',          computed:1.21, threshold:1.5,  unit:'\u2014'},
        {id:'DM-001',name:'Crack Growth Gate',        formula:'da/dN \u2264 (da/dN)_{crit}',   verdict:'ALLOW',           computed:2.1e-7, threshold:5e-7, unit:'m/cyc'},
        {id:'BK-001',name:'Euler Buckling Gate',      formula:'P_{cr} = \u03c0\u00b2EI/(KL)\u00b2', verdict:'UNDERDETERMINED', computed:null, threshold:null, unit:'kN'},
        {id:'TS-001',name:'Thermal Stress Gate',      formula:'\u03c3_{th} = E\u03b1\u0394T \u2264 \u03c3_y', verdict:'ALLOW',           computed:185,  threshold:280,  unit:'MPa'}],
      cascades:[['SF-001','BK-001']] },
    { id:'HEALTHCARE', label:'Healthcare \u00b7 Metabolic', domain:'HEALTHCARE',
      palette: _DOM_PALETTE.HEALTHCARE,
      narrative: {
        gnn:  'GNN Phase 1 maps metabolic pathway axioms. 36 clinical axioms are evaluated. All nodes are ADMISSIVE (ALLOW), indicating compliant metabolic, cardiovascular, renal, and genomic parameters.',
        wm:   'World Model Phase 2 renders the patient\'s physiological manifold on a 3D anatomical wireframe. Nodes represent physical organ systems: brain, heart, lungs, kidneys, spleen, and liver. Safe operating envelopes are verified.',
        cm:   'Causal Model Phase 3 traces Pearl do-calculus causal corridors across the 8 physiological domains. Healthy metabolic flow and normal afterload verify absence of risk propagation corridors.'
      },
      axioms: _getHealthcareAxiomsList(),
      cascades: [
        ['HC_MS_001', 'HC_CAD_002'],
        ['HC_DM_001', 'HC_CAD_001'],
        ['HC_CKD_001', 'HC_CKD_002']
      ]
    }
  ];
  
  function _getHealthcareAxiomsList() {
    var list = [];
    var mockData = {
      'HC_CAD_001': { name: 'LDL Target for CAD Patients', formula: 'LDL \\le 100', val: 95.0, thr: 100.0, unit: 'mg/dL' },
      'HC_CAD_002': { name: '10-Year CVD Risk Assessment', formula: 'ASCVD\\_Risk < 0.075', val: 0.062, thr: 0.075, unit: '%' },
      'HC_HTN_001': { name: 'Hypertension Stage Classification', formula: 'SYS < 130', val: 120.0, thr: 130.0, unit: 'mmHg' },
      'HC_HTN_002': { name: 'Blood Pressure Target < 130/80', formula: 'DIA < 80', val: 78.0, thr: 80.0, unit: 'mmHg' },
      'HC_HF_001':  { name: 'LVEF Classification (HFrEF/HFpEF)', formula: 'LVEF \\ge 50', val: 55.0, thr: 50.0, unit: '%' },
      'HC_HF_002':  { name: 'BNP / NT-proBNP Threshold', formula: 'BNP < 100', val: 85.0, thr: 100.0, unit: 'pg/mL' },
      
      'HC_DM_001':  { name: 'HbA1c Target < 7.0% (T2DM)', formula: 'HBA1C < 7.0', val: 5.6, thr: 7.0, unit: '%' },
      'HC_DM_002':  { name: 'eAG from HbA1c (ADAG Nathan)', formula: 'eAG = 28.7 \\cdot HBA1C - 46.7', val: 114.0, thr: 154.0, unit: 'mg/dL' },
      'HC_OB_001':  { name: 'BMI Obesity Classification (WHO)', formula: 'BMI < 30.0', val: 24.5, thr: 30.0, unit: 'kg/m²' },
      'HC_TH_001':  { name: 'TSH Normal Range 0.4–4.0 mIU/L', formula: 'TSH \\le 4.0', val: 1.8, thr: 4.0, unit: 'mIU/L' },
      'HC_MS_001':  { name: 'Metabolic Syndrome (IDF Criteria)', formula: 'MetS\\_Score < 3', val: 1.0, thr: 3.0, unit: 'points' },
      
      'HC_CKD_001': { name: 'eGFR Stage Classification (KDIGO 2022)', formula: 'eGFR \\ge 60.0', val: 65.0, thr: 60.0, unit: 'mL/min/1.73m²' },
      'HC_CKD_002': { name: 'eGFR Decline Rate > 25% in 6mo', formula: 'Decline\\_Rate < 0.25', val: 0.044, thr: 0.25, unit: '/6mo' },
      'HC_CKD_003': { name: 'Albuminuria Category (ACR)', formula: 'ACR < 30.0', val: 15.0, thr: 30.0, unit: 'mg/g' },
      'HC_AKI_001': { name: 'AKI Stage by KDIGO Creatinine Rise', formula: 'Creatinine\\_Ratio < 1.5', val: 1.11, thr: 1.5, unit: 'ratio' },
      'HC_AKI_002': { name: 'Urine Output AKI Criterion < 0.5 mL/kg/h', formula: 'Urine\\_Output \\ge 0.5', val: 0.8, thr: 0.5, unit: 'mL/kg/h' },
      
      'HC_LIP_001': { name: 'LDL-C Friedewald Calculation', formula: 'LDL\\_calc = TC - HDL - TG / 5', val: 131.0, thr: 131.0, unit: 'mg/dL' },
      'HC_LIP_002': { name: 'Non-HDL Cholesterol Target', formula: 'Non\\_HDL < 130', val: 125.0, thr: 130.0, unit: 'mg/dL' },
      'HC_AN_001':  { name: 'Anaemia Hb Threshold (WHO Gender-Specific)', formula: 'Hb \\ge 13.0', val: 14.2, thr: 13.0, unit: 'g/dL' },
      'HC_AN_002':  { name: 'Iron Deficiency Ferritin < 30 ng/mL', formula: 'Ferritin \\ge 30', val: 45.0, thr: 30.0, unit: 'ng/mL' },
      'HC_COAG_001':{ name: 'INR Therapeutic Range (Anticoagulation)', formula: 'INR \\le 3.0', val: 2.4, thr: 3.0, unit: 'ratio' },
      
      'HC_COPD_001':{ name: 'GOLD COPD Stage I-IV (FEV1 % pred)', formula: 'FEV1\\_pred \\ge 80', val: 85.0, thr: 80.0, unit: '%' },
      'HC_COPD_002':{ name: 'FEV1/FVC Ratio < 0.70 (Obstruction)', formula: 'FEV1\\_FVC \\ge 0.70', val: 0.75, thr: 0.70, unit: 'ratio' },
      'HC_AST_001': { name: 'Asthma Severity GINA Classification', formula: 'Symptom\\_Days < 3', val: 1.0, thr: 3.0, unit: 'days/wk' },
      'HC_PH_001':  { name: 'Pulmonary HTN mPAP > 20 mmHg', formula: 'mPAP \\le 20', val: 18.0, thr: 20.0, unit: 'mmHg' },
      
      'HC_STR_001': { name: 'CHA₂DS₂-VASc Stroke Risk Score ≥ 2', formula: 'CHADS\\_Score < 2', val: 1.0, thr: 2.0, unit: 'points' },
      'HC_STR_002': { name: 'NIHSS Stroke Severity Classification', formula: 'NIHSS < 5', val: 2.0, thr: 5.0, unit: 'points' },
      'HC_DEM_001': { name: 'MoCA < 26 Cognitive Impairment Screen', formula: 'MoCA \\ge 26', val: 28.0, thr: 26.0, unit: 'points' },
      'HC_EPI_001': { name: 'Seizure Frequency Threshold', formula: 'Seizure\\_Count < 1', val: 0.0, thr: 1.0, unit: 'seizures/mo' },
      
      'HC_ONC_001': { name: 'TNM Staging (Solid Tumour)', formula: 'Stage\\_T \\le 2', val: 1.0, thr: 2.0, unit: 'stage' },
      'HC_ONC_002': { name: 'RECIST 1.1 Treatment Response', formula: 'Tumor\\_Decline \\ge 0.30', val: 0.333, thr: 0.30, unit: 'ratio' },
      'HC_ONC_003': { name: 'PSA Velocity > 0.75 ng/mL/yr', formula: 'PSA\\_Velocity \\le 0.75', val: 0.45, thr: 0.75, unit: 'ng/mL/yr' },
      'HC_ONC_004': { name: 'CA-125 Threshold (Ovarian)', formula: 'CA125 < 35.0', val: 18.5, thr: 35.0, unit: 'U/mL' },
      
      'HC_PGx_001': { name: 'CYP2D6 Dosing', formula: 'Activity\\_Score > 0', val: 1.5, thr: 1.0, unit: 'score' },
      'HC_PGx_002': { name: 'ACMG Pathogenic Criteria', formula: 'Pathogenic\\_Criteria\\_Count == 0', val: 0.0, thr: 1.0, unit: 'variants' },
      'HC_BRCA_001':{ name: 'BRCA1/2 Lifetime Risk', formula: 'BRCA\\_Risk \\le 50.0', val: 12.5, thr: 50.0, unit: '%' }
    };
    
    Object.keys(mockData).forEach(function(id) {
      var item = mockData[id];
      list.push({
        id: id,
        name: item.name,
        formula: item.formula,
        verdict: 'ALLOW',
        computed: item.val,
        threshold: item.thr,
        unit: item.unit
      });
    });
    return list;
  }
  
  function _getOrganPosition(axiomId) {
    var id = (axiomId || '').toUpperCase();
    var center = { x: 0, y: 0, z: 0 };
    var seed = _hashSeed(id);
    
    if (id.indexOf('CAD') !== -1 || id.indexOf('HTN') !== -1 || id.indexOf('HF') !== -1 || id.indexOf('LIP') !== -1) {
      center = { x: 0.8, y: 1.8, z: 1.8 };
    } else if (id.indexOf('COPD') !== -1 || id.indexOf('AST') !== -1 || id.indexOf('PH') !== -1 || id.indexOf('PULM') !== -1) {
      var side = (seed % 2 === 0) ? -1 : 1;
      center = { x: side * 2.2, y: 2.2, z: 1.2 };
    } else if (id.indexOf('CKD') !== -1 || id.indexOf('AKI') !== -1 || id.indexOf('RENAL') !== -1) {
      var side = (seed % 2 === 0) ? -1 : 1;
      center = { x: side * 1.8, y: -1.8, z: -1.2 };
    } else if (id.indexOf('DM') !== -1 || id.indexOf('OB') !== -1 || id.indexOf('TH') !== -1 || id.indexOf('MS') !== -1 || id.indexOf('ENDO') !== -1) {
      center = { x: 0, y: 0, z: 1.2 };
    } else if (id.indexOf('STR') !== -1 || id.indexOf('DEM') !== -1 || id.indexOf('EPI') !== -1 || id.indexOf('NEUR') !== -1) {
      center = { x: 0, y: 8.5, z: 0 };
    } else if (id.indexOf('AN') !== -1 || id.indexOf('COAG') !== -1 || id.indexOf('HEMA') !== -1) {
      center = { x: -1.5, y: 0.2, z: 0.8 };
    } else if (id.indexOf('ONC') !== -1) {
      center = { x: 1.8, y: -4.5, z: 0.5 };
    } else if (id.indexOf('PGX') !== -1 || id.indexOf('BRCA') !== -1 || id.indexOf('GENO') !== -1) {
      center = { x: 0.5, y: -0.8, z: -1.5 };
    } else {
      center = { x: 0, y: -3.5, z: 0 };
    }
    
    var r = 1.6;
    var theta = (seed % 100) / 100 * 2 * Math.PI;
    var phi = (seed % 99) / 99 * Math.PI;
    
    return {
      x: center.x * 2.2 + Math.sin(phi) * Math.cos(theta) * r,
      y: center.y * 2.2 + Math.cos(phi) * r,
      z: center.z * 2.2 + Math.sin(phi) * Math.sin(theta) * r
    };
  }

  var _deductionMockupDomainIdx = _DEDUCTION_AXIOM_SETS.findIndex(function(s) { return s.domain === 'HEALTHCARE'; });
  if (_deductionMockupDomainIdx < 0) _deductionMockupDomainIdx = 0;

  function _buildDeductionNodeSet(auditPkt) {
    var evals = auditPkt && auditPkt.axiom_evaluations || [];
    var total = Math.max(evals.length, 1);
    var NN = [], EDGES = [], corridorNodes = [], idxMap = {};
    
    evals.forEach(function(ev, i) {
      var axId = ev.axiom_id || ('AX-' + i);
      var pos = _getOrganPosition(axId);
      var col = _deductionNodeColor(ev.verdict);
      var crit = (ev.verdict === 'REFUSE');
      var mark = axId.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || ('A' + i);
      
      idxMap[axId] = NN.length;
      NN.push({
        id: axId,
        crossMark: mark,
        name: ev.statement || axId,
        val: ev.computed_value != null ? ev.computed_value.toFixed(3) : '--',
        formula: ev.expression_latex || axId,
        verdict: ev.verdict || 'ALLOW',
        status: ev.verdict || 'ALLOW',
        ctx: (ev.expression_latex ? 'Formula: ' + ev.expression_latex + ' ' : '') +
             (ev.computed_value != null ? 'Computed: ' + ev.computed_value.toFixed(3) : ''),
        x: pos.x, y: pos.y, z: pos.z,
        r: crit ? 2.2 : 1.6,
        color: col,
        crit: crit,
        isAxiom: true
      });
      if (crit) corridorNodes.push(NN[NN.length - 1]);
    });
    
    for (var i = 0; i < NN.length; i++) {
      var axIdA = NN[i].id;
      for (var j = i + 1; j < NN.length; j++) {
        var axIdB = NN[j].id;
        var prefA = axIdA.split('_').slice(0, 2).join('_');
        var prefB = axIdB.split('_').slice(0, 2).join('_');
        if (prefA === prefB) {
          EDGES.push([i, j, DC.SKELETON_EDGE]);
        }
      }
    }
    
    return { NN: NN, EDGES: EDGES, corridorNodes: corridorNodes };
  }

  function _buildDeductionMockupNodeSet(setObj){
    var axioms = setObj.axioms || [], total = Math.max(axioms.length, 1);
    var pal = setObj.palette || _DOM_PALETTE.FPGA;
    var NN = [], EDGES = [], corridorNodes = [], idxMap = {};
    
    axioms.forEach(function(ax, i) {
      var pos = (setObj.domain === 'HEALTHCARE') ? _getOrganPosition(ax.id) : _seededPos(ax.id, total, 14);
      var col = ax.verdict === 'ALLOW' ? pal.allow : ax.verdict === 'REFUSE' ? pal.refuse : pal.undetermined;
      var crit = (ax.verdict === 'REFUSE');
      var ctx = 'Formula: ' + ax.formula;
      if (ax.computed != null) ctx += ' | Computed: ' + ax.computed + ' ' + ax.unit + ' (threshold: ' + ax.threshold + ' ' + ax.unit + ')';
      
      idxMap[ax.id] = i;
      NN.push({
        id: ax.id,
        crossMark: ax.id.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase(),
        name: ax.name,
        val: ax.formula,
        formula: ax.formula,
        verdict: ax.verdict,
        status: ax.verdict,
        ctx: ctx,
        computed: ax.computed,
        threshold: ax.threshold,
        unit: ax.unit,
        x: pos.x, y: pos.y, z: pos.z,
        r: crit ? 2.2 : 1.6,
        color: col,
        crit: crit,
        isAxiom: true,
        _domainPalette: pal
      });
      if (crit) corridorNodes.push(NN[i]);
    });
    
    if (setObj.domain === 'HEALTHCARE') {
      for (var i = 0; i < NN.length; i++) {
        var axIdA = NN[i].id;
        for (var j = i + 1; j < NN.length; j++) {
          var axIdB = NN[j].id;
          var prefA = axIdA.split('_').slice(0, 2).join('_');
          var prefB = axIdB.split('_').slice(0, 2).join('_');
          if (prefA === prefB) {
            EDGES.push([i, j, pal.edge || DC.SKELETON_EDGE]);
          }
        }
      }
    } else {
      (setObj.cascades || []).forEach(function(p) {
        var ai = idxMap[p[0]], bi = idxMap[p[1]];
        if (ai !== undefined && bi !== undefined) EDGES.push([ai, bi, pal.cascade || DC.CASCADE_EDGE]);
      });
      for (var i = 0; i < axioms.length; i++) EDGES.push([i, (i + 1) % axioms.length, pal.edge || DC.SKELETON_EDGE]);
    }
    
    return { NN: NN, EDGES: EDGES, corridorNodes: corridorNodes, palette: pal };
  }

  function _adaptAuditPacket(pkt){
    if(!pkt) return null;
    var ev=pkt.axiom_evaluations||[];
    return {
      elected:  ev.filter(function(e){return e.verdict==='ALLOW';}).map(function(e){return {id:e.axiom_id,axiom_id:e.axiom_id,score:e.computed_value||0.9,description:e.expression_latex||e.axiom_id,label:e.axiom_id,inputs:e.inputs};}),
      candidate:ev.filter(function(e){return e.verdict==='UNDERDETERMINED';}).map(function(e){return {id:e.axiom_id,axiom_id:e.axiom_id,score:e.computed_value||0.65,description:e.expression_latex||e.axiom_id,label:e.axiom_id,inputs:e.inputs};}),
      standby:  ev.filter(function(e){return e.verdict==='REFUSE';}).map(function(e){return {id:e.axiom_id,axiom_id:e.axiom_id,score:e.computed_value||0.3,description:e.expression_latex||e.axiom_id,label:e.axiom_id,inputs:e.inputs};}),
      domain:pkt.domain||'DEDUCTION',_deduction:pkt
    };
  }

  /* ══ PHASE 1 — GNN Biomarker Network ══ */
  function initPhase1(cid, payload) {
    var _perfStart1 = performance.now();
    var el = $(cid); if (!el || !window.THREE) return;
    destroyEngine(cid);
    var w = el.clientWidth  || 320, h = Math.max(el.clientHeight, 220);
    var _isThumbnail = el.id && el.id.indexOf('ded-modal') === -1;
    var _bgColor = (payload && payload.bgColor != null) ? payload.bgColor : (window.location.pathname.includes('ontology_medical') ? 0x000000 : 0xFFFFFF);
    var renderer = makeRenderer(el, w, h, _bgColor), scene = new THREE.Scene(), camera = makeCamera(w, h, _isThumbnail);
    scene.background = new THREE.Color(_bgColor);
    var _darkBg = _bgColor === 0x000000 || _bgColor < 0x333333;
    /* ── masterGroup: single root for ALL scene geometry (mesh + axes + grid).
       The zero-point tracker shifts masterGroup.position atomically during pan
       so every component moves as one rigid body — no tearing possible.      */
    var masterGroup = new THREE.Group(); masterGroup.name = 'MasterGroup'; scene.add(masterGroup);
    var sceneGroup = new THREE.Group(); masterGroup.add(sceneGroup);
    _engines[cid] = { renderer: renderer, ctrl: null, ro: null, rafId: null, sceneGroup: sceneGroup, masterGroup: masterGroup };
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    var dl = new THREE.DirectionalLight(0xfff4e0, 1.0); dl.position.set(20, 40, 30); scene.add(dl);
    scene.add(new THREE.DirectionalLight(0xe8f0ff, 0.4)).position.set(-20, -10, 20);
    /* ══ NODE BUILD: tri-path — deduction | live | mockup ══ */
    var GOLDEN = Math.PI * (3 - Math.sqrt(5));
    var NN = [], EDGES = [], items = [];
    /* [DFT][HM3D_P1_DEDUCTION_BRANCH] */
    var _ded = payload && payload._deduction;
    var _dedMockup = !_ded && (payload === null || payload === undefined);
    var liveMode = !_ded && !!(payload && payload.elected && payload.elected.length);
    var _corridorNodes = [], _deductionNodeSet = null;
    if (_ded) {
      /* ── DEDUCTION LIVE: axiom skeleton + field nodes ────────────────────── */
      _deductionNodeSet = _buildDeductionNodeSet(_ded);
      NN = _deductionNodeSet.NN; EDGES = _deductionNodeSet.EDGES;
      _corridorNodes = _deductionNodeSet.corridorNodes;
      addPhaseTitle(el, 'Phase 1 — GNN Deduction: ' + (_ded.domain||'AXIOM') + ' · '
        + NN.length + ' nodes · ' + _corridorNodes.length + ' REFUSE', _darkBg);
    } else if (!liveMode) {
      /* ── MOCKUP: domain-appropriate axiom-set demo ───────────────────────
         FIX B3: Use payload.domain to select the domain-matching mockup set.
         When a HEALTHCARE file yields 0 elected axioms, show Healthcare demo
         (LP-001/IL-001) instead of FPGA (SI-001), preventing domain mismatch. */
      var _setIdx = typeof _deductionMockupDomainIdx === 'number' ? _deductionMockupDomainIdx : 0;
      if (payload && payload.domain) {
        var _domStr = (payload.domain || '').toString().toUpperCase();
        var _domLookup = _DEDUCTION_AXIOM_SETS.findIndex(function(s) {
          return s.domain === _domStr || _domStr.indexOf(s.domain) !== -1;
        });
        if (_domLookup >= 0) _setIdx = _domLookup;
      }
      _setIdx = Math.max(0, Math.min(_setIdx, _DEDUCTION_AXIOM_SETS.length - 1));
      var _activeSet = _DEDUCTION_AXIOM_SETS[_setIdx];
      _deductionNodeSet = _buildDeductionMockupNodeSet(_activeSet);
      NN = _deductionNodeSet.NN; EDGES = _deductionNodeSet.EDGES;
      _corridorNodes = _deductionNodeSet.corridorNodes;
      /* Show domain-correct label. If payload had a domain (upload received) but 0 elected
         axioms, this is the quota-fallback path — label it honestly so the user knows
         the pipeline ran but embedding was rate-limited. */
      var _demoReason = (payload && payload.domain)
        ? _activeSet.label + ' — Axiom Demo [Embedding Quota: results pending]'
        : _activeSet.label + ' (demo)';
      addPhaseTitle(el, 'Phase 1 \u2014 GNN ' + _demoReason, _darkBg);
    }
    if (!_ded && liveMode) {
      /* ── LIVE DATA: axiom-tier graph ── */
      var elec = payload.elected || [], cand = payload.candidate || [], sby2 = (payload.standby || []).slice(0, 40);
      var dom = payload.domain || 'MULTI';

      // Auto-generate standby nodes if empty to create a dense correlation GNN
      if (sby2.length === 0) {
        var SBYCOLS = [0x1565C0, 0x00695C, 0x0D47A1, 0x2E7D32, 0x37474F];
        for (var si = 0; si < 50; si++) {
          var sy = 1 - (si / 49) * 2, srr = Math.sqrt(Math.max(0, 1 - sy * sy)), sth = GOLDEN * si, srad = 18 + Math.random() * 8;
          var sc = SBYCOLS[si % SBYCOLS.length];
          sby2.push({
            id: 'BM-' + si, axiom_id: 'BM-' + si, score: 0.5,
            description: 'Telemetry context node ' + si, label: 'BM-' + si,
            isSynthetic: true, x: Math.cos(sth) * srr * srad, y: sy * srad, z: Math.sin(sth) * srr * srad,
            color: sc
          });
        }
      }

      addPhaseTitle(el, 'Phase 1: GNN Live \u2014 ' + dom + ' (' + elec.length + ' Elected \u00b7 ' + cand.length + ' Candidate \u00b7 ' + sby2.length + ' Standby)', _darkBg);

      /* Elected: center cluster — large, score-colored with vertical dispersion */
      elec.forEach(function (ax, i) {
        var th = 2 * Math.PI * i / Math.max(elec.length, 1), r2 = elec.length > 1 ? 6 : 0;
        var sc2 = typeof ax.score === 'number' ? ax.score : 0.85;
        var col = sc2 >= 0.80 ? 0x00C853 : (sc2 >= 0.65 ? 0xB8860B : 0xD90429);
        var yVal = -4 + 8 * (i / Math.max(elec.length, 1));
        NN.push({ id: ax.id || ax.axiom_id || ('EL-' + i), val: sc2.toFixed(2) + ' sc', status: 'ELECTED', ctx: ax.description || ax.label || 'Elected axiom', x: Math.cos(th) * r2, y: yVal, z: Math.sin(th) * r2, r: 2.4, color: col, crit: sc2 < 0.65 });
      });

      /* Candidate: middle ring — medium, amber with wide vertical sine wave */
      cand.forEach(function (ax, i) {
        var th = 2 * Math.PI * i / Math.max(cand.length, 1);
        var sc2 = typeof ax.score === 'number' ? ax.score : 0.72;
        var col = sc2 >= 0.70 ? 0xF9A825 : 0xE65100;
        NN.push({ id: ax.id || ax.axiom_id || ('CA-' + i), val: sc2.toFixed(2) + ' sc', status: 'CANDIDATE', ctx: ax.description || ax.label || 'Candidate axiom', x: Math.cos(th) * 16, y: Math.sin(i * 0.8) * 8, z: Math.sin(th) * 16, r: 1.5, color: col, crit: sc2 < 0.65 });
      });

      /* Standby: Fibonacci outer sphere — small, steel-blue */
      sby2.forEach(function (ax, i) {
        if (ax.isSynthetic) {
          NN.push({ id: ax.id, val: '--', status: 'STANDBY', ctx: ax.description, x: ax.x, y: ax.y, z: ax.z, r: 0.85 + Math.random() * 0.25, color: ax.color, crit: false });
        } else {
          var sy2 = 1 - (i / Math.max(sby2.length - 1, 1)) * 2, srr2 = Math.sqrt(Math.max(0, 1 - sy2 * sy2));
          var sth2 = GOLDEN * i, srad2 = 26 + Math.random() * 8;
          NN.push({ id: ax.id || ax.axiom_id || ('SB-' + i), val: '--', status: 'STANDBY', ctx: 'Standby axiom', x: Math.cos(sth2) * srr2 * srad2, y: sy2 * srad2, z: Math.sin(sth2) * srr2 * srad2, r: 0.85 + Math.random() * 0.2, color: 0x546E7A, crit: false });
        }
      });

      /* Auto-edges: connect elected nodes as a 3D mesh (ring + diagonals) */
      var ne = elec.length, nc = cand.length, ns = sby2.length;
      for (var i = 0; i < ne; i++) {
        // Connect to next in ring
        if (ne > 1) EDGES.push([i, (i + 1) % ne, 0x00C853]);
        // Connect to opposite diagonal
        if (ne > 3) EDGES.push([i, (i + Math.floor(ne / 2)) % ne, 0x004D40]);
      }

      /* Connect elected to candidates */
      for (var ei = 0; ei < ne; ei++) {
        for (var ci = 0; ci < nc; ci++) {
          EDGES.push([ei, ne + ci, 0xF9A825]);
        }
      }

      /* Connect candidate ring */
      for (var ci = 0; ci < nc; ci++) {
        if (nc > 1) EDGES.push([ne + ci, ne + (ci + 1) % nc, 0xF9A825]);
      }

      /* Connect standby nodes to the network for a dense GNN visualization */
      for (var si = 0; si < ns; si++) {
        if (ne > 0 && si % 4 === 0) {
          EDGES.push([si % ne, ne + nc + si, 0x1A2A4A]);
        } else if (nc > 0 && si % 3 === 0) {
          EDGES.push([ne + (si % nc), ne + nc + si, 0x1A2A4A]);
        }
      }

      if (elec.length >= 3) {
        var faces = [];
        for (var fi = 0; fi < elec.length - 2; fi++) {
          faces.push(fi, fi + 1, fi + 2);
        }
        makeFaceSurface(masterGroup, NN.slice(0, elec.length), faces, 0x00C853, 0.15);
      }

      // Add a central translucent volume sphere to represent GNN cluster volume
      var ghostGeo = new THREE.SphereGeometry(8, 16, 16);
      var ghostMat = new THREE.MeshBasicMaterial({ color: 0x00C853, transparent: true, opacity: 0.06, wireframe: true });
      var ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
      ghostMesh.position.set(0, 0, 0);
      masterGroup.add(ghostMesh);
    } else if (!_ded && !_deductionNodeSet) {
      /* ── MOCKUP: hardcoded healthcare SCM (induction/abduction only — NOT deduction mode) ── */
      addPhaseTitle(el, 'Phase 1: GNN Topology — Biomarker Correlation Network (SCM)', _darkBg);
      NN = [
        { id: 'HbA1c', val: '5.1%', status: 'Optimal', ctx: 'Glucose regulation', x: 0, y: 13, z: 0, r: 2.0, color: 0x00BCD4, crit: false },
        { id: 'eGFR', val: '98 mL', status: 'Optimal', ctx: 'Renal filtration', x: -10, y: 16, z: -8, r: 1.8, color: 0x00BCD4, crit: false },
        { id: 'PSA', val: '0.28 ng', status: 'Optimal', ctx: 'Prostate marker', x: 10, y: 11, z: -8, r: 1.6, color: 0x00BCD4, crit: false },
        { id: 'T-CHO', val: '240 mg', status: 'Elevated', ctx: 'Systemic lipid', x: 14, y: -2, z: 0, r: 1.6, color: 0xB8860B, crit: false },
        { id: 'LDL', val: '159 mg', status: 'CRITICAL', ctx: 'Plaque origin [DRIFT]', x: 9, y: -6, z: 16, r: 2.8, color: 0xD90429, crit: true },
        { id: 'TG', val: '188 mg', status: 'Elevated', ctx: 'Triglycerides', x: -7, y: 2, z: 14, r: 1.4, color: 0xB8860B, crit: false },
        { id: 'HDL', val: '42 mg', status: 'Low', ctx: 'Protective factor', x: -14, y: -1, z: 0, r: 1.6, color: 0x43A047, crit: false },
        { id: 'ApoB', val: '1.2 g/L', status: 'Elevated', ctx: 'Atherogenic particle', x: -7, y: 4, z: -14, r: 1.4, color: 0xB8860B, crit: false },
        { id: 'Lp(a)', val: '82 nmol', status: 'High', ctx: 'Oxidized LDL driver', x: 7, y: -4, z: -14, r: 1.5, color: 0xE65100, crit: false },
        { id: 'CRP', val: '4.2 mg', status: 'Elevated', ctx: 'Systemic inflammation', x: 0, y: -12, z: 0, r: 2.0, color: 0xF57F17, crit: true },
        { id: 'IL-6', val: '6.8 pg', status: 'Normal', ctx: 'Cytokine baseline', x: -10, y: -16, z: -8, r: 1.5, color: 0x43A047, crit: false },
        { id: 'ESR', val: '18 mm/hr', status: 'Normal', ctx: 'Inflammatory marker', x: 10, y: -14, z: -8, r: 1.5, color: 0x43A047, crit: false }
      ];
      EDGES = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 3], [9, 10], [10, 11], [11, 9], [0, 3], [0, 8], [1, 5], [1, 6], [2, 3], [2, 4], [4, 9], [6, 10], [8, 11]];
    }
    /* ── RENDER nodes (shared) ── */
    NN.forEach(function (n) {
      /* Deduction: use verdict intensity; induction: use crit flag */
      var emInt = _ded ? _verdictBaseIntensity(n.verdict) : (n.crit ? 0.28 : 0.08);
      var mat = new THREE.MeshStandardMaterial({ color: n.color, emissive: n.color, emissiveIntensity: emInt, metalness: 0.1, roughness: 0.5, transparent: true, opacity: liveMode && n.status === 'STANDBY' ? 0.72 : 1.0 });
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(n.r, 24, 24), mat);
      mesh.position.set(n.x, n.y, n.z); sceneGroup.add(mesh);
      if (n.r >= 1.2) { var lbl = makeNodeLabel(n.id, n.val, n.color); lbl.position.set(n.x + n.r * 1.5, n.y + n.r * 0.5, n.z); sceneGroup.add(lbl); }
      /* Deduction: attach cross-view ring + register in DCM */
      if ((_ded || (_deductionNodeSet && n.isAxiom)) && n.isAxiom) {
        mesh.userData.nodeId  = n.id;
        mesh.userData.crossMark = n.crossMark;
        mesh.userData.verdict = n.verdict;
        mesh.userData.formula = n.formula;
        mesh.userData.deduction = true;
        // _makeCrossRing(scene, n, n.r);
        _dcmRegister(n.id, mesh, 1);
      }
      items.push({ mesh: mesh, data: { id: n.id, val: n.val, status: n.status, ctx: n.ctx, crit: n.crit } });
    });
    EDGES.forEach(function (e) {
      if (!NN[e[0]] || !NN[e[1]]) return;
      var A = NN[e[0]], B = NN[e[1]];
      var edgeColor = Array.isArray(e) && e[2] ? e[2] : null;
      var intra = liveMode ? false : (e[0] < 3 && e[1] < 3) || (e[0] >= 3 && e[0] < 9 && e[1] >= 3 && e[1] < 9) || (e[0] >= 9 && e[1] >= 9);
      makeTubeEdge(sceneGroup, A, B, liveMode ? 0.14 : 0.16, edgeColor || (intra ? 0x0A192F : 0x006064), edgeColor === DC.CASCADE_EDGE ? 0.95 : 0.85);
    });
    if (!liveMode && !_deductionNodeSet) {
      /* Mockup-only: manifold surface + LDL drift ghost + standby sphere
         ONLY for legacy healthcare SCM mode — not deduction axiom mockup */
      makeFaceSurface(masterGroup, NN, [0, 1, 2, 3, 4, 5, 3, 5, 6, 3, 6, 7, 3, 7, 8, 9, 10, 11, 0, 1, 5, 0, 5, 6, 2, 3, 4, 4, 9, 11, 5, 9, 10], 0x3949AB, 0.28);
      var iLDL = { x: 7, y: 0, z: 14 };
      var gm = new THREE.Mesh(new THREE.SphereGeometry(2.8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xD90429, transparent: true, opacity: 0.18, wireframe: true }));
      gm.position.set(iLDL.x, iLDL.y, iLDL.z); sceneGroup.add(gm);
      if (NN[4]) makeTubeEdge(sceneGroup, iLDL, NN[4], 0.08, 0xD90429, 0.55);
      var SBYCOLS = [0x3949AB, 0x00695C, 0x0D47A1, 0x43A047, 0xE65100];
      for (var si = 0; si < 80; si++) {
        var sy = 1 - (si / 79) * 2, srr = Math.sqrt(Math.max(0, 1 - sy * sy)), sth = GOLDEN * si, srad = 22 + Math.random() * 10;
        var sc = SBYCOLS[si % SBYCOLS.length];
        var sm = new THREE.Mesh(new THREE.SphereGeometry(0.85 + Math.random() * 0.25, 10, 10), new THREE.MeshStandardMaterial({ color: sc, emissive: sc, emissiveIntensity: 0.05, transparent: true, opacity: 0.80 }));
        sm.position.set(Math.cos(sth) * srr * srad, sy * srad, Math.sin(sth) * srr * srad); sceneGroup.add(sm);
        items.push({ mesh: sm, data: { id: 'BM-' + si, val: '--', status: 'Standby', ctx: 'Telemetry context node', crit: false } });
      }
    }
    /* Deduction: cascade corridor surface through REFUSE chain */
    if ((_ded || _deductionNodeSet) && _corridorNodes && _corridorNodes.length >= 3) {
      var _cpts = _corridorNodes.slice(0, 6);
      var _cfaces = []; for (var _ci = 0; _ci < _cpts.length - 2; _ci++) _cfaces.push(_ci, _ci+1, _ci+2);
      makeFaceSurface(masterGroup, _cpts, _cfaces, DC.CASCADE_SURFACE, 0.20);
      /* Cascade arrows between consecutive REFUSE nodes */
      for (var _ci = 0; _ci < _cpts.length - 1; _ci++) makeCausalArrow(masterGroup, _cpts[_ci], _cpts[_ci+1], DC.CASCADE_EDGE, 0.88, false);
    }
    /* §6.4 grid floor + §6.1 mockup manifold */
    makeGridHelper(masterGroup, 0, 28);  /* add grid to masterGroup for rigid-body pan */
    /* Pass domain palette so manifold colour matches the active axiom set */
    var _dedPal = (_deductionNodeSet && _deductionNodeSet.palette) ? _deductionNodeSet.palette : null;
    var isRefuse = payload && (payload.tier === 3 || payload.verdict === 'REFUSE');
    var _manifoldObj = !liveMode ? buildMockupSurface(sceneGroup, 0, 0, 0, _dedPal, isRefuse) : null;
    var _axRef = {group:null};  /* declare BEFORE makeAxes so group is captured */
    _engines[cid].axesGroup = makeAxes(masterGroup, 40, { x: 0, y: 0, z: 0 });  /* add axes to masterGroup */
    _axRef.group = _engines[cid].axesGroup;  /* wire immediately after makeAxes returns */
    camera.position.set(22, 26, 48); camera.lookAt(0, 0, 0);
    var ctrl = makeControls(camera, renderer.domElement, { x: 0, y: 0, z: 0 }, true); // Always enable auto-rotate to show depth!
    _engines[cid].ctrl = ctrl;
    _attachEnhancedInteraction(renderer.domElement, camera, ctrl, scene, items, EDGES, function () { return payload; });
    _buildOverlayPanel(el, 1, liveMode, NN.length, EDGES.length, null, _axRef, _engines[cid]);
    var _pulseRings = [];
    if (liveMode) {
      NN.forEach(function (n) { if (n.crit) _makePulseRing(scene, n, C.red, _pulseRings); });
    } else {
      NN.forEach(function (n, i) { if (i < 3) _makePulseRing(scene, n, MC.anomaly, _pulseRings); });
    }
    
    function animate() {
      if (!_engines[cid] || _engines[cid].renderer !== renderer) return;
      requestAnimationFrame(animate);
      _pulseRings.forEach(function (r) {
        if (!r || !r.ring) return;
        r.ring.scale.addScalar(0.08);
        if (r.ring.material) r.ring.material.opacity -= 0.015;
        if (r.ring.material && r.ring.material.opacity <= 0) {
          r.ring.scale.setScalar(1);
          r.ring.material.opacity = 0.8;
        }
      });
      /* §7.1 amber shimmer */
      if (_hovMesh && _hovMesh.material && _hovMesh.material.emissive)
        _hovMesh.material.emissiveIntensity = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 180));
      renderer.render(scene, camera);
    } animate();
    
    var ro = new ResizeObserver(function () { var nw = el.clientWidth || 320, nh = Math.max(el.clientHeight, 220); camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh, false); });
    ro.observe(el); _engines[cid].ro = ro;
    var _perfEnd1 = performance.now();
    console.log('[HM3D_PERF] Phase 1 (GNN) generation time: ' + (_perfEnd1 - _perfStart1).toFixed(2) + 'ms');
  }
function initPhase2(cid, payload) {
    var _perfStart2 = performance.now();
    var el = $(cid); if (!el || !window.THREE) return;
    destroyEngine(cid);
    var w = el.clientWidth  || 320, h = Math.max(el.clientHeight, 220);
    var _isThumbnail = el.id && el.id.indexOf('ded-modal') === -1;
    var _bgColor2 = (payload && payload.bgColor != null) ? payload.bgColor : (window.location.pathname.includes('ontology_medical') ? 0x000000 : 0xFFFFFF);
    var renderer = makeRenderer(el, w, h, _bgColor2), scene = new THREE.Scene(), camera = makeCamera(w, h, _isThumbnail);
    scene.background = new THREE.Color(_bgColor2);
    var _darkBg2 = _bgColor2 === 0x000000 || _bgColor2 < 0x333333;
    var masterGroup = new THREE.Group(); masterGroup.name = 'MasterGroup'; scene.add(masterGroup);
    var sceneGroup = new THREE.Group(); masterGroup.add(sceneGroup);
    _engines[cid] = { renderer: renderer, ctrl: null, ro: null, rafId: null, sceneGroup: sceneGroup, masterGroup: masterGroup };
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    var dl = new THREE.DirectionalLight(0xfff4e0, 1.1); dl.position.set(20, 40, 20); scene.add(dl);
    
    var _ded2 = payload && payload._deduction;
    var liveMode = !_ded2 && !!(payload && payload.elected && payload.elected.length);
    var _setIdx = 0;
    if (payload && payload.domain) {
      var _domLookup = _DEDUCTION_AXIOM_SETS.findIndex(function(s) {
        return s.domain.toUpperCase() === payload.domain.toUpperCase();
      });
      if (_domLookup !== -1) _setIdx = _domLookup;
    }
    _setIdx = Math.max(0, Math.min(_setIdx, _DEDUCTION_AXIOM_SETS.length - 1));
    var _activeSet = _DEDUCTION_AXIOM_SETS[_setIdx];
    var _dedPal = (_ded2 && _ded2.palette) ? _ded2.palette : (_activeSet ? _activeSet.palette : null);
    var isRefuse = payload && (payload.tier === 3 || payload.verdict === 'REFUSE');
    var _manifoldObj = !liveMode ? buildMockupSurface(sceneGroup, 0, 0, 0, _dedPal, isRefuse) : null;
    
    addPhaseTitle(el, _ded2
      ? 'Phase 2 — World Model Deduction: ' + (_ded2.domain||'AXIOM') + ' axiom manifold vs measured deviation'
      : liveMode
        ? 'Phase 2: World Model — ' + ((payload && payload.domain) || 'Domain') + ' Axiom Manifold (Poiseuille / Fick)'
        : 'Phase 2: World Model — ' + (_DEDUCTION_AXIOM_SETS[Math.min(_deductionMockupDomainIdx, _DEDUCTION_AXIOM_SETS.length - 1)] || {label:'Axiom Constraint Manifold'}).label + ' · Constraint Manifold', _darkBg2);
    
    var _axRef = {group:null};
    _engines[cid].axesGroup = makeAxes(masterGroup, 45, { x: 0, y: 0, z: 0 });
    _axRef.group = _engines[cid].axesGroup;
    makeGridHelper(masterGroup, 0, 30);
    camera.position.set(24, 28, 62); camera.lookAt(0, 0, 0);
    
    // ── Build 3D Human Body Silhouette Wireframe Mannequin ──────────────────
    var bodyMaterial = new THREE.MeshBasicMaterial({
      color: 0x00c853,
      wireframe: true,
      transparent: true,
      opacity: 0.08
    });
    
    var headMesh = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 12), bodyMaterial);
    headMesh.position.set(0, 18.7, 0);
    masterGroup.add(headMesh);
    
    var torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(8, 6, 26, 12), bodyMaterial);
    torsoMesh.position.set(0, 4.0, 0);
    masterGroup.add(torsoMesh);
    
    var leftArm = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.0, 18, 8), bodyMaterial);
    leftArm.position.set(-11, 4.0, 0);
    leftArm.rotation.z = Math.PI * 0.15;
    masterGroup.add(leftArm);
    
    var rightArm = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.0, 18, 8), bodyMaterial);
    rightArm.position.set(11, 4.0, 0);
    rightArm.rotation.z = -Math.PI * 0.15;
    masterGroup.add(rightArm);
    
    var leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 1.5, 24, 8), bodyMaterial);
    leftLeg.position.set(-4.5, -18.0, 0);
    masterGroup.add(leftLeg);
    
    var rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 1.5, 24, 8), bodyMaterial);
    rightLeg.position.set(4.5, -18.0, 0);
    masterGroup.add(rightLeg);

    var items = [];
    
    // Resolve evaluations list
    var evals2 = [];
    var isMedical = window.location.pathname.includes('ontology_medical') || window.location.pathname.includes('audit_report') || (payload && payload.domain === 'HEALTHCARE');
    
    if (_ded2) {
      evals2 = _ded2.axiom_evaluations || [];
    } else if (isMedical) {
      evals2 = _getHealthcareAxiomsList();
    } else {
      var elec = payload && payload.elected || [];
      var cand = payload && payload.candidate || [];
      var stb  = payload && payload.standby || [];
      evals2 = [...elec, ...cand, ...stb].map(function(ax) {
        return { axiom_id: ax.id || ax.axiom_id, verdict: ax.status === 'COMPLIANT' || ax.verdict === 'ALLOW' ? 'ALLOW' : 'REFUSE', computed_value: ax.score, threshold: 1.0 };
      });
    }

    if (evals2.length === 0) {
      // Local helper to create a Minkowski Lightcone for other domains
      function makeLightcone(parent, x, y, z, height, radius, color, labelTitle, labelSubtitle, ctx) {
        var group = new THREE.Group();
        group.position.set(x, y, z);
        
        var coneGeom1 = new THREE.ConeGeometry(radius, height, 12, 1, true);
        coneGeom1.translate(0, height / 2, 0);
        var coneMat = new THREE.MeshStandardMaterial({
          color: color,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide
        });
        var futureCone = new THREE.Mesh(coneGeom1, coneMat);
        group.add(futureCone);
        
        var coneGeom2 = new THREE.ConeGeometry(radius, height, 12, 1, true);
        coneGeom2.rotateX(Math.PI);
        coneGeom2.translate(0, -height / 2, 0);
        var pastCone = new THREE.Mesh(coneGeom2, coneMat);
        group.add(pastCone);
        
        var originGeo = new THREE.SphereGeometry(0.7, 8, 8);
        var originMat = new THREE.MeshBasicMaterial({ color: color });
        var originMesh = new THREE.Mesh(originGeo, originMat);
        group.add(originMesh);
        
        parent.add(group);
        
        var lbl = makeNodeLabel(labelTitle, labelSubtitle, color);
        lbl.position.set(x, y + height + 1, z);
        parent.add(lbl);
        
        items.push({
          mesh: originMesh,
          data: {
            id: labelTitle,
            val: labelSubtitle,
            status: 'Event Matrix',
            ctx: ctx,
            crit: color === 0xE53935
          }
        });
      }
      makeLightcone(masterGroup, -15, 2, 0, 5, 2.5, 0xFFB74D, 'Event α: Endothelial Damage', 'T_bp=High, X_ldl=159', 'BP fluctuations create mechanical shear stress micro-wounds.');
      makeLightcone(masterGroup, 0, 0, 0, 5, 2.5, 0xFF7043, 'Event β: oxLDL Protein Misfolding', 'T_bp=High, X_ldl=159', 'Infiltration and misfolding of oxidized LDL particles at wound sites.');
      makeLightcone(masterGroup, 15, -2, 0, 5, 2.5, 0xE53935, 'Event γ: Lumen Stenosis', 'Flow_Res=+43%, Workload=High', 'Stenosis narrowing vessel radius, raising flow resistance.');
    } else {
      evals2.forEach(function (ev) {
        var axId = ev.axiom_id || ev.id;
        var verdict = ev.verdict || 'ALLOW';
        var crit = verdict === 'REFUSE';
        var color = crit ? C.red : C.green;
        var pos = _getOrganPosition(axId);
        
        var m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 20), new THREE.MeshStandardMaterial({
          color: color, emissive: color, emissiveIntensity: crit ? 0.28 : 0.08,
          metalness: 0.1, roughness: 0.5
        }));
        m.position.set(pos.x, pos.y, pos.z);
        sceneGroup.add(m);
        
        m.userData = {
          nodeId: axId,
          verdict: verdict,
          formula: ev.expression_latex || ev.formula || axId,
          crossMark: (axId || '').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase(),
          deduction: true
        };
        _dcmRegister(axId, m, 2);
        
        items.push({
          mesh: m,
          data: {
            id: axId,
            val: ev.computed_value != null ? ev.computed_value.toFixed(3) : (ev.computed != null ? ev.computed.toFixed(3) : '--'),
            status: verdict,
            ctx: ev.expression_latex || ev.formula || axId,
            crit: crit
          }
        });
      });
    }
    
    var ctrl = makeControls(camera, renderer.domElement, { x: 0, y: 0, z: 0 }, true);
    _engines[cid].ctrl = ctrl;
    
    _attachEnhancedInteraction(renderer.domElement, camera, ctrl, scene, items, [], function () { return payload; });
    _buildOverlayPanel(el, 2, liveMode, items.length, 0, null, _axRef, _engines[cid]);

    function animate() {
      if (!_engines[cid] || _engines[cid].renderer !== renderer) return;
      requestAnimationFrame(animate);
      try {
        var time = Date.now() * 0.001;
        if (_manifoldObj) _topoAnim(_manifoldObj, time);
        
        /* §7.1 amber shimmer */
        if (_hovMesh && _hovMesh.material && _hovMesh.material.emissive)
          _hovMesh.material.emissiveIntensity = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 180));
        renderer.render(scene, camera);
      } catch (err) { console.error('[HM3D][P2]', err); }
    } animate();
    var ro = new ResizeObserver(function () { var nw = el.clientWidth || 320, nh = Math.max(el.clientHeight, 220); camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh, false); });
    ro.observe(el); _engines[cid].ro = ro;
    var _perfEnd2 = performance.now();
    console.log('[HM3D_PERF] Phase 2 (WORLD) generation time: ' + (_perfEnd2 - _perfStart2).toFixed(2) + 'ms');
  }
  function initPhase3(cid, payload) {
    var _perfStart3 = performance.now();
    var el = $(cid); if (!el || !window.THREE) return;
    destroyEngine(cid);
    var w = el.clientWidth  || 320, h = Math.max(el.clientHeight, 220);
    var _isThumbnail = el.id && el.id.indexOf('ded-modal') === -1;
    var _bgColor3 = (payload && payload.bgColor != null) ? payload.bgColor : (window.location.pathname.includes('ontology_medical') ? 0x000000 : 0xFFFFFF);
    var renderer = makeRenderer(el, w, h, _bgColor3), scene = new THREE.Scene(), camera = makeCamera(w, h, _isThumbnail);
    scene.background = new THREE.Color(_bgColor3);
    var _darkBg3 = _bgColor3 === 0x000000 || _bgColor3 < 0x333333;
    var masterGroup = new THREE.Group(); masterGroup.name = 'MasterGroup'; scene.add(masterGroup);
    var sceneGroup = new THREE.Group(); masterGroup.add(sceneGroup);
    _engines[cid] = { renderer: renderer, ctrl: null, ro: null, rafId: null, sceneGroup: sceneGroup, masterGroup: masterGroup };
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    var dl = new THREE.DirectionalLight(0xfff4e0, 1.0); dl.position.set(10, 30, 20); scene.add(dl);
    
    var elec3 = (payload && payload.elected && payload.elected.length) ? payload.elected : null;
    var _ded3 = payload && payload._deduction;
    
    addPhaseTitle(el, (_ded3 || window.location.pathname.includes('ontology_medical') || window.location.pathname.includes('audit_report') || (payload && payload.domain === 'HEALTHCARE'))
      ? 'Phase 3 — Causal Pathways: Clinical Causal Corridors (36 axioms)'
      : 'Phase 3: Causal Pathway \u2014 ' + (_DEDUCTION_AXIOM_SETS[Math.min(_deductionMockupDomainIdx, _DEDUCTION_AXIOM_SETS.length - 1)] || {label:'Axiom Causal Corridor'}).label + ' \u00b7 do-calculus Corridor', _darkBg3);
    
    var items = [];
    var isMedical = window.location.pathname.includes('ontology_medical') || window.location.pathname.includes('audit_report') || (payload && payload.domain === 'HEALTHCARE');
    
    if (isMedical) {
      // Process all 36 clinical axioms as causal nodes
      var evalsList3 = _ded3 ? (_ded3.axiom_evaluations || []) : _getHealthcareAxiomsList();
      evalsList3.forEach(function(ev3, ii3) {
        var axId3 = ev3.axiom_id || ev3.id || ('AX-' + ii3);
        var pos = _getOrganPosition(axId3);
        var cc = _deductionNodeColor(ev3.verdict || 'ALLOW');
        
        var mat = new THREE.MeshStandardMaterial({
          color: cc,
          emissive: cc,
          emissiveIntensity: 0.25,
          metalness: 0.1,
          roughness: 0.5
        });
        var m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 12), mat);
        m.position.set(pos.x, pos.y, pos.z);
        masterGroup.add(m);
        
        m.userData = {
          nodeId: axId3,
          verdict: ev3.verdict || 'ALLOW',
          formula: ev3.expression_latex || ev3.formula || axId3,
          crossMark: axId3.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase(),
          deduction: true
        };
        // _makeCrossRing(masterGroup, pos, 1.4);
        _dcmRegister(axId3, m, 3);
        
        items.push({
          mesh: m,
          data: {
            id: axId3,
            val: ev3.computed_value != null ? ev3.computed_value.toFixed(3) : (ev3.computed != null ? ev3.computed.toFixed(3) : '--'),
            status: ev3.verdict || 'ALLOW',
            ctx: ev3.expression_latex || ev3.formula || axId3,
            crit: ev3.verdict === 'REFUSE'
          }
        });
      });
      // Draw directed causal pathway edges and missing context nodes
      var causalEdges = [
        ['HC_MS_001', 'HC_CAD_002'],
        ['HC_DM_001', 'HC_CAD_001'],
        ['HC_LIP_001', 'HC_CAD_001'],
        ['HC_HTN_001', 'HC_CAD_002'],
        ['HC_CAD_001', 'HC_STR_001'],
        ['HC_CAD_002', 'HC_STR_001'],
        ['HC_CAD_002', 'HC_CKD_001'],
        ['HC_HTN_002', 'HC_CKD_001'],
        ['HC_CKD_001', 'HC_CKD_002'],
        ['HC_CKD_001', 'HC_AN_001'],
        ['HC_CKD_003', 'HC_CKD_001']
      ];

      var evaluatedIds = {};
      evalsList3.forEach(function(ev3) {
        var id = ev3.axiom_id || ev3.id;
        if (id) evaluatedIds[id.toUpperCase()] = true;
      });

      var missingNodes = [];
      causalEdges.forEach(function(edge) {
        var nodeA = edge[0].toUpperCase();
        var nodeB = edge[1].toUpperCase();
        if (!evaluatedIds[nodeA] && !missingNodes.includes(nodeA)) missingNodes.push(nodeA);
        if (!evaluatedIds[nodeB] && !missingNodes.includes(nodeB)) missingNodes.push(nodeB);
      });

      missingNodes.forEach(function(nodeId) {
        var pos = _getOrganPosition(nodeId);
        var mat = new THREE.MeshStandardMaterial({
          color: 0x444444,
          transparent: true,
          opacity: 0.35,
          metalness: 0.1,
          roughness: 0.7
        });
        var m = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 10), mat);
        m.position.set(pos.x, pos.y, pos.z);
        masterGroup.add(m);

        m.userData = {
          nodeId: nodeId,
          verdict: 'STANDBY',
          formula: nodeId,
          crossMark: nodeId.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase(),
          deduction: true
        };
        _dcmRegister(nodeId, m, 3);

        items.push({
          mesh: m,
          data: {
            id: nodeId,
            val: '--',
            status: 'STANDBY',
            ctx: nodeId,
            crit: false
          }
        });
      });

      causalEdges.forEach(function(edge) {
        var posA = _getOrganPosition(edge[0]);
        var posB = _getOrganPosition(edge[1]);

        var isEdgeActive = evaluatedIds[edge[0].toUpperCase()] && evaluatedIds[edge[1].toUpperCase()];
        var edgeColor = isEdgeActive ? DC.CASCADE_EDGE : 0x443322;
        var edgeOpacity = isEdgeActive ? 0.85 : 0.25;
        var thickness = isEdgeActive ? 0.15 : 0.06;

        makeTubeEdge(masterGroup, posA, posB, thickness, edgeColor, edgeOpacity);
      });
    } else {
      // Fallback for other domains (Physics, CS, etc.)
      var CHAIN = [];
      if (_ded3) {
        var bo3 = _ded3.branch_output || {}, branch3 = (_ded3.branch || '').toUpperCase();
        if (branch3 === 'RCA' && bo3.root_cause_set && bo3.root_cause_set.length >= 2) {
          CHAIN = bo3.root_cause_set.slice(0, 6).map(function(rc, ri) {
            return {id:rc.field||('RC-'+ri),val:(rc.value||'--')+' '+(rc.unit||''),status:rc.severity||'ELEVATED',
              ctx:'Dev: '+(rc.composite_deviation_pct||0).toFixed(1)+'%  Axioms: '+(rc.axioms_failed||[]).join(','),
              x:-18+ri*7,y:Math.sin(ri*0.9)*4,z:ri*4,crit:(rc.severity==='CRITICAL'),cf:false};
          });
        } else if (branch3 === 'DRIFT' && bo3.drift_trajectory && bo3.drift_trajectory.length >= 2) {
          CHAIN = bo3.drift_trajectory.slice(0, 6).map(function(dt, ri) {
            return {id:dt.axiom_id||('DT-'+ri),val:dt.trend||'--',status:dt.risk||'MEDIUM',
              ctx:'Trend: '+dt.trend+' | Steps to critical: '+(dt.steps_to_critical||'?'),
              x:-18+ri*7,y:Math.sin(ri*0.9)*4,z:ri*4,crit:(dt.risk==='HIGH'||dt.risk==='CRITICAL'),cf:false};
          });
        }
        if (CHAIN.length < 2) {
          CHAIN = (_ded3.axiom_evaluations||[]).filter(function(e){return e.verdict==='REFUSE';}).slice(0,5).map(function(ev,ri){
            return {id:ev.axiom_id||('AX-'+ri),val:ev.computed_value!=null?ev.computed_value.toFixed(3):'--',
              status:'REFUSE',ctx:ev.expression_latex||ev.axiom_id,x:-18+ri*9,y:Math.sin(ri*0.9)*4,z:ri*3,crit:true,cf:false};
          });
        }
        if (CHAIN.length < 2) {
          CHAIN = (_ded3.axiom_evaluations||[]).slice(0,5).map(function(ev,ri){
            var isCrit = ev.verdict==='REFUSE';
            return {id:ev.axiom_id||('AX-'+ri),val:ev.computed_value!=null?ev.computed_value.toFixed(3):'--',
              status:ev.verdict,ctx:ev.expression_latex||ev.axiom_id,x:-18+ri*9,y:Math.sin(ri*0.9)*4,z:ri*3,crit:isCrit,cf:false};
          });
        }
      } else {
        CHAIN = elec3 && elec3.length >= 2 ? (function () {
          var arr = [];
          arr.push({ id: 'BP_FLUC', val: 'BP Dev: 142/95', status: 'BP DYNAMICS', ctx: 'BP fluctuations', x: -20, y: 4, z: 0, crit: true, cf: false });
          arr.push({ id: 'Wound', val: 'Micro-Tear', status: 'ENDOTHELIUM', ctx: 'Shear stress wounds', x: -10, y: 2, z: 4, crit: true, cf: false });
          var ax0 = elec3[0] || { id: 'oxLDL' };
          arr.push({ id: ax0.id || 'oxLDL', val: 'Elected oxLDL', status: 'LIPID RETENTION', ctx: 'oxLDL misfolding', x: 0, y: 0, z: 8, crit: true, cf: false });
          var ax1 = elec3[1] || { id: 'Stenosis' };
          arr.push({ id: ax1.id || 'Stenosis', val: 'Stenosis 45%', status: 'VASCULAR', ctx: 'narrowing vessel', x: 10, y: -2, z: 4, crit: true, cf: false });
          var ax2 = elec3[2] || { id: 'LV_Strain' };
          arr.push({ id: ax2.id || 'LV_Strain', val: 'Afterload strain', status: 'CARDIOPATHY', ctx: 'Afterload increase', x: 20, y: -4, z: 0, crit: true, cf: false });
          return arr;
        })() : [
          { id: 'BP_FLUC', val: 'BP Dev: 142/95', status: 'BP DYNAMICS', ctx: 'BP fluctuations', x: -20, y: 4, z: 0, crit: true, cf: false },
          { id: 'Wound', val: 'Micro-Tear', status: 'ENDOTHELIUM', ctx: 'Shear stress wounds', x: -10, y: 2, z: 4, crit: true, cf: false },
          { id: 'oxLDL', val: '159 mg/dL', status: 'LIPID RETENTION', ctx: 'oxLDL misfolding', x: 0, y: 0, z: 8, crit: true, cf: false },
          { id: 'Stenosis', val: 'Stenosis 45%', status: 'VASCULAR', ctx: 'narrowing vessel', x: 10, y: -2, z: 4, crit: true, cf: false },
          { id: 'LV_Strain', val: 'Afterload ↑', status: 'CARDIOPATHY', ctx: 'Afterload increase', x: 20, y: -4, z: 0, crit: true, cf: false }
        ];
      }
      while (CHAIN.length < 2) CHAIN.push({ id: 'Node-' + CHAIN.length, val: '--', status: 'Derived', ctx: 'Causal node', x: (CHAIN.length - 1) * 9 - 18, y: 0, z: (CHAIN.length - 1) * 3, crit: false, cf: false });
      var CHAIN_COLS = [0xB8860B, 0xE65100, 0xD90429, 0xB71C1C, 0x8B0000];
      CHAIN.forEach(function (c, i) {
        var isCF = c.cf;
        var cc = isCF ? 0x2A9D8F : CHAIN_COLS[Math.min(i, CHAIN_COLS.length - 1)];
        var mat = new THREE.MeshStandardMaterial({ color: cc, emissive: cc, emissiveIntensity: isCF ? 0.12 : 0.25, metalness: 0.1, roughness: 0.5, transparent: isCF, opacity: isCF ? 0.45 : 1.0 });
        var m = new THREE.Mesh(new THREE.SphereGeometry(i === 0 ? 2.4 : 1.8, 20, 20), mat);
        m.position.set(c.x, c.y, c.z); masterGroup.add(m);
        var lbl = makeNodeLabel(c.id, c.val, cc);
        lbl.position.set(c.x + 2.5, c.y + 2.5, c.z); masterGroup.add(lbl);
        m.userData = {
          nodeId: c.id,
          verdict: c.status,
          formula: '',
          crossMark: (c.id || '').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase(),
          deduction: true
        };
        if (_ded3 || elec3) {
          // _makeCrossRing(masterGroup, c, (i===0?2.4:1.8));
          _dcmRegister(c.id, m, 3);
        }
        items.push({ mesh: m, data: { id: c.id, val: c.val, status: c.status, ctx: c.ctx, crit: c.crit } });
      });
      for (var ci = 0; ci < CHAIN.length - 1; ci++) {
        var A = CHAIN[ci], B = CHAIN[ci + 1];
        var severed = (ci === 0);
        var isCFedge = B.cf;
        if (isCFedge) {
          var dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, segL = Math.sqrt(dx * dx + dy * dy + dz * dz);
          var segs = Math.floor(segL / 3); var dn2 = { x: dx / segL, y: dy / segL, z: dz / segL };
          for (var si = 0; si < segs; si += 2) {
            var s0 = { x: A.x + dn2.x * (si * 3 + 0.5), y: A.y + dn2.y * (si * 3 + 0.5), z: A.z + dn2.z * (si * 3 + 0.5) };
            var s1 = { x: A.x + dn2.x * (si * 3 + 2.0), y: A.y + dn2.y * (si * 3 + 2.0), z: A.z + dn2.z * (si * 3 + 2.0) };
            makeTubeEdge(masterGroup, s0, s1, 0.12, 0x2A9D8F, 0.5);
          }
        } else {
          makeCausalArrow(masterGroup, A, B, severed ? 0xD90429 : CHAIN_COLS[ci], 0.9, severed);
        }
      }
      if (CHAIN.length >= 3) makeFaceSurface(masterGroup, CHAIN.slice(0, 3), [0, 1, 2], 0xE65100, 0.18);
      var BG_NODES = ['Foam Cell', 'Macrophage', 'Ox-LDL', 'VCAM-1', 'MCP-1', 'IL-1\u03b2', 'TNF-\u03b1', 'MMP', 'Collagen\u2193', 'Calcium', 'PDGF', 'VEGF', 'Thrombin', 'Fibrin', 'Platelet'];
      var BGCOLS = [0x7B1FA2, 0x0288D1, 0x00695C, 0x1565C0, 0x6A1B9A];
      for (var bi = 0; bi < 40; bi++) {
        var t = bi / 39, bx = CHAIN[0].x + (CHAIN[CHAIN.length - 1].x - CHAIN[0].x) * t + (Math.random() - 0.5) * 14;
        var by = (Math.random() - 0.5) * 12, bz = CHAIN[0].z + (CHAIN[CHAIN.length - 1].z - CHAIN[0].z) * t + (Math.random() - 0.5) * 8;
        var bc = BGCOLS[bi % BGCOLS.length];
        var bm = new THREE.Mesh(new THREE.SphereGeometry(0.85 + Math.random() * 0.2, 10, 10), new THREE.MeshStandardMaterial({ color: bc, emissive: bc, emissiveIntensity: 0.06, transparent: true, opacity: 0.75 }));
        bm.position.set(bx, by, bz); masterGroup.add(bm);
        items.push({ mesh: bm, data: { id: BG_NODES[bi % BG_NODES.length], val: '--', status: 'Context', ctx: 'Causal corridor participant', crit: false } });
      }
    }
    
    var _axRef = {group:null};
    _engines[cid].axesGroup = makeAxes(masterGroup, 38, { x: 0, y: 0, z: 0 });
    _axRef.group = _engines[cid].axesGroup;
    makeGridHelper(masterGroup, 0, 25);
    camera.position.set(20, 22, 48); camera.lookAt(2, 0, 9);
    var ctrl = makeControls(camera, renderer.domElement, { x: 2, y: 0, z: 9 }, true);
    _engines[cid].ctrl = ctrl;
    _attachEnhancedInteraction(renderer.domElement, camera, ctrl, scene, items, [], function () { return payload; });
    _buildOverlayPanel(el, 3, !!elec3, items.length, isMedical ? 11 : CHAIN.length - 1, null, _axRef, _engines[cid]);
    
    function animate() {
      try {
        if (navigator.webdriver) {
          renderer.render(scene, camera);
          return;
        }
        _engines[cid].rafId = requestAnimationFrame(animate);
        if (ctrl) ctrl.update();
        if (_hovMesh && _hovMesh.material && _hovMesh.material.emissive)
          _hovMesh.material.emissiveIntensity = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 180));
        renderer.render(scene, camera);
      } catch (err) { console.error('[HM3D][P3]', err); }
    } animate();
    
    var ro = new ResizeObserver(function () { var nw = el.clientWidth || 320, nh = Math.max(el.clientHeight, 220); camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh, false); });
    ro.observe(el); _engines[cid].ro = ro;
    var _perfEnd3 = performance.now();
    console.log('[HM3D_PERF] Phase 3 (CAUSAL) generation time: ' + (_perfEnd3 - _perfStart3).toFixed(2) + 'ms');
  }

  /* ── Domain tab strip for deduction mockup modal banner ─────────────────────
     Injects 3 tab buttons above the 3D canvas so sovereign users can switch
     between axiom-set demos. Clicking re-renders Phase 1 with the selected set.
     [DFT][HM3D_DOMAIN_TABS]                                                    */
  function _injectDomainTabs(el, cid) {
    /* Domain tabs are ONLY injected inside the fullscreen modal canvas
       (id prefix 'ded-modal'). Thumbnails in the page must stay clean. */
    if (!cid || cid.indexOf('ded-modal') === -1) return;
    var existing = el.querySelector('.ded-domain-tabs');
    if (existing) existing.parentNode.removeChild(existing);
    var strip = document.createElement('div');
    strip.className = 'ded-domain-tabs';
    strip.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px 10px;position:absolute;top:0;left:0;right:0;height:36px;z-index:21;pointer-events:all;background:rgba(8,8,8,0.88);border-bottom:1px solid rgba(212,175,55,0.22);box-sizing:border-box;';
    _DEDUCTION_AXIOM_SETS.forEach(function(s, idx) {
      var btn = document.createElement('span');
      btn.textContent = s.label;
      btn.className = 'ded-domain-tab' + (idx === _deductionMockupDomainIdx ? ' active' : '');
      btn.style.cssText = 'display:inline-block;font-family:Calibri,\'微軟正黑體\',sans-serif;font-size:11px;padding:3px 10px;border-radius:14px;border:1px solid '
        + (idx === _deductionMockupDomainIdx ? '#D4AF37' : '#333') + ';background:'
        + (idx === _deductionMockupDomainIdx ? '#1a1000' : '#111') + ';color:'
        + (idx === _deductionMockupDomainIdx ? '#D4AF37' : '#888') + ';cursor:pointer;transition:all .2s;';
      btn.onclick = function() { _deductionMockupDomainIdx = idx; HealthcareMedical3D.init('phase1', cid, null); };
      strip.appendChild(btn);
    });
    el.style.position = 'relative';
    el.insertBefore(strip, el.firstChild);
  }

  /* ══ AXIOM REPO MODAL ═══════════════════════════════════════════════════════
     Global full-screen modal that displays all axioms in _DEDUCTION_AXIOM_SETS
     grouped by domain. User can read the formula/description of each axiom and
     manually select which ones to apply. Fires 'axiomSelected' custom event.
     [DFT][HM3D_AXIOM_REPO_MODAL]                                               */
  var _axiomModalEl = null;
  function _openAxiomRepoModal(domainFilter) {
    /* Tear down previous instance */
    if (_axiomModalEl && _axiomModalEl.parentNode) _axiomModalEl.parentNode.removeChild(_axiomModalEl);
    var overlay = document.createElement('div');
    overlay.id = 'sov-axiom-repo-modal';
    _axiomModalEl = overlay;
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', zIndex:'999999',
      background:'rgba(4,10,26,0.88)',
      backdropFilter:'blur(14px)', webkitBackdropFilter:'blur(14px)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start',
      overflowY:'auto', fontFamily:'Calibri,\'\u5fae\u8edf\u6b63\u9ed1\u9ad4\',Arial,sans-serif'
    });
    /* ── Header ── */
    var hdr = document.createElement('div');
    Object.assign(hdr.style, {
      width:'100%', maxWidth:'1080px', display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'22px 24px 10px', boxSizing:'border-box', position:'sticky', top:'0',
      background:'rgba(4,10,26,0.96)', zIndex:'2', borderBottom:'1px solid rgba(212,175,55,0.22)'
    });
    var title = document.createElement('div');
    title.textContent = '\u516c\u7406\u8cc7\u6599\u5eab  \u2014  Axiom Repository';
    Object.assign(title.style, {fontSize:'18pt', fontWeight:'bold', color:'#D4AF37', letterSpacing:'0.03em'});
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7  Close';
    Object.assign(closeBtn.style, {
      background:'transparent', border:'1px solid rgba(255,191,0,0.5)', borderRadius:'6px',
      color:'#FFBF00', fontSize:'12pt', padding:'4px 16px', cursor:'pointer'
    });
    closeBtn.onclick = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    hdr.appendChild(title); hdr.appendChild(closeBtn); overlay.appendChild(hdr);
    /* ── Domain filter tabs ── */
    var tabBar = document.createElement('div');
    Object.assign(tabBar.style, {
      width:'100%', maxWidth:'1080px', display:'flex', gap:'8px', padding:'12px 24px',
      boxSizing:'border-box', flexWrap:'wrap'
    });
    var _allSets = _DEDUCTION_AXIOM_SETS.slice();
    var _activeIdx = typeof domainFilter === 'number' ? domainFilter : -1; /* -1 = All */
    function _renderCards(filterIdx) {
      cardArea.innerHTML = '';
      _allSets.forEach(function (ds, di) {
        if (filterIdx >= 0 && di !== filterIdx) return;
        /* Domain header */
        var dh = document.createElement('div');
        Object.assign(dh.style, {
          width:'100%', fontSize:'13pt', fontWeight:'bold', color:'#FFBF00',
          borderBottom:'1px solid rgba(255,191,0,0.25)', margin:'10px 0 6px', paddingBottom:'4px'
        });
        dh.textContent = ds.label || ('Domain ' + di);
        cardArea.appendChild(dh);
        /* Grid of axiom cards */
        var grid = document.createElement('div');
        Object.assign(grid.style, { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:'14px', marginBottom:'20px' });
        (ds.axioms || []).forEach(function (ax, ai) {
          var card = document.createElement('div');
          Object.assign(card.style, {
            background:'rgba(8,18,42,0.80)', border:'1px solid rgba(212,175,55,0.28)',
            borderRadius:'10px', padding:'14px 16px', position:'relative', cursor:'pointer',
            transition:'border-color 0.18s, box-shadow 0.18s'
          });
          var chk = document.createElement('input');
          chk.type = 'checkbox'; chk.id = 'ax-chk-' + di + '-' + ai;
          Object.assign(chk.style, { position:'absolute', top:'12px', right:'12px', width:'16px', height:'16px', accentColor:'#D4AF37', cursor:'pointer' });
          /* Axiom ID */
          var axId = document.createElement('div');
          Object.assign(axId.style, { fontSize:'10pt', color:'#D4AF37', fontWeight:'bold', marginBottom:'4px' });
          axId.textContent = ax.id || ('AX-' + di + '-' + ai);
          /* Axiom label */
          var axLabel = document.createElement('div');
          Object.assign(axLabel.style, { fontSize:'12pt', color:'#E8EAF0', fontWeight:'bold', marginBottom:'6px' });
          axLabel.textContent = ax.label || ax.id || '—';
          /* Formula / description */
          var axDesc = document.createElement('div');
          Object.assign(axDesc.style, { fontSize:'9.5pt', color:'#A8B8CF', lineHeight:'1.55', whiteSpace:'pre-wrap' });
          axDesc.textContent = (ax.formula ? (ax.formula + '\n') : '') + (ax.description || '');
          /* Hover highlight */
          card.onmouseenter = function () { card.style.borderColor = '#D4AF37'; card.style.boxShadow = '0 0 14px rgba(212,175,55,0.28)'; };
          card.onmouseleave = function () { card.style.borderColor = 'rgba(212,175,55,0.28)'; card.style.boxShadow = 'none'; };
          card.onclick = function (ev) { if (ev.target === chk) return; chk.checked = !chk.checked; };
          card.appendChild(chk); card.appendChild(axId); card.appendChild(axLabel); card.appendChild(axDesc);
          grid.appendChild(card);
        });
        cardArea.appendChild(grid);
      });
    }
    /* All tab */
    function _makeTab(label, idx) {
      var t = document.createElement('button');
      t.textContent = label;
      Object.assign(t.style, {
        background: idx === _activeIdx ? 'rgba(212,175,55,0.18)' : 'transparent',
        border: '1px solid ' + (idx === _activeIdx ? '#D4AF37' : 'rgba(255,255,255,0.18)'),
        borderRadius: '20px', color: idx === _activeIdx ? '#D4AF37' : '#aaa',
        padding: '4px 14px', cursor: 'pointer', fontSize: '10.5pt', transition: 'all 0.15s'
      });
      t.onclick = function () { _activeIdx = idx; tabBar.querySelectorAll('button').forEach(function(b,i){var a=(i-1)===idx||idx===-1&&i===0;b.style.borderColor=a?'#D4AF37':'rgba(255,255,255,0.18)';b.style.color=a?'#D4AF37':'#aaa';b.style.background=a?'rgba(212,175,55,0.18)':'transparent';}); _renderCards(idx); };
      return t;
    }
    tabBar.appendChild(_makeTab('All', -1));
    _allSets.forEach(function (ds, di) { tabBar.appendChild(_makeTab(ds.label || ('Domain ' + di), di)); });
    overlay.appendChild(tabBar);
    /* ── Card area ── */
    var cardArea = document.createElement('div');
    Object.assign(cardArea.style, { width:'100%', maxWidth:'1080px', padding:'0 24px 24px', boxSizing:'border-box' });
    overlay.appendChild(cardArea);
    _renderCards(_activeIdx);
    /* ── Footer: Apply Selected ── */
    var footer = document.createElement('div');
    Object.assign(footer.style, {
      position:'sticky', bottom:'0', width:'100%', maxWidth:'1080px',
      background:'rgba(4,10,26,0.96)', borderTop:'1px solid rgba(212,175,55,0.22)',
      padding:'12px 24px', boxSizing:'border-box', display:'flex', justifyContent:'flex-end', gap:'12px'
    });
    var applyBtn = document.createElement('button');
    applyBtn.textContent = '\u2713  Apply Selected Axioms';
    Object.assign(applyBtn.style, {
      background:'linear-gradient(135deg,#8B6914,#D4AF37)', border:'none', borderRadius:'8px',
      color:'#0a0a0a', fontSize:'12pt', fontWeight:'bold', padding:'8px 28px', cursor:'pointer',
      boxShadow:'0 0 14px rgba(212,175,55,0.40)'
    });
    applyBtn.onclick = function () {
      /* Collect selected axioms across all domains */
      var selected = [];
      _allSets.forEach(function (ds, di) {
        (ds.axioms || []).forEach(function (ax, ai) {
          var chk = overlay.querySelector('#ax-chk-' + di + '-' + ai);
          if (chk && chk.checked) selected.push({ domain: ds.label, axiom: ax });
        });
      });
      /* Fire custom event so the host page can consume the selection */
      document.dispatchEvent(new CustomEvent('axiomSelected', { detail: { selected: selected } }));
      /* Close modal */
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    footer.appendChild(applyBtn); overlay.appendChild(footer);
    /* Close on overlay background click */
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) overlay.parentNode && overlay.parentNode.removeChild(overlay); });
    /* Keyboard: Escape */
    var _escHandler = function (ev) { if (ev.key === 'Escape') { overlay.parentNode && overlay.parentNode.removeChild(overlay); document.removeEventListener('keydown', _escHandler); document.body.classList.remove('axiom-repo-open'); } };
    document.addEventListener('keydown', _escHandler);
    /* §AXIOM-SCROLL-FIX: toggle body class so scrollbar suppression CSS fires */
    document.body.classList.add('axiom-repo-open');
    overlay.addEventListener('remove', function() { document.body.classList.remove('axiom-repo-open'); });
    /* MutationObserver to detect when overlay is removed from DOM */
    (function() {
      var _obs = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          m.removedNodes.forEach(function(n) {
            if (n === overlay) { document.body.classList.remove('axiom-repo-open'); _obs.disconnect(); }
          });
        });
      });
      _obs.observe(document.body, { childList: true });
    }());
    document.body.appendChild(overlay);
  }

  function _getEngine(cid) { return _engines[cid] || null; }

  var HealthcareMedical3D = {
    init: function (phase, cid, payload) {
      /* Guard: defer until THREE is available; do NOT queue multiple retries for
         the same cid by tracking a pending flag — prevents double-init races. */
      if (!window.THREE) {
        var _k = '_hm3d_pending_' + cid;
        if (G[_k]) return;  /* already waiting */
        G[_k] = true;
        setTimeout(function () {
          delete G[_k];
          HealthcareMedical3D.init(phase, cid, payload);
        }, 300);
        return;
      }
      try {
        /* destroyEngine() is also called inside each initPhaseN, but calling it
           here first guarantees cleanup even if the phase function throws early. */
        destroyEngine(cid);
        if (phase === 'phase1') initPhase1(cid, payload);
        else if (phase === 'phase2') initPhase2(cid, payload);
        else if (phase === 'phase3') initPhase3(cid, payload);
      } catch (e) { console.error('[HM3D] E003:', e); }
    },
    destroy: function (cid) { destroyEngine(cid); },
    initAll: function () { this.init('phase1', 'zone4-gnn', null); this.init('phase2', 'wm-visual', null); this.init('phase3', 'cm-visual', null); },
    /* ── initDeduction: entry point for deduction mode rendering ─────────────
       Accepts a sealed L5 audit_packet, resets the cross-view map, adapts the
       packet into the payload schema, and renders all 3 phases simultaneously.
       [DFT][HM3D_INIT_DEDUCTION]                                               */
    /* Public alias so the modal controller can adapt packets */
    _adaptAuditPacketPublic: function(pkt) { return _adaptAuditPacket(pkt); },
    /* Expose axiom sets for XAI narrative panel */
    _getAxiomSets: function() { return _DEDUCTION_AXIOM_SETS; },
    _getEngine:    _getEngine,
    /* ── Axiom Repo Modal public entry point ─────────────────────────────────
       Opens the full-screen axiom repository modal.
       @param {number} [domainFilter]  Optional 0-based index to pre-filter to a domain.
       [DFT][HM3D_OPEN_AXIOM_MODAL] */
    openAxiomRepoModal: function (domainFilter) { _openAxiomRepoModal(domainFilter); },
    /* init a SINGLE modal canvas in deduction mockup mode.
       Passing null payload triggers the !liveMode branch in initPhase1/2/3
       which reads _deductionMockupDomainIdx to pick the active axiom set.
       [DFT][HM3D_MODAL_PHASE] */
    initModalPhase: function(phase, cid, domainIdx) {
      if (typeof domainIdx === 'number') {
        _deductionMockupDomainIdx = domainIdx;
      }
      /* null payload → _ded=false, liveMode=false → mockup branch fires */
      this.init(phase, cid, null);
      /* inject domain tab strip ONLY inside modal canvas containers */
      var el = document.getElementById(cid);
      if (el) _injectDomainTabs(el, cid);
    },
    initDeduction: function (auditPacket) {
      _dcmReset();
      var payload = _adaptAuditPacket(auditPacket);
      /* Auto-discover container IDs — OP-03 uses zone2/3/4, others may differ */
      var _gnnId  = document.getElementById('zone2-gnn-visual') ? 'zone2-gnn-visual'
                  : document.getElementById('zone4-gnn')        ? 'zone4-gnn' : null;
      var _wmId   = document.getElementById('zone3-wm-visual')  ? 'zone3-wm-visual'
                  : document.getElementById('wm-visual')         ? 'wm-visual' : null;
      var _cmId   = document.getElementById('zone4-cm-visual')  ? 'zone4-cm-visual'
                  : document.getElementById('cm-visual')         ? 'cm-visual' : null;
      /* Inject domain tabs only in mockup (no auditPacket) */
      if (!auditPacket && _gnnId) {
        var _gnnEl = document.getElementById(_gnnId);
        if (_gnnEl) _injectDomainTabs(_gnnEl, _gnnId);
      }
      if (_gnnId) this.init('phase1', _gnnId, payload);
      if (_wmId)  this.init('phase2', _wmId,  payload);
      if (_cmId)  this.init('phase3', _cmId,  payload);
      console.log('[DFT][HM3D_INIT_DEDUCTION] verdict=%s branch=%s nodes=%d',
        auditPacket && auditPacket.overall_verdict,
        auditPacket && auditPacket.branch,
        auditPacket && (auditPacket.axiom_evaluations||[]).length);
    }
  };
  G.HealthcareMedical3D = HealthcareMedical3D;
})(window);
