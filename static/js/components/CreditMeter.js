/**
 * Module: CreditMeter.js
 * Version: 1.0.0
 * Description: Live AI credit balance bar injected into the header nav area.
 *              Updates from ExportGate.getCreditStatus().
 */

'use strict';

(function() {

  /**
   * Mount the credit meter into a target element.
   * @param {string|HTMLElement} target - CSS selector or element
   */
  function mount(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;

    const wrap = document.createElement('div');
    wrap.className = 'credit-meter-wrap';
    wrap.id = 'sov-credit-meter';
    wrap.innerHTML = `
      <span id="cm-label" style="font-size:11px;color:var(--muted,#5a6478);font-family:Inter,sans-serif;">Credits</span>
      <div class="credit-meter-bar">
        <div class="credit-meter-fill" id="cm-fill" style="width:0%"></div>
      </div>
      <span id="cm-count" style="font-size:11px;color:var(--muted,#5a6478);font-family:'JetBrains Mono',monospace;min-width:60px;"></span>
    `;
    el.appendChild(wrap);
    _refresh();
    setInterval(_refresh, 30000); // refresh every 30s
  }

  function _refresh() {
    if (!window.ExportGate) return;
    const { used, limit, pct, tier } = window.ExportGate.getCreditStatus();

    const fill  = document.getElementById('cm-fill');
    const count = document.getElementById('cm-count');
    const label = document.getElementById('cm-label');
    if (!fill || !count) return;

    if (limit === 0) {
      // Free tier — show upgrade nudge
      fill.style.width = '0%';
      count.textContent = '0 cr (free)';
      count.style.color = 'var(--muted,#5a6478)';
      return;
    }

    const remaining = limit - used;
    fill.style.width = Math.max(2, 100 - pct) + '%';
    fill.className = 'credit-meter-fill' + (pct > 90 ? ' low' : pct > 70 ? ' warn' : '');
    count.textContent = `${remaining.toLocaleString()} / ${limit.toLocaleString()} cr`;
    count.style.color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#FFBF00';
    if (label) label.textContent = tier === 'pro' ? '⚡ Credits' : 'AI Credits';
  }

  window.CreditMeter = { mount, refresh: _refresh };
})();
