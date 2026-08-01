/* ══════════════════════════════════════════════════════════
   Module: ReportTab.js
   Version: 1.0.0
   Description: Self-registering Report tab component.
                Displays L5 Audit Report summary and
                provides download links for artifacts.
   Skill: frontend-tab-generator
   Standards: ISO/IEC 25010 (Functional Suitability)
   Rule 06: Self-registration pattern.
   ══════════════════════════════════════════════════════════ */

class ReportTab {
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
     * @param {Object} data - REPORT_READY payload
     */
    onData(data) {
        this._data = data;
        if (this._element) this._render(data);
    }

    /**
     * Render the report results panel.
     * @param {Object} data - { reports, export_urls, trace_id }
     * @private
     */
    _render(data) {
        if (!data || !data.reports || data.reports.length === 0) {
            console.warn('[REPORT_TAB] No data available — rendering empty state');
            this._renderEmpty();
            return;
        }

        const report = data.reports[0];
        const export_urls = data.export_urls || {};
        const exec_summary = report.executive_summary || {};
        
        const score = parseFloat(exec_summary.composite_score || 0).toFixed(1);
        const dominant_risk = exec_summary.dominant_risk || 'UNKNOWN';
        const recommendation = exec_summary.recommendation || 'N/A';
        const trace_id = data.trace_id || 'UNKNOWN';

        this._element.innerHTML = `
            <div class="report-tab-header" style="margin-bottom: 20px;">
                <h4 style="color: #D4AF37; margin-top: 0; text-transform: uppercase; border-bottom: 1px solid #444; padding-bottom: 5px;">Final Audit Report</h4>
                <div style="font-size: 12px; color: #888; margin-top: 5px;">TRACE: ${trace_id}</div>
            </div>
            
            <div class="report-summary-panel" style="margin: 20px 0; padding: 15px; border-left: 4px solid ${score > 75 ? '#ff3333' : score > 40 ? '#D4AF37' : '#00bf63'}; background: rgba(0,0,0,0.4); font-family: sans-serif; line-height: 1.6; color: #e0e0e0;">
                <h5 style="margin-top: 0; color: #FFF; font-size: 16px;">Executive Summary</h5>
                <div style="margin-bottom: 10px;">
                    <strong>Composite Risk Score:</strong> 
                    <span style="font-size: 18px; font-weight: bold; color: ${score > 75 ? '#ff3333' : score > 40 ? '#D4AF37' : '#00bf63'};">${score} / 100</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Primary Concern:</strong> ${dominant_risk}
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Recommendation:</strong> ${recommendation}
                </div>
            </div>
            
            <div class="report-export-links" style="margin-top: 30px;">
                <h5 style="color: #888; margin-bottom: 15px;">EXPORT ARTIFACTS</h5>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    ${export_urls.html ? `<a href="${export_urls.html}" target="_blank" style="padding: 8px 15px; background: #222; border: 1px solid #D4AF37; color: #D4AF37; text-decoration: none; border-radius: 4px; font-size: 13px; text-transform: uppercase;">View HTML Report</a>` : ''}
                    ${export_urls.json ? `<a href="${export_urls.json}" target="_blank" download style="padding: 8px 15px; background: #222; border: 1px solid #444; color: #ccc; text-decoration: none; border-radius: 4px; font-size: 13px; text-transform: uppercase;">Download JSON</a>` : ''}
                    ${export_urls.csv ? `<a href="${export_urls.csv}" target="_blank" download style="padding: 8px 15px; background: #222; border: 1px solid #444; color: #ccc; text-decoration: none; border-radius: 4px; font-size: 13px; text-transform: uppercase;">Download CSV</a>` : ''}
                </div>
            </div>
        `;
    }

    /** Render placeholder when no data is available yet */
    _renderEmpty() {
        if (!this._element) return;
        this._element.innerHTML = `
            <div class="report-empty-state" style="color: #666; text-align: center; padding: 40px 0;">
                <p>Awaiting final report generation (L5)...</p>
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
    const component = new ReportTab();
    registry.registerTab({
        id:        'report',
        label:     'REPORT',
        order:     5, // L5
        component,
    });

    // Subscribe to pipeline data
    bus.on('REPORT_READY', payload => component.onData(payload));

    return component;
}
