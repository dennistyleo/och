/**
 * Module: sov.domain.hint.js
 * Version: 1.0.0
 * Description: Shared domain_hint utility for all file upload points.
 *
 * Single source of truth for filename → domain mapping.
 * Must be loaded BEFORE any script that calls new FormData() + ingest/fast.
 *
 * Priority order:
 *   1. window._sovereignDomain (explicit user selection from mode/landing page)
 *   2. sovereign_g3fp_context.domain in sessionStorage (backend already resolved it)
 *   3. Filename heuristic (regex against backend domain constants)
 *   4. null (no hint sent — backend infers from content)
 *
 * Backend domain constants (must match exactly):
 *   HEALTHCARE · CONTRACT · AEROSPACE · FINANCE · GENERAL
 */
(function (G) {
    'use strict';

    /**
     * inferDomainHint(filename)
     * Returns the best domain_hint string for a given filename, or null if unknown.
     * Returns null (not 'GENERAL') so callers can skip appending when unknown.
     *
     * @param {string} filename  - The File.name value
     * @returns {string|null}
     */
    function inferDomainHint(filename) {
        /* Priority 0: explicit mode checks */
        try {
            var _mode = sessionStorage.getItem('sovereign_mode');
            if (_mode === 'ontology_med') {
                return 'HEALTHCARE';
            }
        } catch (_) {}
        try {
            if (window.parent && window.parent.location.pathname.includes('ontology_medical')) {
                return 'HEALTHCARE';
            }
        } catch (_) {}

        /* Priority 1: explicit user selection */
        if (G._sovereignDomain && G._sovereignDomain !== 'GENERAL') {
            return G._sovereignDomain.toUpperCase();
        }

        /* Priority 2: backend already resolved domain in this session */
        try {
            var _ctxRaw = sessionStorage.getItem('sovereign_g3fp_context');
            if (_ctxRaw) {
                var _ctx = JSON.parse(_ctxRaw);
                if (_ctx.domain && _ctx.domain !== 'GENERAL') {
                    return _ctx.domain.toUpperCase();
                }
            }
        } catch (_) { /* non-fatal */ }

        /* Priority 3: filename heuristic — backend constants exactly */
        var n = (filename || '').toLowerCase();
        if (/health|medical|patient|clinical|diag|pharma|hospital|cardio|oncol|lipid|glucose|hemoglobin/.test(n)) return 'HEALTHCARE';
        if (/contract|legal|agree|clause|terms|sla|nda|msa|addendum/.test(n)) return 'CONTRACT';
        if (/aerospace|aviat|fpga|verilog|rtl|thermal|signal|delamination|composite|cfrp/.test(n)) return 'AEROSPACE';
        if (/finance|budget|revenue|cost|equity|portfolio|ebitda|yield|nav/.test(n)) return 'FINANCE';

        /* Priority 4: unknown — return null, don't send GENERAL as hint */
        return null;
    }

    /**
     * appendDomainHint(formData, filename)
     * Convenience: appends domain= to a FormData only when a confident hint exists.
     * Callers should NOT append domain themselves; use this instead.
     *
     * @param {FormData} formData
     * @param {string}   filename
     * @returns {string|null}  The domain that was appended, or null
     */
    function appendDomainHint(formData, filename) {
        var hint = inferDomainHint(filename);
        if (hint) {
            formData.append('domain', hint);
            console.log('[SovDomainHint] domain_hint=' + hint + ' appended for:', filename);
        }
        return hint;
    }

    /* Export */
    G.SovDomainHint = { inferDomainHint: inferDomainHint, appendDomainHint: appendDomainHint };

})(window);
