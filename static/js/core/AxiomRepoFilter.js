/* ══════════════════════════════════════════════════════════
   Module: AxiomRepoFilter.js
   Version: 1.1.0
   Description: Filters Axiom Repository entries based on the
                active operative page paradigm.
                op-page-3 (DEDUCTION)  = DEDUCTION axioms ONLY.
                op-page-1/2            = ALL non-deduction axioms.
                Abduction sub-modes    = ABDUCTION bucket only.
   Standards: ISO/IEC 25010 (Functional Correctness)
              CMMI Level 5 (Deterministic Process)
   Rule 01: Deterministic First — same paradigm → same filter.
   DFT: data-test attributes on DOM helpers for E2E hooks.
   ══════════════════════════════════════════════════════════ */

/** Axiom type constants */
export const AXIOM_TYPE = {
    DEDUCTION:  'DEDUCTION',
    INDUCTION:  'INDUCTION',
    ABDUCTION:  'ABDUCTION',
};

/**
 * Abduction sub-mode keys that all map to the ABDUCTION bucket.
 * Defined here so AxiomController and E2E tests share one source-of-truth.
 * @type {string[]}
 */
export const ABDUCTION_SUBMODES = [
    'ABD_RFP',    // Request-for-Proposal mode
    'ABD_QA',     // Q&A / hypothesis-testing mode
    'ABD_RCA',    // Root-Cause Analysis mode
    'ABD_CAUSAL', // Causal inference mode
];

// ─── DFT Telemetry helper ──────────────────────────────────────────────────
// Writes the last filter result to a hidden sentinel element so Playwright
// tests can assert on it without coupling to visual DOM structure.
const DFT_SENTINEL_ID = 'dft-axiom-repo-filter';

function _writeDFTResult(paradigm, count) {
    let el = document.getElementById(DFT_SENTINEL_ID);
    if (!el) {
        el = document.createElement('span');
        el.id = DFT_SENTINEL_ID;
        el.setAttribute('data-testid', 'axiom-repo-filter-result');
        el.style.cssText = 'display:none;position:absolute;pointer-events:none';
        el.setAttribute('aria-hidden', 'true');
        document.body?.appendChild(el);
    }
    el.setAttribute('data-paradigm', paradigm);
    el.setAttribute('data-count',    String(count));
}
// ──────────────────────────────────────────────────────────────────────────

/**
 * Map any paradigm string (including ABD sub-modes) to its canonical bucket.
 * @param {string} paradigm - Raw paradigm from ENGINE:BOOT or landing page
 * @returns {'DEDUCTION'|'INDUCTION'|'ABDUCTION'} Canonical bucket
 */
export function resolveParadigmBucket(paradigm) {
    if (!paradigm) return AXIOM_TYPE.INDUCTION;
    if (paradigm === AXIOM_TYPE.DEDUCTION) return AXIOM_TYPE.DEDUCTION;
    if (ABDUCTION_SUBMODES.includes(paradigm))  return AXIOM_TYPE.ABDUCTION;
    if (paradigm === AXIOM_TYPE.ABDUCTION)      return AXIOM_TYPE.ABDUCTION;
    return AXIOM_TYPE.INDUCTION;  // default bucket for INDUCTION + unknowns
}

/**
 * Filter axiom records based on the active paradigm.
 * CRITICAL: op-page-3 (DEDUCTION) only shows DEDUCTION axioms.
 *           Abduction sub-modes route to ABDUCTION bucket.
 *
 * @param {Array<Object>} axioms    - Full axiom registry array
 * @param {string}        paradigm  - 'DEDUCTION' | 'INDUCTION' | 'ABDUCTION'
 *                                    | 'ABD_RFP' | 'ABD_QA' | 'ABD_RCA' | 'ABD_CAUSAL'
 * @returns {Array<Object>} Filtered axiom list
 */
export function filterAxiomsForParadigm(axioms, paradigm) {
    if (!Array.isArray(axioms)) {
        console.error('E003: INVALID_AXIOM_ARRAY — expected Array');
        _writeDFTResult(paradigm, 0);
        return [];
    }
    if (!paradigm) {
        console.error('E003: MISSING_PARADIGM — cannot filter axioms');
        _writeDFTResult('MISSING', 0);
        return [];
    }

    const bucket = resolveParadigmBucket(paradigm);
    let result;

    if (bucket === AXIOM_TYPE.DEDUCTION) {
        // op-page-3: EXCLUSIVELY Deduction axioms
        result = axioms.filter(a => a.axiom_type === AXIOM_TYPE.DEDUCTION);
    } else if (bucket === AXIOM_TYPE.ABDUCTION) {
        // Abduction and all its sub-modes
        result = axioms.filter(a => a.axiom_type === AXIOM_TYPE.ABDUCTION);
    } else {
        // INDUCTION bucket: all non-deduction, non-abduction axioms
        // (op-page-1 / op-page-2)
        result = axioms.filter(a =>
            a.axiom_type !== AXIOM_TYPE.DEDUCTION &&
            a.axiom_type !== AXIOM_TYPE.ABDUCTION
        );
    }

    _writeDFTResult(paradigm, result.length);
    return result;
}

/**
 * Assert that a paradigm→filter mapping is valid.
 * For use in unit tests (test-generator skill).
 *
 * @param {string}        paradigm - Active paradigm (raw or sub-mode)
 * @param {Array<Object>} filtered - Filtered axiom list
 * @returns {boolean} True if filter is correctly applied
 */
export function validateFilter(paradigm, filtered) {
    const bucket = resolveParadigmBucket(paradigm);
    if (bucket === AXIOM_TYPE.DEDUCTION) {
        return filtered.every(a => a.axiom_type === AXIOM_TYPE.DEDUCTION);
    }
    if (bucket === AXIOM_TYPE.ABDUCTION) {
        return filtered.every(a => a.axiom_type === AXIOM_TYPE.ABDUCTION);
    }
    return filtered.every(a =>
        a.axiom_type !== AXIOM_TYPE.DEDUCTION &&
        a.axiom_type !== AXIOM_TYPE.ABDUCTION
    );
}
