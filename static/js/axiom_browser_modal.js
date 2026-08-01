/**
 * Module: axiom_browser_modal.js
 * Version: 2.2.0
 * Description: Modular Axiom Browser — HITL Manual Selection Interface.
 *   v2.2: Added solver_results key to _confirm() payload to prevent
 *         XAI Narrator crashes on downstream ONTOLOGY_CLASSIFIED consumers.
 *         All interactive elements now carry data-testid DFT hooks for E2E.
 *         Writes a #dft-axiom-browser sentinel for Playwright assertions.
 *   Activated by: window.AxiomBrowserModal.show(onConfirm, onCancel)
 *              OR window event 'hitl:open' with detail.reason === 'MANUAL_SELECTION'
 *
 *   500ms hover card shows 4 sections:
 *     A  ◈ WHERE IT IS APPLIED (domain context, cyan)
 *     B  ◈ MATHEMATICAL STATEMENT + VARIABLE LEGEND (green / gold)
 *     C  ◈ HOW IT WORKS (mechanism from statement, grey)
 *     D  ◈ CALCULATION MEANING (result interpretation, dim)
 *
 * Rule 02: ≤400 lines | Rule 03: BUS emit | Rule 04: E-code logging
 * Rule 06: Exposes register(registry) for ComponentRegistry
 */
'use strict';
(function (W) {

    /* ── §1 Variable symbol dictionary ──────────────────────────────────────── */
    const SYM = {
        'σ': ['Stress', 'MPa'], 'ε': ['Strain', 'dimensionless'], 'E': ['Elastic modulus', 'GPa'],
        'Vf': ['Fiber volume fraction', '%'], 'V_f': ['Fiber volume fraction', '%'],
        'Tg': ['Glass transition temperature', '°C'], 'ILSS': ['Interlaminar Shear Strength', 'MPa'],
        'P': ['Applied load', 'kN'], 'F': ['Force', 'N'], 'N': ['Life cycles / load factor', '—'],
        'POD': ['Probability of Detection (90/95 rule)', '%'], 'a': ['Flaw / crack size', 'mm'],
        'α': ['False-positive rate threshold', '—'], 'M_∞': ['Equilibrium moisture absorption', 'wt%'],
        'S': ['Stress amplitude (S–N curve)', 'MPa'], 'T': ['Temperature', '°C'],
        'K': ['Stress intensity factor', 'MPa√m'], 'G': ['Energy release rate', 'J/m²'],
        'R': ['Stress ratio σ_min/σ_max', '—'], 'θ': ['Ply orientation angle', '°'],
        'MRL': ['Manufacturing Readiness Level', '1–9'], 'GR&R': ['Gauge R&R', '%'],
        'Vcc': ['Supply voltage', 'V'], 'Imax': ['Max current draw', 'A'],
        'Z': ['Impedance', 'Ω'], 'BER': ['Bit Error Rate', '—'],
        'MTBF': ['Mean Time Between Failures', 'h'], 'ψ': ['Wave function', 'quantum'],
        'ℏ': ['Reduced Planck constant', 'J·s'], 'ω': ['Angular frequency', 'rad/s'],
        'λ': ['Wavelength / failure rate', 'm or h⁻¹'], 'μ': ['Mean / friction coefficient', '—'],
    };

    /* ── §2 Domain application context (WHERE each domain is used) ─────────── */
    const DOM_APP = {
        COMPOSITE: 'Composite structure qualification and coupon testing in aerospace manufacturing.',
        AEROSPACE: 'Aerospace structure design, certification, and MRO compliance assessment.',
        MATERIALS: 'Material characterization during procurement, incoming inspection, and CAPA.',
        STRUCTURAL: 'Structural integrity reviews for primary and secondary load-bearing members.',
        NDT: 'Non-destructive testing of bonded and laminate structures for flaw detection.',
        AIRWORTHINESS: 'EASA / FAA type certification, continued airworthiness, and DO-178C compliance.',
        ELECTRONICS: 'PCB design review, EMC compliance, and electronic subsystem qualification.',
        FIRMWARE: 'Embedded RTOS code review, safety-critical firmware certification.',
        SOFTWARE: 'Software safety analysis (IEC 62443, DO-178C, MISRA-C compliance).',
        THERMAL: 'Thermal margin analysis for PCB and composite structure heat management.',
        POWER: 'Power integrity verification across supply rails in mixed-signal systems.',
        RTL: 'RTL synthesis checks for FPGA/ASIC digital logic compliance.',
        MANUFACTURING: 'Manufacturing process control under AMS, NADCAP, and EN standards.',
        INSPECTION: 'In-process and final inspection protocols per quality plans.',
        SECURITY: 'Cybersecurity posture assessment for OT/IT networked systems.',
        IOT: 'IoT device resilience and secure-by-design evaluation.',
    };

    /* ── §3 Calculation meaning templates ──────────────────────────────────── */
    const CALC_MEANING = {
        materials_science: 'The result indicates whether the measured material property falls within the certified allowable range. A PASS means the sample meets specification; FAIL triggers CAPA and possible batch rejection.',
        structural_mechanics: 'The output is a factor of safety (FoS) or threshold comparison. Values above the floor confirm structural adequacy; values below flag a critical nonconformance.',
        aero_mfg: 'The metric validates whether the manufacturing process is in statistical control per the applicable standard. Out-of-spec results require process hold and root-cause analysis.',
        ndt_inspection: 'The output is a binary pass/fail against the accept/reject criterion. Detection below the threshold means the component cannot be released for service.',
        airworthiness: 'The compliance output maps each requirement to evidence. Missing evidence or non-compliant items are flagged as open findings requiring disposition before release.',
        causality: 'The score measures causal consistency of system behaviour. Low scores indicate potential hidden dependencies or race conditions.',
        determinism: 'The analysis checks whether outputs are uniquely determined by inputs. Non-determinism findings require coverage analysis and test-vector augmentation.',
        electronics: 'The result checks signal integrity, timing margins, or power budgets against design limits. Violations indicate potential field failures under worst-case conditions.',
        firmware: 'The check ensures firmware meets safety and security coding standards. Failures indicate code paths that could lead to undefined behaviour in production.',
        software: 'The assessment verifies code coverage and static analysis findings against the safety integrity level requirements. Failures require code rework and regression.',
    };

    /* ── §4 Domain colour coding (Sovereign palette only) ───────────────────── */
    const DOM_C = {
        COMPOSITE: '#00C853', AEROSPACE: '#00D4FF', MATERIALS: '#00C853', STRUCTURAL: '#D4AF37',
        NDT: '#FF9F00', AIRWORTHINESS: '#ff6b35', ELECTRONICS: '#a78bfa', FIRMWARE: '#f472b6',
        SOFTWARE: '#22d3ee', RTL: '#a78bfa', IOT: '#10b981', THERMAL: '#fbbf24', POWER: '#f59e0b',
        PHYSICS: '#6366f1', PCB: '#e879f9', FPGA: '#8b5cf6', SECURITY: '#ef4444', QUALITY: '#84cc16',
        MANUFACTURING: '#2dd4bf', INSPECTION: '#fb923c', CONTRACT: '#D4AF37', GENERAL: '#555',
    };
    const SEV_C = { CRITICAL: '#ff4444', HIGH: '#D4AF37', MEDIUM: '#888', LOW: '#555' };

    /* ── §5 i18n helper ─────────────────────────────────────────────────────── */
    const _t = (k, fb) => (W.SovereignI18n ? W.SovereignI18n.t(k) : (fb || k));

    /* ── §6 CSS injection ───────────────────────────────────────────────────── */
    function _css() {
        if (W.document.getElementById('abm-css2')) return;
        const s = W.document.createElement('style'); s.id = 'abm-css2';
        s.textContent = `
#abm-ov{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;font-family: Calibri, 'Microsoft JhengHei', sans-serif;font-size: 12px;animation:abm-fi .18s ease}
#abm-box{display:flex;flex-direction:column;width:min(1100px,96vw);max-height:90vh;background:#000000;border:1px solid #D4AF37;border-radius:10px;box-shadow:0 0 60px rgba(212,175,55,.18),0 24px 80px rgba(0,0,0,.95);overflow:hidden}
@keyframes abm-fi{from{opacity:0}to{opacity:1}}
#abm-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 22px 12px;border-bottom:1px solid #1a1a1a;background:#000000;flex-shrink:0;border-radius:10px 10px 0 0}
#abm-hdr h2{color:#00C853;font-size: 12px;letter-spacing:2px;margin:0;font-weight:700}
#abm-close-btn{background:none;border:1px solid #2a2a2a;color:#555;cursor:pointer;padding:4px 12px;border-radius:3px;font-family: Calibri, 'Microsoft JhengHei', sans-serif;font-size: 12px;letter-spacing:1px;transition:all .15s}
#abm-close-btn:hover{border-color:#ff4444;color:#ff4444}
#abm-tabs{display:flex;gap:5px;padding:9px 18px;background:#000000;border-bottom:1px solid #111;flex-wrap:wrap;flex-shrink:0}
.abm-tab{padding:3px 9px;border:1px solid #2a2a2a;border-radius:2px;cursor:pointer;color:#444;font-size: 12px;letter-spacing:.8px;transition:all .15s;background:none;font-family: Calibri, 'Microsoft JhengHei', sans-serif}
.abm-tab:hover{color:#888;border-color:#444}
.abm-tab.on{color:#00C853;border-color:#00C853;background:rgba(0,200,83,.06)}
#abm-body{display:flex;flex:1;overflow:hidden;min-height:0}
#abm-list{flex:1;overflow-y:auto;padding:4px 0}
#abm-list::-webkit-scrollbar{width:3px}#abm-list::-webkit-scrollbar-thumb{background:#1a1a1a}
.abm-row{display:flex;align-items:center;gap:8px;padding:7px 16px;cursor:pointer;border-left:3px solid transparent;transition:background .1s,border-color .1s;user-select:none}
.abm-row:hover{background:rgba(255,255,255,.03);border-left-color:#2a2a2a}
.abm-row.on{background:rgba(0,200,83,.06);border-left-color:#00C853}
.abm-row.on .abm-nm{color:#00C853}
.abm-ck{width:13px;height:13px;border:1px solid #2a2a2a;border-radius:2px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size: 12px;color:#000;transition:all .1s}
.abm-row.on .abm-ck{background:#00C853;border-color:#00C853}
.abm-aid{color:#333;font-size: 12px;min-width:72px;flex-shrink:0}
.abm-nm{color:#888;flex:1;font-size: 12px}
.abm-sev{font-size: 12px;padding:1px 4px;border-radius:2px;border:1px solid;flex-shrink:0}
#abm-rp{width:240px;border-left:1px solid #111;display:flex;flex-direction:column;background:#000000;flex-shrink:0}
#abm-rc{padding:13px 14px;border-bottom:1px solid #111;font-size: 12px;color:#00C853;letter-spacing:.8px}
#abm-rl{flex:1;overflow-y:auto;padding:6px}
.abm-chip{display:flex;align-items:center;justify-content:space-between;padding:5px 7px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:2px;margin-bottom:3px;font-size: 12px;color:#888}
.abm-chip button{background:none;border:none;color:#333;cursor:pointer;font-size: 12px;padding:0 2px;transition:color .1s}
.abm-chip button:hover{color:#ff4444}
#abm-ft{display:flex;align-items:center;gap:8px;padding:11px 18px;border-top:1px solid #1a1a1a;background:#000000;flex-shrink:0;border-radius:0 0 10px 10px}
#abm-ft .abm-hint{color:#2a2a2a;font-size: 12px;flex:1;letter-spacing:.3px}
.abm-fbtn{padding:6px 14px;border-radius:2px;cursor:pointer;font-family: Calibri, 'Microsoft JhengHei', sans-serif;font-size: 12px;letter-spacing:1px;transition:all .15s;border:1px solid}
#abm-clr{background:none;border-color:#1a1a1a;color:#333}#abm-clr:hover{border-color:#ff4444;color:#ff4444}
#abm-cnl{background:none;border-color:#1a1a1a;color:#444}#abm-cnl:hover{border-color:#555;color:#777}
#abm-ok{background:#00C853;border-color:#00C853;color:#000;font-weight:900}#abm-ok:hover{background:#00bf63;border-color:#00bf63}
#abm-ok:disabled{background:#1a1a1a;border-color:#1a1a1a;color:#333;cursor:not-allowed}
.abm-empty{padding:20px;color:#2a2a2a;text-align:center;font-size: 12px}
/* ─ Centered 4-section reference card (500ms hover) ─────────────────── */
#abm-card-ov{position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;animation:abm-fi .12s ease}
#abm-card{width:min(660px,94vw);max-height:88vh;overflow-y:auto;background:#000000;border:1px solid #D4AF37;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.9),0 0 30px rgba(212,175,55,.12);display:flex;flex-direction:column}
#abm-card::-webkit-scrollbar{width:3px}#abm-card::-webkit-scrollbar-thumb{background:#1a1a1a}
.amc-hdr{padding:16px 20px 14px;border-bottom:1px solid #111;background:#000000}
.amc-id{font-size: 12px;color:#333;letter-spacing:1.5px;margin-bottom:6px;display:flex;gap:8px;flex-wrap:wrap}
.amc-badge{padding:1px 6px;border-radius:2px;border:1px solid;font-size: 12px}
.amc-name{font-size: 12px;color:#eee;font-weight:700;line-height:1.3}
.amc-body{padding:16px 20px}
.amc-sec{font-size: 12px;letter-spacing:2px;font-weight:700;margin:14px 0 6px;display:flex;align-items:center;gap:6px}
.amc-sec::after{content:'';flex:1;height:1px;background:#111}
.amc-eq{background:#020d02;border:1px solid #172a17;border-radius:3px;padding:12px 16px;font-size: 12px;color:#00C853;line-height:2;letter-spacing:.5px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.amc-vars{display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;margin-top:4px}
.amc-vs{color:#D4AF37;font-size: 12px;font-weight:700;white-space:nowrap}
.amc-vd{color:#666;font-size: 12px;line-height:1.5}
.amc-vu{color:#333;font-size: 12px;text-align:right;white-space:nowrap}
.amc-stmt{font-size: 12px;color:#666;line-height:1.8}
.amc-doms{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.amc-dom{font-size: 12px;padding:2px 7px;border-radius:2px}
.amc-kws{font-size: 12px;color:#222;line-height:2;margin-top:3px}
.amc-ft{display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #0a0a0a;background:#000000;flex-shrink:0}
.amc-btn-sel{padding:7px 18px;background:#00C853;color:#000;border:1px solid #00C853;border-radius:3px;font-family: Calibri, 'Microsoft JhengHei', sans-serif;font-size: 12px;font-weight:900;letter-spacing:1px;cursor:pointer;transition:all .15s}
.amc-btn-sel:hover{background:#00bf63;border-color:#00bf63}
.amc-btn-sel.on{background:#0a0a0a;color:#00C853;border-color:#00C853}
.amc-btn-cls{padding:7px 14px;background:none;color:#444;border:1px solid #2a2a2a;border-radius:3px;font-family: Calibri, 'Microsoft JhengHei', sans-serif;font-size: 12px;letter-spacing:1px;cursor:pointer;transition:all .15s}
.amc-btn-cls:hover{border-color:#555;color:#777}`;
        W.document.head.appendChild(s);
    }

    /* ── §7 State ────────────────────────────────────────────────────────────── */
    let _ov = null, _cardOv = null, _hTmr = null, _sel = new Set(), _dom = 'ALL', _onOk = null, _onCnl = null;

    /* ── §8 Centered reference card ─────────────────────────────────────────── */
    function _showCard(ax) {
        _css();          /* Ensure position:fixed overlay CSS is always injected */
        _dismissCard();
        const sc = SEV_C[ax.severity] || '#555';
        const f = ax._formula || 'f(x) ∈ Ω_valid';
        const doms = ax.domain || [];
        const stmt = ax.statement || '—';
        const cat = (ax.category || '').toLowerCase();
        const kws = (ax.keywords || []).slice(0, 12);

        /* Variable legend — symbols present in formula */
        const vars = Object.entries(SYM).filter(([k]) => f.includes(k))
            .map(([k, [desc, unit]]) => ({ k, desc, unit }));

        /* Standards keywords from kws array */
        const stds = kws.filter(w => /^[A-Z]{2,}[\d\s\-D]*\d/.test(w)
            || /^(ASTM|EN |AMS|NADCAP|DO-|AS\d|EASA|FAA|ECSS|IPC|MIL-)/.test(w));

        /* A: WHERE APPLIED */
        const appLines = doms.map(d => DOM_APP[d]).filter(Boolean);
        const application = appLines.length ? appLines[0]
            : `Applied in ${doms.join(', ') || 'general compliance'} compliance assessment.`;

        /* C: HOW IT WORKS — split statement into ≤2 sentences */
        const sentences = stmt.split(/[;\n]/).map(s => s.trim()).filter(s => s.length > 5);
        const howItWorks = sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '…' : '.');

        /* D: CALCULATION MEANING */
        const calcMeaning = CALC_MEANING[cat]
            || `The evaluation yields a PASS / FAIL verdict. ${ax.severity === 'CRITICAL'
                ? 'A FAIL is a blocking nonconformance requiring immediate disposition.'
                : 'A FAIL flags a potential nonconformance requiring investigation.'}`;

        const isSel = _sel.has(ax.id);
        const domsHtml = doms.map(d => {
            const c = DOM_C[d] || '#444';
            return `<span class="amc-dom" style="background:${c}18;border:1px solid ${c}44;color:${c}">${d}</span>`;
        }).join('');

        const varsHtml = vars.length
            ? `<div class="amc-vars">${vars.map(v =>
                `<span class="amc-vs">${v.k}</span><span class="amc-vd">${v.desc}</span><span class="amc-vu">${v.unit}</span>`
            ).join('')}</div>`
            : `<span style="color:#2a2a2a;font-size: 12px">See compliance rule below for parameter definitions.</span>`;

        _cardOv = W.document.createElement('div');
        _cardOv.id = 'abm-card-ov';
        _cardOv.innerHTML = `
<div id="abm-card">
  <div class="amc-hdr">
    <div class="amc-id">
      <span class="amc-badge" style="color:${sc};border-color:${sc}44;background:${sc}0d">${ax.severity || '?'}</span>
      <span class="amc-badge" style="color:#555;border-color:#2a2a2a">${ax.id}</span>
      <span class="amc-badge" style="color:#555;border-color:#2a2a2a">${cat.replace(/_/g, ' ').toUpperCase()}</span>
      <span class="amc-badge" style="color:#333;border-color:#1a1a1a">${ax.level || '?'} · ${ax.type || '?'}</span>
    </div>
    <div class="amc-name">${ax.name}</div>
  </div>
  <div class="amc-body">

    <div class="amc-sec" style="color:#00D4FF">${_t('browser.application', '◈ WHERE IT IS APPLIED')}</div>
    <div class="amc-stmt" style="color:#4a8fa0">${application}</div>
    <div class="amc-doms" style="margin-top:6px">${domsHtml}</div>

    <div class="amc-sec" style="color:#00C853">${_t('browser.formula', '◈ MATHEMATICAL STATEMENT')}</div>
    <div class="amc-eq">${f}</div>
    <div class="amc-sec" style="color:#D4AF37;margin-top:10px">${_t('browser.vars', '◈ VARIABLE LEGEND')}</div>
    ${varsHtml}

    <div class="amc-sec" style="color:#888">${_t('browser.mechanism', '◈ HOW IT WORKS')}</div>
    <div class="amc-stmt">${howItWorks}</div>

    <div class="amc-sec" style="color:#555">${_t('browser.calc_meaning', '◈ CALCULATION MEANING')}</div>
    <div class="amc-stmt" style="color:#555">${calcMeaning}</div>

    ${stds.length ? `<div class="amc-sec" style="color:#333">APPLICABLE STANDARDS</div>
    <div class="amc-kws">${stds.slice(0, 8).join(' &nbsp;·&nbsp; ')}</div>` : ''}
    ${kws.length ? `<div class="amc-kws" style="margin-top:10px;font-size: 12px">🔑 ${kws.slice(0, 10).join(' · ')}</div>` : ''}
  </div>
  <div class="amc-ft">
    <button class="amc-btn-cls" id="amc-cls">✕ ${_t('common.close', 'CLOSE')}</button>
    <button class="amc-btn-sel${isSel ? ' on' : ''}" id="amc-sel">
      ${isSel ? '✓ SELECTED' : _t('browser.select_btn', '⊕ SELECT THIS AXIOM')}
    </button>
  </div>
</div>`;

        W.document.body.appendChild(_cardOv);
        _cardOv.addEventListener('click', e => { if (e.target === _cardOv) _dismissCard(); });
        _cardOv.querySelector('#amc-cls').onclick = _dismissCard;
        _cardOv.querySelector('#amc-sel').onclick = () => {
            _sel.has(ax.id) ? _sel.delete(ax.id) : _sel.add(ax.id);
            _dismissCard(); _render(_dom);
        };
    }

    function _dismissCard() { if (_cardOv) { _cardOv.remove(); _cardOv = null; } }

    /* Expose card renderer globally so telemetry panels outside axiom browser can hover-preview */
    W._sovereignShowAxiomCard = _showCard;

    /* ── §9 Axiom list render ────────────────────────────────────────────────── */
    function _render(dom) {
        _dom = dom;
        const db = W.SOVEREIGN_AXIOM_DB || [];
        const rows = dom === 'ALL' ? db : db.filter(ax =>
            (ax.domain || []).includes(dom) ||
            (ax.category || '').replace(/_/g, ' ').toUpperCase().includes(dom.replace(/_/g, ' '))
        );
        const cont = W.document.getElementById('abm-list');
        if (!cont) return;
        cont.setAttribute('data-testid', 'abm-axiom-list');
        cont.setAttribute('data-domain', dom);
        cont.innerHTML = rows.length
            ? rows.map(ax => {
                const sc = SEV_C[ax.severity] || '#555';
                return `<div class="abm-row${_sel.has(ax.id) ? ' on' : ''}" data-aid="${ax.id}"
                    data-testid="abm-row-${ax.id}"
                    data-selected="${_sel.has(ax.id)}">
                <span class="abm-ck">${_sel.has(ax.id) ? '✓' : ''}</span>
                <span class="abm-aid">${ax.id}</span>
                <span class="abm-nm">${ax.name}</span>
                <span class="abm-sev" style="color:${sc};border-color:${sc}33;background:${sc}0d">${ax.severity || '?'}</span>
            </div>`;
            }).join('')
            : `<div class="abm-empty" data-testid="abm-empty">${_t('browser.none', 'No axioms for this domain')}</div>`;
        _updatePanel();
    }

    function _updatePanel() {
        const db = W.SOVEREIGN_AXIOM_DB || [];
        const sels = db.filter(a => _sel.has(a.id));
        const rc = W.document.getElementById('abm-rc');
        const rl = W.document.getElementById('abm-rl');
        const ok = W.document.getElementById('abm-ok');
        if (rc) rc.textContent = `${_sel.size} ${_t('browser.selected', 'AXIOMS SELECTED')}`;
        if (rl) rl.innerHTML = sels.length
            ? sels.map(a => `<div class="abm-chip"><span>${a.id} — ${a.name.slice(0, 26)}${a.name.length > 26 ? '…' : ''}</span>
            <button data-rm="${a.id}">✕</button></div>`).join('')
            : `<div class="abm-empty" style="padding:10px">—</div>`;
        if (ok) {
            ok.disabled = !_sel.size;
            ok.textContent = `${_t('browser.confirm', 'CONFIRM SELECTION')} (${_sel.size})`;
            ok.setAttribute('data-testid', 'abm-confirm-btn');
            ok.setAttribute('data-selection-count', String(_sel.size));
        }
    }

    /* ── §10 Domain tab bar ──────────────────────────────────────────────────── */
    function _tabs() {
        const db = W.SOVEREIGN_AXIOM_DB || [];
        const set = new Set(['ALL']);
        db.forEach(ax => (ax.domain || []).forEach(d => set.add(d)));
        return [...set].map(d =>
            `<button class="abm-tab${d === 'ALL' ? ' on' : ''}" data-dom="${d}">${d}</button>`
        ).join('');
    }

    /* ── §11 Event wiring ────────────────────────────────────────────────────── */
    function _wire() {
        _ov.querySelectorAll('.abm-tab').forEach(tab => {
            tab.onclick = () => {
                _ov.querySelectorAll('.abm-tab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on'); _render(tab.dataset.dom);
            };
        });
        const list = W.document.getElementById('abm-list');
        list.addEventListener('click', e => {
            const row = e.target.closest('.abm-row'); if (!row) return;
            const id = row.dataset.aid;
            _sel.has(id) ? _sel.delete(id) : _sel.add(id); _render(_dom);
        });
        list.addEventListener('mouseover', e => {
            const row = e.target.closest('.abm-row'); if (!row) return;
            clearTimeout(_hTmr);
            _hTmr = setTimeout(() => {
                const ax = (W.SOVEREIGN_AXIOM_DB || []).find(a => a.id === row.dataset.aid);
                if (ax) _showCard(ax);
            }, 500);
        });
        list.addEventListener('mouseleave', () => clearTimeout(_hTmr));
        W.document.getElementById('abm-rl').addEventListener('click', e => {
            if (e.target.dataset.rm) { _sel.delete(e.target.dataset.rm); _render(_dom); }
        });
        W.document.getElementById('abm-clr').onclick = () => { _sel.clear(); _render(_dom); };
        W.document.getElementById('abm-cnl').onclick = AxiomBrowserModal.hide;
        W.document.getElementById('abm-close-btn').onclick = AxiomBrowserModal.hide;
        W.document.getElementById('abm-ok').onclick = _confirm;
        W.addEventListener('keydown', _onKey);
    }

    /* ── §12 Confirm ─────────────────────────────────────────────────────────── */
    function _confirm() {
        const db = W.SOVEREIGN_AXIOM_DB || [];
        const sels = db.filter(a => _sel.has(a.id))
            .map(a => ({ ...a, score: 1.0, _tier: 'ELECTED', _formula: a._formula || 'f(x) ∈ Ω_valid' }));
        AxiomBrowserModal.hide();
        try {
            const tiered = {
                selected: sels, candidate: [], standby: db.filter(a => !_sel.has(a.id)),
                electionMode: 'MANUAL', certaintygap: 1.0,
                primaryDomain: (sels[0]?.domain || ['MANUAL'])[0],
                detectedDomains: [...new Set(sels.flatMap(a => a.domain || []))],
                // ── v2.2: solver_results key prevents XAI Narrator null-guard crash ──
                // Python SAA will populate this array; manual confirm seeds it empty
                // so downstream modules never receive undefined.
                solver_results: sels.map(a => ({
                    axiom_id:         a.id,
                    solver_direction: a.solver_direction || 'UNDETERMINED',
                    required_value:   a.required_value   ?? null,
                    compliance:       a.compliance       || 'PENDING',
                    formula:          a._formula         || 'f(x) ∈ Ω_valid',
                }))
            };
            try {
                sessionStorage.setItem('sovereign_axiom_match', JSON.stringify({
                    file: '[MANUAL]', ts: Date.now(), electionMode: 'MANUAL',
                    selectedIds: sels.map(a => a.id), candidateIds: [],
                    detectedDomains: tiered.detectedDomains, primaryDomain: tiered.primaryDomain, certaintygap: 1.0
                }));
            } catch (_) { }

            // ── DFT sentinel ──
            _writeDFTConfirm(tiered);

            ['tele-body-op03', 'tele-body', 'axiom-panel-op01'].forEach(pid => {
                if (W.document.getElementById(pid) && W.AxiomMatcher?.renderTelemetry)
                    W.AxiomMatcher.renderTelemetry(pid, tiered, true);
            });
            if (W.SovereignBUS) W.SovereignBUS.emit('ONTOLOGY_CLASSIFIED', {
                sender: 'axiom_browser_modal', message_type: 'ONTOLOGY_CLASSIFIED', payload: tiered
            });
            if (typeof _onOk === 'function') _onOk(sels);
        } catch (err) { console.error('E003: [AxiomBrowser] confirm error:', err); }
    }

    /**
     * Write a DFT sentinel element for Playwright / E2E test assertions.
     * @param {Object} tiered - Confirmed tiered payload
     * @private
     */
    function _writeDFTConfirm(tiered) {
        try {
            let el = W.document.getElementById('dft-axiom-browser');
            if (!el) {
                el = W.document.createElement('span');
                el.id = 'dft-axiom-browser';
                el.setAttribute('data-testid', 'axiom-browser-confirm-state');
                el.style.cssText = 'display:none;position:absolute;pointer-events:none';
                el.setAttribute('aria-hidden', 'true');
                W.document.body?.appendChild(el);
            }
            el.setAttribute('data-election-mode',   tiered.electionMode);
            el.setAttribute('data-selected-count',  String((tiered.selected || []).length));
            el.setAttribute('data-primary-domain',  tiered.primaryDomain || '');
            el.setAttribute('data-solver-results',  String((tiered.solver_results || []).length));
            el.setAttribute('data-confirmed',        'true');
        } catch (_) { /* non-critical DFT helper — swallow silently */ }
    }

    function _onKey(e) {
        if (e.key === 'Escape') { if (_cardOv) { _dismissCard(); } else { AxiomBrowserModal.hide(); } }
    }

    /* ── §13 Public API ──────────────────────────────────────────────────────── */
    const AxiomBrowserModal = {
        show(onConfirm, onCancel) {
            try {
                _css();
                _onOk = onConfirm; _onCnl = onCancel; _sel.clear(); _dom = 'ALL';
                _ov = W.document.createElement('div'); _ov.id = 'abm-ov';
                _ov.innerHTML = `
            <div id="abm-box">
              <div id="abm-hdr">
                <h2>${_t('browser.title', '⊛ SOVEREIGN AXIOM BROWSER — MANUAL SELECTION')}</h2>
                <button id="abm-close-btn">${_t('common.close', 'CLOSE')} ✕</button>
              </div>
              <div id="abm-tabs">${_tabs()}</div>
              <div id="abm-body">
                <div id="abm-list"></div>
                <div id="abm-rp">
                  <div id="abm-rc">0 ${_t('browser.selected', 'AXIOMS SELECTED')}</div>
                  <div id="abm-rl"></div>
                </div>
              </div>
              <div id="abm-ft">
                <span class="abm-hint">${_t('browser.hint', 'Hover 500ms for details · Click to select')}</span>
                <button class="abm-fbtn" id="abm-clr" data-testid="abm-clear-btn">${_t('browser.clear', 'CLEAR')}</button>
                <button class="abm-fbtn" id="abm-cnl" data-testid="abm-cancel-btn">${_t('hitl.cancel', 'CANCEL')}</button>
                <button class="abm-fbtn" id="abm-ok" disabled
                        data-testid="abm-confirm-btn"
                        data-selection-count="0">${_t('browser.confirm', 'CONFIRM SELECTION')} (0)</button>
              </div>
            </div>`;
                W.document.body.appendChild(_ov);
                _render('ALL');
                _wire();
            } catch (err) { console.error('E003: [AxiomBrowser] show error:', err); }
        },
        hide() {
            clearTimeout(_hTmr); _dismissCard();
            W.removeEventListener('keydown', _onKey);
            if (_ov) { _ov.remove(); _ov = null; }
            if (typeof _onCnl === 'function') _onCnl();
            _onOk = null; _onCnl = null;
        },
        register(registry) {
            if (registry?.on) registry.on('modal:axiom-browse', () => AxiomBrowserModal.show());
        }
    };
    W.AxiomBrowserModal = AxiomBrowserModal;

    /* ── §14 Auto-intercept hitl:open MANUAL_SELECTION ──────────────────────── */
    W.addEventListener('hitl:open', ev => {
        if ((ev.detail?.reason || '') !== 'MANUAL_SELECTION') return;
        ev.stopImmediatePropagation();
        AxiomBrowserModal.show(
            sels => {
                console.log(`[AxiomBrowser] ${sels.length} axioms confirmed`);
                if (W.SovereignI18n) W.SovereignI18n.refresh();
            },
            () => console.log('[AxiomBrowser] cancelled')
        );
    });

}(window));
