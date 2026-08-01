/**
 * Module: tube_engine.js — Sovereign Matrix Tube Progress Engine
 * Version: 4.0.0 (HTML-Augmentation Architecture — DO NOT replace DOM)
 * Description: Powers the 5 L-stage progress tubes in OP-01 / OP-02 / OP-03 headers.
 *
 * ARCHITECTURE RULE (v4):
 *   This engine AUGMENTS the existing HTML markup.
 *   It does NOT replace .eng-bars innerHTML.
 *   The HTML in each page is the canonical source for:
 *     - Full tube labels (e.g. "L1 · PROBLEM CHARACTERIZATION")
 *     - Triangle triggers (.eng-tube-arrow with CSS ::after triangle)
 *     - Flyout containers (.eng-tube-flyout)
 *   This engine only provides:
 *     - toggleFlyout(n): toggle .visible / .active
 *     - updateTube(n, pct): update fill-N width + segmented/full class
 *     - Spectral gradient application via data-lane attr
 *     - HITL amber interrupt pulse
 *
 * Spec reference: spec/15_html_ui.md §2 & §3
 * CSS authority:  static/css/sovereign-header.css
 *
 * Triangle spec (§2.3):
 *   At rest  : gold #b59140  (via .eng-tube-arrow::after in sovereign-header.css)
 *   Hover    : light gold #ffeaaa
 *   Active   : neon green #00C853 + rotate(180deg)  → .eng-tube-arrow.active::after
 */
(function (global) {
    'use strict';

    /* ══════════════════════════════════════════════════════════════
       §1  SPECTRAL LANE GRADIENTS (mirror of sovereign-header.css §5)
           Applied to .eng-bar-fill[data-lane="N"] on init.
    ══════════════════════════════════════════════════════════════ */
    const LANE_GRADIENTS = {
        1: 'linear-gradient(90deg, #00e5ff, #00C853, #c8ff00)',
        2: 'linear-gradient(90deg, #00b4d8, #48cae4, #90e0ef)',
        3: 'linear-gradient(90deg, #00C853, #7fff00, #c8ff00)',
        4: 'linear-gradient(90deg, #c8ff00, #ffd60a, #ffb700)',
        5: 'linear-gradient(90deg, #00e5ff, #ff6b35, #ffd60a)',
    };

    /* ══════════════════════════════════════════════════════════════
       §2  FLYOUT CSS — injected once, controls .eng-tube-flyout visibility
           The triangle colors are in sovereign-header.css — NOT here.
    ══════════════════════════════════════════════════════════════ */
    function _injectFlyoutCSS() {
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

    /* ══════════════════════════════════════════════════════════════
       §3  INIT — augment existing HTML, do NOT replace it
    ══════════════════════════════════════════════════════════════ */
    function init() {
        _injectFlyoutCSS();

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

        /* §PERSIST: Restore saved progress from localStorage so OP-02 shows
         * OP-01 state even when OP-01 completed before OP-02 was opened. */
        _loadState();

        _state.initialized = true;
    }

    /** Persist current tube progress to localStorage (called after every _applyTube). */
    function _saveState() {
        try {
            localStorage.setItem('sovereign-tube-state', JSON.stringify(_state.progress));
        } catch (_) { /* Private / incognito — degrade silently */ }
    }

    /** Load saved tube progress from localStorage and apply to DOM. */
    function _loadState() {
        try {
            /* ONLY restore if a valid session evaluation badge exists.
             * This prevents stale, cached progress from a prior session/tab
             * from loading on a fresh load. */
            if (!sessionStorage.getItem('sovereign_session_evaluated')) {
                console.log('[TubeEngine] No active session badge found. Keeping tubes at 0% default.');
                for (let n = 1; n <= 5; n++) {
                    _applyTube(n, 0);
                }
                return;
            }

            /* Check if authoritative session state exists */
            const _sessionSt = sessionStorage.getItem('sovereign_op01_state');
            if (_sessionSt) {
                const _stParsed = JSON.parse(_sessionSt);
                if (_stParsed && _stParsed.tubeProgress && _stParsed.tubeProgress.length) {
                    console.log('[TubeEngine] Restoring authoritative session tube state:', _stParsed.tubeProgress);
                    for (let n = 1; n <= 5; n++) {
                        const val = _stParsed.tubeProgress[n - 1];
                        if (typeof val === 'number') {
                            _applyTube(n, val);
                        }
                    }
                    return;
                }
            }
            /* Otherwise fall back to localStorage */
            const raw = localStorage.getItem('sovereign-tube-state');
            if (!raw) return;
            const saved = JSON.parse(raw);
            for (const key in saved) {
                const n = parseInt(key, 10);
                if (n >= 1 && n <= 5 && typeof saved[key] === 'number') {
                    _applyTube(n, saved[key]);
                }
            }
        } catch (_) { /* Corrupt entry — ignore */ }
    }

    /* ══════════════════════════════════════════════════════════════
       §4  STATE
    ══════════════════════════════════════════════════════════════ */
    const _state = {
        progress: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        interrupt: false,
        initialized: false,
    };

    /* ══════════════════════════════════════════════════════════════
       §4b CROSS-PAGE SYNC — BroadcastChannel 'sovereign-tubes'
           OP-01 drives progress; OP-02 / OP-03 mirror it in real-time.
           _applyTube() = DOM-only (no re-broadcast, prevents loops).
           updateTube() = DOM + broadcast (public entry point).
    ══════════════════════════════════════════════════════════════ */
    let _bc = null;
    try {
        _bc = new BroadcastChannel('sovereign-tubes');
        _bc.onmessage = (ev) => {
            const d = ev.data || {};
            if (d.type === 'tube')      { _applyTube(d.n, d.pct); }
            if (d.type === 'interrupt') { _applyInterrupt(d.active); }
            if (d.type === 'thinking')  { updateThinking(d.stage, d.text); }
            if (d.type === 'reset')     { for (let n = 1; n <= 5; n++) _applyTube(n, 0); _applyInterrupt(false); }
        };
    } catch (_) { _bc = null; /* BroadcastChannel unsupported — silent degradation */ }

    /* ══════════════════════════════════════════════════════════════
       §5  PUBLIC API
    ══════════════════════════════════════════════════════════════ */

    /**
     * Toggle flyout for tube n (1–5).
     * Spec §2.3: active triangle → neon green #00C853 + rotate 180°
     *            via .eng-tube-arrow.active::after in sovereign-header.css
     * @param {number} n
     */
    function toggleFlyout(n) {
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

        /* §Z-INDEX GUARD: suppress scrollbar rail when any flyout is open.
         * .flyout-active body class is read by sovereign-header.css +
         * sovereign_scrollbar.css to drop .sv-pill below the flyout layer. */
        const anyOpen = !!document.querySelector('.eng-tube-flyout.visible');
        document.body.classList.toggle('flyout-active', anyOpen);
    }

    /**
     * Update fill-N width and segmented/full class.
     * Spec §2.5:
     *   0%    → no fill
     *   1–99% → .segmented (inset shadow gap)
     *   100%  → .full (seamless)
     * @param {number} n    — lane number 1–5
     * @param {number} pct  — 0–100
     */
    function updateTube(n, pct) {
        if (typeof n === 'string') {
            if (n.startsWith('L')) {
                n = parseInt(n.substring(1), 10);
            } else {
                n = parseInt(n, 10);
            }
        }
        _applyTube(n, pct);
        if (_bc) try { _bc.postMessage({ type: 'tube', n, pct }); } catch(_) {}
    }

    /** Internal: DOM update only — called from BroadcastChannel to prevent re-broadcast loops. */
    function _applyTube(n, pct) {
        pct = Math.max(0, Math.min(100, pct));
        _state.progress[n] = pct;

        const fill = document.getElementById(`fill-${n}`);
        const pctEl = document.getElementById(`pct-${n}`);

        if (fill) {
            fill.style.width = pct + '%';
            /* DFT Hook: Playwright polls this to track tube progress */
            fill.setAttribute('data-test-progress', pct);
            /* DFT Hook: state — RUNNING | WAITING | RESOLVED (set by handshake script) */
            if (!fill.hasAttribute('data-test-tube-state')) {
                fill.setAttribute('data-test-tube-state', 'RUNNING');
            }
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
        /* Save state so other pages can restore it on load */
        _saveState();
    }

    /**
     * Alias for updateTube — preferred entry point for SovereignEvaluator.
     * Calling advanceTube(n, pct) is identical to updateTube(n, pct).
     * @param {number} n    — lane 1–5
     * @param {number} pct  — 0–100
     */
    function advanceTube(n, pct) {
        updateTube(n, pct);
    }

    /**
     * Set progress by stage key ('L1'–'L5'), segments 0–10.
     * Backward-compat bridge from v3 API.
     * @param {string} stage
     * @param {number} segments — 0–10 (maps to 0–100%)
     */
    function setProgress(stage, segments) {
        const n = parseInt(stage.replace(/\D/g, ''), 10);
        if (n >= 1 && n <= 5) {
            updateTube(n, Math.round((segments / 10) * 100));
        }
    }

    /**
     * Enable/disable HITL amber interrupt on all fills.
     * @param {boolean} active
     */
    function setInterrupt(active) {
        _applyInterrupt(active);
        if (_bc) try { _bc.postMessage({ type: 'interrupt', active: !!active }); } catch(_) {}
    }

    /** Internal: interrupt DOM update without re-broadcasting. */
    function _applyInterrupt(active) {
        _state.interrupt = !!active;
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
     * @param {string} stage — 'L1'–'L5' or 1–5
     * @param {string} text
     */
    function updateThinking(stage, text) {
        const n = typeof stage === 'string'
            ? parseInt(stage.replace(/\D/g, ''), 10)
            : stage;
        const el = document.getElementById(`tube-log-${n}`);
        if (el) {
            el.textContent = text || '—';
            el.scrollTop = el.scrollHeight;
        }
        if (_bc) try { _bc.postMessage({ type: 'thinking', stage, text }); } catch(_) {}
    }

    /**
     * Reset all tubes to 0%.
     */
    function reset() {
        for (let n = 1; n <= 5; n++) _applyTube(n, 0);
        _applyInterrupt(false);
        if (_bc) try { _bc.postMessage({ type: 'reset' }); } catch(_) {}
    }

    /**
     * Close all open flyouts (used by click-outside handler).
     */
    function closeAllFlyouts() {
        document.querySelectorAll('.eng-tube-flyout.visible').forEach(f => f.classList.remove('visible'));
        document.querySelectorAll('.eng-tube-arrow.active').forEach(a => a.classList.remove('active'));
        /* Restore scrollbar z-index when all flyouts are closed */
        document.body.classList.remove('flyout-active');
    }

    /* ══════════════════════════════════════════════════════════════
       §6  AUTO-INIT
    ══════════════════════════════════════════════════════════════ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ══════════════════════════════════════════════════════════════
       §7  CLICK-OUTSIDE: close any open flyout
    ══════════════════════════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('click', (e) => {
            const inside = e.target.closest('.eng-bar-col, .eng-tube-flyout');
            if (!inside) closeAllFlyouts();
        });
    });

    /* ══════════════════════════════════════════════════════════════
       §8  EXPORT
    ══════════════════════════════════════════════════════════════ */
    global.SovereignTubes = {
        init,
        toggleFlyout,
        updateTube,
        advanceTube,   /* D1-T1: event-driven entry point for SovereignEvaluator */
        setProgress,   /* backward-compat: stage 'L1'–'L5', segments 0–10 */
        setInterrupt,
        updateThinking,
        reset,
        closeAllFlyouts,
    };

}(window));
