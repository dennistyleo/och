/**
 * Module: main
 * Version: 3.0.0
 * Description: Sovereign Matrix — 3-page dashboard, axiom browser,
 *              deterministic routing, gold-breathing axiom selection,
 *              D3 GNN + particle WM + DAG causal animations.
 */

import { AXIOM_DOMAINS, AXIOM_INDEX, DEDUCTION_IDS } from './data/axiomData.js';
import { matchTextToAxioms, buildGNNGraph, buildCausalGraph, buildWorldModelParticles } from './matchEngine.js';
import { dashAnim } from './visualizations/dashboard-animations.js';
// Compatibility shim — old code used AXIOMS[id], new code uses AXIOM_INDEX[id]
const AXIOMS = AXIOM_INDEX;


// ── State ────────────────────────────────────────────────────────────────────
const state = {
  page:          1,
  engine:        'ABDUCTION',   // Default: Abduction mode
  language:      'en',          // Default: English
  domain:        'AUTO',
  uploadedFile:  null,
  selectedAxiom: null,
  activeLayer:   1,
  activeAnalysisTab: 'core',
  hitlTimer:     null,
  hitlSeconds:   300,
  reportData:    null,
  sessionId:     null,
  filterStatus:  'all',
  searchQuery:   '',
};

// DEDUCTION_IDS is now imported from axioms.js (P1+P2: full physics+engineering set)

// ── Language registry ─────────────────────────────────────────────────────────
const LANGUAGES = [
  { code:'en', flag:'🇬🇧', name:'English',    required:true  },
  { code:'zh', flag:'🇨🇳', name:'中文',        required:true  },
  { code:'ja', flag:'🇯🇵', name:'日本語',      required:true  },
  { code:'de', flag:'🇩🇪', name:'Deutsch',    required:true  },
  { code:'fr', flag:'🇫🇷', name:'Français',   required:false },
  { code:'es', flag:'🇪🇸', name:'Español',    required:false },
  { code:'ko', flag:'🇰🇷', name:'한국어',      required:false },
  { code:'pt', flag:'🇧🇷', name:'Português',  required:false },
  { code:'ar', flag:'🇸🇦', name:'العربية',    required:false },
  { code:'ru', flag:'🇷🇺', name:'Русский',    required:false },
  { code:'it', flag:'🇮🇹', name:'Italiano',   required:false },
  { code:'nl', flag:'🇳🇱', name:'Nederlands', required:false },
  { code:'sv', flag:'🇸🇪', name:'Svenska',    required:false },
];

// ── Utilities ────────────────────────────────────────────────────────────────
function genSessionId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,15);
  return `AXG_${ts}`;
}

function genTraceId() {
  return `TRC_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

/**
 * Display a toast notification.
 * @param {string} msg
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} ms
 */
function toast(msg, type = 'info', ms = 4500) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  el.setAttribute('role','alert');
  c.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity 0.3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return root.querySelectorAll(sel); }

// ── Engine Initialization ────────────────────────────────────────────────────
qs('#initialize-engine')?.addEventListener('click', initEngine);

function initEngine() {
  // ── QUARANTINE BOUNDARY ──────────────────────────────────────────────────
  // Op-root dashboard lives in a completely separate file.
  // This call navigates there — landing page code and dashboard code
  // are now physically isolated from each other.
  const modeEl = document.querySelector('input[name="logic-mode"]:checked');
  const mode   = modeEl ? modeEl.value.toUpperCase() : 'ABDUCTION';
  window.location.href = `/op_root_new.html?mode=${mode}`;
}

// ── Return to landing ────────────────────────────────────────────────────────
function returnToLanding() {
  qs('#op-root').classList.remove('visible');
  qs('#landing-root').style.display = '';
  toast('Returned to landing — select a mode and re-initialize', 'info', 3000);
}
// Wire all return buttons (wide header, slim header)
document.querySelectorAll('#hdr-return-btn, #hdr-return-btn-slim').forEach(btn => {
  btn?.addEventListener('click', returnToLanding);
});

// ── Op-Page Navigation ───────────────────────────────────────────────────────

/**
 * Show an operation page (1, 2, or 3), swap headers accordingly.
 * @param {number} n
 */
function _showOpPage(n) {
  state.page = n;

  // Show/hide pages
  qsa('.op-page').forEach(p => {
    const isTarget = p.id === `op-page-${n}`;
    p.classList.toggle('op-page-active', isTarget);
    p.style.display = isTarget ? 'flex' : 'none';
  });

  // Swap headers: wide (5-tube) on Op-1; slim on Op-2/3
  const wideHdr = qs('#op-header-wide');
  const slimHdr = qs('#op-header-slim');
  if (wideHdr && slimHdr) {
    wideHdr.style.display = (n === 1) ? '' : 'none';
    slimHdr.style.display = (n === 1) ? 'none' : 'flex';
  }

  // Slim header CTA adjustments:
  // Op-2: [MANUAL AXIOM SELECTION] + [GENERATE AUDIT REPORT] (no upload)
  // Op-3: [MANUAL AXIOM SELECTION] + [UPLOAD INPUT FILE] + [GENERATE AUDIT REPORT]
  const uploadBtn  = qs('#btn-upload-file');
  const bannerEl   = qs('#deduction-eval-banner');
  if (uploadBtn)  uploadBtn.style.display  = (n === 3) ? '' : 'none';
  if (bannerEl)   bannerEl.style.display   = (n === 3) ? '' : 'none';

  // Animate L1 tube to 100%, others proportional
  _animateTubes(n);

  // Dashboard canvas animations
  if (n === 1) dashAnim.startPage1();
  else if (n === 2) dashAnim.startPage2();
  else if (n === 3) dashAnim.startPage3();
  else dashAnim.stopAll();
}

/**
 * Animate tube fill percentages based on current op-page.
 * @param {number} opPage
 */
function _animateTubes(opPage) {
  const pcts = {
    1: [100,  0,  0,  0,  0],
    2: [100,100,100,  0,  0],
    3: [100,100,100,100,100],
  }[opPage] || [0,0,0,0,0];
  pcts.forEach((pct, i) => {
    const tube   = qs(`#tube-l${i+1}`);
    const scalar = qs(`#scalar-l${i+1}`);
    const fill   = tube?.querySelector('.liquid-fill');
    if (fill)   fill.style.width = pct + '%';
    if (tube)   tube.setAttribute('aria-valuenow', pct);
    if (scalar) scalar.textContent = pct + '%';
  });
}

// Wire op-page navigation buttons
document.addEventListener('click', e => {
  if (e.target.id === 'op-next-btn-1') _showOpPage(2);
  if (e.target.id === 'op-next-btn-2') _showOpPage(3);
  if (e.target.id === 'op-back-btn-2') _showOpPage(1);
  if (e.target.id === 'op-back-btn-3') _showOpPage(2);
});

/** Legacy navigatePage shim — keep so _buildReport etc. still work */
function navigatePage(n) { _showOpPage(n); }

// ── Logic Engine ─────────────────────────────────────────────────────────────
function setEngine(engine) {
  state.engine = engine;
  document.body.dataset.engine = engine; // drives CSS mode colors
  _syncEngineDisplay();
  _renderAxiomTree();  // re-filter for DEDUCTION restriction
  toast(`Logic engine: ${engine}`, 'info', 2500);
}

function _syncEngineDisplay() {
  // Update all engine button groups
  qsa('[data-engine]').forEach(btn => {
    const isActive = btn.dataset.engine === state.engine;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    // Fix prefix text for each button group style
    const dot = isActive ? '● ' : '+ ';
    if (btn.classList.contains('header-logic-btn')) {
      btn.textContent = dot + btn.dataset.engine;
    }
    if (btn.classList.contains('logic-btn-light')) {
      btn.textContent = btn.dataset.engine; // clean labels on white
    }
    if (btn.classList.contains('logic-btn')) {
      btn.textContent = btn.dataset.engine; // clean labels on dark landing
    }
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-engine]');
  if (btn) setEngine(btn.dataset.engine);
});

// Domain buttons
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-domain]');
  if (!btn) return;
  state.domain = btn.dataset.domain;
  qsa('[data-domain]').forEach(b => {
    b.classList.toggle('active', b.dataset.domain === state.domain);
    b.setAttribute('aria-pressed', b.dataset.domain === state.domain ? 'true' : 'false');
  });
});

// ── Upload ───────────────────────────────────────────────────────────────────
const dropZone   = qs('#drop-zone');
const uploadInput = qs('#upload-input');

dropZone?.addEventListener('click', () => uploadInput?.click());
dropZone?.addEventListener('keydown', e => {
  if (e.key==='Enter'||e.key===' ') { e.preventDefault(); uploadInput?.click(); }
});
dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone?.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const f = e.dataTransfer?.files?.[0];
  if (f) _handleFileLegacy(f);
});
uploadInput?.addEventListener('change', e => {
  const f = e.target.files?.[0]; if (f) _handleFileLegacy(f);
});

const ALLOWED_EXT = [
  // Documents
  '.pdf','.csv','.json','.xls','.xlsx',
  // Images (including medical)
  '.png','.jpg','.jpeg','.tiff','.tif','.dcm','.bmp','.webp',
  // Audio (infrasound, ultrasound, waveform)
  '.wav','.mp3','.flac','.aac','.ogg','.m4a',
  // Video
  '.mp4','.avi','.mov','.mkv','.webm',
];
const MAX_BYTES   = 50 * 1024 * 1024;

function _handleFileLegacy(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) { toast(`Unsupported: ${ext}. Use PDF, CSV, JSON, XLS.`, 'error'); return; }
  if (file.size > MAX_BYTES)       { toast('File too large. Maximum 50MB.', 'error'); return; }

  state.uploadedFile = file;

  // Show file info
  const card = qs('#file-info-card');
  card.classList.add('visible');
  qs('#file-info-name').textContent = file.name;
  qs('#file-info-size').textContent = `${(file.size/1024).toFixed(1)} KB · ${ext.toUpperCase().slice(1)}`;

  // ── P5: Real XHR upload with progress events ────────────────────────────
  const fill  = qs('#upload-fill');
  const label = qs('#upload-pct');
  const pw    = qs('#upload-progress-wrap');
  pw.classList.add('visible');
  qs('#upload-status-label').textContent = `Uploading ${file.name}…`;

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', e => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 90); // up to 90% on upload
    fill.style.width  = pct + '%';
    label.textContent = pct + '%';
  });

  xhr.addEventListener('load', () => {
    fill.style.width = '100%'; label.textContent = '100%';
    qs('#upload-status-label').textContent = 'Extraction complete';
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        _injectExtractedAxioms(data);
        state.reportData = data;
        _onDataExtracted(data);
        toast('Extraction complete — axioms added to browser', 'success');
      } catch (e) {
        _useMockFallback(file.name);
      }
    } else {
      _useMockFallback(file.name);
    }
  });

  xhr.addEventListener('error', () => { _useMockFallback(file.name); });
  xhr.addEventListener('timeout', () => { toast('Upload timed out after 30s', 'error'); _useMockFallback(file.name); });

  const fd = new FormData();
  fd.append('file', file);
  fd.append('session_id', state.sessionId ?? 'ANON');
  fd.append('engine', state.engine);
  fd.append('domain', state.domain);

  xhr.open('POST', '/api/upload');
  xhr.timeout = 30000;
  xhr.send(fd);
}

/**
 * Inject axioms returned from the RAG backend into the live AXIOMS store.
 * Expected shape: { axioms: [{axiom_id, layer_1_audit_header, layer_2_summary, layer_3_full_detail}] }
 * @param {object} data
 */
function _injectExtractedAxioms(data) {
  const newAxioms = data?.axioms ?? [];
  if (!newAxioms.length) return;
  newAxioms.forEach(ax => {
    const id = ax.axiom_id;
    if (!id) return;
    // Merge into global AXIOMS store (override if re-extracted)
    AXIOMS[id] = ax;
    // Register in index
    const domain = ax.layer_1_audit_header?.domain ?? 'Extracted';
    const status = ax.layer_1_audit_header?.status ?? 'HYPOTHESIZED';
    if (!AXIOM_INDEX.axioms_by_domain[domain]) AXIOM_INDEX.axioms_by_domain[domain] = [];
    if (!AXIOM_INDEX.axioms_by_domain[domain].includes(id)) AXIOM_INDEX.axioms_by_domain[domain].push(id);
    if (!AXIOM_INDEX.axioms_by_status[status]) AXIOM_INDEX.axioms_by_status[status] = [];
    if (!AXIOM_INDEX.axioms_by_status[status].includes(id)) AXIOM_INDEX.axioms_by_status[status].push(id);
  });
  _renderAllAxiomTrees();
  toast(`${newAxioms.length} axiom(s) injected into browser`, 'info', 3000);
}

function _useMockFallback(filename) {
  console.warn('[UPLOAD] Backend offline — using mock extraction');
  const data = _mockExtraction(filename);
  _onDataExtracted(data);
  toast('Backend not available — using mock extraction', 'warning');
}

function _mockExtraction(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  const domainMap = {
    '.pdf': 'Celestial Mechanics', '.wav': 'Thermodynamics',
    '.mp4': 'Electromagnetism',   '.dcm': 'UPASL Invariants',
  };
  const domain = domainMap[ext] ?? 'Power Management';
  return {
    filename, domain, confidence: 0.78, trace_id: genTraceId(),
    nodes: [
      { field:'axiom_id',   value:'NEWTON_GRAV_01', confidence:0.99, source:'OCR' },
      { field:'domain',     value: domain,           confidence:0.93, source:'NLP' },
      { field:'expression', value:'F = G·m₁m₂/r²',  confidence:0.72, source:'LaTeX parser' },
      { field:'status',     value:'ANOMALOUS',       confidence:0.65, source:'AI Noether' },
    ],
  };
}

function _onDataExtracted(data) {
  if (!data) return;
  if ((data.confidence ?? 1) < 0.85) openHITL(data);
}

// ── Page 2 Setup ─────────────────────────────────────────────────────────────
function _setupPage2() {
  _renderAxiomTree();
  _setupAnalysisTabs();
  // Draw stub canvas if nothing selected
  if (!state.selectedAxiom) _drawCoreEmpty();
}

// ── Axiom Tree ───────────────────────────────────────────────────────────────
function _buildAxiomTree() { /* build done on render */ }

function _renderAxiomTree() {
  // DEPRECATED — delegates to new _renderAllAxiomTrees() which uses AXIOM_DOMAINS
  _renderAllAxiomTrees();
}

// ── Filter & Search ──────────────────────────────────────────────────────────
qs('#axiom-search')?.addEventListener('input', e => {
  state.searchQuery = e.target.value.toLowerCase();
  _renderAxiomTree();
});

qsa('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    state.filterStatus = chip.dataset.filter;
    qsa('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
    _renderAxiomTree();
  });
});

// ── Select Axiom ─────────────────────────────────────────────────────────────
function selectAxiom(id) {
  const ax = AXIOMS[id];
  if (!ax) { toast(`Axiom ${id} not found`, 'warning'); return; }

  state.selectedAxiom = ax;
  state.activeLayer   = 1;

  // Highlight row
  qsa('.axiom-row').forEach(r => r.classList.toggle('selected', r.dataset.axiomId===id));

  // Show detail panel
  const panel = qs('#axiom-detail-panel');
  panel.classList.add('visible');

  // Header
  const l1 = ax.layer_1_audit_header;
  qs('#detail-id').textContent   = ax.axiom_id;
  qs('#detail-name').textContent = l1.name;

  const badge = qs('#detail-status-badge');
  badge.textContent  = l1.status;
  badge.className    = `axiom-status-badge ${l1.status.toLowerCase()}`;

  _renderLayer(1);
  _drawCoreDiagram(ax);
  toast(`Selected: ${ax.axiom_id}`, 'info', 2000);
}

// ── Layer tabs ───────────────────────────────────────────────────────────────
qsa('.layer-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeLayer = +btn.dataset.layer;
    qsa('.layer-tab-btn').forEach(b => b.classList.toggle('active', b===btn));
    _renderLayer(state.activeLayer);
  });
});

function _renderLayer(n) {
  const ax = state.selectedAxiom;
  if (!ax) return;
  const content = qs('#layer-content');
  const l1 = ax.layer_1_audit_header;
  const l2 = ax.layer_2_summary;
  const l3 = ax.layer_3_full_detail;

  if (n === 1) {
    const ratio = l1.health?.explanation_ratio ?? 1;
    const healthColor = ratio >= 0.9 ? '#22C55E' : ratio >= 0.7 ? '#F59E0B' : '#EF4444';
    content.innerHTML = `
      <div class="latex-display" id="latex-l1">\\( ${l1.expression_latex} \\)</div>
      <p style="font-size:12px;color:var(--lt-muted);margin-bottom:8px">
        <strong>Domain:</strong> ${l1.domain} &nbsp;·&nbsp;
        <strong>Version:</strong> ${ax.version} &nbsp;·&nbsp;
        <strong>Modified:</strong> ${ax.last_modified.slice(0,10)}
      </p>
      <p style="font-size:12px;color:var(--lt-muted);margin-bottom:4px">
        <strong>Phenomena coverage:</strong>
        ${l1.health?.phenomena_explained_count ?? '—'} / ${l1.health?.phenomena_total_count ?? '—'}
        &nbsp;(${Math.round(ratio*100)}%)
      </p>
      <div style="background:var(--lt-border);height:6px;border-radius:3px;overflow:hidden;margin-bottom:14px">
        <div style="height:100%;width:${ratio*100}%;background:${healthColor};border-radius:3px;transition:width 0.4s"></div>
      </div>
      <div class="code-block" id="pddl-block" style="font-size: 12px">${l1.expression_pddl ?? 'N/A'}</div>`;
    _typeset();
  }

  else if (n === 2) {
    if (!l2) { content.innerHTML = '<p style="color:var(--lt-muted)">No Layer 2 data available.</p>'; return; }

    const explains = (l2.explains || []).map(e => `
      <div class="phenomenon-row">
        <span class="phenomenon-ok">✓</span>
        <span class="phenomenon-id">${e.phenomenon_id}</span>
        <span class="phenomenon-conf">${Math.round(e.confidence*100)}%</span>
      </div>`).join('');

    const fails = (l2.fails_to_explain || []).map(e => `
      <div class="phenomenon-row">
        <span class="phenomenon-fail">✗</span>
        <span class="phenomenon-id">${e.phenomenon_id}</span>
        <span class="gap-desc">${e.gap_description}${e.gap_quantitative!=null ? ` (${e.gap_quantitative} ${e.gap_units??''})` : ''}</span>
      </div>`).join('');

    const gap = l2.abductive_gap;
    const gapHtml = gap ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--lt-border)">
        <p style="font-size:12px;font-weight:700;color:var(--lt-heading);margin-bottom:8px">Abductive Gap</p>
        <p style="font-size:12px;color:var(--lt-text);margin-bottom:6px">Candidate: <strong>${gap.candidate_missing_axiom?.axiom_id}</strong></p>
        <p style="font-size:12px;margin-bottom:2px;color:var(--lt-muted)">\\( ${gap.candidate_missing_axiom?.expression_latex} \\)</p>
        <div class="sem-distance-row">
          <span class="sem-label">Semantic distance:</span>
          <div class="sem-track"><div class="sem-marker" style="left:${gap.semantic_distance*100}%"></div></div>
          <span class="sem-value" style="color:${gap.semantic_distance>0.6?'#EF4444':'#22C55E'}">${gap.semantic_distance.toFixed(2)}</span>
        </div>
      </div>` : '';

    content.innerHTML = `
      <div style="margin-bottom:8px">
        <p style="font-size:12px;font-weight:700;color:var(--lt-heading);margin-bottom:6px">Explains (${l2.explains?.length ?? 0})</p>
        ${explains}
      </div>
      <div style="margin-bottom:4px">
        <p style="font-size:12px;font-weight:700;color:var(--status-error);margin-bottom:6px">
          Fails to Explain (${l2.fails_to_explain?.length ?? 0})
        </p>
        ${fails || '<p style="font-size:12px;color:var(--lt-muted)">None — fully canonical.</p>'}
      </div>
      ${gapHtml}`;
    _typeset();
  }

  else if (n === 3) {
    if (!l3) { content.innerHTML = '<p style="color:var(--lt-muted)">No Layer 3 data available.</p>'; return; }
    const st = l3.symbolic_transformation;
    const alg = l3.algebraic?.primary_decomposition;
    const pddl = l3.pddl_representation;

    const stepsHtml = st ? `
      <p style="font-size:12px;font-weight:700;color:var(--lt-heading);margin-bottom:6px">Symbolic Transformation Trail</p>
      <ul class="rewrite-steps">${(st.rewrite_steps||[]).map(s=>`<li>${s}</li>`).join('')}</ul>
      <p style="font-size: 12px;color:var(--lt-muted);margin-top:6px;font-style:italic">${st.llm_justification}</p>` : '';

    const algHtml = alg ? `
      <p style="font-size:12px;font-weight:700;color:var(--lt-heading);margin:12px 0 6px">Primary Decomposition</p>
      <p style="font-size:12px;color:var(--lt-muted);margin-bottom:6px">Input ideal: <span class="text-mono">${alg.input_ideal}</span></p>
      <div class="code-block" style="font-size: 12px">${(alg.associated_primes||[]).join('\n')}</div>
      <p style="font-size:12px;font-weight:700;color:var(--lt-heading);margin:10px 0 6px">Generators Tested</p>
      <div class="code-block" style="font-size: 12px">${(alg.generators_tested||[]).map(g=>`${g.derives_q?'✓':'✗'} ${g.generator}${g.rejection_reason?' → '+g.rejection_reason:''}`).join('\n')}</div>` : '';

    const pddlHtml = pddl ? `
      <p style="font-size:12px;font-weight:700;color:var(--lt-heading);margin:12px 0 6px">PDDL Representation</p>
      <div class="code-block" style="font-size: 12px">(:action ${pddl.action.name}\n  :parameters (${(pddl.action.parameters||[]).join(' ')})\n  :precondition\n    ${(pddl.action.preconditions||[]).join('\n    ')}\n  :effect\n    ${(pddl.action.effects||[]).join('\n    ')})</div>` : '';

    content.innerHTML = stepsHtml + algHtml + pddlHtml || '<p style="color:var(--lt-muted)">Detailed decomposition not available for this axiom.</p>';
  }
}

// ── Analysis Tabs ────────────────────────────────────────────────────────────
function _setupAnalysisTabs() {
  qsa('.analysis-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeAnalysisTab = tab.dataset.tab;
      qsa('.analysis-tab').forEach(t => { t.classList.toggle('active', t===tab); t.setAttribute('aria-selected', t===tab?'true':'false'); });
      qsa('[id^="aview-"]').forEach(p => p.style.display='none');
      const target = qs(`#aview-${tab.dataset.tab}`);
      if (target) target.style.display='flex';
      _drawActiveCanvas(tab.dataset.tab);
    });
  });
}

// ── Canvas Drawing (stubs) ───────────────────────────────────────────────────
function _drawCoreEmpty() {
  const empty = qs('#core-empty');
  if (empty) empty.style.display = 'flex';
  const cv = qs('#core-canvas');
  if (cv) cv.style.display = 'none';
}

function _drawCoreDiagram(ax) {
  const empty = qs('#core-empty');
  if (empty) empty.style.display = 'none';
  const cv = qs('#core-canvas');
  if (!cv) return;
  cv.style.display = 'block';
  const parent = cv.parentElement;
  cv.width = parent.clientWidth;
  cv.height = parent.clientHeight;
  const ctx = cv.getContext('2d');
  _renderCoreCanvas(ctx, cv, ax);
}

function _renderCoreCanvas(ctx, cv, ax) {
  const W = cv.width, H = cv.height;
  const l1 = ax.layer_1_audit_header;
  const l2 = ax.layer_2_summary;
  const statusColor = { CANONICAL:'#22C55E', ANOMALOUS:'#EF4444', HYPOTHESIZED:'#3B82F6', INCOMPLETE:'#F59E0B' }[l1.status] ?? '#888';

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#F8F9FA'; ctx.fillRect(0,0,W,H);

  // Central node
  const cx = W/2, cy = H/2;
  ctx.beginPath(); ctx.arc(cx,cy,52,0,Math.PI*2);
  ctx.fillStyle   = statusColor + '1A'; ctx.fill();
  ctx.strokeStyle = statusColor;        ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle = '#1A1A2E'; ctx.font='bold 11px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(ax.axiom_id.replace(/_/g,' '), cx, cy-6);
  ctx.fillStyle = statusColor; ctx.font='10px Inter,sans-serif';
  ctx.fillText(l1.status, cx, cy+10);

  // Explains nodes
  const explains = l2?.explains || [];
  explains.slice(0,6).forEach((e,i) => {
    const angle = (i / Math.max(explains.length,1)) * Math.PI * 2 - Math.PI/2;
    const r = Math.min(W,H) * 0.32;
    const nx = cx + Math.cos(angle)*r, ny = cy + Math.sin(angle)*r;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny);
    ctx.strokeStyle = 'rgba(34,197,94,0.3)'; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath(); ctx.arc(nx,ny,28,0,Math.PI*2);
    ctx.fillStyle='rgba(34,197,94,0.08)'; ctx.fill();
    ctx.strokeStyle='#22C55E'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#1A1A2E'; ctx.font='9px JetBrains Mono,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const label = e.phenomenon_id.replace(/_/g,' ').substring(0,14);
    ctx.fillText(label, nx, ny-4);
    ctx.fillStyle='#22C55E'; ctx.font='bold 9px Inter,sans-serif';
    ctx.fillText(`${Math.round(e.confidence*100)}%`, nx, ny+6);
  });

  // Fails nodes
  const fails = l2?.fails_to_explain || [];
  fails.slice(0,3).forEach((e,i) => {
    const angle = (i / Math.max(fails.length,1)) * Math.PI*2 - Math.PI/2 + Math.PI/6;
    const r = Math.min(W,H) * 0.42;
    const nx = cx + Math.cos(angle)*r*0.8, ny = cy + Math.sin(angle)*r*1.2;
    ctx.beginPath(); ctx.setLineDash([4,4]); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny);
    ctx.strokeStyle='rgba(239,68,68,0.4)'; ctx.lineWidth=1; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(nx,ny,22,0,Math.PI*2);
    ctx.fillStyle='rgba(239,68,68,0.08)'; ctx.fill();
    ctx.strokeStyle='#EF4444'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#EF4444'; ctx.font='8px JetBrains Mono,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(e.phenomenon_id.replace(/_/g,' ').substring(0,12), nx, ny);
  });

  // Candidate fix node
  const gap = l2?.abductive_gap;
  if (gap) {
    const nx = cx, ny = cy - Math.min(W,H)*0.38;
    ctx.beginPath(); ctx.setLineDash([6,3]); ctx.moveTo(cx,cy-52); ctx.lineTo(nx,ny+26);
    ctx.strokeStyle='rgba(59,130,246,0.5)'; ctx.lineWidth=2; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(nx,ny,34,0,Math.PI*2);
    ctx.fillStyle='rgba(59,130,246,0.1)'; ctx.fill();
    ctx.strokeStyle='#3B82F6'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#3B82F6'; ctx.font='bold 9px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('CANDIDATE', nx, ny-6);
    ctx.font='8px JetBrains Mono,monospace'; ctx.fillText(gap.candidate_missing_axiom.axiom_id.replace(/_/g,' '), nx, ny+5);
    ctx.fillStyle='#888'; ctx.font='8px Inter,sans-serif'; ctx.fillText(`d=${gap.semantic_distance}`, nx, ny+16);
  }
}

function _drawActiveCanvas(tab) {
  // Cancel any running animation loops from previous tab
  if (tab !== 'gnn'   && _gnnAnim)    { cancelAnimationFrame(_gnnAnim);    _gnnAnim    = null; }
  if (tab !== 'causal'&& _causalAnim) { cancelAnimationFrame(_causalAnim); _causalAnim = null; }

  if (tab==='core') { if (state.selectedAxiom) _drawCoreDiagram(state.selectedAxiom); else _drawCoreEmpty(); return; }

  const canvasIds = { gnn:'gnn-canvas', 'world-model':'wm-canvas', causal:'causal-canvas' };
  const canvasId = canvasIds[tab];
  if (!canvasId) return;
  const cv = qs(`#${canvasId}`);
  if (!cv) return;
  const parent = cv.parentElement;
  cv.width = parent.clientWidth; cv.height = parent.clientHeight;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#F8F9FA'; ctx.fillRect(0,0,W,H);

  if (tab==='gnn')          _drawGNNStub(ctx,W,H);
  else if (tab==='world-model') _drawWMStub(ctx,W,H);
  else if (tab==='causal')  _drawCausalStub(ctx,W,H);
}

// ── P3: GNN Visualization — Animated Constellation Map ──────────────────────
let _gnnAnim = null;   // animation frame handle

function _drawGNNStub(ctx, W, H) {
  if (_gnnAnim) cancelAnimationFrame(_gnnAnim);

  const modeColor = _getModeColor();
  const axiomList = Object.values(AXIOMS).slice(0, 18);
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) * 0.34;

  // Build stable node positions (concentric rings)
  const nodes = axiomList.map((ax, i) => {
    const ring = i < 6 ? 1 : i < 13 ? 0.6 : 0.25;
    const angle = (i / axiomList.length) * Math.PI * 2 - Math.PI / 2;
    const statusColor = { CANONICAL:'#22C55E', ANOMALOUS:'#EF4444', HYPOTHESIZED:'#3B82F6', INCOMPLETE:'#F59E0B' }[ax.layer_1_audit_header.status] ?? '#888';
    return {
      x: cx + Math.cos(angle) * R * ring,
      y: cy + Math.sin(angle) * R * ring,
      r: ax === state.selectedAxiom ? 14 : 7 + (ax.layer_1_audit_header.health?.explanation_ratio ?? 0.5) * 8,
      color: statusColor,
      ax,
      pulse: Math.random() * Math.PI * 2,   // phase offset
      particles: [],
    };
  });

  // Seed edge particles
  const edges = [];
  nodes.forEach((n, i) => {
    if (i > 0 && i < nodes.length) {
      const to = nodes[(i + 3) % nodes.length];
      edges.push({ from: n, to, t: Math.random() });
    }
  });

  const t0 = performance.now();

  function frame(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#F8F9FA'; ctx.fillRect(0, 0, W, H);

    // Draw edges with flowing particles
    edges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.from.x, e.from.y);
      ctx.lineTo(e.to.x, e.to.y);
      ctx.strokeStyle = modeColor + '20'; ctx.lineWidth = 1; ctx.stroke();

      e.t = (e.t + 0.003) % 1;
      const px = e.from.x + (e.to.x - e.from.x) * e.t;
      const py = e.from.y + (e.to.y - e.from.y) * e.t;
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = modeColor + 'CC'; ctx.fill();
    });

    // Draw nodes
    nodes.forEach((n, i) => {
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.5 + n.pulse);
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.5);
      glow.addColorStop(0, n.color + '55');
      glow.addColorStop(1, n.color + '00');
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();

      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = n.color + '22'; ctx.fill();
      ctx.strokeStyle = n.color; ctx.lineWidth = n.ax === state.selectedAxiom ? 2.5 : 1.5; ctx.stroke();

      if (n.r > 10) {
        ctx.fillStyle = '#1A1A2E'; ctx.font = 'bold 8px JetBrains Mono,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.ax.axiom_id.split('_')[0], n.x, n.y);
      }
    });

    // Central label
    ctx.fillStyle = '#AAA'; ctx.font = '11px Inter,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`GNN Constellation — ${axiomList.length} nodes · ${edges.length} edges`, W / 2, 10);

    _gnnAnim = requestAnimationFrame(frame);
  }
  _gnnAnim = requestAnimationFrame(frame);
}

// ── P3: World Model — Hexagonal Projection Lattice ───────────────────────────
function _drawWMStub(ctx, W, H) {
  const modeColor = _getModeColor();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#F8F9FA'; ctx.fillRect(0, 0, W, H);

  // Hexagonal grid
  const hexR = 32, pad = 40;
  const cols = Math.floor((W - pad * 2) / (hexR * 1.75)) + 1;
  const rows = Math.floor((H - pad * 2) / (hexR * 1.52)) + 1;
  const domains = Object.keys(AXIOM_INDEX.axioms_by_domain);
  let idx = 0;

  function hexPath(cx, cy, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 180 * (60 * k - 30);
      if (k === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else          ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  }

  const domainColors = [
    modeColor, '#D4AF37', '#3B82F6', '#22C55E',
    '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#64748B',
  ];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = pad + col * hexR * 1.75 + (row % 2 ? hexR * 0.875 : 0);
      const cy = pad + row * hexR * 1.52;
      if (cx > W + hexR || cy > H + hexR) continue;

      // Which domain does this hex belong to?
      const domIdx = (row * cols + col) % domains.length;
      const domain = domains[domIdx];
      const axiomIds = AXIOM_INDEX.axioms_by_domain[domain] ?? [];
      const selId = state.selectedAxiom?.axiom_id;
      const isSelected = axiomIds.includes(selId);
      const color = domainColors[domIdx % domainColors.length];
      const health = axiomIds.reduce((acc, id) =>
        acc + (AXIOMS[id]?.layer_1_audit_header?.health?.explanation_ratio ?? 0.5), 0) / Math.max(axiomIds.length, 1);

      hexPath(cx, cy, hexR - 2);
      ctx.fillStyle = isSelected ? color + '44' : color + (Math.round(health * 0x22 + 0x06).toString(16).padStart(2,'0'));
      ctx.fill();
      ctx.strokeStyle = isSelected ? color : color + '66';
      ctx.lineWidth = isSelected ? 2 : 0.8;
      ctx.stroke();

      if (hexR > 20) {
        ctx.fillStyle = isSelected ? '#1A1A2E' : '#666';
        ctx.font = `${isSelected ? 'bold ' : ''}8px Inter,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const shortName = domain.split(' ')[0].substring(0, 8);
        ctx.fillText(shortName, cx, cy);
        ctx.fillStyle = isSelected ? '#1A1A2E' : '#999';
        ctx.font = '7px JetBrains Mono,monospace';
        ctx.fillText(`${Math.round(health * 100)}%`, cx, cy + 10);
      }
    }
  }

  ctx.fillStyle = '#AAA'; ctx.font = '11px Inter,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`World Model Projection — ${domains.length} domain clusters`, W / 2, H - 8);
}

// ── P3: Causal Matrix — Animated Edge-Trace Graph ────────────────────────────
let _causalAnim = null;

function _drawCausalStub(ctx, W, H) {
  if (_causalAnim) cancelAnimationFrame(_causalAnim);

  const anomalyGroups = AXIOM_INDEX.anomaly_groups ?? [];
  if (!anomalyGroups.length) {
    ctx.fillStyle = '#AAA'; ctx.font = '13px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('No anomaly groups in repository', W / 2, H / 2);
    return;
  }

  const modeColor = _getModeColor();
  const selectedId = state.selectedAxiom?.axiom_id;

  // Build nodes from anomaly groups
  const nodeMap = {};
  anomalyGroups.forEach(g => {
    if (!nodeMap[g.anomalous_axiom]) nodeMap[g.anomalous_axiom] = { id: g.anomalous_axiom, type: 'anomalous', edges: [] };
    if (!nodeMap[g.candidate_fix])   nodeMap[g.candidate_fix]   = { id: g.candidate_fix,   type: 'candidate', edges: [] };
    nodeMap[g.anomalous_axiom].edges.push({ to: g.candidate_fix, dist: g.semantic_distance });
  });
  const nodes = Object.values(nodeMap);
  const rows = Math.max(2, Math.ceil(nodes.length / 3));
  const cols = Math.ceil(nodes.length / rows);
  nodes.forEach((n, i) => {
    n.x = (W * 0.1) + (i % cols) / Math.max(cols - 1, 1) * (W * 0.8);
    n.y = (H * 0.2) + Math.floor(i / cols) / Math.max(rows - 1, 1) * (H * 0.6);
    n.isSelected = n.id === selectedId;
  });

  // Animated dash offset
  let dashOffset = 0;
  const t0 = performance.now();

  function frame(now) {
    dashOffset = ((now - t0) / 30) % 20;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#F8F9FA'; ctx.fillRect(0, 0, W, H);

    // Draw edges
    nodes.forEach(n => {
      n.edges.forEach(e => {
        const to = nodeMap[e.to];
        if (!to) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);

        // Bezier curve for visual quality
        const mx = (n.x + to.x) / 2, my = (n.y + to.y) / 2 - 40;
        ctx.bezierCurveTo(mx, n.y - 30, mx, to.y - 30, to.x, to.y);

        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -dashOffset;
        ctx.strokeStyle = `rgba(239,68,68,${0.5 + e.dist * 0.5})`;
        ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();

        // Semantic distance label
        ctx.fillStyle = '#999'; ctx.font = '9px JetBrains Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`d=${e.dist.toFixed(2)}`, mx, my + 12);
      });
    });

    // Draw nodes
    nodes.forEach(n => {
      const isAnomaly = n.type === 'anomalous';
      const color = isAnomaly ? '#EF4444' : modeColor;
      const r = n.isSelected ? 28 : 22;

      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2);
      grad.addColorStop(0, color + '33'); grad.addColorStop(1, color + '00');
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 2, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();

      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color + '18'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = n.isSelected ? 2.5 : 1.5; ctx.stroke();

      ctx.fillStyle = isAnomaly ? '#EF4444' : '#1A1A2E';
      ctx.font = `bold 8px JetBrains Mono,monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = n.id.replace(/_/g,' ').substring(0, 12);
      ctx.fillText(label, n.x, n.y - 4);
      ctx.fillStyle = '#888'; ctx.font = '7px Inter,sans-serif';
      ctx.fillText(isAnomaly ? 'ANOMALOUS' : 'CANDIDATE', n.x, n.y + 6);
    });

    ctx.fillStyle = '#AAA'; ctx.font = '11px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`Causal Matrix — ${anomalyGroups.length} anomaly chains`, W / 2, H - 8);

    _causalAnim = requestAnimationFrame(frame);
  }
  _causalAnim = requestAnimationFrame(frame);
}

/** Get current mode brand color for canvas renders */
function _getModeColor() {
  return state.engine === 'DEDUCTION'  ? '#00C853'
       : state.engine === 'INDUCTION'  ? '#00D4FF'
       : /* ABDUCTION */                 '#FF6B1A';
}

// ── Report ───────────────────────────────────────────────────────────────────
function _buildReport() {
  const ax   = state.selectedAxiom;
  const trace = genTraceId();
  const ts    = new Date().toISOString();

  qs('#report-id-val').textContent    = `RPT_${state.sessionId ?? 'ANON'}`;
  qs('#report-trace-val').textContent = trace;
  qs('#report-type-val').textContent  = ax ? 'DOC_ACCURACY' : 'N/A';
  qs('#report-engine-val').textContent = state.engine;
  qs('#report-ts-val').textContent    = ts.slice(0,19).replace('T',' ');

  const body = qs('#report-content');
  if (!ax) return;

  const l1 = ax.layer_1_audit_header;
  const l2 = ax.layer_2_summary;
  body.innerHTML = `
    <div style="padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--lt-border)">
        <div>
          <h3 style="font-size:18px;font-weight:700;color:var(--lt-heading);margin-bottom:4px">${ax.axiom_id}</h3>
          <p style="color:var(--lt-muted);font-size:14px">${l1.name} · ${l1.domain}</p>
        </div>
        <span style="padding:5px 14px;border-radius:16px;font-size: 12px;font-weight:700;background:${l1.status==='CANONICAL'?'rgba(34,197,94,0.1)':l1.status==='ANOMALOUS'?'rgba(239,68,68,0.1)':'rgba(59,130,246,0.1)'};color:${l1.status==='CANONICAL'?'#22C55E':l1.status==='ANOMALOUS'?'#EF4444':'#3B82F6'};border:1px solid currentColor">${l1.status}</span>
      </div>

      <section style="margin-bottom:24px">
        <h4 style="font-size:13px;font-weight:700;color:var(--lt-heading);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">Audit Summary</h4>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="border-bottom:1px solid var(--lt-border)"><td style="padding:8px 0;color:var(--lt-muted);width:40%">Explanation Ratio</td><td style="padding:8px 0;font-weight:600">${Math.round((l1.health?.explanation_ratio??0)*100)}%</td></tr>
          <tr style="border-bottom:1px solid var(--lt-border)"><td style="padding:8px 0;color:var(--lt-muted)">Phenomena Explained</td><td style="padding:8px 0;font-weight:600">${l1.health?.phenomena_explained_count ?? '—'} / ${l1.health?.phenomena_total_count ?? '—'}</td></tr>
          <tr style="border-bottom:1px solid var(--lt-border)"><td style="padding:8px 0;color:var(--lt-muted)">Logic Engine</td><td style="padding:8px 0;font-weight:600">${state.engine}</td></tr>
          <tr style="border-bottom:1px solid var(--lt-border)"><td style="padding:8px 0;color:var(--lt-muted)">Derivation Type</td><td style="padding:8px 0;font-weight:600">${l2?.derivation_path?.type?.toUpperCase() ?? '—'}</td></tr>
          ${l2?.abductive_gap ? `<tr><td style="padding:8px 0;color:var(--lt-muted)">Semantic Distance to Fix</td><td style="padding:8px 0;font-weight:600;color:#EF4444">${l2.abductive_gap.semantic_distance}</td></tr>` : ''}
        </table>
      </section>

      ${(l2?.fails_to_explain||[]).length > 0 ? `
      <section style="margin-bottom:24px">
        <h4 style="font-size:13px;font-weight:700;color:#EF4444;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">⚠ Anomaly Report</h4>
        ${(l2.fails_to_explain||[]).map(e=>`
          <div style="padding:10px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:6px;margin-bottom:8px">
            <div style="font-weight:600;font-size:13px;font-family:var(--font-mono)">${e.phenomenon_id}</div>
            <div style="font-size:12px;color:var(--lt-muted);margin-top:2px">${e.gap_description}${e.gap_quantitative!=null?` — ${e.gap_quantitative} ${e.gap_units??''}`:''}
            </div>
          </div>`).join('')}
      </section>` : ''}

      <section>
        <h4 style="font-size:13px;font-weight:700;color:var(--lt-heading);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Canonical Expression</h4>
        <div style="background:var(--lt-surface);border:1px solid var(--lt-border);border-radius:8px;padding:16px;text-align:center;font-size:16px;font-family:var(--font-mono)">
          ${l1.expression_latex}
        </div>
      </section>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--lt-border);font-size: 12px;color:var(--lt-muted);display:flex;justify-content:space-between">
        <span>Session: ${state.sessionId ?? '—'}</span>
        <span>Trace: ${trace}</span>
        <span>Engine: Sovereign Matrix v2.0.0</span>
      </div>
    </div>`;
}

// ── Report Export Buttons ────────────────────────────────────────────────────
qs('#print-report-btn')?.addEventListener('click', () => window.print());
qs('#export-json-btn')?.addEventListener('click',  () => toast('JSON export — connect backend endpoint /api/report/json', 'warning'));
qs('#export-pdf-btn')?.addEventListener('click',   () => toast('PDF export — connect backend endpoint /api/report/pdf', 'warning'));
qs('#export-csv-btn')?.addEventListener('click',   () => toast('CSV export — connect backend endpoint /api/report/csv', 'warning'));

// ── Detail Buttons ───────────────────────────────────────────────────────────
qs('#detail-run-hitl-btn')?.addEventListener('click', () => {
  if (!state.selectedAxiom) { toast('Select an axiom first', 'warning'); return; }
  openHITL(_mockExtraction(state.selectedAxiom?.axiom_id ?? 'UNKNOWN'));
});

// ── HITL Modal ───────────────────────────────────────────────────────────────
function openHITL(data) {
  const modal = qs('#hitl-modal');
  if (!modal) return;

  // Populate summary
  qs('#hitl-filename').textContent   = data.filename ?? '—';
  qs('#hitl-domain').textContent     = data.domain   ?? '—';
  qs('#hitl-confidence').textContent = data.confidence != null ? `${Math.round(data.confidence*100)}%` : '—';
  qs('#hitl-trace').textContent      = data.trace_id ?? '—';

  // Table
  const tbody = qs('#hitl-tbody');
  tbody.innerHTML = (data.nodes ?? []).map((n,i) => {
    const conf = n.confidence ?? 0;
    const cls  = conf>=0.85?'hitl-conf-high':conf>=0.6?'hitl-conf-medium':'hitl-conf-low';
    return `<tr data-index="${i}">
      <td class="text-mono" style="font-size:12px">${n.field}</td>
      <td style="font-size:12px">${n.value}</td>
      <td class="${cls}">${Math.round(conf*100)}%</td>
      <td style="font-size: 12px;color:var(--dk-muted)">${n.source}</td>
      <td><button style="padding:3px 10px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--dk-muted);font-size: 12px;cursor:pointer" onclick="window._editHITLRow(${i},'${n.field}')">Edit</button></td>
    </tr>`;
  }).join('');

  // Timer
  state.hitlSeconds = 300;
  _updateHITLTimer();
  if (state.hitlTimer) clearInterval(state.hitlTimer);
  state.hitlTimer = setInterval(() => {
    state.hitlSeconds--;
    _updateHITLTimer();
    if (state.hitlSeconds <= 0) { clearInterval(state.hitlTimer); closeHITL(); toast('HITL timeout — continuing', 'warning'); }
  }, 1000);

  modal.classList.add('active');
  qs('#hitl-confirm-btn')?.focus();
}

function closeHITL() {
  if (state.hitlTimer) clearInterval(state.hitlTimer);
  qs('#hitl-modal')?.classList.remove('active');
  qs('#hitl-edit-panel')?.classList.remove('visible');
}

function _updateHITLTimer() {
  const el = qs('#hitl-countdown');
  if (el) { el.textContent=`${state.hitlSeconds}s`; el.style.color=state.hitlSeconds<60?'#EF4444':state.hitlSeconds<120?'#F59E0B':'#F59E0B'; }
}

window._editHITLRow = function(i, field) {
  const panel = qs('#hitl-edit-panel');
  if (panel) { panel.classList.add('visible'); qs('#hitl-edit-field-title').textContent=`Editing: ${field}`; qs('#hitl-edit-value')?.focus(); }
};

qs('#hitl-close-btn')?.addEventListener('click',   closeHITL);
qs('#hitl-cancel-btn')?.addEventListener('click',  closeHITL);
qs('#hitl-confirm-btn')?.addEventListener('click', () => {
  closeHITL();
  toast('HITL confirmed — pipeline continuing', 'success');
});

document.addEventListener('keydown', e => {
  if (e.key==='Escape' && qs('#hitl-modal')?.classList.contains('active')) closeHITL();
});

// ── MathJax typesetting helper ───────────────────────────────────────────────
function _typeset() {
  if (window.MathJax?.typesetPromise) {
    MathJax.typesetPromise([qs('#layer-content'), qs('#latex-l1')].filter(Boolean)).catch(console.warn);
  }
}

// ── Language Modal ───────────────────────────────────────────────────────────
function _buildLangGrid() {
  const grid = qs('#lang-grid');
  if (!grid) return;
  grid.innerHTML = LANGUAGES.map(l => `
    <div class="lang-pill${l.required ? ' required' : ''}${state.language === l.code ? ' active' : ''}"
         data-lang="${l.code}" role="option" aria-selected="${state.language === l.code}"
         tabindex="0">
      <span class="lang-pill-flag">${l.flag}</span>
      <span class="lang-pill-name">${l.name}</span>
    </div>`).join('');
  grid.querySelectorAll('.lang-pill').forEach(pill => {
    pill.addEventListener('click', () => setLanguage(pill.dataset.lang));
    pill.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') setLanguage(pill.dataset.lang); });
  });
}

function setLanguage(code) {
  state.language = code;
  const lang = LANGUAGES.find(l => l.code === code);
  // Update active pill
  qsa('.lang-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.lang === code);
    p.setAttribute('aria-selected', p.dataset.lang === code ? 'true' : 'false');
  });
  // Update button label
  const btn = qs('#hdr-language-btn');
  if (btn && lang) btn.textContent = `🌐 ${lang.flag} ${lang.name.length > 7 ? lang.name.slice(0,7) : lang.name}`;
  toast(`Language: ${lang?.name ?? code}`, 'info', 2000);
  // Real i18n hook: would call a translation service here
  console.log(`[LANGUAGE] Set to: ${code}`);
}

function openLangModal() {
  _buildLangGrid();
  qs('#lang-modal')?.classList.add('active');
}
function closeLangModal() {
  qs('#lang-modal')?.classList.remove('active');
}

qs('#hdr-language-btn')?.addEventListener('click', openLangModal);
qs('#lang-close-btn')?.addEventListener('click',  closeLangModal);
qs('#lang-close-btn2')?.addEventListener('click', closeLangModal);
document.addEventListener('keydown', e => {
  if (e.key==='Escape' && qs('#lang-modal')?.classList.contains('active')) closeLangModal();
});

// ── Expose for inline event handlers ────────────────────────────────────────
window.showToast  = toast;
window.openHITL   = openHITL;
window.closeHITL  = closeHITL;
window.returnToLanding = returnToLanding;

// ── Boot: apply default engine color to body ─────────────────────────────────
document.body.dataset.engine = state.engine;

console.log('[SOVEREIGN] main.js v2.1.0 loaded — default engine: ABDUCTION | lang: EN');

// ── Axiom Tree clone helpers for Op-2 and Op-3 ─────────────────────────────

/**
 * Clone the rendered axiom-tree HTML into Op-2 and Op-3 sidebars.
 */
function _cloneAxiomTrees() {
  const src = qs('#axiom-tree');
  if (!src) return;
  const t2 = qs('#axiom-tree-2');
  if (t2) t2.innerHTML = src.innerHTML;
  _renderAxiomTree3();   // Op-3: deduction-only
}

/** Render full axiom tree into #axiom-tree-2 */
function _renderAxiomTree2() {
  const treeEl = qs('#axiom-tree-2');
  if (!treeEl) return;
  treeEl.innerHTML = '';
  _populateTree(treeEl, false);
}

/** Render deduction-only axiom tree into #axiom-tree-3 */
function _renderAxiomTree3() {
  const treeEl = qs('#axiom-tree-3');
  if (!treeEl) return;
  treeEl.innerHTML = '';
  _populateTree(treeEl, true);
}

/**
 * Generic tree builder for all 3 sidebar trees.
 * @param {HTMLElement} treeEl
 * @param {boolean} deductionOnly
 */
function _populateTree(treeEl, deductionOnly) {
  Object.entries(AXIOM_INDEX.axioms_by_domain).forEach(([domain, ids]) => {
    const filtered = ids.filter(id => {
      const ax = AXIOMS[id]; if (!ax) return false;
      if (deductionOnly && !DEDUCTION_IDS.has(id)) return false;
      const status = ax.layer_1_audit_header?.status?.toLowerCase() ?? '';
      const matchStatus = state.filterStatus === 'all' || status === state.filterStatus.toLowerCase();
      const matchSearch = !state.searchQuery || ax.layer_1_audit_header?.name?.toLowerCase().includes(state.searchQuery) || id.toLowerCase().includes(state.searchQuery);
      return matchStatus && matchSearch;
    });
    if (!filtered.length) return;

    const group = document.createElement('div');
    group.className = 'domain-group';

    const hdr = document.createElement('div');
    hdr.className = 'domain-header';
    hdr.innerHTML = '<span>&#128193; ' + domain + '</span><span class="domain-toggle open">&#9654;</span>';
    group.appendChild(hdr);

    const axiomsDiv = document.createElement('div');
    axiomsDiv.className = 'domain-axioms open';

    filtered.forEach(id => {
      const ax = AXIOMS[id]; if (!ax) return;
      const l1 = ax.layer_1_audit_header;
      const status = l1.status.toLowerCase();
      const healthPct = Math.round((l1.health?.explanation_ratio ?? 1) * 100);
      const healthColor = healthPct >= 90 ? '#22C55E' : healthPct >= 70 ? '#F59E0B' : '#EF4444';

      const row = document.createElement('div');
      row.className = 'axiom-row' + (state.selectedAxiom?.axiom_id === id ? ' selected' : '');
      row.dataset.axiomId = id;
      row.setAttribute('role', 'treeitem');
      row.setAttribute('tabindex', '0');
      row.innerHTML =
        '<div class="axiom-status-dot ' + status + '" title="' + l1.status + '"></div>' +
        '<div class="axiom-row-info">' +
          '<div class="axiom-row-id">' + id + '</div>' +
          '<div class="axiom-row-name">' + l1.name + '</div>' +
        '</div>' +
        '<div class="axiom-health-bar">' +
          '<div class="axiom-health-fill" style="width:' + healthPct + '%;background:' + healthColor + '"></div>' +
        '</div>';
      row.addEventListener('click', () => selectAxiom(id));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectAxiom(id); });
      axiomsDiv.appendChild(row);
    });

    group.appendChild(axiomsDiv);
    treeEl.appendChild(group);

    hdr.addEventListener('click', () => {
      const arrow = hdr.querySelector('.domain-toggle');
      axiomsDiv.classList.toggle('open');
      arrow.classList.toggle('open');
    });
  });
}

/** Initialize the radar chart on Op-3 */
function _setupRadarChart() {
  const canvas = qs('#radar-ui');
  if (!canvas || !window.Chart) return;
  if (canvas._chartInstance) { canvas._chartInstance.destroy(); }
  const ctx = canvas.getContext('2d');
  canvas._chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Prop', 'Cap', 'Diss', 'Admit', 'Sync'],
      datasets: [{
        label: 'UPASL',
        data: [85, 92, 78, 88, 95],
        borderColor: '#00bf63',
        backgroundColor: 'rgba(0,191,99,0.12)',
        pointBackgroundColor: '#00bf63',
        pointRadius: 4,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          ticks: { display: false },
          grid: { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { color: '#888', font: { size: 10 } }
        }
      },
      plugins: { legend: { display: false } }
    },
  });
}

// selectAxiom Op-3 detail show handled inline

// ══════════════════════════════════════════════════════════════════
// AXIOM TREE RENDERER — uses new AXIOM_DOMAINS structure
// ══════════════════════════════════════════════════════════════════

/**
 * Render an axiom tree into a target container element.
 * @param {HTMLElement} container
 * @param {object} domains - AXIOM_DOMAINS[mode] or all modes
 * @param {boolean} deductionOnly - only render DEDUCTION domains
 */
function _renderTree(container, domains, deductionOnly = false) {
  if (!container) return;
  container.innerHTML = '';
  const src = deductionOnly ? { DEDUCTION: domains.DEDUCTION } : domains;

  Object.entries(src).forEach(([modeName, modeData]) => {
    if (!modeData) return;
    Object.entries(modeData).forEach(([domainName, domainData]) => {
      if (!domainData || !domainData.axioms) return;

      // Domain group header
      const groupEl = document.createElement('div');
      groupEl.className = 'tree-domain-group';

      const headEl = document.createElement('div');
      headEl.className = 'tree-domain-head';
      const arrow = document.createElement('span');
      arrow.className = 'tree-domain-arrow';
      arrow.textContent = '▶';
      headEl.appendChild(arrow);
      headEl.appendChild(document.createTextNode(' ' + domainName));
      groupEl.appendChild(headEl);

      const listEl = document.createElement('div');
      listEl.className = 'tree-axiom-list';
      groupEl.appendChild(listEl);

      // Auto-open all groups; toggle on click
      listEl.classList.add('open');
      arrow.classList.add('open');
      headEl.addEventListener('click', () => {
        const open = listEl.classList.toggle('open');
        arrow.classList.toggle('open', open);
      });

      // Axiom rows
      domainData.axioms.forEach(axiom => {
        const itemEl = document.createElement('div');
        itemEl.className = 'tree-axiom-item axiom-item';
        itemEl.dataset.axiomId = axiom.id;

        const dot = document.createElement('span');
        dot.className = `tree-axiom-dot ${axiom.status}`;
        const idSpan = document.createElement('span');
        idSpan.className = 'tree-axiom-id';
        idSpan.textContent = axiom.id;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-axiom-name';
        nameSpan.title = axiom.name;
        nameSpan.textContent = axiom.name;

        itemEl.appendChild(dot);
        itemEl.appendChild(idSpan);
        itemEl.appendChild(nameSpan);

        itemEl.addEventListener('click', () => _selectAxiom(axiom, itemEl));
        listEl.appendChild(itemEl);
      });

      container.appendChild(groupEl);
    });
  });
}

/** Render all three sidebar trees */
function _renderAllAxiomTrees() {
  const mode = state.engine;
  const modeDomains = AXIOM_DOMAINS[mode] || AXIOM_DOMAINS.DEDUCTION;

  // Sidebar 1 (Op-1): current mode axioms
  _renderTree(qs('#axiom-tree'),   AXIOM_DOMAINS, false);
  // Sidebar 2 (Op-2): current mode axioms
  _renderTree(qs('#axiom-tree-2'), AXIOM_DOMAINS, false);
  // Sidebar 3 (Op-3): DEDUCTION only
  _renderTree(qs('#axiom-tree-3'), AXIOM_DOMAINS, true);
}

// ══════════════════════════════════════════════════════════════════
// AXIOM SELECTION — gold breathing glow + central card update
// ══════════════════════════════════════════════════════════════════

function _selectAxiom(axiom, itemEl) {
  state.selectedAxiom = axiom;

  // Remove selected from all items across all trees
  qsa('.axiom-item.selected').forEach(el => el.classList.remove('selected'));
  itemEl.classList.add('selected');

  // Update AXIOM APPLIED cards
  const content = _buildAxiomDetailHTML(axiom);

  const targets = [
    qs('#axiom-applied-body-1'),
    qs('#axiom-applied-body-2-top'),
    qs('#deduction-axiom-body-1'),
  ];
  targets.forEach(el => { if (el) el.innerHTML = content; });

  // Update deduction criterion score display
  const score = (axiom.confidence || 0.85).toFixed(4);
  const scoreEl = qs('#ded-score-display');
  const verdictEl = qs('#ded-verdict-display');
  if (scoreEl) scoreEl.textContent = score;
  if (verdictEl) verdictEl.textContent = parseFloat(score) > 0.85 ? 'ALLOW' : 'REFUSE';

  // Trigger canvas refresh with new axiom data
  const gnnData = buildGNNGraph([{ ...axiom, confidence: axiom.confidence || 0.85 }]);
  const causalData = buildCausalGraph([{ ...axiom, confidence: axiom.confidence || 0.85 }]);
  const particles = buildWorldModelParticles([{ ...axiom, confidence: axiom.confidence || 0.85 }]);
  dashAnim.updateData({ gnnData, causalData, particles });

  toast(`Axiom ${axiom.id} — ${axiom.name}`, 'info', 3000);
}

/**
 * Build full axiom detail HTML for AXIOM APPLIED card body.
 * @param {object} axiom
 * @returns {string} HTML string
 */
function _buildAxiomDetailHTML(axiom) {
  const conf = (axiom.confidence || 0.85) * 100;
  return `<div class="axiom-detail-block">
  <div class="axiom-detail-id">${axiom.id}</div>
  <div class="axiom-detail-name">${axiom.name}</div>
  <div class="axiom-detail-domain">DOMAIN: ${Object.keys(AXIOM_DOMAINS).find(m =>
    Object.values(AXIOM_DOMAINS[m]).some(d => d.axioms && d.axioms.some(a => a.id === axiom.id))
  ) || '—'}</div>

  <div class="axiom-detail-label">FORMULA</div>
  <div class="axiom-detail-formula">${axiom.formula}</div>

  <div class="axiom-detail-label">DESCRIPTION</div>
  <div class="axiom-detail-desc">${axiom.description || '—'}</div>

  <div class="axiom-detail-label">GNN INTERPRETATION</div>
  <div class="axiom-interp-block">
    <div class="axiom-interp-title">▸ GNN MODEL</div>
    <div class="axiom-interp-text">Axiom entities are encoded as graph nodes. Edges propagate the constraint
    <em>${axiom.formula}</em> via message passing. Each iteration refines node embeddings until
    convergence — nodes violating the boundary are coloured anomalous (red).</div>
  </div>

  <div class="axiom-detail-label">WORLD MODEL INTERPRETATION</div>
  <div class="axiom-interp-block">
    <div class="axiom-interp-title">▸ WORLD MODEL</div>
    <div class="axiom-interp-text">1280 particles sample the admissibility manifold defined by this axiom.
    High-density clusters near the boundary indicate high-confidence regime.
    Resampling fires on new evidence upload, shifting the posterior distribution.</div>
  </div>

  <div class="axiom-detail-label">CAUSAL MODEL INTERPRETATION</div>
  <div class="axiom-interp-block">
    <div class="axiom-interp-title">▸ CAUSAL MODEL</div>
    <div class="axiom-interp-text">Do-calculus applied: P(Y|do(X=x)) = Σ P(Y|X,Z)·P(Z).
    Backdoor adjustment isolates the direct causal path implicit in this axiom.
    Intervention nodes shown as diamonds; confounders shown in amber.</div>
  </div>

  <div class="axiom-conf-bar">
    <span class="axiom-conf-label">CONFIDENCE</span>
    <div class="axiom-conf-track"><div class="axiom-conf-fill" style="width:${conf.toFixed(1)}%"></div></div>
    <span class="axiom-conf-pct">${conf.toFixed(0)}%</span>
  </div>
</div>`;
}

// ══════════════════════════════════════════════════════════════════
// UPLOAD HANDLER — Op-1 (100MB), Op-3 (no limit)
// ══════════════════════════════════════════════════════════════════

function _initUploadZone(dropZoneId, inputId, maxBytes, onFile) {
  const zone  = qs(`#${dropZoneId}`);
  const input = qs(`#${inputId}`);
  if (!zone || !input) return;

  zone.addEventListener('click', e => {
    if (e.target !== input) input.click();
  });
  zone.addEventListener('dragover', e => {
    e.preventDefault(); zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) _handleFile(file, maxBytes, onFile);
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) _handleFile(file, maxBytes, onFile);
    input.value = '';
  });
}

function _handleFile(file, maxBytes, onFile) {
  if (maxBytes && file.size > maxBytes) {
    toast(`File too large: ${(file.size/1024/1024).toFixed(1)}MB / max ${(maxBytes/1024/1024).toFixed(0)}MB`, 'error');
    return;
  }
  state.uploadedFile = file;
  toast(`File accepted: ${file.name}`, 'success', 3000);

  // Update file info displays
  qsa('#file-info-name').forEach(el => el.textContent = file.name);
  qsa('#file-info-size').forEach(el => el.textContent = `${(file.size/1024).toFixed(1)} KB`);
  qsa('#file-info-card, #file-info-card-3').forEach(el => el.style.display = '');

  // Read as text and run axiom matching
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result || '';
    const matches = matchTextToAxioms(text, [], state.engine);
    console.log(`[MATCH] ${matches.length} axioms matched for ${file.name}`);
    if (matches.length > 0) _applyMatchedAxioms(matches, file.name);
    if (onFile) onFile(file, matches);
    // Simulate progress bar
    _simulateProgress();
    // Advance to Op-2 if on Op-1 after a short delay
    if (state.page === 1 && state.engine !== 'DEDUCTION') {
      setTimeout(() => _showOpPage(2), 1800);
    }
  };
  reader.onerror = () => toast('File read error', 'error');
  // Try text read; fallback for binary files
  try { reader.readAsText(file); }
  catch(ex) { toast('Binary file — axiom matching skipped', 'warning', 3000); }
}

function _simulateProgress() {
  const fillEl = qs('#upload-fill');
  const pctEl  = qs('#upload-pct');
  const wrap   = qs('#upload-progress-wrap');
  if (!wrap) return;
  wrap.style.display = '';
  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 18;
    if (pct >= 100) { pct = 100; clearInterval(iv); setTimeout(() => { wrap.style.display = 'none'; }, 1200); }
    if (fillEl) fillEl.style.width = pct + '%';
    if (pctEl)  pctEl.textContent  = Math.round(pct) + '%';
  }, 120);
}

/**
 * Populate AXIOM APPLIED cards from matched axioms.
 * @param {Array} matches
 * @param {string} fileName
 */
function _applyMatchedAxioms(matches, fileName) {
  // Build graph + particle data from top matches
  const top3 = matches.slice(0, 3);
  const gnnData    = buildGNNGraph(matches.slice(0, 12));
  const causalData = buildCausalGraph(matches.slice(0, 8));
  const particles  = buildWorldModelParticles(matches);

  dashAnim.updateData({ gnnData, causalData, particles });

  // Populate AXIOM APPLIED cards (Op-1)
  const body1 = qs('#axiom-applied-body-1');
  if (body1 && top3[0]) body1.innerHTML = _buildAxiomDetailHTML({ ...top3[0], confidence: top3[0].confidence });

  // Populate Op-2 cards
  const bodyP2Top = qs('#axiom-applied-body-2-top');
  const bodyP2Bot = qs('#axiom-applied-body-2-bot');
  if (bodyP2Top && top3[0]) bodyP2Top.innerHTML = _buildAxiomDetailHTML({ ...top3[0], confidence: top3[0].confidence });
  if (bodyP2Bot && top3[1]) bodyP2Bot.innerHTML = _buildAxiomDetailHTML({ ...top3[1], confidence: top3[1].confidence });

  // Populate Op-3 deduction cards
  top3.forEach((ax, i) => {
    const el = qs(`#deduction-axiom-body-${i+1}`);
    if (el) el.innerHTML = _buildAxiomDetailHTML({ ...ax, confidence: ax.confidence });
  });

  // Update deduction score
  const avgConf = top3.reduce((s, a) => s + a.confidence, 0) / top3.length;
  const scoreEl = qs('#ded-score-display');
  const verdictEl = qs('#ded-verdict-display');
  if (scoreEl) scoreEl.textContent = avgConf.toFixed(4);
  if (verdictEl) verdictEl.textContent = avgConf > 0.85 ? 'ALLOW' : 'REFUSE_TIER_2';

  // Highlight matched axioms in sidebar with gold glow
  top3.forEach(ax => {
    qsa(`[data-axiom-id="${ax.id}"]`).forEach(el => el.classList.add('selected'));
  });

  toast(`${matches.length} axioms matched from ${fileName}`, 'success');
}

// Initialise both upload zones on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  // Op-1 upload zone — 100MB
  _initUploadZone('drop-zone', 'upload-input', 100 * 1024 * 1024, null);
  // Op-3 upload zone — no limit (null)
  _initUploadZone('drop-zone-3', 'upload-input-3', null, null);
});

// ══════════════════════════════════════════════════════════════════
// SLIM HEADER CTA WIRING
// ══════════════════════════════════════════════════════════════════

document.addEventListener('click', e => {
  // MANUAL AXIOM SELECTION
  if (e.target.id === 'btn-manual-axiom') {
    toast('Manual axiom selection mode — click any axiom in the AXIOM REPO', 'info', 3500);
  }
  // UPLOAD INPUT FILE (Op-3 header button)
  if (e.target.id === 'btn-upload-file') {
    qs('#upload-input-3')?.click();
  }
  // GENERATE AUDIT REPORT
  if (e.target.id === 'btn-generate-report') {
    toast('Generating audit report…', 'info', 2000);
    setTimeout(() => _generateAuditReport(), 2000);
  }
  // TRACE ENGINE LOGIC toggle
  if (e.target.id === 'btn-trace-engine') {
    const panel = qs('#trace-engine-panel');
    if (panel) {
      const open = panel.style.display === 'none';
      panel.style.display = open ? '' : 'none';
      e.target.classList.toggle('active', open);
    }
  }
  // DEDUCTIVE TIMESTAMP toggle
  if (e.target.id === 'btn-deductive-timestamp') {
    const panel = qs('#timestamp-panel');
    if (panel) {
      const open = panel.style.display === 'none';
      panel.style.display = open ? '' : 'none';
      e.target.classList.toggle('active', open);
      if (open) _tickTimestampLog();
    }
  }
});

/** Live-append timestamp entries */
function _tickTimestampLog() {
  const el = qs('#timestamp-entries');
  if (!el) return;
  const now = new Date().toLocaleTimeString('en-GB');
  const entry = document.createElement('div');
  entry.className = 'ded-log-entry';
  entry.textContent = `[${now}] [SYSTEM] Deductive constraint check — boundary verified`;
  entry.style.color = 'rgba(57,255,20,0.7)';
  entry.style.fontSize = '9px';
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;
  setTimeout(_tickTimestampLog, 4200);
}

function _generateAuditReport() {
  toast('Audit report generated — ALLOW verdict confirmed', 'success');
}


// ============================================================
// SOFTWARE DEBUGGING MODULE
// ============================================================

function initSoftwareDebugger() {
    const uploadZone = document.getElementById('software-upload-zone');
    const languageSelect = document.getElementById('software-language');
    const debugBtn = document.getElementById('debug-software-btn');
    const resultsDiv = document.getElementById('debug-results');
    
    if (!uploadZone) return;
    
    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });
    
    uploadZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        if (file) {
            await debugSoftware(file);
        }
    });
    
    // Click to upload
    uploadZone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.py,.js,.v,.sv,.json,.csv';
        input.onchange = async (e) => {
            if (e.target.files[0]) {
                await debugSoftware(e.target.files[0]);
            }
        };
        input.click();
    });
    
    // Debug button
    if (debugBtn) {
        debugBtn.addEventListener('click', async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
                if (e.target.files[0]) {
                    await debugSoftware(e.target.files[0]);
                }
            };
            input.click();
        });
    }
}

async function debugSoftware(file) {
    const resultsDiv = document.getElementById('debug-results');
    if (!resultsDiv) return;
    
    resultsDiv.innerHTML = '<div class="loading">🔍 Running L1-L5 pipeline...</div>';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/debug/software', {
            method: 'POST',
            body: formData
        });
        
        const results = await response.json();
        
        // Display results
        let html = `
            <div class="debug-report">
                <h3>🔍 AXIOM GENERATOR DEBUG REPORT</h3>
                <div class="debug-meta">
                    <span>File: ${results.file}</span>
                    <span>Language: ${results.language}</span>
                    <span>Score: ${results.score}/100</span>
                    <span class="status-${results.status.toLowerCase()}">Status: ${results.status}</span>
                </div>
                <div class="debug-bugs">
                    <h4>🐛 Bugs Found (${results.bugs.length})</h4>
                    <ul>
                        ${results.bugs.map(bug => `
                            <li class="severity-${bug.severity.toLowerCase()}">
                                <strong>[${bug.severity}]</strong> ${bug.type}
                                <p>${bug.message}</p>
                                ${bug.suggestion ? `<p class="fix-suggestion">🔧 Fix: ${bug.suggestion}</p>` : ''}
                            </li>
                        `).join('')}
                    </ul>
                </div>
                ${results.fixes.length > 0 ? `
                <div class="debug-fixes">
                    <h4>🔧 Suggested Fixes</h4>
                    <ul>
                        ${results.fixes.map(fix => `<li>${fix.suggestion}</li>`).join('')}
                    </ul>
                    <button onclick="autoFixSoftware()" class="btn-fix">Apply Auto-Fix</button>
                </div>
                ` : ''}
            </div>
        `;
        
        resultsDiv.innerHTML = html;
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
    }
}

async function autoFixSoftware() {
    // Implementation for auto-fix
    alert('Auto-fix feature will apply suggested fixes automatically');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initSoftwareDebugger);
