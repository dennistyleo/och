/* ══════════════════════════════════════════════════════════
   Module: TubeService.js
   Version: 2.0.0
   Description: Isolated 5-tube liquid animation service with bus integration.
                Follows Rule 02, 03, and 06.
   ══════════════════════════════════════════════════════════ */

import { bus } from '../bus.js';

/**
 * SPECTRAL LANE GRADIENTS (mirror of sovereign-header.css §5)
 */
const LANE_GRADIENTS = {
    1: 'linear-gradient(90deg, #00e5ff, #00C853, #c8ff00)',
    2: 'linear-gradient(90deg, #00b4d8, #48cae4, #90e0ef)',
    3: 'linear-gradient(90deg, #00C853, #7fff00, #c8ff00)',
    4: 'linear-gradient(90deg, #c8ff00, #ffd60a, #ffb700)',
    5: 'linear-gradient(90deg, #00e5ff, #ff6b35, #ffd60a)',
};

export class TubeService {
    /**
     * @param {Object} registry - ComponentRegistry instance
     */
    constructor(registry) {
        this.registry = registry;
        this.bus = registry.bus;
        this._staggerMs = 30;
        this._fillSpeedMs = 15;
        this._state = {
            progress: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            interrupt: false,
            initialized: false,
        };

        this._register();
        this._registerHandlers();
        this._injectFlyoutCSS();
        
        // Auto-init if DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    _register() {
        this.registry.registerService('TUBE_SERVICE', this);
        // Expose to window for backward compatibility with onclick handlers
        window.SovereignTubes = this;
    }

    _registerHandlers() {
        // Rule 03: Event-Driven Communication

        // FIX B3: PIPELINE_COMPLETE is now the single event that drives all 5 tubes
        // from real pipeline stage data (tubeProgress[0..4] computed by onProcessDone).
        this.bus.on('PIPELINE_COMPLETE', (auditPacket) => {
            const tp = (auditPacket && auditPacket.tubeProgress) || [];
            console.log('[TUBE_SERVICE] PIPELINE_COMPLETE received | tubeProgress:', tp);
            for (let i = 0; i < 5; i++) {
                // stagger each tube update for smooth visual cascade
                const target = typeof tp[i] === 'number' ? tp[i] : 0;
                setTimeout(() => this.updateTube(i + 1, target), i * this._staggerMs);
            }
        });

        // DATA_EXTRACTED: early signal (L1 starts) — animate L1 only
        this.bus.on('DATA_EXTRACTED', () => {
            console.log('[TUBE_SERVICE] DATA_EXTRACTED — L1 warming up');
            this.updateTube(1, 35);
        });

        // ONTOLOGY_CLASSIFIED: L1+L2 complete — update from real counts if available
        this.bus.on('ONTOLOGY_CLASSIFIED', (payload) => {
            // Only update if PIPELINE_COMPLETE hasn't already fired (avoid overwriting)
            if (!window._sovereignLastAuditPacket) {
                this.updateTube(1, 100);
                this.updateTube(2, 60);
            }
        });

        this.bus.on('REPORT_READY', (payload) => {
            if (!window._sovereignLastAuditPacket) {
                let electedCount = 0;
                if (payload && payload.packet) {
                    electedCount = (payload.packet.elected || payload.packet.elected_axioms || []).length;
                } else {
                    try {
                        const tr = JSON.parse(sessionStorage.getItem('sovereign_tiered_results') || '{}');
                        electedCount = (tr.elected || tr.elected_axioms || []).length;
                    } catch (_) {}
                }
                if (electedCount > 0) {
                    this.animate([100, 100, 100, 100, 100]);
                } else {
                    this.animate([100, 100, 45, 60, 50]);
                }
            }
        });

        this.bus.on('ERROR', () => this.reset());

        this.bus.on('HITL_REQUEST', () => this.setInterrupt(true));
        this.bus.on('HITL_RESPONSE', () => this.setInterrupt(false));
    }

    _injectFlyoutCSS() {
        if (document.getElementById('sovereign-tube-flyout-css')) return;
        const s = document.createElement('style');
        s.id = 'sovereign-tube-flyout-css';
        s.textContent = `
        /* ── Flyout panel — NON-DESTRUCTIVE OVERLAY ── */
        .eng-tube-flyout {
            display: none;
            position: absolute;
            top: calc(100% + 14px);
            left: 0;
            min-width: 340px;
            max-width: 420px;
            background: rgba(7, 7, 7, 0.97);
            border: 1px solid #b59140;
            border-radius: 6px;
            padding: 14px 16px;
            z-index: 500;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75),
                        0 0 0 1px rgba(181, 145, 64, 0.15);
            pointer-events: auto;
        }
        .eng-tube-flyout.visible {
            display: block;
        }
        .gate-status-pill {
            font-family: 'JetBrains Mono', Calibri, monospace;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            padding: 3px 10px;
            border-radius: 99px;
            display: inline-block;
            margin-bottom: 10px;
        }
        .gate-status-pill.blue   { color: #00aaff; border: 1px solid #00aaff; background: rgba(0,170,255,0.1); }
        .gate-status-pill.orange { color: #ff914d; border: 1px solid #ff914d; background: rgba(255,145,77,0.1); }
        .gate-status-pill.red    { color: #ff3333; border: 1px solid #ff3333; background: rgba(255,51,51,0.1); }
        .gate-status-pill.green  { color: #00C853; border: 1px solid #00C853; background: rgba(0,200,83,0.1); }
        .gate-status-pill.gold   { color: #b59140; border: 1px solid #b59140; background: rgba(181,145,64,0.1); }
        .gate-meaning {
            font-family: Calibri, 'Microsoft JhengHei', sans-serif;
            font-size: 11px;
            font-weight: 700;
            color: #ddd;
            margin-bottom: 6px;
        }
        .gate-body {
            font-family: Calibri, 'Microsoft JhengHei', sans-serif;
            font-size: 11px;
            color: #aaa;
            line-height: 1.55;
            margin-bottom: 10px;
        }
        .gate-math {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: #b59140;
            border-left: 2px solid #b59140;
            padding-left: 10px;
            margin-bottom: 10px;
            line-height: 1.6;
        }
        .gate-thinking-log {
            font-family: 'JetBrains Mono', monospace;
            font-size: 9px;
            color: #00C853;
            background: #040404;
            border: 1px solid #1a1a1a;
            border-radius: 3px;
            padding: 6px 8px;
            min-height: 36px;
            max-height: 100px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-word;
            margin-bottom: 8px;
        }
        .mono-term {
            font-family: 'JetBrains Mono', monospace;
            color: #ffd60a;
        }
        /* HITL amber pulse on fill */
        .eng-bar-fill.hitl-pulse {
            animation: hitl-amber 0.8s ease-in-out infinite;
        }
        @keyframes hitl-amber {
            0%, 100% { opacity: 0.55; filter: brightness(0.8) sepia(1) hue-rotate(-20deg); }
            50%       { opacity: 1.0;  filter: brightness(1.3) sepia(1) hue-rotate(-20deg); }
        }
        `;
        document.head.appendChild(s);
    }

    init() {
        /* Apply spectral gradients to existing fill elements */
        for (let n = 1; n <= 5; n++) {
            const fill = document.getElementById(`fill-${n}`);
            if (fill) {
                const lane = fill.getAttribute('data-lane') || n;
                const grad = LANE_GRADIENTS[lane];
                if (grad) fill.style.background = grad;
            }
        }

        /* Ensure .eng-bar-col has position:relative for flyout anchoring */
        document.querySelectorAll('.eng-bar-col').forEach(col => {
            col.style.position = 'relative';
        });

        this._state.initialized = true;
        console.log('[TUBE_SERVICE] Initialized');
    }

    /**
     * Animate all 5 tubes with staggered fill animation.
     * @param {Array<number>} [overrides] - Optional array of target percentages [L1–L5]
     */
    animate(overrides = []) {
        for (let i = 1; i <= 5; i++) {
            const target = overrides[i - 1] ?? 0;
            setTimeout(() => this.updateTube(i, target), (i - 1) * this._staggerMs);
        }
    }

    /**
     * Update fill-N width and segmented/full class.
     * @param {number} n    — lane number 1–5
     * @param {number} pct  — 0–100
     */
    updateTube(n, pct) {
        if (typeof n === 'string') {
            if (n.startsWith('L')) {
                n = parseInt(n.substring(1), 10);
            } else {
                n = parseInt(n, 10);
            }
        }
        if (isNaN(n) || n < 1 || n > 5) {
            console.warn('[TUBE_SERVICE] Invalid tube identifier:', n);
            return;
        }
        pct = Math.max(0, Math.min(100, pct));
        this._state.progress[n] = pct;

        const fill = document.getElementById(`fill-${n}`);
        const pctEl = document.getElementById(`pct-${n}`);

        if (fill) {
            fill.style.width = pct + '%';
            fill.setAttribute('data-test-progress', pct);
            
            const lane = fill.getAttribute('data-lane') || n;
            if (LANE_GRADIENTS[lane]) fill.style.background = LANE_GRADIENTS[lane];

            fill.classList.remove('segmented', 'full', 'hitl-pulse');
            if (pct === 100) {
                fill.classList.add('full');
            } else if (pct > 0) {
                fill.classList.add('segmented');
            }
        }
        if (pctEl) pctEl.textContent = pct + '%';
    }

    /**
     * Toggle flyout for tube n (1–5).
     * @param {number} n
     */
    toggleFlyout(n) {
        const flyout = document.getElementById(`tube-flyout-${n}`);
        const arrow  = document.getElementById(`arrow-${n}`);
        if (!flyout) return;

        const isOpen = flyout.classList.toggle('visible');
        if (arrow) arrow.classList.toggle('active', isOpen);

        /* Close all other open flyouts */
        for (let i = 1; i <= 5; i++) {
            if (i === n) continue;
            const f = document.getElementById(`tube-flyout-${i}`);
            const a = document.getElementById(`arrow-${i}`);
            if (f) f.classList.remove('visible');
            if (a) a.classList.remove('active');
        }

        const anyOpen = !!document.querySelector('.eng-tube-flyout.visible');
        document.body.classList.toggle('flyout-active', anyOpen);
    }

    /**
     * Enable/disable HITL amber interrupt on all fills.
     * @param {boolean} active
     */
    setInterrupt(active) {
        this._state.interrupt = !!active;
        for (let n = 1; n <= 5; n++) {
            const fill = document.getElementById(`fill-${n}`);
            if (!fill) continue;
            if (active) {
                fill.classList.add('hitl-pulse');
            } else {
                fill.classList.remove('hitl-pulse');
            }
        }
    }

    /**
     * Push live reasoning text to tube-log-N.
     * @param {string|number} stage — 'L1'–'L5' or 1–5
     * @param {string} text
     */
    updateThinking(stage, text) {
        const n = typeof stage === 'string'
            ? parseInt(stage.replace(/\D/g, ''), 10)
            : stage;
        const el = document.getElementById(`tube-log-${n}`);
        if (el) {
            el.textContent = text || '—';
            el.scrollTop = el.scrollHeight;
        }
    }

    /**
     * Reset all tubes to 0%.
     */
    reset() {
        for (let n = 1; n <= 5; n++) this.updateTube(n, 0);
        this.setInterrupt(false);
    }

    /**
     * Close all open flyouts.
     */
    closeAllFlyouts() {
        document.querySelectorAll('.eng-tube-flyout.visible').forEach(f => f.classList.remove('visible'));
        document.querySelectorAll('.eng-tube-arrow.active').forEach(a => a.classList.remove('active'));
        document.body.classList.remove('flyout-active');
    }
}
