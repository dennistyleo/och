/* ══════════════════════════════════════════════════════════
   Module: ComponentRegistry.js
   Version: 1.0.0
   Description: Centralized self-registration hub for all
                Sovereign Matrix UI components.
                Enforces Rule 06: No Hardcoded IDs.
   Standards: ISO/IEC 25010 (Maintainability, Modularity)
              CMMI Level 5 (Quantitative Process Management)
   ══════════════════════════════════════════════════════════ */

export class ComponentRegistry {
    /**
     * Centralized registry for all self-registering UI components.
     * @param {Object} bus - SovereignBUS singleton instance
     */
    constructor(bus) {
        this.bus      = bus;
        this._tabs    = new Map();
        this._zones   = new Map();
        this._services = new Map();
        console.log('[REGISTRY] Initialized — ComponentRegistry v1.0.0');
    }

    /**
     * Register a tab component using the frontend-tab-generator pattern.
     * Components must call this themselves — no external wiring.
     * @param {Object} opts - { id: string, label: string, order: number, component: Object }
     */
    registerTab({ id, label, order, component }) {
        if (!id || !component) {
            console.error(`E401: INVALID_TAB_REGISTRATION — id=${id}`);
            return;
        }
        this._tabs.set(id, { id, label, order, component });
        console.log(`[REGISTRY] TAB_REGISTERED — ${id} (order=${order})`);
        this.bus.emit('REGISTRY:TAB_REGISTERED', { id, label, order });
    }

    /**
     * Register a structural zone handler (Z1–Z5).
     * @param {string} id - Semantic zone ID e.g. 'Z1_TELEMETRY'
     * @param {Object} handler - Zone handler instance
     */
    registerZone(id, handler) {
        if (!id || !handler) {
            console.error(`E401: INVALID_ZONE_REGISTRATION — id=${id}`);
            return;
        }
        this._zones.set(id, handler);
        console.log(`[REGISTRY] ZONE_REGISTERED — ${id}`);
        this.bus.emit('REGISTRY:ZONE_REGISTERED', { id });
    }

    /**
     * Register a named service (TubeService, ToastService, etc.)
     * @param {string} name - Service name constant (UPPER_SNAKE_CASE)
     * @param {Object} instance - Service instance
     */
    registerService(name, instance) {
        if (!name || !instance) {
            console.error(`E401: INVALID_SERVICE_REGISTRATION — name=${name}`);
            return;
        }
        this._services.set(name, instance);
        console.log(`[REGISTRY] SERVICE_REGISTERED — ${name}`);
    }

    /** @returns {Object|undefined} Tab registration data by ID */
    getTab(id) { return this._tabs.get(id); }

    /** @returns {Array<Object>} All registered tabs sorted by display order */
    getTabs() {
        return [...this._tabs.values()].sort((a, b) => a.order - b.order);
    }

    /** @returns {Object|undefined} Zone handler by semantic ID */
    getZone(id) { return this._zones.get(id); }

    /** @returns {Object|undefined} Service instance by name */
    getService(name) { return this._services.get(name); }
}
