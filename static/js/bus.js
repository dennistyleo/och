/* ══════════════════════════════════════════════════════════
   Module: bus.js
   Version: 2.0.0
   Description: SovereignBUS — typed, deterministic event bus.
                Rule 03: ALL inter-module communication goes
                through this bus exclusively. No direct calls.
   Standards: ISO/IEC 25010 (Reliability, Maintainability)
              NIST SP 800-53 (Audit logging)
              CMMI Level 5 (Quantitative Process Management)
   ══════════════════════════════════════════════════════════ */

/**
 * Sovereign typed event whitelist.
 * Only events in this set are valid — enforces deterministic routing.
 * Rule 03: Events must be typed and validated.
 */
const TYPED_EVENTS = new Set([
    // Pipeline lifecycle
    'DATA_EXTRACTED',
    'ONTOLOGY_CLASSIFIED',
    'HYPOTHESIS_GENERATED',
    'PATHWAY_FILTERED',
    'RISK_ASSESSED',
    'REPORT_READY',
    // Analysis modules
    'DRIFT_DETECTED',
    'SHAPE_COMPARED',
    'CAUSAL_MATRIX_READY',
    // HITL
    'HITL_REQUEST',
    'HITL_RESPONSE',
    'HITL_SPATIAL_PIN',
    // Phase morphing (Layout Orchestrator)
    'EVT_PHASE_1',
    'EVT_PHASE_2',
    'EVT_PHASE_3',
    // Engine state
    'ENGINE:CHANGED',
    'ENGINE:BOOT',
    'ENGINE:EVALUATE:FORCE',
    // Registry signals
    'REGISTRY:TAB_REGISTERED',
    'REGISTRY:ZONE_REGISTERED',
    // Zone readiness
    'Z1_READY',
    'Z2_READY',
    'Z3_READY',
    // i18n
    'LANG_CHANGED',
    // Pipeline complete
    'PIPELINE_COMPLETE',
    // MCP API & OCM Coordinator Portal
    'MCP_CONFIG_UPDATED',
    'CUSTOM_TOOL_REGISTERED',
    // G3FP Context Ready
    'G3FP_CONTEXT_READY',
    // Error
    'ERROR',
]);

class SovereignBUS {
    constructor() {
        this._listeners = new Map();
        this._cache     = new Map();
        console.log('[BUS] SovereignBUS v2.0.0 — Initialized');
    }

    /**
     * Subscribe to a typed Sovereign event.
     * @param {string} event - Must exist in TYPED_EVENTS whitelist
     * @param {Function} handler - Callback receiving the payload
     */
    on(event, handler) {
        if (!TYPED_EVENTS.has(event)) {
            console.error(`E009: BUS_ROUTING_FAILED — Unknown event: "${event}"`);
            return;
        }
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(handler);
    }

    /**
     * Emit a typed Sovereign event with a structured payload.
     * Payload should include trace_id per Rule 01 (Trace IDs).
     * @param {string} event - Must exist in TYPED_EVENTS whitelist
     * @param {Object} payload - Event data; should include trace_id
     */
    emit(event, payload = {}) {
        if (!TYPED_EVENTS.has(event)) {
            console.error(`E009: BUS_ROUTING_FAILED — Unknown event: "${event}"`);
            return;
        }
        this._cache.set(event, payload);
        const handlers = this._listeners.get(event) || [];
        handlers.forEach(h => {
            try {
                h(payload);
            } catch (err) {
                console.error(`E003: BUS_HANDLER_ERROR on "${event}":`, err);
                this.emit('ERROR', {
                    error_code: 'E003',
                    message: `Handler error on event ${event}`,
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    /**
     * Get the last cached payload for an event.
     * Per Rule 21: Modules may read shared state via getCached only.
     * @param {string} event
     * @returns {Object|null}
     */
    getCached(event) {
        return this._cache.get(event) || null;
    }

    /**
     * Remove all handlers for an event (page/session cleanup).
     * @param {string} event
     */
    off(event) {
        this._listeners.delete(event);
    }
}

// Singleton — one bus for the entire application
export const bus = new SovereignBUS();
