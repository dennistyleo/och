/**
 * Module: SovereignHandshake
 * Version: 1.0.0
 * Description: BOC (Bi-directional Ontological Contract) frontend client.
 *
 *   Usage (singleton):
 *     const hs = SovereignHandshake.getInstance();
 *     const { valid, contract_id } = await hs.handshake({ domain, axiom_ids });
 *     // ... run pipeline ...
 *     await hs.release();
 *
 *   NOTE (architecture): OP-01 and OP-02 are one logical session.
 *   The contract is persisted in sessionStorage so it survives the
 *   OP-01 → OP-02 page navigation and can be released from OP-02.
 *
 *   The handshake MUST succeed (valid === true) before
 *   the deduction pipeline is allowed to emit SAA_FORMULA_RESULTS.
 */

'use strict';

(function (root) {

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    const BOC_HANDSHAKE_URL   = '/api/boc/handshake';
    const BOC_RELEASE_URL     = '/api/boc/release';
    const BOC_STATUS_URL      = '/api/boc/status';
    const SESSION_KEY         = 'sovereign_boc_contract';   // sessionStorage key
    const FETCH_TIMEOUT_MS  = 8000;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Generate a UUID-v4 nonce (fallback for environments without crypto.randomUUID).
     * @returns {string}
     */
    function _nonce() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    /**
     * Fetch with a timeout.
     * @param {string} url
     * @param {RequestInit} opts
     * @returns {Promise<Response>}
     */
    async function _fetchWithTimeout(url, opts) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            return await fetch(url, { ...opts, signal: controller.signal });
        } finally {
            clearTimeout(tid);
        }
    }

    // -----------------------------------------------------------------------
    // SovereignHandshake Singleton
    // -----------------------------------------------------------------------

    class SovereignHandshake {

        constructor() {
            /** @type {string|null} */
            this._contractId   = null;
            /** @type {string|null} */
            this._nonce        = null;
            /** @type {string|null} */
            this._fingerprint  = null;
            /** @type {string|null} */
            this._domain       = null;
            /** @type {string[]} */
            this._axiomIds     = [];
            /** @type {boolean} */
            this._released     = true;  // starts as "no active contract"

            // Rehydrate from sessionStorage (OP-01 → OP-02 cross-page survival)
            this._rehydrate();
        }

        // -------------------------------------------------------------------
        // sessionStorage persistence (OP-01/OP-02 logical session)
        // -------------------------------------------------------------------

        _persist() {
            try {
                sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                    contractId  : this._contractId,
                    nonce       : this._nonce,
                    fingerprint : this._fingerprint,
                    domain      : this._domain,
                    axiomIds    : this._axiomIds,
                }));
            } catch (_) { /* private/incognito — no-op */ }
        }

        _rehydrate() {
            try {
                const raw = sessionStorage.getItem(SESSION_KEY);
                if (!raw) return;
                const s = JSON.parse(raw);
                if (s && s.contractId) {
                    this._contractId  = s.contractId;
                    this._nonce       = s.nonce;
                    this._fingerprint = s.fingerprint;
                    this._domain      = s.domain;
                    this._axiomIds    = s.axiomIds || [];
                    this._released    = false;
                    console.info(`[SovereignHandshake] ↩️ Rehydrated contract from sessionStorage: ${s.contractId}`);
                }
            } catch (_) { /* no-op */ }
        }

        _clearStorage() {
            try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* no-op */ }
        }

        // -------------------------------------------------------------------
        // Singleton accessor
        // -------------------------------------------------------------------

        static getInstance() {
            if (!SovereignHandshake._instance) {
                SovereignHandshake._instance = new SovereignHandshake();
            }
            return SovereignHandshake._instance;
        }

        // -------------------------------------------------------------------
        // Public API
        // -------------------------------------------------------------------

        /**
         * Issue a BOC handshake against the server.
         *
         * @param {{domain: string, axiom_ids: string[], locale?: string}} params
         * @returns {Promise<{valid: boolean, contract_id: string|null, fingerprint: string|null, missing: string[]}>}
         */
        async handshake({ domain, axiom_ids, locale = 'zh-TW' } = {}) {
            if (!domain || !Array.isArray(axiom_ids) || axiom_ids.length === 0) {
                console.error('[SovereignHandshake] E004 — domain and axiom_ids are required.');
                return { valid: false, contract_id: null, fingerprint: null, missing: [] };
            }

            // Release any lingering contract first
            if (!this._released && this._contractId) {
                await this.release().catch(() => {});
            }

            const nonce = _nonce();

            try {
                const resp = await _fetchWithTimeout(BOC_HANDSHAKE_URL, {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body   : JSON.stringify({ domain, axiom_ids, nonce, locale }),
                });

                const data = await resp.json();

                if (!resp.ok || !data.valid) {
                    console.warn('[SovereignHandshake] Handshake rejected:', data);
                    return {
                        valid       : false,
                        contract_id : null,
                        fingerprint : null,
                        missing     : data.missing || [],
                        error_code  : data.error_code,
                    };
                }

                // Store active contract state
                this._contractId  = data.contract_id;
                this._nonce       = nonce;
                this._fingerprint = data.fingerprint;
                this._domain      = domain;
                this._axiomIds    = axiom_ids;
                this._released    = false;
                this._persist();  // survive OP-01 → OP-02 navigation

                console.info(`[SovereignHandshake] ✅ Contract issued: ${data.contract_id} | ${domain}`);
                return {
                    valid       : true,
                    contract_id : data.contract_id,
                    fingerprint : data.fingerprint,
                    missing     : [],
                };

            } catch (err) {
                console.error('[SovereignHandshake] E002 — handshake fetch failed:', err);
                return { valid: false, contract_id: null, fingerprint: null, missing: [], error_code: 'E002' };
            }
        }

        /**
         * Release the active BOC contract.
         * Call after the pipeline completes or on HITL modal dismiss.
         *
         * @returns {Promise<{released: boolean, contract_id: string|null}>}
         */
        async release() {
            if (this._released || !this._contractId) {
                return { released: true, contract_id: null };
            }

            const contractId = this._contractId;
            const nonce      = this._nonce;

            try {
                const resp = await _fetchWithTimeout(BOC_RELEASE_URL, {
                    method : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body   : JSON.stringify({ contract_id: contractId, nonce }),
                });
                const data = await resp.json();
                if (data.released) {
                    console.info(`[SovereignHandshake] 🔓 Contract released: ${contractId}`);
                } else {
                    console.warn('[SovereignHandshake] Release rejected:', data);
                }
                return { released: !!data.released, contract_id: contractId };
            } catch (err) {
                console.error('[SovereignHandshake] E002 — release fetch failed:', err);
                return { released: false, contract_id: contractId };
            } finally {
                // Always clear local state to avoid ghost contracts
                this._contractId  = null;
                this._nonce       = null;
                this._fingerprint = null;
                this._released    = true;
                this._clearStorage();  // clear OP-01/OP-02 session key
            }
        }

        /**
         * Poll the server for the current contract status (debug / HITL UI).
         *
         * @returns {Promise<object|null>}
         */
        async status() {
            if (!this._contractId) return null;
            try {
                const resp = await _fetchWithTimeout(`${BOC_STATUS_URL}/${this._contractId}`, { method: 'GET' });
                return await resp.json();
            } catch (err) {
                console.error('[SovereignHandshake] status fetch failed:', err);
                return null;
            }
        }

        // -------------------------------------------------------------------
        // Guard helper — use at pipeline entry points
        // -------------------------------------------------------------------

        /**
         * Returns true only when a valid, unreleased contract is active.
         * @returns {boolean}
         */
        get isActive() {
            return !this._released && this._contractId !== null;
        }

        /** @returns {string|null} */
        get contractId()  { return this._contractId; }
        /** @returns {string|null} */
        get fingerprint() { return this._fingerprint; }
        /** @returns {string|null} */
        get domain()      { return this._domain; }
        /** @returns {string[]} */
        get axiomIds()    { return [...this._axiomIds]; }
    }

    // -----------------------------------------------------------------------
    // Attach to global scope
    // -----------------------------------------------------------------------
    root.SovereignHandshake = SovereignHandshake;

}(typeof globalThis !== 'undefined' ? globalThis : window));
