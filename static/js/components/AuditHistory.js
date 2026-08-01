/**
 * Module: AuditHistory.js
 * Version: 1.0.0
 * Description: Tier-gated audit evaluation history storage and comparison engine.
 *
 * Storage Tiers:
 *   free    — session only (cleared on tab close), no persistence
 *   premium — up to 5 audits, 30-day TTL, ~1 credit/save
 *   sso     — up to 20 audits, 90-day TTL, side-by-side comparison view
 *   pro     — unlimited, 365-day TTL, full diff export + timeline view
 */

(function (global) {
  'use strict';

  // ── Tier config ─────────────────────────────────────────────────────────
  const HISTORY_LIMITS = {
    free:    { maxRecords: 0,  ttlDays: 0,   compare: false, diffExport: false },
    premium: { maxRecords: 5,  ttlDays: 30,  compare: false, diffExport: false },
    sso:     { maxRecords: 20, ttlDays: 90,  compare: true,  diffExport: false },
    pro:     { maxRecords: -1, ttlDays: 365, compare: true,  diffExport: true  },
  };

  const STORAGE_KEY = 'sovereign_audit_history';

  // ── Resolve tier from session ────────────────────────────────────────────
  function _getTier() {
    try { return sessionStorage.getItem('sovereign_membership_tier') || 'free'; } catch (_) { return 'free'; }
  }

  function _getConfig() {
    return HISTORY_LIMITS[_getTier()] || HISTORY_LIMITS.free;
  }

  // ── Persist helper (localStorage, TTL-aware) ─────────────────────────────
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) || [];
    } catch (_) { return []; }
  }

  function _save(records) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
    catch (_) { /* quota exceeded */ }
  }

  // Prune expired records by TTL
  function _prune(records, ttlDays) {
    if (ttlDays <= 0) return [];
    const cutoff = Date.now() - ttlDays * 86400 * 1000;
    return records.filter(r => r.savedAt && r.savedAt > cutoff);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  const AuditHistory = {

    /**
     * Save an audit evaluation to history.
     * @param {object} auditData - The audit payload (same shape as sovereign_audit_data).
     * @returns {{ ok: boolean, message: string, gateUrl?: string }}
     */
    save(auditData) {
      const tier = _getTier();
      const cfg = _getConfig();

      if (cfg.maxRecords === 0) {
        return {
          ok: false,
          message: 'Audit history storage requires a Premium membership or above.',
          gateUrl: '/pricing.html',
          tier,
        };
      }

      let records = _load();
      records = _prune(records, cfg.ttlDays);

      // Enforce max records (trim oldest if needed)
      if (cfg.maxRecords > 0 && records.length >= cfg.maxRecords) {
        records = records.slice(records.length - cfg.maxRecords + 1);
      }

      const entry = {
        id: `AUD_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        savedAt: Date.now(),
        filename: auditData.filename || 'Unknown',
        domain: auditData.domain || '—',
        mode: auditData.mode || '—',
        verdict: auditData.verdict || '—',
        verdictClass: auditData.verdictClass || '',
        electedCount: (auditData.elected || []).length,
        riskTier: auditData.riskTier || '—',
        traceId: auditData.trace_id || auditData.traceId || '—',
        snapshot: tier === 'pro' ? auditData : null, // Full snapshot for Pro only
      };

      records.push(entry);
      _save(records);

      return { ok: true, message: `Audit saved to history (${records.length}/${cfg.maxRecords < 0 ? '∞' : cfg.maxRecords})`, tier };
    },

    /**
     * Load all stored audit history entries for current tier.
     * @returns {Array}
     */
    list() {
      const cfg = _getConfig();
      if (cfg.maxRecords === 0) return [];
      const records = _load();
      return _prune(records, cfg.ttlDays);
    },

    /**
     * Compare two audits by ID. SSO+ only.
     * @param {string} idA
     * @param {string} idB
     * @returns {{ ok: boolean, diff?: object, message?: string }}
     */
    compare(idA, idB) {
      const cfg = _getConfig();
      if (!cfg.compare) {
        return { ok: false, message: 'Side-by-side comparison requires SSO Enterprise or Sovereign Pro.', gateUrl: '/pricing.html' };
      }
      const records = _load();
      const a = records.find(r => r.id === idA);
      const b = records.find(r => r.id === idB);
      if (!a || !b) return { ok: false, message: 'One or both audit records not found.' };

      return {
        ok: true,
        diff: {
          filename:     [a.filename,     b.filename],
          domain:       [a.domain,       b.domain],
          verdict:      [a.verdict,      b.verdict],
          riskTier:     [a.riskTier,     b.riskTier],
          electedCount: [a.electedCount, b.electedCount],
          savedAt:      [new Date(a.savedAt).toISOString(), new Date(b.savedAt).toISOString()],
        },
      };
    },

    /**
     * Export comparison diff as JSON. Sovereign Pro only.
     * @param {string} idA
     * @param {string} idB
     */
    exportDiff(idA, idB) {
      const cfg = _getConfig();
      if (!cfg.diffExport) {
        if (window.SovUpgradeModal) window.SovUpgradeModal.show('pro');
        else window.open('/pricing.html', '_blank');
        return;
      }
      const result = this.compare(idA, idB);
      if (!result.ok) { alert(result.message); return; }
      const blob = new Blob([JSON.stringify(result.diff, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `sovereign_audit_diff_${idA}_vs_${idB}.json`;
      a.click(); URL.revokeObjectURL(url);
    },

    /**
     * Delete a single record by ID.
     */
    delete(id) {
      const records = _load().filter(r => r.id !== id);
      _save(records);
    },

    /**
     * Clear all history (all tiers).
     */
    clear() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    },

    /**
     * Render a compact history panel into a mount element.
     * Shows upgrade nudge for free tier.
     * @param {HTMLElement} mountEl
     */
    renderPanel(mountEl) {
      if (!mountEl) return;
      const tier = _getTier();
      const cfg  = _getConfig();
      const records = this.list();

      if (cfg.maxRecords === 0) {
        mountEl.innerHTML = `
          <div style="padding:16px;border:0.5px solid rgba(212,175,55,.2);border-radius:8px;background:rgba(0,0,0,.4);">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:3px;color:#D4AF37;margin-bottom:8px;">
              📂 AUDIT HISTORY
            </div>
            <div style="font-size:11px;color:#555;line-height:1.7;">
              Audit history storage is not included in the <b style="color:#7a8aa0">Free</b> plan.<br>
              Upgrade to <b style="color:#60a5fa">Premium</b> to save up to 5 evaluations for 30 days.
            </div>
            <a href="/pricing.html" target="_blank"
               style="display:inline-block;margin-top:10px;padding:5px 14px;background:rgba(255,191,0,.12);
                      border:0.5px solid rgba(255,191,0,.4);border-radius:4px;color:#D4AF37;
                      font-size:10px;letter-spacing:2px;text-decoration:none;font-family:'Bebas Neue',sans-serif;">
              VIEW PLANS →
            </a>
          </div>`;
        return;
      }

      const limitLabel = cfg.maxRecords < 0 ? '∞' : cfg.maxRecords;
      const rows = records.length === 0
        ? `<div style="color:#555;font-size:10px;padding:8px 0;">No saved audits yet.</div>`
        : records.slice().reverse().map(r => {
            const date = new Date(r.savedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
            const vCls = r.verdictClass === 'fail' ? '#ff4444' : r.verdictClass === 'warn' ? '#ffb529' : '#00C853';
            return `<div style="display:flex;align-items:center;justify-content:space-between;
                                padding:7px 0;border-bottom:0.5px solid rgba(255,255,255,.04);gap:8px;">
              <div>
                <div style="font-size:10px;color:#D4AF37;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${r.filename}</div>
                <div style="font-size:9px;color:#555;letter-spacing:1px;">${r.domain} · ${date}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:9px;color:${vCls};border:0.5px solid ${vCls}40;padding:1px 6px;border-radius:3px;
                             font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">${r.verdict}</span>
                ${cfg.compare ? `<button onclick="AuditHistory._selectForCompare('${r.id}')"
                  style="background:transparent;border:0.5px solid #333;border-radius:3px;color:#666;
                         font-size:8px;padding:2px 6px;cursor:pointer;letter-spacing:1px;"
                  title="Select for comparison">⇌</button>` : ''}
                <button onclick="AuditHistory.delete('${r.id}');AuditHistory.renderPanel(document.getElementById('sov-history-panel'))"
                  style="background:transparent;border:none;color:#444;font-size:10px;cursor:pointer;"
                  title="Remove">✕</button>
              </div>
            </div>`;
          }).join('');

      mountEl.innerHTML = `
        <div style="padding:16px;border:0.5px solid rgba(212,175,55,.2);border-radius:8px;background:rgba(0,0,0,.4);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:3px;color:#D4AF37;">
              📂 AUDIT HISTORY
            </div>
            <div style="font-size:9px;color:#555;letter-spacing:1px;">${records.length}/${limitLabel} saved · ${cfg.ttlDays}d retention</div>
          </div>
          <div id="sov-history-list">${rows}</div>
          ${cfg.compare ? `<div id="sov-compare-slot" style="margin-top:10px;font-size:9px;color:#555;letter-spacing:1px;min-height:20px;"></div>` : ''}
        </div>`;
    },

    // Comparison selection state
    _compareSlot: [],
    _selectForCompare(id) {
      if (this._compareSlot.includes(id)) return;
      this._compareSlot.push(id);
      const slot = document.getElementById('sov-compare-slot');
      if (this._compareSlot.length < 2) {
        if (slot) slot.textContent = `Selected: ${id}. Select one more to compare.`;
        return;
      }
      const result = this.compare(this._compareSlot[0], this._compareSlot[1]);
      this._compareSlot = [];
      if (!result.ok) { if (slot) slot.textContent = result.message; return; }
      const d = result.diff;
      if (slot) slot.innerHTML = `
        <div style="border:0.5px solid rgba(212,175,55,.2);border-radius:6px;padding:10px;margin-top:4px;background:rgba(0,0,0,.3);">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:10px;letter-spacing:2px;color:#D4AF37;margin-bottom:6px;">⇌ COMPARISON</div>
          ${Object.entries(d).map(([k,v]) =>
            `<div style="display:flex;justify-content:space-between;font-size:9px;padding:2px 0;color:#888;">
               <span style="color:#555;letter-spacing:1px;text-transform:uppercase">${k}</span>
               <span>${v[0]} → <b style="color:#D4AF37">${v[1]}</b></span>
             </div>`
          ).join('')}
        </div>`;
    },
  };

  // ── Auto-save hook: fires after audit report is generated ────────────────
  // Listens for the REPORT_READY BUS event if a BUS is present, or a custom DOM event.
  document.addEventListener('sovereign:report_ready', function (e) {
    if (!e.detail) return;
    const result = AuditHistory.save(e.detail);
    if (result.ok) {
      console.info('[AuditHistory] Saved:', result.message);
    } else {
      console.warn('[AuditHistory] Not saved (tier gate):', result.message);
    }
  });

  global.AuditHistory = AuditHistory;

})(window);
