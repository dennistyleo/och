/**
 * Module: hitl_modal_bridge.js — Sovereign Matrix HITL iframe Bridge
 * Version: 3.1.0 — i18n pre-seed fix: write localStorage['sovereign_lang'] BEFORE iframe.src
 * Description: Thin adapter that renders hitl_modal.html inside a fullscreen
 *   overlay <iframe> instead of using the legacy hitl_modal.js DOM injection.
 *   Maintains full API compatibility: HITLModal.show(file, mode, onConfirm, onCancel)
 *
 * Architecture:
 *   1. show() creates a fixed <iframe> overlay loading hitl_modal.html
 *   2. Once iframe is ready, sends { type:'hitl:context', payload } via postMessage
 *   3. Listens for { type:'hitl:confirmed' } → calls onConfirm + dispatches event
 *   4. Listens for { type:'hitl:cancelled' } → calls onCancel  + dispatches event
 *   5. dismiss() removes the iframe, dispatches hitl:cancelled
 */
(function (global) {
    'use strict';

    /* ── Overlay/iframe style injected once ─────────────────────────────── */
    (function injectCSS() {
        if (document.getElementById('hitl-bridge-css')) return;
        const s = document.createElement('style');
        s.id = 'hitl-bridge-css';
        s.textContent = `
        #sov-hitl-bridge, #hitl-bridge-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            animation: hitl-bridge-fade 0.22s ease;
        }
        @keyframes hitl-bridge-fade {
            from { opacity: 0; transform: scale(0.97); }
            to   { opacity: 1; transform: scale(1); }
        }
        #sov-hitl-frame, #hitl-bridge-frame {
            width: 96vw;
            max-width: 1600px;
            height: 94vh;
            max-height: 950px;
            border: none;
            border-radius: 15px;
            background: transparent;
            display: block;
        }
        `;
        document.head.appendChild(s);
    })();

    /* ── State ───────────────────────────────────────────────────────────── */
    let _overlay = null;
    let _iframe = null;
    let _onConfirm = null;
    let _onCancel = null;
    let _msgHandler = null;
    let _cancelling = false; /* guard: prevent double hitl:cancelled dispatch */
    let _origSetItem = null; /* original sessionStorage.setItem */

    /* ── Resolve the base URL for hitl_modal.html ────────────────────────── */
    function _modalURL() {
        /* Works whether the page is served via HTTP or file:// */
        const scripts = document.querySelectorAll('script[src*="hitl_modal_bridge"]');
        if (scripts.length) {
            const base = scripts[scripts.length - 1].src.replace(/hitl_modal_bridge\.js[^\/]*$/, '');
            return base + 'hitl_modal.html?v=10009';
        }
        return 'hitl_modal.html?v=10009';
    }

    /* ── Build context payload from a File object + mode ────────────────── */
    function _buildContext(file, mode, options) {
        const sizeKB = file ? (file.size / 1024).toFixed(1) + ' KB' : '—';
        const ext = file ? (file.name.split('.').pop() || 'FILE').toUpperCase() : 'FILE';
        const domain = _inferDomain(file ? file.name : '');

        /* Read elected axioms from sessionStorage so the iframe chatbot always has context */
        let elected_axioms = [];
        try {
            const am = JSON.parse(sessionStorage.getItem('sovereign_axiom_match') || '{}');
            elected_axioms = am.selectedIds || am.elected_axioms || am.axioms || [];
        } catch (e) { }

        /* Read trace_id from sessionStorage — written by fast-path ingest */
        let trace_id = null;
        try {
            trace_id = sessionStorage.getItem('sovereign_trace_id') || null;
            /* Also try hitl_context for legacy compatibility */
            if (!trace_id) {
                const hc = JSON.parse(sessionStorage.getItem('sovereign_hitl_context') || 'null');
                if (hc && hc.trace_id) trace_id = hc.trace_id;
            }
        } catch (e) { }

        /* ── Origin-Mode Inheritance ────────────────────────────────────────────
         * Rule:
         *   1. If user entered from landing page with a specific sub-mode intent
         *      (sovereign_sub_mode written by landing page) AND no parent mode was
         *      supplied (or mode === 'induction') → originMode = 'induction'
         *   2. If user arrived via Abduction or Deduction pipeline and then selected
         *      a sub-mode (QA/RCA/RFP/Causal as intent refinement) → originMode
         *      inherits the parent mode (abduction | deduction)
         *   3. If no sub-mode at all → originMode = mode as-is
         * ─────────────────────────────────────────────────────────────────────── */
        let subMode = null;
        try {
            const _sm = sessionStorage.getItem('sovereign_sub_mode');
            if (_sm) subMode = _sm.toLowerCase(); /* 'qa' | 'rca' | 'rfp' | 'causal' */
        } catch (e) { }

        const _parentMode = (mode || '').toLowerCase();
        let originMode;
        if (subMode && (!_parentMode || _parentMode === 'induction')) {
            /* Landing-page direct entry: all sub-modes default to induction */
            originMode = 'induction';
        } else if (_parentMode === 'abduction' || _parentMode === 'deduction') {
            /* Pipeline-entry: sub-mode intent inherits the parent operational mode */
            originMode = _parentMode;
        } else {
            /* No sub-mode or plain mode entry */
            originMode = _parentMode || 'deduction';
        }

        /* Read visitor name from auth layer — written by login or profile system */
        let visitorName = 'Analyst';
        try {
            visitorName = sessionStorage.getItem('sovereign_user_name')
                || localStorage.getItem('sovereign_user_name')
                || localStorage.getItem('userName')
                || sessionStorage.getItem('userName')
                || 'Analyst';
        } catch (e) { }

        /* LANG-FIX: Language is a USER preference — never derive from filename or domain.
         * Read whatever the user has stored; default to 'en' if nothing set. */
        const _ctxLang = (function() {
            try { return localStorage.getItem('sovereign_lang') || 'en'; } catch(_) { return 'en'; }
        })();

        return {
            fileName: file ? file.name : '—',
            fileSize: sizeKB,
            fileType: ext,
            fileDomain: domain,
            complexityLevel: 3,
            recommendedStrategy: 'Evidence Hygiene',
            analysisMode: 'root-cause',
            mode: _parentMode || 'deduction',
            originMode: originMode,   /* authoritative mode for OCM conversation routing */
            subMode: subMode,          /* 'qa' | 'rca' | 'rfp' | 'causal' | null */
            lang: _ctxLang,             /* belt-and-suspenders: iframe can call setLanguage(lang) on receipt */
            visitorName: visitorName,
            systemTier: (options && options.systemTier) ? options.systemTier : 'FULL',
            elected_axioms: elected_axioms,  /* injected into iframe for OCM chatbot context */
            trace_id: trace_id,        /* backend session link — enables live G3FP dialogue */
        };
    }

    /* ── Domain inference — delegates to SovDomainHint (single source of truth) ── */
    function _inferDomain(filename) {
        /* SovDomainHint is the canonical implementation loaded by op_01/op_03 before this bridge.
         * Fallback inline logic only fires if the utility script wasn't loaded (edge case). */
        if (window.SovDomainHint) {
            return window.SovDomainHint.inferDomainHint(filename) || 'GENERAL';
        }
        /* Fallback inline (kept in sync with sov.domain.hint.js) */
        try {
            var _mode = sessionStorage.getItem('sovereign_mode');
            if (_mode === 'ontology_med') return 'HEALTHCARE';
        } catch (_) {}
        try {
            if (window.parent && window.parent.location.pathname.includes('ontology_medical')) {
                return 'HEALTHCARE';
            }
        } catch (_) {}
        const n = (filename || '').toLowerCase();
        try {
            const _ctx = JSON.parse(sessionStorage.getItem('sovereign_g3fp_context') || '{}');
            if (_ctx.domain && _ctx.domain !== 'GENERAL') return _ctx.domain.toUpperCase();
        } catch (_) {}
        if (/health|medical|patient|clinical|diag|pharma|hospital|cardio|oncol|lipid|glucose|hemoglobin/.test(n)) return 'HEALTHCARE';
        if (/contract|legal|agree|clause|terms|sla|nda|msa|addendum/.test(n)) return 'CONTRACT';
        if (/aerospace|aviat|fpga|verilog|rtl|thermal|signal|delamination|composite|cfrp/.test(n)) return 'AEROSPACE';
        if (/finance|budget|revenue|cost|equity|portfolio|ebitda|yield|nav/.test(n)) return 'FINANCE';
        return 'GENERAL';
    }

    /* ── Internal cleanup ─────────────────────────────────────────────────── */
    function _destroy() {
        if (_msgHandler) {
            window.removeEventListener('message', _msgHandler);
            _msgHandler = null;
        }
        if (_overlay && _overlay.parentNode) {
            _overlay.parentNode.removeChild(_overlay);
        }
        _overlay = null;
        _iframe = null;
        _onConfirm = null;
        _onCancel = null;
        if (_origSetItem) {
            try {
                sessionStorage.setItem = _origSetItem;
            } catch (e) {
                console.error('[HITL Bridge] Failed to restore sessionStorage.setItem:', e);
            }
            _origSetItem = null;
        }
    }

    /* ── Public API: show ─────────────────────────────────────────────────── */
    /**
     * @param {File}     file       - The file object selected by the user
     * @param {string}   mode       - 'deduction' | 'induction' | 'abduction'
     * @param {Function} onConfirm  - Called with payload on Approve
     * @param {Function} onCancel   - Called with no args on dismiss
     * @param {Object}   options    - { systemTier: 'FULL' | 'DEGRADED_MANUAL' }
     */
    function show(file, mode, onConfirm, onCancel, options) {
        /* Prevent double-open */
        if (_overlay) dismiss();

        _onConfirm = onConfirm || function () { };
        _onCancel = onCancel || function () { };

        /* Proxy sessionStorage.setItem to catch same-window writes */
        try {
            if (!_origSetItem) {
                _origSetItem = sessionStorage.setItem;
                sessionStorage.setItem = function (key, value) {
                    _origSetItem.apply(this, arguments);
                    if (key === 'sovereign_trace_id' || key === 'sovereign_hitl_context') {
                        var traceRelayEvent = new CustomEvent('sovereign_storage_upgrade', { detail: { key, value } });
                        window.dispatchEvent(traceRelayEvent);
                    }
                };
            }
        } catch (e) {
            console.error('[HITL Bridge] Failed to proxy sessionStorage.setItem:', e);
        }

        /* FIX-IDENTITY-02: Write name BEFORE _buildContext() reads it.
         * Previously this was AFTER _buildContext, so visitorName always
         * resolved to the 'Analyst' fallback. Moved above the call. */
        try { sessionStorage.setItem('sovereign_user_name', 'Dennis Leo'); } catch (e) { }

        const ctx = _buildContext(file, mode, options);
        /* Hard-override as belt-and-suspenders: even if storage read failed
         * (incognito, sandboxed iframe restriction, etc.) the name is correct. */
        ctx.visitorName = sessionStorage.getItem('sovereign_user_name') || 'Dennis Leo';

        /* Stamp mode into sessionStorage BEFORE the iframe loads */
        try { sessionStorage.setItem('sovereign_mode', (mode || 'deduction').toLowerCase()); } catch (e) { }
        /* Stamp originMode so hitl_modal.html can read it synchronously at parse time */
        try { sessionStorage.setItem('sovereign_origin_mode', ctx.originMode); } catch (e) { }
        /* G4-FIX: Always stamp sovereign_sub_mode — even as '' — to flush stale values
         * from prior sessions that had a sub-mode set. Conditional stamp caused bleed-through. */
        try { sessionStorage.setItem('sovereign_sub_mode', ctx.subMode || ''); } catch (e) { }

        /* ── i18n pre-seed (BRIDGE) ──────────────────────────────────────────────
         * i18n.js reads localStorage['sovereign_lang'] synchronously in _init()
         * when the iframe's scripts are parsed — BEFORE any postMessage arrives.
         * The lang MUST be written HERE, before _iframe.src is assigned below.
         *
         * LANG-RULE: Language = user preference ONLY. Never derive from filename
         * or document domain. Read what the user has set; default to 'en'.
         * ─────────────────────────────────────────────────────────────────── */
        try {
            const _currentLang = (function() {
                try { return localStorage.getItem('sovereign_lang') || 'en'; } catch(_) { return 'en'; }
            })();
            localStorage.setItem('sovereign_lang', _currentLang);
            sessionStorage.setItem('sovereign_lang_mode', _currentLang === 'zh-TW' ? 'ZH-TW' : _currentLang.toUpperCase().replace('-','_'));
            console.log('[HITL Bridge] i18n pre-seed: sovereign_lang =', _currentLang,
                '— written to localStorage BEFORE iframe.src assignment.');
        } catch (_langErr) {
            console.warn('[HITL Bridge] Could not write sovereign_lang to localStorage:', _langErr);
        }

        /* Z-index guard: yield scrollbar rail below the HITL overlay */
        document.body.classList.add('hitl-active', 'modal-active-lock');
        /* FIX-PILL-02: hide .sv-pill directly — CSS !important loses to the
         * 500ms setInterval that re-applies visibility:visible inline */
        document.querySelectorAll('.sv-pill').forEach(function (p) {
            p._hitlDisplay = p.style.display; p.style.display = 'none';
        });

        /* Build overlay */
        _overlay = document.createElement('div');
        /* DFT-canonical: tests use #hitl-bridge-overlay; production CSS uses both via combined rule */
        _overlay.id = 'hitl-bridge-overlay';
        /* A-2 FIX: z-index set inline so overlay is above .sv-pill rail (z:MAX_INT)
         * even before sovereign_scrollbar.css has loaded. CSS pin rule is the backstop. */
        _overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
        /* DFT Hook: Playwright asserts this attribute to confirm overlay is live */
        _overlay.setAttribute('data-test-state', 'open');
        window.dispatchEvent(new CustomEvent('SOVEREIGN_HITL_OPENED', { detail: { mode } }));

        _iframe = document.createElement('iframe');
        _iframe.id = 'hitl-bridge-frame';   /* DFT: canonical test selector (replaces sov-hitl-frame) */

        /* ── Send context once the iframe has loaded ── */
        _iframe.addEventListener('load', function () {
            /* BUG-02 FIX: Post context immediately — hitl_modal.html registers its
             * window.addEventListener('message',…) synchronously at script top, so
             * it is always live before the parent receives the iframe 'load' event.
             * The old 80 ms setTimeout was a defensive over-estimate — removed. */
            if (_iframe && _iframe.contentWindow) {
                _iframe.contentWindow.postMessage({ type: 'hitl:context', payload: ctx }, '*');
            }

            /* ── G3FP domain relay: update fileDomain when backend resolves ──────────
             * _buildContext runs synchronously before the backend G3FP scan completes,
             * so ctx.fileDomain may be the filename heuristic (e.g. HEALTHCARE from
             * the regex, or GENERAL if no match). When the backend finishes and writes
             * sovereign_g3fp_context, op_01.html emits G3FP_CONTEXT_READY on the BUS.
             * We intercept it here and relay a domain-override postMessage to the iframe
             * so the OCM's __SESSION_OPEN__ receives the correct domain.
             * ─────────────────────────────────────────────────────────────────── */
            (function _watchG3fpDomain() {
                function _relayDomain() {
                    try {
                        var _ctxRaw = sessionStorage.getItem('sovereign_g3fp_context');
                        if (!_ctxRaw) return;
                        var _gCtx = JSON.parse(_ctxRaw);
                        var _realDomain = (_gCtx.domain || '').toUpperCase();
                        if (_realDomain && _realDomain !== 'GENERAL' && _realDomain !== ctx.fileDomain) {
                            ctx.fileDomain = _realDomain;  /* Update ctx so later relay reads correctly */
                            if (_iframe && _iframe.contentWindow) {
                                _iframe.contentWindow.postMessage({
                                    type: 'hitl:context',
                                    payload: { fileDomain: _realDomain, _domainRelay: true }
                                }, '*');
                                console.log('[HITL Bridge] G3FP domain relay:', _realDomain, '→ iframe');
                            }
                        }
                    } catch (_) {}
                }
                /* Listen for BUS event */
                if (window.SovereignBUS) {
                    window.SovereignBUS.on('G3FP_CONTEXT_READY', _relayDomain);
                }
                /* Also check immediately — G3FP may have already resolved before iframe load */
                _relayDomain();
                /* StorageEvent fallback — fires when sovereign_g3fp_context is written */
                function _onGCtxStorage(ev) {
                    if (ev.key === 'sovereign_g3fp_context') { _relayDomain(); window.removeEventListener('storage', _onGCtxStorage); }
                }
                window.addEventListener('storage', _onGCtxStorage);
            })();

            /* ── GATE-A FIX: Emit SOVEREIGN_TUBES_RESOLVED for OP-02 / OP-03 ────────
             * op_02.html and op_03.html have NO _waitForTubesResolved() — the signal
             * never arrives → Gate A stays false forever → btn-eval is permanently locked.
             *
             * Fix: the bridge is the authoritative entry-point for OP-02/OP-03 HITL.
             * After sending hitl:context we:
             *   1. Set window._sovereignTubesResolved = true on THIS (parent) window so
             *      the iframe's 200ms fallback poll resolves Gate A immediately.
             *   2. postMessage SOVEREIGN_TUBES_RESOLVED to the iframe after 500ms —
             *      long enough for CLCP Phase 1 to start, short enough to open Gate A
             *      well before Gate C closes at ~8.8s.
             *
             * For OP-01 the existing _waitForTubesResolved() already emits this signal.
             * If it fires *after* this bridge relay, Gate A is already true — no-op.
             * ─────────────────────────────────────────────────────────────────────── */
            window._sovereignTubesResolved = true;  /* Fallback poll reads this */
            var _gateAIframe = _iframe;
            setTimeout(function () {
                if (_gateAIframe && _gateAIframe.contentWindow) {
                    _gateAIframe.contentWindow.postMessage({ type: 'SOVEREIGN_TUBES_RESOLVED' }, '*');
                    console.log('[HITL Bridge] GATE-A: SOVEREIGN_TUBES_RESOLVED relayed to iframe.');
                }
            }, 10);

            /* ── TRACE-ID RELAY (BUG-01 FIX): event-driven, zero-latency ───────────────
             * Problem: the old implementation polled sessionStorage every 400 ms with a
             * 200 ms boot delay, causing up to 600 ms lag between the fast-path POST
             * resolving and the iframe being notified of the real trace_id.
             *
             * Fix: Use window StorageEvent — the browser fires this synchronously on
             * every sessionStorage.setItem() call in the SAME tab. The moment
             * hitl_modal.js line-868 writes 'sovereign_trace_id', the handler below
             * fires in <5 ms and relays the upgrade postMessage to the iframe.
             *
             * Fallback: if the trace_id was already written before the iframe loaded
             * (fast backend, slow iframe load), read it synchronously right now.
             * A 30 s deadline warning is kept as a last-resort sentinel (no polling).
             * ─────────────────────────────────────────────────────────────────────── */
            (function _relayTraceId() {
                var _relayDone = false;
                var _relayStart = Date.now();
                var _DEADLINE_MS = 30000;

                function _doRelay(tid) {
                    if (_relayDone || !_iframe || !_overlay) return;
                    _relayDone = true;
                    ctx.trace_id = tid;
                    console.log('[HITL Bridge] TRACE-ID RELAY: real trace_id landed →', tid.slice(-8),
                        '— relaying into iframe.');
                    if (_iframe && _iframe.contentWindow) {
                        _iframe.contentWindow.postMessage({
                            type: 'hitl:context',
                            payload: { trace_id: tid, _relay: true }
                        }, '*');
                    }
                    window.removeEventListener('storage', _onStorage);
                    window.removeEventListener('sovereign_storage_upgrade', _onLocalUpgrade);
                    if (window.SovereignBUS) {
                        try { window.SovereignBUS.off('G3FP_CONTEXT_READY'); } catch (e) {}
                    }
                    clearTimeout(_deadlineTimer);
                }

                function _readTid() {
                    try {
                        var tid = sessionStorage.getItem('sovereign_trace_id');
                        if (!tid) {
                            var hc = JSON.parse(sessionStorage.getItem('sovereign_hitl_context') || 'null');
                            if (hc && hc.trace_id) tid = hc.trace_id;
                        }
                        return (tid && !tid.startsWith('REJECT_')) ? tid : null;
                    } catch (e) { return null; }
                }

                function _onLocalUpgrade() {
                    var tid = _readTid();
                    if (tid) _doRelay(tid);
                }

                /* Attempt 1: synchronous read — covers the case where fast-path already
                 * completed before the iframe's load event fired. */
                var immediateId = _readTid();
                if (immediateId) { _doRelay(immediateId); return; }

                /* Attempt 2: StorageEvent listener — fires in <5 ms on write from other tabs. */
                function _onStorage(ev) {
                    if (!ev || (ev.key !== 'sovereign_trace_id' && ev.key !== 'sovereign_hitl_context')) return;
                    var tid = _readTid();
                    if (tid) _doRelay(tid);
                }
                window.addEventListener('storage', _onStorage);

                /* Attempt 2b: Local sessionStorage proxy listener (same window). */
                window.addEventListener('sovereign_storage_upgrade', _onLocalUpgrade);

                /* Attempt 2c: SovereignBUS event listener as a secondary fallback. */
                if (window.SovereignBUS) {
                    window.SovereignBUS.on('G3FP_CONTEXT_READY', _onLocalUpgrade);
                }

                /* Attempt 3: 30 s deadline warning sentinel (no polling). */
                var _deadlineTimer = setTimeout(function () {
                    if (_relayDone) return;
                    window.removeEventListener('storage', _onStorage);
                    window.removeEventListener('sovereign_storage_upgrade', _onLocalUpgrade);
                    if (window.SovereignBUS) {
                        try { window.SovereignBUS.off('G3FP_CONTEXT_READY'); } catch (e) {}
                    }
                    console.warn('[HITL Bridge] TRACE-ID RELAY: 30 s deadline reached — no real trace_id. Chatbot remains stateless.');
                }, _DEADLINE_MS);
            })();
        });

        _iframe.src = _modalURL() + '?t=' + Date.now(); /* cache-bust */
        /* Commented out to resolve browser sandbox escape warning.
         * Since this is a first-party, same-origin iframe that absolutely requires
         * allow-scripts and allow-same-origin, sandboxing is redundant and triggers warnings. */
        // _iframe.setAttribute('sandbox',
        //     'allow-scripts allow-same-origin allow-forms allow-popups');
        /* HOTFIX: microphone delegation uses Permissions Policy `allow` attr,
         * NOT sandbox tokens. `allow-microphone` is an illegal sandbox flag that
         * triggers a browser parser error and halts the parent thread (Ground Zero). */
        _iframe.setAttribute('allow', 'microphone');

        /* FIX-IFRAME-SCROLL: Apply style DIRECTLY on the iframe element.
         * Parent-page CSS (body overflow, z-index) does NOT propagate into iframe
         * content — this is the CSS cascade boundary. The iframe must be positioned
         * to cover the full viewport so no scrollbar rails from the parent page
         * can bleed through its edges. The _overlay is already inset:0;z-index:MAX
         * but the iframe itself must also be pinned to fill it completely. */
        _iframe.style.cssText = [
            'position:fixed',
            'top:0', 'left:0',
            'width:100vw', 'height:100vh',
            'border:none',
            'background:transparent',
            'z-index:2147483647',
            'display:block',
        ].join(';');

        _overlay.appendChild(_iframe);
        document.body.appendChild(_overlay);

        /* ── Listen for messages from the iframe ── */
        _msgHandler = function (ev) {
            if (!ev.data || typeof ev.data !== 'object') return;
            /* Only accept messages from our own iframe */
            if (_iframe && ev.source !== _iframe.contentWindow) return;

            if (ev.data.type === 'hitl:ready') {
                console.log('[HITL Bridge] Child reported hitl:ready. Sending context...');
                if (_iframe && _iframe.contentWindow) {
                    _iframe.contentWindow.postMessage({ type: 'hitl:context', payload: ctx }, '*');
                }
                return;
            }

            if (ev.data.type === 'hitl:confirmed') {
                const payload = Object.assign({ file }, ev.data.payload || {});
                /* CRITICAL FIX: Capture callback reference BEFORE _destroy() nulls _onConfirm */
                const cb = _onConfirm;
                _destroy();
                document.body.classList.remove('hitl-active', 'modal-active-lock'); /* FIX-SCROLL-02 */
                document.querySelectorAll('.sv-pill').forEach(function (p) { p.style.display = (p._hitlDisplay !== undefined) ? p._hitlDisplay : ''; delete p._hitlDisplay; }); /* FIX-PILL-02 */

                window.dispatchEvent(new CustomEvent('hitl:confirmed', { detail: payload }));
                window.dispatchEvent(new CustomEvent('SOVEREIGN_MODAL_CLOSED', { detail: { reason: 'confirmed' } }));
                try { cb && cb(payload); } catch (e) { console.error('[HITL Bridge] onConfirm error', e); }
                return;
            }

            if (ev.data.type === 'hitl:cancelled') {
                if (_cancelling) return;   /* already being handled by dismiss() */
                _cancelling = true;
                const cb = _onCancel;
                _destroy();
                document.body.classList.remove('hitl-active', 'modal-active-lock'); /* FIX-SCROLL-02 */
                document.querySelectorAll('.sv-pill').forEach(function (p) { p.style.display = (p._hitlDisplay !== undefined) ? p._hitlDisplay : ''; delete p._hitlDisplay; }); /* FIX-PILL-02 */
                _cancelling = false;

                window.dispatchEvent(new CustomEvent('hitl:cancelled', { detail: {} }));
                window.dispatchEvent(new CustomEvent('SOVEREIGN_MODAL_CLOSED', { detail: { reason: 'cancelled' } }));
                try { cb && cb(); } catch (e) { console.error('[HITL Bridge] onCancel error', e); }
                return;
            }
        };
        window.addEventListener('message', _msgHandler);

        /* ── Click-outside to dismiss ── */
        _overlay.addEventListener('click', function (e) {
            if (e.target === _overlay) dismiss();
        });

        /* ── Escape key to dismiss ── */
        document._hitlEscHandler = function (e) {
            if (e.key === 'Escape') dismiss();
        };
        document.addEventListener('keydown', document._hitlEscHandler);
    }

    /* ── Public API: dismiss ──────────────────────────────────────────────── */
    function dismiss() {
        if (_cancelling) return;   /* already being cleaned up via iframe message */
        if (document._hitlEscHandler) {
            document.removeEventListener('keydown', document._hitlEscHandler);
            delete document._hitlEscHandler;
        }
        _cancelling = true;
        const cb = _onCancel;
        _destroy();
        document.body.classList.remove('hitl-active', 'modal-active-lock'); /* FIX-SCROLL-02 */
        document.querySelectorAll('.sv-pill').forEach(function (p) { p.style.display = (p._hitlDisplay !== undefined) ? p._hitlDisplay : ''; delete p._hitlDisplay; }); /* FIX-PILL-02 */
        _cancelling = false;

        window.dispatchEvent(new CustomEvent('hitl:cancelled', { detail: {} }));
        window.dispatchEvent(new CustomEvent('SOVEREIGN_MODAL_CLOSED', { detail: { reason: 'dismissed' } }));
        if (cb) try { cb(); } catch (e) { console.error('[HITL Bridge] onCancel error', e); }
    }

    /* ── Export under the same global name used by op_01/op_03 ──────────── */
    global.HITLModal = {
        show,
        dismiss,
        isOpen: function () { return !!_overlay; }
    };

})(window);
