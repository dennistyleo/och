/**
 * Module: rfp_generator.js
 * Version: 1.1.0
 * Description: RFP Proposal Generator — independent frontend logic.
 *              Sandboxed: communicates only with /rfp/* endpoints on SOVEREIGN_PORT.
 *              Does NOT import or mutate tube_engine.js or axiom_matcher.js.
 *              HITL Bridge: listens for 'pending_hitl' responses and signals
 *              hitl_modal_bridge.js via CustomEvent 'sovereign:rfp:hitl_required'.
 *              Evidence Overlay: hover tooltips showing Source_UID coordinates.
 *              Trust Score: per-section colour-coded confidence indicators.
 *
 * Frontend Data Anchoring Directive (Validator-mandated):
 *  - Zero computation beyond display formatting in this file.
 *  - All rendered values correspond directly to backend Source_UID.
 *  - verifySource(field) — developer console audit tool.
 *  - Session isolation: RFP state is a module-scoped object; no shared globals.
 */

'use strict';

// ── Config ─────────────────────────────────────────────────────────────────────
const RFP_BASE = '';          // Same-origin — sandboxed to SOVEREIGN_PORT
const POLL_MS  = 1500;        // Job status poll interval
const MAX_POLL = 40;          // 60s max (40 × 1500ms)

// ── Tier Gate (client-side fast-path; server enforces authoritative gate) ─────
(function _clientTierGate() {
    const tier = sessionStorage.getItem('sovereign_membership_tier') || 'free';
    if (!['sso', 'pro'].includes(tier.toLowerCase())) {
        document.body.innerHTML = `
            <div id="rfp-gate-wall" style="
                display:flex;align-items:center;justify-content:center;
                min-height:100vh;background:#000000;flex-direction:column;gap:24px;
            ">
                <div style="font-family:'Orbitron',sans-serif;color:#D4AF37;font-size:1.5rem;letter-spacing:4px;">
                    🔒 SSO ENTERPRISE &amp; ABOVE REQUIRED
                </div>
                <div style="color:#666;font-size:0.9rem;max-width:400px;text-align:center;line-height:1.7;">
                    The RFP Proposal Generator is available for SSO Enterprise and Sovereign Pro members.
                </div>
                <a href="/pricing.html#rfp" style="
                    color:#D4AF37;border:1px solid #D4AF37;padding:12px 28px;
                    border-radius:6px;text-decoration:none;font-size:13px;letter-spacing:2px;
                ">VIEW MEMBERSHIP PLANS →</a>
            </div>`;
        document.title = 'Access Restricted — RFP Generator';
    }
})();

// ── State ─────────────────────────────────────────────────────────────────────
// SESSION ISOLATION GUARANTEE:
// RFP is a const module-scoped object — one per browser tab, never shared.
// Server-side isolation is enforced via Flask session (cookie-bound):
//   Session A's raw_spec is stored under session['raw_spec'] keyed to its
//   signed cookie. Session B's generate call reads its OWN session['raw_spec'].
//   _start_synthesis_job receives spec_data as a direct parameter passed at
//   call time — no global server state, no cross-session leakage possible.
const RFP = {
    currentJobId:  null,
    pollCount:     0,
    pollTimer:     null,
    uploadedFile:  null,
    specNodes:     [],
    proposal:      null,
    // sourceMap: populated after upload — maps field → {cell, page, bbox, file}
    sourceMap:     {},
};

// ── DOM Ready ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _bindUploadZone();
    _bindGenerateButton();
    _bindTabSwitcher();
    _bindExportButtons();
    _initProgressBar(0);
    // Event delegation for dynamically generated or manually injected TCO buttons
    const outputContainer = document.getElementById('rfp-proposal-output');
    if (outputContainer) {
        outputContainer.addEventListener('click', e => {
            const btn = e.target.closest('#rfp-tco-btn');
            if (btn) {
                _loadTCO();
            }
        });
    }
    _log('RFP Generator initialised', 'info');
});

// ── Upload Zone ────────────────────────────────────────────────────────────────
function _bindUploadZone() {
    const zone  = document.getElementById('rfp-upload-zone');
    const input = document.getElementById('rfp-file-input');
    if (!zone || !input) return;

    // Drag-and-drop
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) _handleFileSelect(file);
    });

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        if (input.files[0]) _handleFileSelect(input.files[0]);
    });
}

async function _handleFileSelect(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'pdf'].includes(ext)) {
        _showError(`Unsupported format ".${ext}" — upload .xlsx or .pdf`);
        return;
    }

    RFP.uploadedFile = file;
    _setUploadStatus(`Uploading ${file.name}…`, 'pending');
    _initProgressBar(15);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res  = await _apiPost('/rfp/api/proposal/upload', formData, false);
        const data = await res.json();

        if (data.status === 'success') {
            RFP.specNodes  = data.data_nodes || [];
            // Populate sourceMap from raw_spec coordinates returned by server
            RFP.sourceMap  = data.source_map || {};   // {field: {cell, page, bbox, file}}
            _setUploadStatus(`✓ Grounded ${RFP.specNodes.length} data nodes from ${file.name}`, 'success');
            _renderOCMMap(data.data_nodes, data.missing_fields);
            _initProgressBar(30);
            _log(`Upload OK — nodes: ${data.data_nodes.join(', ')}`, 'info');
            document.getElementById('rfp-generate-btn')?.removeAttribute('disabled');
        } else {
            _showError(data.message || 'Upload failed');
            _initProgressBar(0);
        }
    } catch (e) {
        _showError(`Upload error: ${e.message}`);
        _log(`Upload error: ${e}`, 'error');
        _initProgressBar(0);
    }
}

// ── OCM Mapping View ───────────────────────────────────────────────────────────
function _renderOCMMap(nodes, missingFields = []) {
    const panel = document.getElementById('rfp-ocm-map');
    if (!panel) return;

    const missingSet = new Set(missingFields);
    const rows = nodes.map(node => {
        const isMissing = missingSet.has(node);
        return `
            <tr class="ocm-row ${isMissing ? 'ocm-missing' : ''}">
                <td class="ocm-cell ocm-param">${node}</td>
                <td class="ocm-cell ocm-arrow">→</td>
                <td class="ocm-cell ocm-node">
                    OCM:${node.replace(/_/g, ' ').toUpperCase()}_2026
                </td>
                <td class="ocm-cell ocm-status">
                    ${isMissing
                        ? '<span class="ocm-badge ocm-missing-badge">DATA_MISSING</span>'
                        : '<span class="ocm-badge ocm-pass-badge">GROUNDED</span>'
                    }
                </td>
            </tr>`;
    }).join('');

    panel.innerHTML = `
        <h3 class="rfp-panel-title">OCM Mapping View</h3>
        <table class="ocm-table" data-test="rfp-ocm-map">
            <thead>
                <tr>
                    <th>Raw Parameter</th><th></th>
                    <th>Ontology Node</th><th>Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ── Generate Button ────────────────────────────────────────────────────────────
function _bindGenerateButton() {
    const btn = document.getElementById('rfp-generate-btn');
    if (!btn) return;
    btn.addEventListener('click', _startGeneration);
}

async function _startGeneration() {
    const btn    = document.getElementById('rfp-generate-btn');
    const sector = document.getElementById('rfp-sector-select')?.value || 'AI_Power_Management_ASIC';
    const org    = document.getElementById('rfp-org-input')?.value    || 'AIChip Corporation';

    if (btn) btn.setAttribute('disabled', 'true');
    _initProgressBar(35);
    _showG3FPConsole('Fetching 2026 market benchmarks via G3FP…');
    _log('Generation started', 'info');

    try {
        const res  = await _apiPost('/rfp/api/proposal/generate', { sector, org_name: org });
        const data = await res.json();

        if (data.status === 'pending') {
            RFP.currentJobId = data.job_id;
            RFP.pollCount    = 0;
            _initProgressBar(50);
            _showG3FPConsole(`OCM Double-Loop running… Job ${data.job_id}`);
            _pollJobStatus(data.job_id);

        } else if (data.status === 'pending_hitl') {
            _initProgressBar(40);
            _showG3FPConsole('⚠ OCM found compliance gaps — routing to HITL for human confirmation…');
            _triggerHITLBridge(data.hitl_context);
            if (btn) btn.removeAttribute('disabled');

        } else {
            _showError(data.message || 'Generation failed');
            if (btn) btn.removeAttribute('disabled');
        }
    } catch (e) {
        _showError(`Generation error: ${e.message}`);
        _log(`Generation error: ${e}`, 'error');
        if (btn) btn.removeAttribute('disabled');
    }
}

// ── Poll Job Status ────────────────────────────────────────────────────────────
function _pollJobStatus(jobId) {
    clearTimeout(RFP.pollTimer);

    if (RFP.pollCount >= MAX_POLL) {
        _showError('E002: Proposal generation timed out. Please retry.');
        document.getElementById('rfp-generate-btn')?.removeAttribute('disabled');
        return;
    }

    RFP.pollTimer = setTimeout(async () => {
        RFP.pollCount++;
        try {
            const res  = await fetch(`${RFP_BASE}/rfp/api/proposal/status/${jobId}`);
            const data = await res.json();

            if (data.status === 'done') {
                _initProgressBar(100);
                RFP.proposal = data.result;
                _renderProposal(data.result);
                _showG3FPConsole(`✓ Proposal complete — Trust Score: ${data.result?.overall_trust_score ?? 'N/A'}`);
                document.getElementById('rfp-generate-btn')?.removeAttribute('disabled');
            } else if (data.status === 'error') {
                _showError(data.error || 'Synthesis failed (E006)');
                document.getElementById('rfp-generate-btn')?.removeAttribute('disabled');
            } else {
                // Still running
                _initProgressBar(50 + Math.min(RFP.pollCount * 1.5, 45));
                _pollJobStatus(jobId);
            }
        } catch (e) {
            _log(`Poll error: ${e}`, 'error');
            _pollJobStatus(jobId);
        }
    }, POLL_MS);
}

// ── HITL Bridge Signal ────────────────────────────────────────────────────────
function _triggerHITLBridge(hitlContext) {
    // Set HITL context — hitl_modal_bridge.js listens for this
    try {
        sessionStorage.setItem('sovereign_hitl_context', JSON.stringify({
            ...hitlContext,
            mode:   'PROPOSAL_GEN',
            source: 'rfp_generator',
        }));
    } catch (_) {}

    // Fire CustomEvent for hitl_modal_bridge.js listener
    window.dispatchEvent(new CustomEvent('sovereign:rfp:hitl_required', {
        detail: { context: hitlContext, resolveUrl: '/rfp/api/proposal/audit' },
        bubbles: true,
    }));

    _showHITLPanel(hitlContext);
}

function _showHITLPanel(ctx) {
    const panel = document.getElementById('rfp-hitl-panel');
    if (!panel) return;

    const gapRows = (ctx.gaps || []).map(g => `
        <div class="hitl-gap-row">
            <span class="hitl-metric">${g.metric}</span>
            <span class="hitl-issue">${g.issue}</span>
            <span class="hitl-severity hitl-sev-${(g.severity||'').toLowerCase()}">${g.severity || ''}</span>
            <input class="hitl-correction" data-field="${g.metric.toLowerCase()}"
                   placeholder="Enter corrected value…" type="text">
        </div>`).join('');

    panel.innerHTML = `
        <h3 class="rfp-panel-title hitl-title">⚠ HITL Review Required</h3>
        <p class="hitl-desc">OCM detected compliance gaps. Please confirm or correct the values below before generation proceeds.</p>
        <div id="hitl-gap-list">${gapRows}</div>
        <button id="hitl-confirm-btn" class="rfp-btn rfp-btn-gold">CONFIRM &amp; GENERATE</button>
        <button id="hitl-cancel-btn" class="rfp-btn rfp-btn-ghost">CANCEL</button>`;

    panel.style.display = 'block';

    document.getElementById('hitl-confirm-btn')?.addEventListener('click', _submitHITLResponse);
    document.getElementById('hitl-cancel-btn')?.addEventListener('click', () => { panel.style.display = 'none'; });
}

async function _submitHITLResponse() {
    const corrections = {};
    document.querySelectorAll('.hitl-correction').forEach(input => {
        if (input.value.trim()) corrections[input.dataset.field] = input.value.trim();
    });

    const panel  = document.getElementById('rfp-hitl-panel');
    if (panel) panel.style.display = 'none';

    _initProgressBar(45);
    _showG3FPConsole('HITL confirmed — re-running OCM audit with corrections…');

    const sector = document.getElementById('rfp-sector-select')?.value || 'AI_Power_Management_ASIC';
    const org    = document.getElementById('rfp-org-input')?.value    || 'AIChip Corporation';

    try {
        const res  = await _apiPost('/rfp/api/proposal/audit', { corrections, sector, org_name: org });
        const data = await res.json();
        if (data.status === 'pending') {
            RFP.currentJobId = data.job_id;
            RFP.pollCount    = 0;
            _initProgressBar(55);
            _pollJobStatus(data.job_id);
        } else {
            _showError(data.message || 'HITL resubmit failed');
        }
    } catch (e) {
        _showError(`HITL submit error: ${e.message}`);
    }
}

// ── Proposal Renderer ─────────────────────────────────────────────────────────
function _renderProposal(result) {
    const container = document.getElementById('rfp-proposal-output');
    if (!container) return;

    const ext    = result.external_proposal || {};
    const intAud = result.internal_audit    || {};
    const trust  = result.overall_trust_score ?? 'N/A';

    container.innerHTML = `
        <!-- Trust Score Banner -->
        <div class="trust-banner" data-test-trust-score="${trust}">
            <span class="trust-label">OVERALL TRUST SCORE</span>
            <span class="trust-value" style="color:${_trustColour(trust)};">${(trust * 100).toFixed(0)}%</span>
            <span class="trust-sub">Ratio of directly cited vs AI-inferred values</span>
        </div>

        <!-- Tab Switcher -->
        <div class="proposal-tabs">
            <button class="ptab ptab-active" data-target="external-view">External Proposal</button>
            <button class="ptab" data-target="internal-view">Internal Audit</button>
            <button class="ptab" data-target="tco-view">TCO Analysis</button>
        </div>

        <!-- External Proposal -->
        <div id="external-view" class="proposal-view">
            ${_renderSection('I. Executive Summary', ext.section_1_executive_summary, trust)}
            ${_renderSection('II. Compliance Matrix', ext.section_2_compliance_matrix, trust)}
            ${_renderSection('III. Technical Deep-Dive', ext.section_3_technical_deepdive, trust)}
            ${_renderSection('IV. Governance & Compliance', ext.section_4_governance, trust)}
        </div>

        <!-- Internal Audit -->
        <div id="internal-view" class="proposal-view" style="display:none;">
            <div class="audit-section">
                <h4 class="audit-section-title">Gap Analysis</h4>
                ${_renderGaps(intAud.section_1_gap_analysis)}
            </div>
            <div class="audit-section">
                <h4 class="audit-section-title">Missing Data Fields</h4>
                <div class="missing-list">
                    ${(intAud.section_2_missing_data?.missing_fields || []).map(f =>
                        `<div class="missing-tag">[DATA_MISSING_FOR_COMPLIANCE: ${f}]</div>`
                    ).join('') || '<div class="no-missing">✓ No missing fields</div>'}
                </div>
            </div>
            <div class="audit-section">
                <h4 class="audit-section-title">Audit Trail</h4>
                <code class="audit-trail">${intAud.section_3_audit_trail?.trail || 'N/A'}</code>
                <br><code class="audit-trail">Hash: ${intAud.section_3_audit_trail?.audit_hash || 'N/A'}</code>
            </div>
        </div>

        <!-- TCO Placeholder (populated via /api/proposal/pricing call) -->
        <div id="tco-view" class="proposal-view" style="display:none;">
            <button id="rfp-tco-btn" class="rfp-btn rfp-btn-secondary">Calculate TCO →</button>
            <div id="tco-result" class="tco-result"></div>
        </div>`;

    // Bind tab switcher
    container.querySelectorAll('.ptab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.ptab').forEach(t => t.classList.remove('ptab-active'));
            container.querySelectorAll('.proposal-view').forEach(v => v.style.display = 'none');
            tab.classList.add('ptab-active');
            const target = document.getElementById(tab.dataset.target);
            if (target) target.style.display = 'block';
        });
    });

    // TCO button
    document.getElementById('rfp-tco-btn')?.addEventListener('click', _loadTCO);

    // Evidence overlays
    _attachEvidenceOverlays(container);
}

function _renderSection(title, sectionData, trust) {
    if (!sectionData) return '';
    const sectionTrust = typeof trust === 'number' ? trust : 0;
    const lines = typeof sectionData === 'object'
        ? Object.entries(sectionData).map(([k, v]) => {
            const isMissing = typeof v === 'string' && v.includes('DATA_MISSING');
            return `
                <div class="prop-field ${isMissing ? 'field-missing' : ''}">
                    <span class="prop-key">${k.replace(/_/g, ' ')}</span>
                    <span class="prop-val" ${!isMissing ? `data-evidence="${k}"` : ''}>
                        ${_escapeHtml(String(v))}
                    </span>
                </div>`;
        }).join('')
        : `<div class="prop-field"><span class="prop-val">${_escapeHtml(String(sectionData))}</span></div>`;

    return `
        <div class="prop-section" data-test-trust-score="${sectionTrust}">
            <div class="prop-section-header">
                <h4 class="prop-section-title">${title}</h4>
                <div class="section-trust-badge" style="background:${_trustColour(sectionTrust)}22;border:1px solid ${_trustColour(sectionTrust)};">
                    <span style="color:${_trustColour(sectionTrust)};">
                        Trust: ${(sectionTrust * 100).toFixed(0)}%
                    </span>
                </div>
            </div>
            <div class="prop-section-body">${lines}</div>
        </div>`;
}

function _renderGaps(gapData) {
    if (!gapData?.gaps?.length) return '<div class="no-gaps">✓ No compliance gaps detected</div>';
    return gapData.gaps.map(g => `
        <div class="gap-row gap-${(g.severity || '').toLowerCase()}">
            <span class="gap-metric">${g.metric}</span>
            <span class="gap-issue">${g.issue}</span>
            <span class="gap-sev">${g.severity}</span>
            ${g.source ? `<a href="${g.source}" target="_blank" class="gap-cite">Source ↗</a>` : ''}
        </div>`).join('');
}

// ── Evidence Overlays (hover → Source_UID tooltip) ────────────────────────────
function _attachEvidenceOverlays(container) {
    const tooltip = document.getElementById('rfp-evidence-tooltip') || _createTooltip();

    container.querySelectorAll('[data-evidence]').forEach(el => {
        el.addEventListener('mouseenter', e => {
            const field = el.dataset.evidence;
            const uid   = _resolveSourceUID(field);
            tooltip.innerHTML = uid;
            tooltip.style.display = 'block';
            tooltip.style.left    = `${e.pageX + 12}px`;
            tooltip.style.top     = `${e.pageY - 8}px`;
        });
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        el.addEventListener('mousemove',  e => {
            tooltip.style.left = `${e.pageX + 12}px`;
            tooltip.style.top  = `${e.pageY - 8}px`;
        });
    });
}

/**
 * _resolveSourceUID(field)
 * Returns a formatted Source_UID string for a given spec field.
 * Reads from RFP.sourceMap which is populated after upload.
 * Format: "File: {filename} | Cell: {Excel_Row_N_Col_X} | Page: {N} | BBox: {coords}"
 */
function _resolveSourceUID(field) {
    const src = RFP.sourceMap[field];
    if (!src) {
        const trail = RFP.proposal?.internal_audit?.section_3_audit_trail?.trail || 'N/A';
        return `<b>Field:</b> ${field}<br><b>Audit:</b> ${trail}`;
    }
    const cell = src.cell   ? `Excel_Row_${src.cell.slice(1)}_Col_${src.cell[0]}`
                            : (src.bbox ? `PDF_Page_${src.page}_BBox_${src.bbox}` : 'N/A');
    return [
        `<b>Field:</b> ${field}`,
        `<b>Source_UID:</b> ${cell}`,
        `<b>File:</b> ${src.file || src.source_file || 'N/A'}`,
        src.page ? `<b>Page:</b> ${src.page}` : '',
        src.ontology_node ? `<b>OCM Node:</b> ${src.ontology_node}` : '',
    ].filter(Boolean).join('<br>');
}

function _createTooltip() {
    const t = document.createElement('div');
    t.id = 'rfp-evidence-tooltip';
    t.style.cssText = `
        position:fixed;z-index:9999;background:#1a1a1a;border:1px solid #D4AF37;
        color:#D4AF37;font-size:11px;padding:6px 10px;border-radius:4px;
        pointer-events:none;display:none;max-width:360px;line-height:1.5;
    `;
    document.body.appendChild(t);
    return t;
}

// ── TCO Loader ─────────────────────────────────────────────────────────────────
async function _loadTCO() {
    const sector = document.getElementById('rfp-sector-select')?.value || 'AI_Power_Management_ASIC';
    const result = document.getElementById('tco-result');
    if (result) result.textContent = 'Calculating…';

    try {
        const res  = await _apiPost('/rfp/api/proposal/pricing', { sector });
        const data = await res.json();

        if (result) {
            result.innerHTML = `
                <div class="tco-grid">
                    <div class="tco-row"><span>5-Year TCO</span><strong>${_fmtUSD(data.tco_5yr_usd)}</strong></div>
                    <div class="tco-row"><span>Annual Energy Cost</span><strong>${_fmtUSD(data.energy_cost_yr)}</strong></div>
                    <div class="tco-row"><span>Annual Compute Cost</span><strong>${_fmtUSD(data.compute_cost_yr)}</strong></div>
                    <div class="tco-row"><span>BOM Unit Cost</span><strong>${_fmtUSD(data.bom_cost)}</strong></div>
                    <div class="tco-row"><span>PCE vs Market</span>
                        <strong style="color:${data.margin_analysis?.status === 'EXCEEDS_MARKET' ? '#00ff88' : '#ff4444'}">
                            ${data.margin_analysis?.status || 'N/A'}
                        </strong>
                    </div>
                    ${data.missing_fields?.length ? `<div class="tco-missing">⚠ Missing: ${data.missing_fields.join(', ')}</div>` : ''}
                </div>`;
        }
    } catch (e) {
        if (result) result.textContent = `Error: ${e.message}`;
    }
}

// ── Export Buttons ─────────────────────────────────────────────────────────────
function _bindExportButtons() {
    document.getElementById('rfp-export-pdf')?.addEventListener('click', () => {
        if (!RFP.proposal) { _showError('Generate a proposal first.'); return; }
        window.print();
    });

    document.getElementById('rfp-export-json')?.addEventListener('click', () => {
        if (!RFP.proposal) { _showError('Generate a proposal first.'); return; }
        const blob = new Blob([JSON.stringify(RFP.proposal, null, 2)], { type: 'application/json' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `rfp_proposal_${Date.now()}.json`;
        a.click();
    });
}

// ── Tab Switcher ───────────────────────────────────────────────────────────────
function _bindTabSwitcher() {
    document.querySelectorAll('[data-rfp-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.rfpTab;
            document.querySelectorAll('[data-rfp-panel]').forEach(p => {
                p.style.display = p.dataset.rfpPanel === target ? 'block' : 'none';
            });
            document.querySelectorAll('[data-rfp-tab]').forEach(b => b.classList.remove('active-tab'));
            btn.classList.add('active-tab');
        });
    });
}

// ── G3FP Console ───────────────────────────────────────────────────────────────
function _showG3FPConsole(msg) {
    const console_ = document.getElementById('rfp-g3fp-console');
    if (!console_) return;
    const line = document.createElement('div');
    line.className = 'g3fp-line';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console_.appendChild(line);
    console_.scrollTop = console_.scrollHeight;
}

// ── Progress Bar ───────────────────────────────────────────────────────────────
function _initProgressBar(pct) {
    const bar = document.getElementById('rfp-progress-bar');
    if (!bar) return;
    bar.style.width    = `${pct}%`;
    bar.style.opacity  = pct > 0 && pct < 100 ? '1' : pct === 100 ? '0.7' : '0.3';
    bar.dataset.pct    = pct;
}

// ── Upload Status ──────────────────────────────────────────────────────────────
function _setUploadStatus(msg, state) {
    const el = document.getElementById('rfp-upload-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = `rfp-upload-status status-${state}`;
}

function _showError(msg) {
    const el = document.getElementById('rfp-error-banner');
    if (!el) return;
    el.textContent = `⚠ ${msg}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 8000);
    _log(msg, 'error');
}

// ── G3FP Console Logging ───────────────────────────────────────────────────────
function _log(msg, level = 'info') {
    const prefix = '[RFP-Generator]';
    if (level === 'error') console.error(prefix, msg);
    else                   console.log(prefix, msg);
    _showG3FPConsole(msg);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function _apiPost(url, bodyOrFormData, isJson = true) {
    const opts = { method: 'POST' };
    if (isJson) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body    = JSON.stringify(bodyOrFormData);
    } else {
        opts.body = bodyOrFormData;   // FormData
    }
    return fetch(url, opts);
}

function _trustColour(score) {
    if (typeof score !== 'number') return '#555';
    if (score >= 0.8) return '#00ff88';
    if (score >= 0.5) return '#ffd700';
    return '#ff4444';
}

function _fmtUSD(val) {
    if (typeof val === 'string') return val;   // DATA_MISSING tag passthrough
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── verifySource() — Developer Console Audit Tool ────────────────────────────
/**
 * verifySource(field)
 * Call from browser DevTools console to reverse-trace any displayed value
 * back to its original file coordinate.
 *
 * Usage:  verifySource('efficiency')
 * Returns: {field, source_uid, file, cell, page, bbox, ocm_node, audit_hash}
 *
 * Red flag: if source_uid === 'NO_GROUNDING' → hallucination risk, report immediately.
 *
 * @param {string} field - The spec field name to trace (e.g. 'efficiency', 'power_mw')
 * @returns {object} Full provenance record, or error object if not found.
 */
window.verifySource = function verifySource(field) {
    const src       = RFP.sourceMap?.[field];
    const auditHash = RFP.proposal?.internal_audit?.section_3_audit_trail?.audit_hash || 'N/A';
    const trail     = RFP.proposal?.internal_audit?.section_3_audit_trail?.trail      || 'N/A';

    if (!src) {
        const record = {
            field,
            source_uid:  'NO_GROUNDING',
            audit_hash:  auditHash,
            audit_trail: trail,
            warning:     'Field not found in sourceMap. Value may be DATA_MISSING or upload not yet completed.',
        };
        console.warn('[verifySource] ⚠ NO_GROUNDING for field:', field, record);
        return record;
    }

    const cell = src.cell
        ? `Excel_Row_${src.cell.slice(1)}_Col_${src.cell[0]}`
        : (src.bbox ? `PDF_Page_${src.page}_BBox_${src.bbox}` : 'N/A');

    const record = {
        field,
        source_uid:   cell,
        file:         src.file || src.source_file || 'N/A',
        cell:         src.cell         || null,
        page:         src.page         || null,
        bbox:         src.bbox         || null,
        ocm_node:     src.ontology_node || 'N/A',
        hitl_confirmed: src.hitl_confirmed || false,
        audit_hash:   auditHash,
        audit_trail:  trail,
    };

    console.group(`[verifySource] ✓ Provenance for '${field}'`);
    console.table(record);
    console.groupEnd();
    return record;
};
