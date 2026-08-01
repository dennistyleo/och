/**
 * Module: SchemaValidator.js
 * Version: 1.0.0
 * Description: JSON schema validation for Sovereign Matrix module outputs.
 *              Implements all three required validators per schema-validator skill.
 *
 * Skill schema-validator:
 *   validate_rag_output(data)    → { valid, errors }
 *   validate_gnn_output(data)    → { valid, errors }
 *   validate_causal_output(data) → { valid, errors }
 *
 * Rule 04: All errors are collected and returned — never silently swallowed.
 * Rule 03: Emits 'ERROR' event via window.SovereignBUS on schema violation.
 * Rule 00: All public functions have JSDoc.
 */

'use strict';

/* ── Allowed domain values per rag-code-generator skill ─── */
const ALLOWED_DOMAINS = new Set([
    'CONTRACT', 'FINANCIAL', 'TECHNICAL', 'AEROSPACE', 'GENERAL',
    /* Extended sovereign domains */
    'COMPOSITE', 'STRUCTURAL', 'NDT', 'ELECTRONICS', 'FIRMWARE',
    'SOFTWARE', 'IOT', 'RTL', 'MATERIALS', 'AIRWORTHINESS', 'UNKNOWN'
]);

const ALLOWED_TIERS = new Set(['ELECTED', 'CANDIDATE', 'STANDBY', 'REJECTED']);

/**
 * Emit a schema error event via SovereignBUS if available.
 * @param {string} errorCode
 * @param {string} module
 * @param {string[]} errors
 */
function _emitSchemaError(errorCode, module, errors) {
    if (window.SovereignBUS) {
        window.SovereignBUS.emit('ERROR', {
            error_code: errorCode,
            message: `E004: SCHEMA_VALIDATION_FAILED — ${module}: ${errors.join('; ')}`,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Validate a single node object from the RAG output nodes array.
 * @param {Object} node
 * @param {number} idx
 * @returns {string[]} array of error messages (empty = valid)
 */
function _validateNode(node, idx) {
    const errs = [];
    if (typeof node.id !== 'string' || !node.id)
        errs.push(`nodes[${idx}].id must be a non-empty string`);
    if (typeof node.name !== 'string' || !node.name)
        errs.push(`nodes[${idx}].name must be a non-empty string`);
    if (typeof node.value === 'undefined')
        errs.push(`nodes[${idx}].value is required`);
    if (typeof node.confidence !== 'number' || node.confidence < 0 || node.confidence > 1)
        errs.push(`nodes[${idx}].confidence must be number in [0, 1]`);
    return errs;
}

/**
 * Validate RAG module output.
 * Expected schema (rag-code-generator skill):
 *   { domain: string, nodes: Array<{id, name, value, confidence}>, assessment: {conf, tier, reason} }
 *
 * @param {Object} data - The RAG module output to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate_rag_output(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
        errors.push('E004: RAG output must be a non-null object');
        _emitSchemaError('E004', 'rag_output', errors);
        return { valid: false, errors };
    }

    /* Error response — still valid shape */
    if (data.error_code) {
        const validCodes = new Set(['E001', 'E002', 'E003', 'E004', 'E005', 'E008']);
        if (!validCodes.has(data.error_code))
            errors.push(`error_code "${data.error_code}" not in valid error code set`);
        if (typeof data.message !== 'string')
            errors.push('error response must have string message');
        return { valid: errors.length === 0, errors };
    }

    /* domain field */
    if (typeof data.domain !== 'string') {
        errors.push('domain must be a string');
    } else if (!ALLOWED_DOMAINS.has(data.domain.toUpperCase())) {
        errors.push(`domain "${data.domain}" not in allowed values: ${[...ALLOWED_DOMAINS].join(', ')}`);
    }

    /* nodes array */
    if (!Array.isArray(data.nodes)) {
        errors.push('nodes must be an array');
    } else {
        data.nodes.forEach((n, i) => errors.push(..._validateNode(n, i)));
    }

    /* assessment object */
    if (!data.assessment || typeof data.assessment !== 'object') {
        errors.push('assessment must be an object');
    } else {
        const a = data.assessment;
        if (typeof a.conf !== 'number' || a.conf < 0 || a.conf > 1)
            errors.push('assessment.conf must be number in [0, 1]');
        if (!ALLOWED_TIERS.has(a.tier))
            errors.push(`assessment.tier must be one of: ${[...ALLOWED_TIERS].join(', ')}`);
        if (typeof a.reason !== 'string' || !a.reason)
            errors.push('assessment.reason must be a non-empty string');
    }

    if (errors.length) _emitSchemaError('E004', 'rag_output', errors);
    return { valid: errors.length === 0, errors };
}

/**
 * Validate GNN module output.
 * Expected schema (gnn-code-generator skill + build_3d_shape return value):
 *   { nodes: Array<{id, x, y, z, drift}>, edges: Array<{source, target, weight}>,
 *     centroid: [x, y, z], driftDetected?: boolean, driftScore?: number }
 *
 * @param {Object} data - The GNN module output to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate_gnn_output(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
        errors.push('E004: GNN output must be a non-null object');
        _emitSchemaError('E004', 'gnn_output', errors);
        return { valid: false, errors };
    }

    /* nodes */
    if (!Array.isArray(data.nodes))
        errors.push('nodes must be an array');
    else {
        data.nodes.forEach((n, i) => {
            if (typeof n.id === 'undefined') errors.push(`nodes[${i}].id is required`);
            if (typeof n.x !== 'number')     errors.push(`nodes[${i}].x must be number`);
            if (typeof n.y !== 'number')     errors.push(`nodes[${i}].y must be number`);
        });
    }

    /* edges */
    if (!Array.isArray(data.edges))
        errors.push('edges must be an array');
    else {
        data.edges.forEach((e, i) => {
            if (typeof e.source === 'undefined') errors.push(`edges[${i}].source is required`);
            if (typeof e.target === 'undefined') errors.push(`edges[${i}].target is required`);
        });
    }

    /* centroid */
    if (!Array.isArray(data.centroid) || data.centroid.length !== 3)
        errors.push('centroid must be an array of 3 numbers [x, y, z]');
    else if (data.centroid.some(v => typeof v !== 'number'))
        errors.push('centroid values must all be numbers');

    /* optional drift fields */
    if (data.driftDetected !== undefined && typeof data.driftDetected !== 'boolean')
        errors.push('driftDetected must be boolean if present');
    if (data.driftScore !== undefined && (typeof data.driftScore !== 'number' || data.driftScore < 0 || data.driftScore > 1))
        errors.push('driftScore must be number in [0, 1] if present');

    if (errors.length) _emitSchemaError('E004', 'gnn_output', errors);
    return { valid: errors.length === 0, errors };
}

/**
 * Validate Causal Matrix module output.
 * Expected schema:
 *   { axioms: Array<{axiom_id, name, status, confidence}>,
 *     anomalies: Array<{id, name}>,
 *     engine: 'DEDUCTION'|'INDUCTION'|'ABDUCTION' }
 *
 * @param {Object} data - The Causal Matrix output to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate_causal_output(data) {
    const errors = [];
    const ALLOWED_ENGINES = new Set(['DEDUCTION', 'INDUCTION', 'ABDUCTION']);
    const ALLOWED_STATUSES = new Set(['CANONICAL', 'HYPOTHESIZED', 'ANOMALOUS', 'UNKNOWN']);

    if (!data || typeof data !== 'object') {
        errors.push('E004: Causal output must be a non-null object');
        _emitSchemaError('E004', 'causal_output', errors);
        return { valid: false, errors };
    }

    /* axioms */
    if (!Array.isArray(data.axioms))
        errors.push('axioms must be an array');
    else {
        data.axioms.forEach((a, i) => {
            if (typeof a.axiom_id !== 'string') errors.push(`axioms[${i}].axiom_id must be string`);
            if (typeof a.name !== 'string')     errors.push(`axioms[${i}].name must be string`);
            if (a.status && !ALLOWED_STATUSES.has(a.status))
                errors.push(`axioms[${i}].status "${a.status}" not in ${[...ALLOWED_STATUSES].join(', ')}`);
            if (typeof a.confidence !== 'number' || a.confidence < 0 || a.confidence > 1)
                errors.push(`axioms[${i}].confidence must be number in [0, 1]`);
        });
    }

    /* anomalies */
    if (!Array.isArray(data.anomalies))
        errors.push('anomalies must be an array');

    /* engine */
    if (!ALLOWED_ENGINES.has(data.engine))
        errors.push(`engine must be one of: ${[...ALLOWED_ENGINES].join(', ')}`);

    if (errors.length) _emitSchemaError('E004', 'causal_output', errors);
    return { valid: errors.length === 0, errors };
}

/* ── Public API ─────────────────────────────────────────────────────────── */
window.SchemaValidator = {
    validate_rag_output,
    validate_gnn_output,
    validate_causal_output
};
