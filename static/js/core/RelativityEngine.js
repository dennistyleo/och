/**
 * Module: RelativityEngine.js
 * Version: 1.0.0
 * Description: Core mathematical engine for Minkowski Spacetime (TXYZ)
 *              calculations, spacetime intervals, and causal reachability.
 *              c = speed of information transfer (normalized to 1.0)
 */

export class RelativityEngine {
    constructor(c = 1.0) {
        this.c = c;
    }

    /**
     * Calculate Minkowski Interval (invariant distance)
     * Δs² = (c*Δt)² - (Δx² + Δy² + Δz²)
     * 
     * @param {Object} p1 - {t, x, y, z}
     * @param {Object} p2 - {t, x, y, z}
     * @returns {number} The spacetime interval squared
     */
    calculateIntervalSqr(p1, p2) {
        const dt = p2.t - p1.t;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;

        return Math.pow(this.c * dt, 2) - (Math.pow(dx, 2) + Math.pow(dy, 2) + Math.pow(dz, 2));
    }

    /**
     * Classify relationship based on interval
     * @param {number} ds2 - Δs²
     * @returns {string} TIMELIKE | SPACELIKE | LIGHTLIKE
     */
    classify(ds2) {
        if (Math.abs(ds2) < 1e-9) return 'LIGHTLIKE'; // On the light cone
        return ds2 > 0 ? 'TIMELIKE' : 'SPACELIKE';
    }

    /**
     * Check if p2 is in the causal future light cone of p1
     * @param {Object} p1 - Origin event
     * @param {Object} p2 - Target event
     * @returns {boolean}
     */
    isReachable(p1, p2) {
        if (p2.t <= p1.t) return false; // Must be in future
        const ds2 = this.calculateIntervalSqr(p1, p2);
        return ds2 >= 0; // Inside or on the light cone
    }

    /**
     * Generate a coordinate for an axiom event based on metadata
     * @param {Object} axiom - {timestamp, feature_vector, confidence}
     * @returns {Object} {t, x, y, z}
     */
    mapToSpacetime(axiom, baseTime = 0) {
        // Feature vector indices map to X, Y, Z
        // Timestamp maps to T
        const t = (axiom.timestamp || Date.now()) - baseTime;
        const x = axiom.feature_vector?.[0] || 0;
        const y = axiom.feature_vector?.[1] || 0;
        const z = axiom.feature_vector?.[2] || 0;

        return { t, x, y, z };
    }
}
