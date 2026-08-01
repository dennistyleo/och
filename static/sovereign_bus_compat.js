/**
 * Module: sovereign_bus_compat.js
 * Version: 1.0.0
 * Description: IIFE shim that exposes window.SovereignBUS for plain-script consumers
 *              (axiom_matcher.js, gnn_3d_engine.js, world-model.js, causal-matrix.js).
 *              If the ES-module bus.js has already set window.SovereignBUS, this is a no-op.
 *
 * Rule 03: ALL inter-module communication goes through SovereignBUS only.
 * Rule 00: Deterministic first — same events always routed identically.
 *
 * Usage (plain script, no import needed):
 *   window.SovereignBUS.on('ONTOLOGY_CLASSIFIED', handler);
 *   window.SovereignBUS.emit('ONTOLOGY_CLASSIFIED', payload);
 */

(function (global) {
    'use strict';

    /* ── Typed event whitelist — mirrors bus.js TYPED_EVENTS ── */
    const TYPED_EVENTS = new Set([
        /* Pipeline lifecycle */
        'DATA_EXTRACTED',
        'ONTOLOGY_CLASSIFIED',
        'HYPOTHESIS_GENERATED',
        'PATHWAY_FILTERED',
        'RISK_ASSESSED',
        'REPORT_READY',
        /* Analysis modules */
        'DRIFT_DETECTED',
        'SHAPE_COMPARED',
        'CAUSAL_MATRIX_READY',
        /* HITL */
        'HITL_REQUEST',
        'HITL_RESPONSE',
        'HITL_SPATIAL_PIN',
        /* Phase morphing */
        'EVT_PHASE_1',
        'EVT_PHASE_2',
        'EVT_PHASE_3',
        /* Engine state */
        'ENGINE:CHANGED',
        'ENGINE:BOOT',
        /* Registry */
        'REGISTRY:TAB_REGISTERED',
        'REGISTRY:ZONE_REGISTERED',
        /* Zone readiness */
        'Z1_READY',
        'Z2_READY',
        'Z3_READY',
        /* Pipeline complete */
        'PIPELINE_COMPLETE',
        /* MCP API & OCM Coordinator Portal */
        'MCP_CONFIG_UPDATED',
        'CUSTOM_TOOL_REGISTERED',
        /* G3FP Context Ready */
        'G3FP_CONTEXT_READY',
        /* Error */
        'ERROR',
    ]);

    /* ── Bail out if ES-module bus already wired ── */
    if (global.SovereignBUS) {
        console.log('[BUS-COMPAT] window.SovereignBUS already present — shim skipped.');
        return;
    }

    /**
     * Lightweight BUS implementation for plain-script contexts.
     * API is identical to the ES-module SovereignBUS in bus.js.
     */
    class SovereignBUSCompat {
        constructor() {
            this._listeners = new Map();
            this._cache     = new Map();
            console.log('[BUS-COMPAT] SovereignBUS v1.0.0 — Global shim active.');
        }

        /**
         * Subscribe to a typed Sovereign event.
         * @param {string} event
         * @param {Function} handler
         */
        on(event, handler) {
            if (!TYPED_EVENTS.has(event)) {
                console.error(`E009: BUS_ROUTING_FAILED — Unknown event: "${event}"`);
                return;
            }
            if (!this._listeners.has(event)) this._listeners.set(event, []);
            this._listeners.get(event).push(handler);

            /* Replay cached payload so late subscribers get last value */
            if (this._cache.has(event)) {
                try { handler(this._cache.get(event)); } catch (err) {
                    console.error(`E003: BUS_COMPAT_REPLAY_ERROR on "${event}":`, err);
                }
            }
        }

        /**
         * Emit a typed Sovereign event.
         * @param {string} event
         * @param {Object} payload
         */
        emit(event, payload = {}) {
            if (!TYPED_EVENTS.has(event)) {
                console.error(`E009: BUS_ROUTING_FAILED — Unknown event: "${event}"`);
                return;
            }
            if (!payload.trace_id) {
                payload.trace_id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            }
            if (!payload.timestamp) {
                payload.timestamp = new Date().toISOString();
            }
            this._cache.set(event, payload);
            const handlers = this._listeners.get(event) || [];
            handlers.forEach(h => {
                try { h(payload); } catch (err) {
                    console.error(`E003: BUS_HANDLER_ERROR on "${event}":`, err);
                }
            });
        }

        /**
         * Get the last cached payload for an event.
         * @param {string} event
         * @returns {Object|null}
         */
        getCached(event) {
            return this._cache.get(event) || null;
        }

        /** Remove all handlers for an event. */
        off(event) { this._listeners.delete(event); }
    }

    global.SovereignBUS = new SovereignBUSCompat();

}(window));
