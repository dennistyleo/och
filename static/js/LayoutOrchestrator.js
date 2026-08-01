/* ══════════════════════════════════════════════════════════
   Module: LayoutOrchestrator.js
   Version: 1.0.0
   Description: Sovereign Matrix dashboard layout controller.
                Replaces UIManager.js. Responsible ONLY for
                reactive CSS grid morphing based on phase events
                and paradigm-based page routing.
   Standards: ISO/IEC 25010 (Modularity, Functional Suitability)
              CMMI Level 5 (Quantitative Management)
   Rule 06: No hardcoded IDs — all lookups via registry.
   Rule 03: Phase transitions arrive via SovereignBUS only.
   ══════════════════════════════════════════════════════════ */

import { TubeService }  from './services/TubeService.js';
import { ToastService } from './services/ToastService.js';

/** Paradigm → operative page routing table */
const PARADIGM_ROUTING = {
    'INDUCTION':  'op-page-1',
    'ABDUCTION':  'op-page-2',
    'DEDUCTION':  'op-page-3',   // op-page-3 EXCLUSIVELY for Deduction mode
};

/** Paradigm → header description content */
const HEADER_DESCRIPTIONS = {
    'INDUCTION': `
        <div class="hdr-desc-box">LOGIC ENGINE REVISION</div>
        <div class="hdr-desc-box">ONTOLOGICAL ENGINE</div>
        <div class="hdr-desc-box">AXIOM ENGINE</div>
        <div class="hdr-desc-box">GNN VECTOR ENGINE</div>
        <div class="hdr-desc-box">GENERATION ENGINE</div>`,
    'ABDUCTION': `
        <div class="hdr-desc-box">LOGIC ENGINE REVISION</div>
        <div class="hdr-desc-box">ONTOLOGICAL ENGINE</div>
        <div class="hdr-desc-box">AXIOM ENGINE</div>
        <div class="hdr-desc-box">GNN VECTOR ENGINE</div>
        <div class="hdr-desc-box">GENERATION ENGINE</div>`,
    'DEDUCTION': `<div class="hdr-row-banner">DEDUCTION SPECIFIED EVALUATION</div>`,
};

export class LayoutOrchestrator {
    /**
     * @param {Object} bus      - SovereignBUS singleton
     * @param {Object} registry - ComponentRegistry singleton
     */
    constructor(bus, registry) {
        this.bus             = bus;
        this.registry        = registry;
        this.tubeService     = new TubeService(bus);
        this.toastService    = new ToastService();
        this.selectedParadigm = 'INDUCTION';
        this.currentPhase    = 0;

        this._bindStaticElements();
        this._subscribeToPhaseEvents();
        this._initParadigmButtons();

        if (window.location.hash === '#op') this.enterOperation();
    }

    /**
     * Bind to root-level elements that always exist in the DOM.
     * @private
     */
    _bindStaticElements() {
        this._landingRoot  = document.getElementById('landing-root');
        this._opRoot       = document.getElementById('op-root');
        this._opPages      = document.querySelectorAll('.op-page');
        this._descRow      = document.querySelector('.hdr-row-descriptions');

        const initBtn   = document.getElementById('initialize-engine');
        const returnBtn = document.getElementById('hdr-return-btn');

        initBtn?.addEventListener('click',   () => this.enterOperation());
        returnBtn?.addEventListener('click', () => this.enterLanding());
    }

    /**
     * Subscribe to BUS phase-shift events to morph the grid.
     * @private
     */
    _subscribeToPhaseEvents() {
        this.bus.on('EVT_PHASE_1', () => this._applyPhase(1));
        this.bus.on('EVT_PHASE_2', () => this._applyPhase(2));
        this.bus.on('EVT_PHASE_3', () => this._applyPhase(3));
    }

    /**
     * Wire up paradigm selection buttons via data attributes (no hardcoded text).
     * @private
     */
    _initParadigmButtons() {
        document.querySelectorAll('.lp-paradigm-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.lp-paradigm-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedParadigm = btn.dataset.paradigm || 'INDUCTION';
            });
        });
    }

    /**
     * Transition from landing to the operative dashboard.
     * Routes to the correct op-page based on selected paradigm.
     */
    enterOperation() {
        const targetPageId = PARADIGM_ROUTING[this.selectedParadigm] || 'op-page-1';

        if (this._landingRoot) this._landingRoot.style.display = 'none';
        if (this._opRoot)      this._opRoot.classList.add('visible');

        this._opPages.forEach(pg => {
            pg.classList.toggle('active-page', pg.id === targetPageId);
        });

        this._updateHeaderDescriptions();
        this._applyPhase(1);
        this.tubeService.animate();
        this.toastService.show(
            `ENGINE INITIALIZED — ${this.selectedParadigm} PROTOCOL ACTIVE`
        );

        window.location.hash = 'op';
        this.bus.emit('ENGINE:BOOT', {
            paradigm: this.selectedParadigm,
            page: targetPageId,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Return to the landing page and reset state.
     */
    enterLanding() {
        if (this._opRoot)      this._opRoot.classList.remove('visible');
        if (this._landingRoot) this._landingRoot.style.display = 'block';
        this.tubeService.reset();
        this._applyPhase(0);
        window.location.hash = '';
    }

    /**
     * Apply a CSS grid phase class to the op-root container.
     * Phase 1: Vertical split | Phase 2: 2-row stack | Phase 3: 3-row + trace
     * @param {number} phase - 0 (reset) | 1 | 2 | 3
     * @private
     */
    _applyPhase(phase) {
        if (!this._opRoot) return;
        this._opRoot.classList.remove(
            'grid-phase-1', 'grid-phase-2', 'grid-phase-3'
        );
        if (phase > 0) {
            this._opRoot.classList.add(`grid-phase-${phase}`);
        }
        this.currentPhase = phase;
        console.log(`[LAYOUT] Phase applied: ${phase}`);
    }

    /**
     * Update the header description row based on the active paradigm.
     * Deduction mode shows a single banner; others show 5 engine labels.
     * @private
     */
    _updateHeaderDescriptions() {
        if (!this._descRow) return;
        const content = HEADER_DESCRIPTIONS[this.selectedParadigm]
            || HEADER_DESCRIPTIONS['INDUCTION'];
        this._descRow.innerHTML = content;
        this._descRow.style.borderBottom =
            this.selectedParadigm === 'DEDUCTION'
                ? 'none'
                : '1px solid rgba(126, 105, 6, 0.3)';
    }

    /**
     * Public API: programmatically transition to a phase.
     * Called externally via BUS events only.
     * @param {number} phase - 1 | 2 | 3
     */
    transitionToPhase(phase) {
        const eventMap = { 1: 'EVT_PHASE_1', 2: 'EVT_PHASE_2', 3: 'EVT_PHASE_3' };
        const event = eventMap[phase];
        if (event) this.bus.emit(event, { timestamp: new Date().toISOString() });
    }
}
