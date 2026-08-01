/* ══════════════════════════════════════════════════════════
   Module: CoreTab.js
   Version: 1.0.0
   Description: Self-registering Core tab component.
                Displays RAG extraction results and
                ISO 25010 quality characteristics.
   Skill: frontend-tab-generator
   Standards: ISO/IEC 25010 (Functional Suitability)
   Rule 06: Self-registration pattern.
   ══════════════════════════════════════════════════════════ */

class CoreTab {
    constructor() {
        this._element = null;
        this._data    = null;
    }

    /**
     * Called by ComponentRegistry when container is created.
     * @param {HTMLElement} element - The tab's container DOM element
     */
    bind(element) {
        this._element = element;
        this._renderEmpty();
    }

    /** Called when this tab becomes the active/visible tab */
    onActivate() {
        if (this._data) this._render(this._data);
    }

    /** Called when this tab is hidden */
    onDeactivate() { /* No cleanup needed */ }

    /**
     * Called when new pipeline data arrives via BUS.
     * @param {Object} data - DATA_EXTRACTED payload
     */
    onData(data) {
        this._data = data;
        if (this._element) this._render(data);
    }

    /**
     * Render the core results panel.
     * @param {Object} data - { domain, nodes, assessment }
     * @private
     */
    _render(data) {
        if (!data || !data.nodes) {
            console.warn('[CORE_TAB] No data available — rendering empty state');
            this._renderEmpty();
            return;
        }

        const { domain = 'GENERAL', nodes = [], diagnostic_summary = "", assessment = {} } = data;
        const tier = assessment.tier || 'N/A';
        const conf = ((assessment.conf || 0) * 100).toFixed(1);
        const tierClass = tier === 3 ? 'tier-refuse' : tier === 2 ? 'tier-review' : 'tier-accept';

        this._element.innerHTML = `
            <div class="core-tab-header">
                <span class="core-domain-badge">${domain}</span>
                <span class="core-confidence">CONF: ${conf}%</span>
                <span class="core-tier ${tierClass}">TIER ${tier}</span>
            </div>
            
            <!-- WORLD MODEL & DIAGNOSTIC SECTION -->
            ${diagnostic_summary ? `
            <div class="core-diagnostic-panel" style="margin: 20px 0; padding: 15px; border-left: 4px solid #7E6906; background: rgba(0,0,0,0.4); font-family: sans-serif; line-height: 1.6; color: #e0e0e0; white-space: pre-wrap;">
                <h4 style="margin-top: 0; color: #FFF;">ONTOLOGICAL DIAGNOSIS & WORLD MODEL ANALYSIS</h4>
                ${diagnostic_summary}
            </div>
            ` : ''}
            
            <div class="core-nodes-list" style="margin-top: 20px;">
                <h5 style="color: #888;">EXTRACTED VECTORS & PARAMETERS</h5>
                ${nodes.map(n => `
                    <div class="core-node ${n.confidence < 0.60 ? 'node-low-conf' : ''}">
                        <span class="node-id">${n.id}</span>
                        <span class="node-name">${n.name}</span>
                        <span class="node-value">${n.value}</span>
                        <span class="node-conf">${(n.confidence * 100).toFixed(0)}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /** Render placeholder when no data is available yet */
    _renderEmpty() {
        if (!this._element) return;
        this._element.innerHTML = `
            <div class="core-empty-state">
                <p>Awaiting data extraction...</p>
            </div>
        `;
    }
}

/**
 * Self-registration entry point — called by main.js bootloader.
 * Follows frontend-tab-generator skill pattern.
 * @param {Object} registry - ComponentRegistry instance
 * @param {Object} bus      - SovereignBUS instance
 */
export function register(registry, bus) {
    const component = new CoreTab();
    registry.registerTab({
        id:        'core',
        label:     'CORE',
        order:     1,
        component,
    });

    // Subscribe to pipeline data
    bus.on('DATA_EXTRACTED', payload => component.onData(payload));

    return component;
}
