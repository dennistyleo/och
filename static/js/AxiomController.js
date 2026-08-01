/* ══════════════════════════════════════════════════════════
   Module: AxiomController.js
   Version: 2.1.0
   Description: Manages axiom selection, filtering, scoring,
                and the Sovereign Audit detail panel.
                Implements Axiom Democracy Scoring Formula.
                v2.1: Subscribes to ONTOLOGY_CLASSIFIED to surface
                      solver verdicts (Forward/Inverse/Undetermined),
                      required_value, and compliance status.
                      All modes (DEDUCTION, INDUCTION, ABD_*)
                      produce formula-manipulation "solutions" (求解).
   Standards: ISO/IEC 25010 (Functional Suitability, Reliability)
              CMMI Level 5 (Quantitative Management)
              ISO 26262 / DO-178C (Safety-critical axiom ranking)
   Rule 01: Deterministic — same inputs → same Winning_Score.
   Rule 03: EVENT-DRIVEN via SovereignBUS only.
   Rule 04: All errors caught, logged with E-codes.
   DFT:     data-testid attributes injected for E2E coverage.
   ══════════════════════════════════════════════════════════ */

import { AXIOM_INDEX }                                    from './data/axiomData.js';
import { filterAxiomsForParadigm, resolveParadigmBucket } from './core/AxiomRepoFilter.js';

/* ── DFT sentinel writer ──────────────────────────────────────────────────── */
const DFT_CONTROLLER_ID = 'dft-axiom-controller';

function _writeDFT(attrs = {}) {
    let el = document.getElementById(DFT_CONTROLLER_ID);
    if (!el) {
        el = document.createElement('span');
        el.id = DFT_CONTROLLER_ID;
        el.setAttribute('data-testid', 'axiom-controller-state');
        el.style.cssText = 'display:none;position:absolute;pointer-events:none';
        el.setAttribute('aria-hidden', 'true');
        document.body?.appendChild(el);
    }
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(`data-${k}`, String(v)));
}
/* ─────────────────────────────────────────────────────────────────────────── */

export class AxiomController {
    /**
     * @param {Object} bus      - SovereignBUS singleton
     * @param {Object} registry - ComponentRegistry singleton
     */
    constructor(bus, registry) {
        this.bus      = bus;
        this.registry = registry;

        this._state = {
            selectedAxiomId: null,
            activeLayer:     1,
            filterStatus:    'all',
            searchQuery:     '',
            paradigm:        'INDUCTION',  // Updated on ENGINE:BOOT
            solverResults:   null,         // Last ONTOLOGY_CLASSIFIED payload
        };

        this._registerHandlers();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 1: Event Wiring
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Subscribe to typed BUS events only.
     * @private
     */
    _registerHandlers() {
        // When engine boots, update paradigm context and re-render
        this.bus.on('ENGINE:BOOT', ({ paradigm }) => {
            this._state.paradigm = paradigm || 'INDUCTION';
            _writeDFT({ paradigm: this._state.paradigm, event: 'ENGINE_BOOT' });
            this.renderTree();
        });

        // ── NEW v2.1: Solver result from SAA / Python backend ──────────────
        // Emitted by axiom_browser_modal._confirm(), by the Python SAA agent,
        // or by any module that resolves an axiom formula for solution (求解).
        this.bus.on('ONTOLOGY_CLASSIFIED', (msg) => {
            try {
                const payload = msg?.payload ?? msg;
                this._state.solverResults = payload;
                _writeDFT({
                    event:         'ONTOLOGY_CLASSIFIED',
                    solver_mode:   payload.electionMode   || 'UNKNOWN',
                    solver_domain: payload.primaryDomain  || 'UNKNOWN',
                    solver_count:  (payload.selected || []).length,
                });
                this._renderSolverPanel(payload);
            } catch (err) {
                console.error('E003: AxiomController ONTOLOGY_CLASSIFIED handler:', err);
            }
        });

        // Row clicks via event delegation — no direct querySelector coupling
        document.addEventListener('click', (e) => {
            const row = e.target.closest('.axiom-row');
            if (row?.dataset?.axiomId) {
                this.selectAxiom(row.dataset.axiomId);
            }

            const layerBtn = e.target.closest('.layer-tab-btn');
            if (layerBtn?.dataset?.layer) {
                this.setLayer(parseInt(layerBtn.dataset.layer, 10));
            }
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 2: Axiom Democracy Scoring Formula
    // Spec ref: spec/00_global_standards.md §Axiom Democracy
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Calculate the Winning_Score for a single axiom.
     * Formula: (Relevance × 0.40) + (Confidence × 0.30) +
     *          (Historical_Success × 0.20) + ((1 - Cost) × 0.10)
     *
     * @param {Object} axiom       - Axiom record from AXIOM_INDEX
     * @param {Object} fingerprint - Data fingerprint from RAG (domain_hints array)
     * @param {string} domain      - Active domain (e.g. 'AEROSPACE')
     * @returns {Object} { winning_score, breakdown }
     */
    calculateWinningScore(axiom, fingerprint = {}, domain = 'GENERAL') {
        try {
            const relevance         = this._calcRelevance(axiom, fingerprint, domain);
            const confidence        = parseFloat(axiom.confidence_score || 0);
            const historicalSuccess = this._calcHistoricalSuccess(axiom, domain);
            const costAdjusted      = 1 - parseFloat(axiom.computational_cost || 0);

            const winning_score =
                (relevance         * 0.40) +
                (confidence        * 0.30) +
                (historicalSuccess * 0.20) +
                (costAdjusted      * 0.10);

            return {
                winning_score: Math.round(winning_score * 1000) / 1000,
                breakdown: {
                    relevance:          Math.round(relevance * 1000) / 1000,
                    confidence:         Math.round(confidence * 1000) / 1000,
                    historical_success: Math.round(historicalSuccess * 1000) / 1000,
                    cost_adjusted:      Math.round(costAdjusted * 1000) / 1000,
                }
            };
        } catch (err) {
            console.error(`E003: AXIOM_SCORE_FAILED — ${axiom?.axiom_id}:`, err);
            return { winning_score: 0, breakdown: {} };
        }
    }

    /**
     * Compute relevance score: cosine similarity proxy between
     * fingerprint domain hints and axiom declared domains.
     * @private
     */
    _calcRelevance(axiom, fingerprint, domain) {
        const axiomDomains = (axiom.domains || []).map(d => d.toUpperCase());
        if (axiomDomains.length === 0) return 0;

        // Direct domain match
        if (axiomDomains.includes(domain.toUpperCase())) return 1.0;

        // Partial match via fingerprint hints
        const hints = (fingerprint.domain_hints || []).map(h => h.toUpperCase());
        const matchCount = hints.filter(h => axiomDomains.includes(h)).length;
        return hints.length > 0 ? matchCount / hints.length : 0;
    }

    /**
     * Look up historical success rate for the given domain.
     * @private
     */
    _calcHistoricalSuccess(axiom, domain) {
        const history = axiom.confidence_history || [];
        const record  = history.find(h =>
            h.domain?.toUpperCase() === domain.toUpperCase()
        );
        return parseFloat(record?.success_rate || 0.5); // Default 0.5 if no history
    }

    /**
     * Rank all eligible axioms by Winning_Score (descending).
     * Filters to top candidates with relevance > 0.60.
     *
     * @param {Array<Object>} axioms    - Filtered axiom list
     * @param {Object}        fingerprint - RAG data fingerprint
     * @param {string}        domain    - Active domain
     * @returns {Array<Object>} Ranked axioms with scores
     */
    rankAxioms(axioms, fingerprint, domain) {
        return axioms
            .map(ax => ({
                ...ax,
                ...this.calculateWinningScore(ax, fingerprint, domain)
            }))
            .filter(ax => ax.breakdown.relevance > 0.60)
            .sort((a, b) => b.winning_score - a.winning_score)
            .slice(0, 5); // Top 5 advance to primary election
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 3: UI Rendering
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** Set filter state and re-render */
    setFilter(filter) {
        this._state.filterStatus = filter;
        this.renderTree();
    }

    /** Set search query and re-render */
    setSearch(query) {
        this._state.searchQuery = (query || '').toLowerCase();
        this.renderTree();
    }

    /** Switch active detail layer */
    setLayer(layer) {
        this._state.activeLayer = layer;
        document.querySelectorAll('.layer-tab-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.layer, 10) === layer);
        });
        this.renderDetail();
    }

    /**
     * Select an axiom and display its detail panel.
     * @param {string} id - Axiom ID
     */
    selectAxiom(id) {
        const ax = AXIOM_INDEX[id];
        if (!ax) {
            console.error(`E001: AXIOM_NOT_FOUND — id=${id}`);
            return;
        }

        this._state.selectedAxiomId = id;
        this._state.activeLayer     = 1;
        _writeDFT({ selected_axiom_id: id });

        document.querySelectorAll('.axiom-row').forEach(r => {
            r.classList.toggle('selected', r.dataset.axiomId === id);
        });

        const panel = document.getElementById('axiom-detail-panel');
        panel?.classList.add('visible');

        this.renderDetail();
        // No 'DATA:AXIOM:SELECTED' — use typed bus event
        // (extend TYPED_EVENTS in bus.js if needed for cross-module use)
    }

    /**
     * Render the axiom tree, filtered by the active paradigm.
     * Supports DEDUCTION, INDUCTION, ABDUCTION, and all ABD sub-modes.
     */
    renderTree() {
        const container = document.getElementById('axiom-tree-container');
        if (!container) return;

        const allAxioms = Object.values(AXIOM_INDEX);
        const paradigmFiltered = filterAxiomsForParadigm(
            allAxioms, this._state.paradigm
        );

        const q      = this._state.searchQuery;
        const status = this._state.filterStatus;

        const visible = paradigmFiltered.filter(ax => {
            if (!ax?.axiom_id) return false;
            const matchesSearch = !q || ax.axiom_id.toLowerCase().includes(q);
            const matchesFilter = status === 'all'
                || ax.layer_1_audit_header?.status === status;
            return matchesSearch && matchesFilter;
        });

        container.setAttribute('data-testid', 'axiom-tree-container');
        container.setAttribute('data-paradigm', this._state.paradigm);
        container.setAttribute('data-axiom-count', String(visible.length));

        container.innerHTML = visible.map(ax => {
            const s = (ax.layer_1_audit_header?.status || 'unknown').toLowerCase();
            return `
                <div class="axiom-row ${this._state.selectedAxiomId === ax.axiom_id ? 'selected' : ''}"
                     data-axiom-id="${ax.axiom_id}"
                     data-testid="axiom-row-${ax.axiom_id}">
                    <span class="axiom-status-dot dot-${s}"></span>
                    <span class="axiom-id">${ax.axiom_id}</span>
                    <span class="axiom-name">${ax.layer_1_audit_header?.name || ''}</span>
                </div>
            `;
        }).join('');
    }

    /** Render the axiom detail panel for the currently selected axiom */
    renderDetail() {
        const ax = AXIOM_INDEX[this._state.selectedAxiomId];
        if (!ax) return;

        const layer   = this._state.activeLayer;
        const content = document.getElementById('layer-content');
        if (!content) return;

        const idEl     = document.getElementById('detail-id');
        const nameEl   = document.getElementById('detail-name');
        const badge    = document.getElementById('detail-status-badge');

        if (idEl)   idEl.textContent   = ax.axiom_id;
        if (nameEl) nameEl.textContent = ax.layer_1_audit_header?.name || '';

        if (badge) {
            badge.textContent = ax.layer_1_audit_header?.status || '';
            badge.className   = `axiom-status-badge ${(ax.layer_1_audit_header?.status || '').toLowerCase()}`;
            badge.setAttribute('data-testid', 'axiom-status-badge');
        }

        if (layer === 1)      content.innerHTML = this._getLayer1Html(ax);
        else if (layer === 2) content.innerHTML = this._getLayer2Html(ax);
        else                  content.innerHTML = this._getLayer3Html(ax);

        if (window.MathJax) window.MathJax.typesetPromise();
    }

    _getLayer1Html(ax) {
        const l1 = ax.layer_1_audit_header;
        return `
            <div class="latex-display" data-testid="layer1-latex">\\( ${l1.expression_latex || ''} \\)</div>
            <div class="axiom-meta" data-testid="layer1-meta">
                <strong>Domain:</strong> ${l1.domain || 'N/A'}<br>
                <strong>Logic:</strong> ${l1.logic_type || 'N/A'}
            </div>
            <div class="pddl-code" data-testid="layer1-pddl">${l1.expression_pddl || ''}</div>
        `;
    }

    _getLayer2Html(ax) {
        const l2 = ax.layer_2_summary;
        if (!l2) return '<p>No causal summary available.</p>';
        return `
            <div class="summary-box" data-testid="layer2-summary">
                <h4>Causal Interpretation</h4>
                <p>${l2.causal_summary || 'Analysis pending...'}</p>
            </div>
        `;
    }

    _getLayer3Html(ax) {
        return '<p data-testid="layer3-placeholder">Layer 3 Full Traceability active.</p>';
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SECTION 4: Solver Verdict Panel (NEW v2.1)
    // Renders backend solver result from ONTOLOGY_CLASSIFIED
    // payload into the detail panel's solver verdict section.
    // Supports all modes: DEDUCTION, INDUCTION, ABD_RFP,
    // ABD_QA, ABD_RCA, ABD_CAUSAL (all produce 求解 solutions).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Render solver verdicts (Forward / Inverse / Undetermined) for
     * each elected axiom into a dedicated solver-verdict container.
     *
     * Expected payload shape (from SAA Python agent or manual confirm):
     * {
     *   selected: [{ id, name, solver_direction?, required_value?, compliance?, ... }],
     *   electionMode: 'AUTO'|'MANUAL',
     *   primaryDomain: 'AEROSPACE',
     *   ...
     * }
     *
     * @param {Object} payload - ONTOLOGY_CLASSIFIED payload
     * @private
     */
    _renderSolverPanel(payload) {
        try {
            let panel = document.getElementById('axiom-solver-panel');
            if (!panel) {
                // Create the solver panel on first use — additive, non-breaking
                panel = document.createElement('div');
                panel.id = 'axiom-solver-panel';
                panel.setAttribute('data-testid', 'axiom-solver-panel');
                panel.style.cssText = [
                    'margin-top:12px',
                    'padding:10px 14px',
                    'border:1px solid #1a2a1a',
                    'border-radius:4px',
                    'background:#060f06',
                    'font-family:Calibri,\'Microsoft JhengHei\',sans-serif',
                    'font-size:12px',
                ].join(';');

                // Attempt to insert after the axiom detail panel
                const detailPanel = document.getElementById('axiom-detail-panel');
                if (detailPanel?.parentNode) {
                    detailPanel.parentNode.insertBefore(panel, detailPanel.nextSibling);
                } else {
                    document.body.appendChild(panel);
                }
            }

            const selected = payload?.selected || [];
            const mode     = payload?.electionMode || 'UNKNOWN';
            const bucket   = resolveParadigmBucket(this._state.paradigm);

            panel.setAttribute('data-election-mode', mode);
            panel.setAttribute('data-solver-bucket', bucket);

            if (!selected.length) {
                panel.innerHTML = `
                    <div style="color:#333;letter-spacing:.8px">
                        SOLVER — No axioms elected
                    </div>`;
                return;
            }

            const rows = selected.map(ax => {
                const dir        = ax.solver_direction || 'UNDETERMINED';
                const reqVal     = ax.required_value   != null ? String(ax.required_value) : '—';
                const compliance = ax.compliance       || 'PENDING';
                const dirColor   = dir === 'FORWARD'  ? '#00C853'
                                 : dir === 'INVERSE'  ? '#00D4FF'
                                 : '#D4AF37'; // UNDETERMINED
                const compColor  = compliance === 'PASS'    ? '#00C853'
                                 : compliance === 'FAIL'    ? '#ff4444'
                                 : '#888';

                return `
                    <div style="display:flex;align-items:center;gap:10px;padding:5px 0;
                                border-bottom:1px solid #111;"
                         data-testid="solver-row-${ax.id || ax.axiom_id}"
                         data-solver-direction="${dir}"
                         data-compliance="${compliance}">
                        <span style="color:#555;min-width:100px;flex-shrink:0">${ax.id || ax.axiom_id || '?'}</span>
                        <span style="color:${dirColor};min-width:90px;letter-spacing:.8px;font-weight:700"
                              data-testid="solver-direction">${dir}</span>
                        <span style="color:#444;flex:1">${ax.name || '—'}</span>
                        <span style="color:#888;min-width:80px;text-align:right" title="required_value">
                            ${reqVal !== '—' ? `<span style="color:#D4AF37">→</span> ${reqVal}` : '—'}
                        </span>
                        <span style="color:${compColor};min-width:54px;text-align:right;font-weight:700"
                              data-testid="solver-compliance">${compliance}</span>
                    </div>`;
            }).join('');

            const modeLabel   = this._getSolverModeLabel(this._state.paradigm);
            const bucketColor = bucket === 'DEDUCTION' ? '#00D4FF'
                              : bucket === 'ABDUCTION' ? '#D4AF37'
                              : '#00C853';

            panel.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;
                            margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1a1a1a">
                    <span style="color:${bucketColor};font-weight:700;letter-spacing:1.5px"
                          data-testid="solver-mode-label">⊛ SOLVER · ${modeLabel}</span>
                    <span style="color:#2a2a2a;flex:1"></span>
                    <span style="color:#333;font-size:11px">${mode} MODE · ${selected.length} AXIOM(S)</span>
                </div>
                <div style="display:flex;gap:10px;margin-bottom:4px;
                            font-size:11px;color:#333;letter-spacing:.8px;padding:0 0 4px 0;
                            border-bottom:1px solid #0d0d0d">
                    <span style="min-width:100px">AXIOM ID</span>
                    <span style="min-width:90px">DIRECTION</span>
                    <span style="flex:1">NAME</span>
                    <span style="min-width:80px;text-align:right">SOLUTION</span>
                    <span style="min-width:54px;text-align:right">STATUS</span>
                </div>
                ${rows}
            `;
        } catch (err) {
            console.error('E003: AxiomController._renderSolverPanel failed:', err);
        }
    }

    /**
     * Map raw paradigm/sub-mode to a human-readable solver mode label.
     * @param {string} paradigm
     * @returns {string}
     * @private
     */
    _getSolverModeLabel(paradigm) {
        const MAP = {
            DEDUCTION:  'DEDUCTION (求解 Forward)',
            INDUCTION:  'INDUCTION (Pattern → Rule)',
            ABDUCTION:  'ABDUCTION (Hypothesis)',
            ABD_RFP:    'RFP (Request-for-Proposal)',
            ABD_QA:     'Q&A (Hypothesis Test)',
            ABD_RCA:    'RCA (Root-Cause Analysis)',
            ABD_CAUSAL: 'CAUSAL (Causal Inference)',
        };
        return MAP[paradigm] || paradigm || 'GENERAL';
    }
}
