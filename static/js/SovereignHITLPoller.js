/**
 * Module: SovereignHITLPoller
 * Version: 1.0.0
 * Description: Mid-pipeline HITL decision poller. Exposes watch(traceId, cb)
 *              and stopAll() for the OP-03 deduction pipeline.
 *
 * This module resolves Defect 2 (Ghost Poller): the guard at op_03.html line 1447
 *   `if (window.SovereignHITLPoller && window._sovereignTraceId)`
 * previously always evaluated false because this module was never imported.
 *
 * Integration: Injected via <script src="js/SovereignHITLPoller.js"> before
 * the main inline RIGHT PANEL LOGIC script block.
 *
 * Error codes: E009 (BUS_ROUTING_FAILED), E010 (HITL_TIMEOUT)
 */

;(function (global) {
    'use strict';

    /**
     * @typedef {function(string, object=): void} HITLCallback
     * Called when a HITL decision arrives. First arg is decision string,
     * second arg is the full event payload.
     */

    /**
     * Internal registry of active poll handles.
     * Keys are traceId strings; values are { intervalId, timeoutId } objects.
     * @type {Map<string, {intervalId: number, timeoutId: number}>}
     */
    var _activePolls = new Map();

    /**
     * Sovereign poll interval (ms). Kept short so mid-pipeline reviews
     * resolve within a single heartbeat cycle.
     * @const {number}
     */
    var POLL_INTERVAL_MS = 1500;

    /**
     * Maximum time (ms) to wait for a HITL decision before auto-resolving
     * with a TIMEOUT decision and firing E010.
     * @const {number}
     */
    var POLL_TIMEOUT_MS = 120000; // 2 minutes

    /**
     * Sovereign session key written by the HITL modal when the user
     * confirms or rejects a review. Format:
     *   { decision: 'CONFIRM'|'REJECT', stage: string, traceId: string }
     * @const {string}
     */
    var SESSION_DECISION_KEY = 'sovereign_hitl_decision';

    /**
     * Polls for a HITL decision associated with the given traceId.
     * Fires cb(decision, payload) once and stops the poll automatically.
     * A second call with the same traceId replaces the previous watcher.
     *
     * @param {string}       traceId - The sovereign trace ID being monitored.
     * @param {HITLCallback} cb      - Callback invoked on decision arrival.
     * @returns {void}
     */
    function watch(traceId, cb) {
        if (typeof traceId !== 'string' || !traceId) {
            console.error('[SovereignHITLPoller] E009: watch() called without a valid traceId.');
            return;
        }
        if (typeof cb !== 'function') {
            console.error('[SovereignHITLPoller] E009: watch() called without a valid callback.');
            return;
        }

        /* Stop any pre-existing watcher for this traceId. */
        _stopTrace(traceId);

        console.log('[SovereignHITLPoller] Starting poll for traceId=' + traceId);

        var intervalId = setInterval(function () {
            try {
                var raw = sessionStorage.getItem(SESSION_DECISION_KEY);
                if (!raw) return;

                var payload = JSON.parse(raw);
                /* Only consume decisions that belong to this traceId. */
                if (payload && payload.traceId === traceId) {
                    /* Clear the key so stale decisions don't re-fire. */
                    sessionStorage.removeItem(SESSION_DECISION_KEY);
                    _stopTrace(traceId);
                    console.log('[SovereignHITLPoller] Decision received: ' + payload.decision + ' · traceId=' + traceId);
                    cb(payload.decision, payload);
                }
            } catch (e) {
                console.error('[SovereignHITLPoller] E003: Failed to parse decision payload.', e);
            }
        }, POLL_INTERVAL_MS);

        /* E010 auto-timeout: resolve with TIMEOUT decision if no response. */
        var timeoutId = setTimeout(function () {
            _stopTrace(traceId);
            console.warn('[SovereignHITLPoller] E010: HITL_TIMEOUT — no decision received within '
                + (POLL_TIMEOUT_MS / 1000) + 's for traceId=' + traceId);
            cb('TIMEOUT', { traceId: traceId, decision: 'TIMEOUT', stage: 'PIPELINE' });
        }, POLL_TIMEOUT_MS);

        _activePolls.set(traceId, { intervalId: intervalId, timeoutId: timeoutId });
    }

    /**
     * Stops all active HITL pollers. Called during page teardown or
     * when a hard-reset is triggered.
     *
     * @returns {void}
     */
    function stopAll() {
        if (_activePolls.size === 0) return;
        console.log('[SovereignHITLPoller] Stopping all ' + _activePolls.size + ' active poller(s).');
        _activePolls.forEach(function (handle, traceId) {
            _stopTrace(traceId);
        });
    }

    /**
     * Internal: clears a single trace poll by id.
     * @param {string} traceId
     * @private
     */
    function _stopTrace(traceId) {
        var handle = _activePolls.get(traceId);
        if (!handle) return;
        clearInterval(handle.intervalId);
        clearTimeout(handle.timeoutId);
        _activePolls.delete(traceId);
        console.log('[SovereignHITLPoller] Stopped poll for traceId=' + traceId);
    }

    /* ── Public API surface ────────────────────────────────────────────────── */
    global.SovereignHITLPoller = {
        watch:   watch,
        stopAll: stopAll
    };

    /* Clean up on page unload to prevent ghost timers leaking across navigations. */
    window.addEventListener('pagehide', stopAll);
    window.addEventListener('beforeunload', stopAll);

    console.log('[SovereignHITLPoller] Module loaded. Ghost Poller defect resolved.');

})(window);
