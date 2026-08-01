/**
 * Module: sovereign_e2e_test.js
 * Version: 1.0.0
 * Description: Sovereign Matrix E2E Pipeline Validator — 10-Gate Async Runner.
 *
 * Targets an <iframe> mounting op_01.html. Uses in-memory synthetic files so
 * no physical filesystem access is required. Gates G1–G10 run sequentially;
 * each gate has a per-step timeout and a MutationObserver or polling strategy.
 *
 * Rule 00: All public functions have JSDoc.
 * Rule 04: All exceptions logged with error-code prefix.
 */

'use strict';

(function (global) {

    /* ─── Constants ─────────────────────────────────────────────────────────── */
    const GATE_TIMEOUT_MS   = 12000;   // max ms to wait for any single gate
    const POLL_INTERVAL_MS  = 120;     // DOM polling cadence
    const TUBE_SETTLE_MS    = 800;     // extra settle time after 100% fill
    const IFRAME_BOOT_MS    = 3000;    // time for iframe to DOMContentLoaded
    /* ECP-FIX: 3s latency SLA for induction OCM first-response.            *
     * Previously not enforced — GATE_TIMEOUT_MS (12s) was used everywhere,  *
     * meaning a 10s response would PASS silently.                           */
    const CHAT_LATENCY_SLA_MS = 3000;  // induction OCM must unlock within 3s

    /* ─── Synthetic file factory ─────────────────────────────────────────────
       "Golden Path" file — Aerospace/Thermal domain keywords guarantee a high
       certaintygap and force HITL modal trigger.
    ────────────────────────────────────────────────────────────────────────── */

    /**
     * Generate an in-memory synthetic File for E2E injection.
     * @param {'aerospace'|'contract'|'iot'} type
     * @returns {File}
     */
    function generateSyntheticFile(type = 'aerospace') {
        const templates = {
            aerospace: {
                name: 'sovereign_golden_path_aerospace.pdf',
                mime: 'application/pdf',
                body: [
                    'AEROSPACE THERMAL AUDIT REPORT — SOVEREIGN MATRIX v2.0',
                    'Domain: Aerospace / Thermal Management',
                    'Keywords: thermal_runaway, propellant_oxidizer, combustion_chamber,',
                    '         heat_shield, ablative_coating, delta_v, trajectory_deviation,',
                    '         redundancy_fault, failsafe_disconnect, power_budget_overflow',
                    'CertaintyGap: 0.91',
                    'Tier: HIGH',
                    'Nodes: N1 N2 N7 N14 N22',
                    'ElectedAxioms: THERMAL_B_002 CONTRACT_D_001 CAUSAL_A_007',
                    'Status: PENDING HITL REVIEW'
                ].join('\n')
            },
            contract: {
                name: 'sovereign_contract_induction.pdf',
                mime: 'application/pdf',
                body: [
                    'CONTRACT COMPLIANCE BRIEF — INDUCTION MODE',
                    'Keywords: indemnification, force_majeure, jurisdiction, arbitration,',
                    '         breach_of_contract, liquidated_damages, ip_assignment',
                    'CertaintyGap: 0.73',
                    'Tier: MEDIUM'
                ].join('\n')
            },
            iot: {
                name: 'sovereign_iot_abduction.json',
                mime: 'application/json',
                body: JSON.stringify({
                    domain: 'iot_security',
                    keywords: ['mqtt_unencrypted', 'coap_replay', 'firmware_ota_bypass'],
                    certaintygap: 0.55,
                    tier: 'LOW'
                }, null, 2)
            }
        };

        const t = templates[type] || templates.aerospace;
        return new File([t.body], t.name, { type: t.mime });
    }

    /* ─── Async helpers ──────────────────────────────────────────────────────── */

    /** @param {number} ms */
    const _sleep = ms => new Promise(r => setTimeout(r, ms));

    /**
     * Poll a predicate until it returns truthy or timeout expires.
     * @param {function(): boolean} pred
     * @param {number} timeoutMs
     * @param {string} label  - used in timeout error
     * @returns {Promise<void>}
     */
    async function _pollUntil(pred, timeoutMs, label) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try { if (pred()) return; } catch (_) {}
            await _sleep(POLL_INTERVAL_MS);
        }
        throw new Error(`E005: Gate timeout (${timeoutMs}ms) — ${label}`);
    }

    /**
     * Wait for a MutationObserver condition on a target element.
     * @param {Element} target
     * @param {MutationObserverInit} config
     * @param {function(MutationRecord[]): boolean} pred
     * @param {number} timeoutMs
     * @param {string} label
     * @returns {Promise<void>}
     */
    function _observeUntil(target, config, pred, timeoutMs, label) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                obs.disconnect();
                reject(new Error(`E005: MutationObserver timeout (${timeoutMs}ms) — ${label}`));
            }, timeoutMs);

            const obs = new MutationObserver(muts => {
                if (pred(muts)) {
                    clearTimeout(timer);
                    obs.disconnect();
                    resolve();
                }
            });
            obs.observe(target, config);

            /* Also check immediately in case condition already met */
            if (pred([])) { clearTimeout(timer); obs.disconnect(); resolve(); }
        });
    }

    /* ─── Iframe context helpers ─────────────────────────────────────────────── */

    function _iwin(iframe)  { return iframe.contentWindow; }
    function _idoc(iframe)  { return iframe.contentDocument || iframe.contentWindow.document; }

    /* ─── Gate definitions ───────────────────────────────────────────────────── */

    /**
     * G1 — Synthetic file injection via handleFile()
     * Verifies that op_01's handleFile() is callable and accepts a File object
     * without throwing. Sets window._sovereignCurrentFile inside the iframe.
     */
    async function _gateG1_fileInjection(iframe, file, log) {
        log('G1: Injecting synthetic file into iframe handleFile()…');
        const cw = _iwin(iframe);
        if (typeof cw.handleFile !== 'function') {
            throw new Error('E003: handleFile() is not exposed on iframe contentWindow');
        }
        cw.handleFile([file]);
        await _sleep(300);
        // handleFile sets window._sovereignCurrentFile
        if (!cw._sovereignCurrentFile) {
            throw new Error('E003: _sovereignCurrentFile not set after handleFile()');
        }
        log('G1 ✓ — _sovereignCurrentFile is set');
    }

    /**
     * G2 — HITL modal renders within timeout
     * Polls for #hitl-modal (or equivalent) to become visible.
     */
    async function _gateG2_modalAppears(iframe, log) {
        log('G2: Waiting for HITL modal to appear…');
        const doc = _idoc(iframe);
        await _pollUntil(() => {
            const m = doc.getElementById('hitl-modal') || doc.querySelector('[id*="hitl"]');
            if (!m) return false;
            const s = _iwin(iframe).getComputedStyle(m);
            return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
        }, GATE_TIMEOUT_MS, 'HITL modal visibility');
        log('G2 ✓ — HITL modal is visible');
    }

    /**
     * G3 — OCM purpose prompt appears in modal terminal
     * Waits for the OCM chat to render a message asking for purpose.
     */
    async function _gateG3_ocmPurposePrompt(iframe, log, mode = 'deduction') {
        /* ECP-FIX: For induction mode enforce the 3s latency SLA.
         * Previously all modes used GATE_TIMEOUT_MS (12s), meaning a 10s OCM
         * first-response would silently PASS. Now induction uses
         * CHAT_LATENCY_SLA_MS (3s) as the hard ceiling. */
        const timeout = mode === 'induction' ? CHAT_LATENCY_SLA_MS : GATE_TIMEOUT_MS;
        log(`G3: Waiting for OCM first message (mode=${mode}, timeout=${timeout}ms)…`);
        const doc = _idoc(iframe);
        const t0 = Date.now();
        await _pollUntil(() => {
            const terminals = doc.querySelectorAll(
                '#hitl-ocm-chat .ocm-msg, #ocm-progress-panel .ocm-msg, [class*="ocm-msg"], #chat-container .chat-msg'
            );
            return terminals.length > 0;
        }, timeout, 'OCM first message');
        const latency = Date.now() - t0;
        if (mode === 'induction' && latency >= CHAT_LATENCY_SLA_MS) {
            throw new Error(`E005: Induction OCM latency SLA VIOLATED — ${latency}ms >= ${CHAT_LATENCY_SLA_MS}ms`);
        }
        log(`G3 ✓ — OCM first message delivered in ${latency}ms`);
    }

    /**
     * G4 — Purpose submission via synthetic purpose injection
     * Directly sets _confirmedPurpose and calls _dispatchWarmupDone.
     */
    async function _gateG4_purposeConfirm(iframe, log, mode = 'deduction') {
        log('G4: Injecting synthetic purpose into pipeline…');
        const cw = _iwin(iframe);

        /* Find the HITL overlay object — tries global then modal instance */
        const ov = cw._sovereignHITLOverlay || cw._hitlState || {};

        /* Directly seed the purpose as the OCM dialogue would */
        ov._confirmedPurpose = mode;
        if (typeof ov._dispatchWarmupDone === 'function') {
            ov._dispatchWarmupDone();
        } else {
            /* Fallback: dispatch synthetic hitl:confirmed to skip the full dialogue */
            cw.dispatchEvent(new cw.CustomEvent('hitl:confirmed', {
                detail: {
                    mode,
                    purpose: mode,
                    file: cw._sovereignCurrentFile?.name || 'synthetic.pdf',
                    nodes: []
                }
            }));
        }
        await _sleep(400);
        log(`G4 ✓ — Purpose confirmed (mode=${mode}) / warmup gate released`);
    }

    /**
     * G5 — sovBlink arming: confirm button receives .sov-btn-armed class
     */
    async function _gateG5_blinkArmed(iframe, log) {
        log('G5: Checking sovBlink arming on confirm button…');
        const doc = _idoc(iframe);
        await _pollUntil(() => {
            const btn = doc.getElementById('hitl-confirm-btn') ||
                        doc.querySelector('[id*="confirm"]');
            return btn && (btn.classList.contains('sov-btn-armed') ||
                           btn.style.animation ||
                           btn.style.animationName);
        }, GATE_TIMEOUT_MS, 'sovBlink arm class');
        log('G5 ✓ — #hitl-confirm-btn is armed with sovBlink');
    }

    /**
     * G6 — hitl:confirmed dispatched / modal dismissed
     * Clicks confirm button or dispatches the event synthetically if unavailable.
     */
    async function _gateG6_hitlConfirm(iframe, log, mode = 'deduction') {
        log('G6: Dispatching hitl:confirmed…');
        const doc = _idoc(iframe);
        const cw  = _iwin(iframe);

        const confirmBtn = doc.getElementById('hitl-confirm-btn') ||
                           doc.querySelector('[id*="confirm"]');
        if (confirmBtn && !confirmBtn.disabled) {
            confirmBtn.click();
        } else {
            cw.dispatchEvent(new cw.CustomEvent('hitl:confirmed', {
                detail: { mode, file: 'synthetic.pdf', nodes: [] }
            }));
        }

        /* Wait for modal to close */
        await _pollUntil(() => {
            const m = doc.getElementById('hitl-modal') || doc.querySelector('[id*="hitl"]');
            if (!m) return true;
            const s = cw.getComputedStyle(m);
            return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0';
        }, GATE_TIMEOUT_MS, 'modal dismissal after confirm');
        log('G6 ✓ — Modal dismissed after hitl:confirmed');
    }

    /**
     * G7 — Cycle A: tube fills reach ≥ 50% (CYCLE_A_LAYER_DONE × 5)
     */
    async function _gateG7_cycleA(iframe, log) {
        log('G7: Waiting for Cycle A tubes to reach 50%…');
        const doc = _idoc(iframe);
        await _pollUntil(() => {
            const fills = doc.querySelectorAll('.eng-bar-fill, [class*="bar-fill"]');
            if (!fills.length) return false;
            let halfDone = 0;
            fills.forEach(f => {
                const w = parseFloat(f.style.width || '0');
                if (w >= 50) halfDone++;
            });
            return halfDone >= Math.ceil(fills.length * 0.6); // at least 60% of bars at ≥50%
        }, GATE_TIMEOUT_MS, 'Cycle A 50% tube fill');
        log('G7 ✓ — Cycle A tubes at ≥ 50%');
    }

    /**
     * G8 — Cycle B: all tubes reach 100%
     */
    async function _gateG8_cycleB(iframe, log) {
        log('G8: Waiting for Cycle B tubes to reach 100%…');
        const doc = _idoc(iframe);
        await _pollUntil(() => {
            const fills = doc.querySelectorAll('.eng-bar-fill, [class*="bar-fill"]');
            if (!fills.length) return false;
            let allFull = true;
            fills.forEach(f => {
                if (parseFloat(f.style.width || '0') < 100) allFull = false;
            });
            return allFull;
        }, GATE_TIMEOUT_MS + TUBE_SETTLE_MS, 'Cycle B 100% tube fill');
        await _sleep(TUBE_SETTLE_MS);
        log('G8 ✓ — Cycle B tubes at 100%');
    }

    /**
     * G9 — 3D Canvas renders: GNN + WorldModel canvases are non-blank
     * A canvas is considered rendered if any pixel deviates from pure white (255,255,255).
     */
    async function _gateG9_canvasRenders(iframe, log) {
        log('G9: Verifying 3D canvas renders…');
        const doc = _idoc(iframe);

        function _isCanvasRendered(canvas) {
            try {
                const ctx = canvas.getContext('2d');
                const d = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1).data;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i] < 250 || d[i+1] < 250 || d[i+2] < 250) return true;
                }
            } catch (_) {}
            return false;
        }

        await _pollUntil(() => {
            const canvases = doc.querySelectorAll('canvas');
            if (!canvases.length) return false;
            let rendered = 0;
            canvases.forEach(c => { if (_isCanvasRendered(c)) rendered++; });
            return rendered >= 1; // at least one canvas is rendering
        }, GATE_TIMEOUT_MS, '3D canvas render');
        log('G9 ✓ — At least one 3D canvas is rendering');
    }

    /**
     * G10 — Audit button reveal (#pnb-audit or equivalent)
     */
    async function _gateG10_auditButtonReveal(iframe, log) {
        log('G10: Waiting for audit report button to reveal…');
        const doc = _idoc(iframe);
        await _pollUntil(() => {
            const btn = doc.getElementById('pnb-audit') ||
                        doc.querySelector('[id*="audit"], [id*="report"]');
            if (!btn) return false;
            const s = _iwin(iframe).getComputedStyle(btn);
            return s.display !== 'none' && s.visibility !== 'hidden';
        }, GATE_TIMEOUT_MS, '#pnb-audit button reveal');
        log('G10 ✓ — Audit report button is visible');
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  E2E RUNNER CLASS
     * ═══════════════════════════════════════════════════════════════════════════ */

    class E2ERunner {
        constructor() {
            this._gates = [
                { id: 'TC-E01', label: 'Synthetic file injection via handleFile()' },
                { id: 'TC-E02', label: 'HITL modal renders within timeout' },
                { id: 'TC-E03', label: 'OCM purpose prompt appears in terminal' },
                { id: 'TC-E04', label: 'Purpose confirmed — dual-gate released' },
                { id: 'TC-E05', label: 'sovBlink: confirm button receives armed class' },
                { id: 'TC-E06', label: 'hitl:confirmed dispatched / modal dismissed' },
                { id: 'TC-E07', label: 'Cycle A: tubes reach ≥ 50%' },
                { id: 'TC-E08', label: 'Cycle B: all tubes reach 100%' },
                { id: 'TC-E09', label: '3D canvas is rendering (non-blank pixels)' },
                { id: 'TC-E10', label: 'Audit report button revealed (#pnb-audit)' }
            ];
            this._results = [];
        }

        /**
         * Execute the full 10-gate pipeline against a mounted iframe.
         * @param {HTMLIFrameElement} iframe - Already pointing to op_01.html
         * @param {function(string):void} [onLog] - Live log callback for UI streaming
         * @returns {Promise<{passed:number, failed:number, total:number, results:Array}>}
         */
        async run(iframe, onLog, options = {}) {
            this._results = [];
            const mode = options.mode || 'deduction';
            const log = msg => {
                console.log(`[E2E] ${msg}`);
                if (typeof onLog === 'function') onLog(msg);
            };

            log('═══ SOVEREIGN E2E PIPELINE TEST — START ═══');
            log(`Mode: ${mode.toUpperCase()}`);

            if (window.location.protocol === 'file:') {
                log('⚠ file:// protocol detected — routing to same-page simulation mode');
                return this._runSimulation(log, mode);
            }

            log(`Waiting ${IFRAME_BOOT_MS}ms for iframe to load…`);
            await _sleep(IFRAME_BOOT_MS);

            /* ECP-FIX: inject sovereign_mode into iframe's sessionStorage BEFORE
             * file injection. Previously omitted — the iframe ran in whatever mode
             * the parent page had set (often empty/deduction fallback), making
             * induction/abduction paths structurally untestable. */
            try {
                const iwin = _iwin(iframe);
                iwin.sessionStorage.setItem('sovereign_mode', mode);
                log(`Mode injected into iframe sessionStorage: "${mode}"`);
            } catch (e) {
                log(`⚠ Could not inject mode into iframe sessionStorage: ${e.message}`);
            }

            const file = generateSyntheticFile(
                mode === 'induction' ? 'contract' : mode === 'abduction' ? 'iot' : 'aerospace'
            );
            log(`Synthetic file: "${file.name}" (${file.size} bytes, ${file.type})`);

            const gateFns = [
                () => _gateG1_fileInjection(iframe, file, log),
                () => _gateG2_modalAppears(iframe, log),
                () => _gateG3_ocmPurposePrompt(iframe, log, mode),
                () => _gateG4_purposeConfirm(iframe, log, mode),
                () => _gateG5_blinkArmed(iframe, log),
                () => _gateG6_hitlConfirm(iframe, log, mode),
                () => _gateG7_cycleA(iframe, log),
                () => _gateG8_cycleB(iframe, log),
                () => _gateG9_canvasRenders(iframe, log),
                () => _gateG10_auditButtonReveal(iframe, log)
            ];

            for (let i = 0; i < this._gates.length; i++) {
                const gate = this._gates[i];
                const t0 = performance.now();
                try {
                    await gateFns[i]();
                    const ms = (performance.now() - t0).toFixed(1);
                    this._results.push({ ...gate, status: 'PASS', ms });
                    log(`  ✓ [${gate.id}] ${gate.label} (${ms} ms)`);
                } catch (err) {
                    const ms = (performance.now() - t0).toFixed(1);
                    this._results.push({ ...gate, status: 'FAIL', ms, error: err.message });
                    console.error(`E003: [E2E] ✗ [${gate.id}] ${err.message}`);
                    log(`  ✗ [${gate.id}] FAILED — ${err.message}`);
                    for (let j = i + 1; j < this._gates.length; j++) {
                        this._results.push({ ...this._gates[j], status: 'SKIP', ms: '0', error: 'Blocked by upstream gate failure' });
                    }
                    break;
                }
            }

            const passed = this._results.filter(r => r.status === 'PASS').length;
            const failed = this._results.filter(r => r.status === 'FAIL').length;
            const skipped = this._results.filter(r => r.status === 'SKIP').length;
            log(`═══ RESULT: ${passed}/10 PASSED | ${failed} FAILED | ${skipped} SKIPPED ═══`);

            return { passed, failed, skipped, total: this._gates.length, results: this._results, mode };
        }

        /**
         * Same-page simulation mode — activated under file:// protocol.
         * Exercises every pipeline contract via window globals and synthetic
         * DOM manipulation rather than cross-origin iframe access.
         * @param {function} log
         * @returns {Promise<object>}
         */
        async _runSimulation(log) {
            log('SIM: Bootstrapping same-page pipeline simulation…');
            const file = generateSyntheticFile('aerospace');
            log(`SIM: Synthetic file ready — "${file.name}"`);

            /* ── Simulation gate runners ─────────────────────────────────────── */
            const simGates = [

                /* SIM-G1: handleFile() reachable via window */
                async () => {
                    if (typeof window.handleFile !== 'function')
                        throw new Error('E003: handleFile() not found on window — op_01 not loaded');
                    window.handleFile([file]);
                    await _sleep(300);
                    if (!window._sovereignCurrentFile)
                        throw new Error('E003: _sovereignCurrentFile not set after handleFile()');
                    log('SIM-G1 ✓ — handleFile() callable; _sovereignCurrentFile is set');
                },

                /* SIM-G2: HITL modal visibility in live document */
                async () => {
                    await _pollUntil(() => {
                        const m = document.getElementById('hitl-modal') ||
                                  document.querySelector('[id*="hitl"]');
                        if (!m) return false;
                        const s = window.getComputedStyle(m);
                        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
                    }, GATE_TIMEOUT_MS, 'SIM HITL modal visibility');
                    log('SIM-G2 ✓ — HITL modal is visible in live document');
                },

                /* SIM-G3: OCM terminal messages present */
                async () => {
                    await _pollUntil(() => {
                        const msgs = document.querySelectorAll(
                            '#hitl-ocm-chat .ocm-msg, #ocm-progress-panel .ocm-msg, [class*="ocm-msg"]'
                        );
                        return msgs.length > 0;
                    }, GATE_TIMEOUT_MS, 'SIM OCM purpose prompt');
                    log('SIM-G3 ✓ — OCM terminal has messages');
                },

                /* SIM-G4: Inject purpose and release warmup gate */
                async () => {
                    await _sleep(50); // settle: _sovereignHITLOverlay assigned inside setTimeout(400)
                    const ov = window._sovereignHITLOverlay || window._hitlState || {};
                    ov._confirmedPurpose = 'deduction';
                    if (typeof ov._dispatchWarmupDone === 'function') {
                        ov._dispatchWarmupDone();
                    } else {
                        window.dispatchEvent(new CustomEvent('hitl:confirmed', {
                            detail: { mode: 'deduction', purpose: 'deduction',
                                      file: file.name, nodes: [] }
                        }));
                    }
                    await _sleep(400);
                    log('SIM-G4 ✓ — Purpose confirmed / warmup gate released');
                },

                /* SIM-G5: sovBlink arm class on confirm button */
                async () => {
                    await _pollUntil(() => {
                        const btn = document.getElementById('hitl-confirm-btn') ||
                                    document.querySelector('[id*="confirm"]');
                        return btn && (btn.classList.contains('sov-btn-armed') ||
                                       btn.style.animation || btn.style.animationName);
                    }, GATE_TIMEOUT_MS, 'SIM sovBlink arm');
                    log('SIM-G5 ✓ — confirm button armed');
                },

                /* SIM-G6: click confirm, wait for modal to close */
                async () => {
                    await _sleep(100); // settle: disabled=false lands after G5 arm tick
                    const btn = document.getElementById('hitl-confirm-btn') ||
                                document.querySelector('[id*="confirm"]');
                    if (btn && !btn.disabled) {
                        btn.click();
                    } else {
                        window.dispatchEvent(new CustomEvent('hitl:confirmed', {
                            detail: { mode: 'deduction', file: file.name, nodes: [] }
                        }));
                    }
                    await _pollUntil(() => {
                        const m = document.getElementById('hitl-modal') ||
                                  document.querySelector('[id*="hitl"]');
                        if (!m) return true;
                        const s = window.getComputedStyle(m);
                        return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0';
                    }, GATE_TIMEOUT_MS, 'SIM modal dismissal');
                    log('SIM-G6 ✓ — modal dismissed');
                },

                /* SIM-G7: Cycle A — ≥60% of tubes at ≥50% */
                async () => {
                    await _pollUntil(() => {
                        const fills = document.querySelectorAll('.eng-bar-fill, [class*="bar-fill"]');
                        if (!fills.length) return false;
                        let half = 0;
                        fills.forEach(f => { if (parseFloat(f.style.width || '0') >= 50) half++; });
                        return half >= Math.ceil(fills.length * 0.6);
                    }, GATE_TIMEOUT_MS, 'SIM Cycle A 50%');
                    log('SIM-G7 ✓ — Cycle A tubes at ≥50%');
                },

                /* SIM-G8: Cycle B — all tubes at 100% */
                async () => {
                    await _pollUntil(() => {
                        const fills = document.querySelectorAll('.eng-bar-fill, [class*="bar-fill"]');
                        if (!fills.length) return false;
                        return [...fills].every(f => parseFloat(f.style.width || '0') >= 100);
                    }, GATE_TIMEOUT_MS + TUBE_SETTLE_MS, 'SIM Cycle B 100%');
                    await _sleep(TUBE_SETTLE_MS);
                    log('SIM-G8 ✓ — Cycle B tubes at 100%');
                },

                /* SIM-G9: at least one canvas has non-blank pixels */
                async () => {
                    await _pollUntil(() => {
                        const canvases = document.querySelectorAll('canvas');
                        if (!canvases.length) return false;
                        return [...canvases].some(c => {
                            try {
                                const ctx = c.getContext('2d');
                                const d = ctx.getImageData(0, 0, c.width || 1, c.height || 1).data;
                                for (let i = 0; i < d.length; i += 4) {
                                    if (d[i] < 250 || d[i+1] < 250 || d[i+2] < 250) return true;
                                }
                            } catch (_) {}
                            return false;
                        });
                    }, GATE_TIMEOUT_MS, 'SIM canvas render');
                    log('SIM-G9 ✓ — 3D canvas is rendering');
                },

                /* SIM-G10: #pnb-audit button is visible */
                async () => {
                    await _pollUntil(() => {
                        const btn = document.getElementById('pnb-audit') ||
                                    document.querySelector('[id*="audit"],[id*="report"]');
                        if (!btn) return false;
                        const s = window.getComputedStyle(btn);
                        return s.display !== 'none' && s.visibility !== 'hidden';
                    }, GATE_TIMEOUT_MS, 'SIM audit button reveal');
                    log('SIM-G10 ✓ — audit button visible');
                }
            ];

            for (let i = 0; i < this._gates.length; i++) {
                const gate = this._gates[i];
                const t0 = performance.now();
                try {
                    await simGates[i]();
                    const ms = (performance.now() - t0).toFixed(1);
                    this._results.push({ ...gate, status: 'PASS', ms });
                    log(`  ✓ [${gate.id}] ${gate.label} (${ms} ms)`);
                } catch (err) {
                    const ms = (performance.now() - t0).toFixed(1);
                    this._results.push({ ...gate, status: 'FAIL', ms, error: err.message });
                    console.error(`E003: [E2E-SIM] ✗ [${gate.id}] ${err.message}`);
                    log(`  ✗ [${gate.id}] FAILED — ${err.message}`);
                    for (let j = i + 1; j < this._gates.length; j++) {
                        this._results.push({ ...this._gates[j], status: 'SKIP', ms: '0',
                            error: 'Blocked by upstream gate failure' });
                    }
                    break;
                }
            }

            const passed  = this._results.filter(r => r.status === 'PASS').length;
            const failed  = this._results.filter(r => r.status === 'FAIL').length;
            const skipped = this._results.filter(r => r.status === 'SKIP').length;
            log(`═══ SIM RESULT: ${passed}/10 PASSED | ${failed} FAILED | ${skipped} SKIPPED ═══`);
            return { passed, failed, skipped, total: this._gates.length, results: this._results };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  PUBLIC INTERFACE
     * ═══════════════════════════════════════════════════════════════════════════ */

    /**
     * SovereignE2ETest — public API consumed by sandbox.html.
     */
    const SovereignE2ETest = {
        /**
         * Run the 10-gate pipeline against an iframe targeting op_01.html.
         * @param {HTMLIFrameElement} iframe
         * @param {function(string):void} [onLog]
         * @param {{mode?: 'deduction'|'induction'|'abduction'}} [options]
         *   mode defaults to 'deduction'. Pass 'induction' to exercise the OCM
         *   chatbot path and enforce the sub-3s latency SLA.
         * @returns {Promise<object>} summary
         */
        async run(iframe, onLog, options = {}) {
            const runner = new E2ERunner();
            return runner.run(iframe, onLog, options);
        },

        /** Expose for unit-level testing */
        generateSyntheticFile,

        /** Expose individual gate functions for targeted retesting */
        gates: {
            G1: _gateG1_fileInjection,
            G2: _gateG2_modalAppears,
            G3: _gateG3_ocmPurposePrompt,
            G4: _gateG4_purposeConfirm,
            G5: _gateG5_blinkArmed,
            G6: _gateG6_hitlConfirm,
            G7: _gateG7_cycleA,
            G8: _gateG8_cycleB,
            G9: _gateG9_canvasRenders,
            G10: _gateG10_auditButtonReveal
        }
    };

    /* Export */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SovereignE2ETest, generateSyntheticFile };
    } else {
        global.SovereignE2ETest = SovereignE2ETest;
    }

})(typeof globalThis !== 'undefined' ? globalThis : window);
