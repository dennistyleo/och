/**
 * Module: sovereign_i18n
 * Version: 1.2.0
 * Description: Runtime i18n engine for all Sovereign Matrix pages.
 *
 * Usage:
 *   1. Include i18n_data.js BEFORE this file.
 *   2. Call SovereignI18n.refresh() after any dynamic DOM update.
 *   3. Tag static elements with data-i18n="key" (key must exist in T).
 *   4. Use data-i18n-placeholder="key" for input/textarea placeholder text.
 *   5. Use SovereignI18n.t(key) to get a translated string in JS.
 *   6. Use SovereignI18n.setLanguage('zh-CN') to switch language at runtime.
 *   7. Read SovereignI18n.lang to get the currently active language code.
 *
 * Language resolution order:
 *   sessionStorage.sovereign_lang_mode → navigator.language → 'en-US'
 */
(function (W) {
  'use strict';

  /* Z5-FIX: Guard against overwriting i18n.js which exposes the same global.
   * If window.SovereignI18n already has a full API (refresh + setLanguage),
   * sovereign_i18n.js yields to it and exits early.
   * Load order: index.html loads sovereign_i18n.js only.
   *             op_01/02.html load i18n.js only.
   *             audit_report.html loads sovereign_i18n.js only.
   * This guard covers any future page that accidentally loads both. */
  if (W.SovereignI18n &&
      typeof W.SovereignI18n.refresh === 'function' &&
      typeof W.SovereignI18n.setLanguage === 'function') {
    console.log('[sovereign_i18n] i18n.js already active — yielding, no overwrite.');
    return;
  }

  // ── Language index map ─────────────────────────────────────────────────
  const LANG_INDEX = {
    'en-US': 0, 'de-DE': 1, 'fr-FR': 2,  'es-ES': 3,
    'nl-NL': 4, 'ja-JP': 5, 'zh-CN': 6,  'zh-TW': 7,
    'sv-SE': 8, 'nb-NO': 9, 'da-DK': 10, 'fi-FI': 11,
  };

  let _hasTranslated = false;


  /**
   * Resolve the active language index.
   * Priority: sessionStorage['sovereign_lang_mode'] → localStorage['sovereign_lang']
   *   (only if user explicitly set it THIS session via sov.lang.user_set.session)
   * Falls back to 0 (en-US) — NEVER uses navigator.language auto-detect.
   * This ensures the landing page always defaults to EN on fresh load,
   * regardless of OS/browser language setting or stale localStorage from prior sessions.
   * @returns {number} 0-based index into translation arrays
   */
  function resolveIndex() {
    // 1. sessionStorage is the authoritative cross-module channel
    const stored = sessionStorage.getItem('sovereign_lang_mode');
    if (stored && LANG_INDEX[stored] !== undefined) {
      return LANG_INDEX[stored];
    }
    // 2. localStorage only if user explicitly chose a language THIS session
    //    (sov.lang.user_set.session is written by setLanguage() in both i18n.js and this module)
    const _userSetThisSession = !!sessionStorage.getItem('sov.lang.user_set.session');
    if (_userSetThisSession) {
      try {
        const shortCode = localStorage.getItem('sovereign_lang');
        if (shortCode) {
          /* Exact match first (handles zh-CN, zh-TW which are already full) */
          if (LANG_INDEX[shortCode] !== undefined) return LANG_INDEX[shortCode];
          /* Prefix match: 'de' → 'de-DE', 'ja' → 'ja-JP' */
          const expanded = Object.keys(LANG_INDEX).find(k => k.startsWith(shortCode.split('-')[0]));
          if (expanded && LANG_INDEX[expanded] !== undefined) return LANG_INDEX[expanded];
        }
      } catch(_) {}
    }
    // 3. Default: en-US (index 0) — no navigator.language auto-detection
    return 0;
  }

  /**
   * Look up a single translation key and return the translated string.
   * Falls back to the English (index 0) value if the key is missing for
   * the active language, or returns undefined if the key doesn't exist.
   * @param {string} key - Translation key (must exist in i18n_data.js T map)
   * @returns {string|undefined}
   */
  function t(key) {
    const data = W.SovereignI18nData;
    if (!data || !data.T) return undefined;
    const row = data.T[key];
    if (!row) return undefined;
    const idx = resolveIndex();
    return row[idx] || row[0];
  }

  /**
   * Translate all [data-i18n] elements in the document.
   * Also patches [data-i18n-placeholder] for input/textarea placeholders.
   * Preserves leading non-word characters (icons/glyphs) by default.
   * @param {Element|Document} [root=document] - Scope of translation sweep.
   * @param {boolean} [preserveIcons=true]     - Keep leading glyph prefixes.
   */
  function refresh(root, preserveIcons) {
    const scope = root || document;
    const keepIcons = preserveIcons !== false; // default true

    const data = W.SovereignI18nData;
    if (!data || !data.T) {
      console.warn('[SovereignI18n] i18n_data.js not loaded — skipping refresh.');
      return;
    }

    const idx = resolveIndex();
    if (idx === 0 && !_hasTranslated) return;


    // ── 1. Patch text content via [data-i18n] ──────────────────────────
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const row = data.T[key];
      if (!row) {
        console.warn('[SovereignI18n] Missing translation key:', key);
        return;
      }
      const translation = row[idx];
      if (!translation) return;

      if (keepIcons) {
        // Preserve leading non-letter, non-CJK glyph prefix (e.g. "⬡ ", "⚡ ")
        const iconMatch = el.textContent.match(/^[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7a3]+/);
        const icon = iconMatch ? iconMatch[0] : '';
        // Only inject icon if the translation doesn't already contain it
        el.textContent = (icon && !translation.startsWith(icon.trim()))
          ? icon + translation
          : translation;
      } else {
        el.textContent = translation;
      }
    });

    // ── 2. Patch placeholder via [data-i18n-placeholder] ───────────────
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const row = data.T[key];
      if (!row) {
        console.warn('[SovereignI18n] Missing placeholder key:', key);
        return;
      }
      const translation = row[idx] || row[0];
      if (translation) el.setAttribute('placeholder', translation);
    });

    // Also update <html lang=""> for accessibility
    const langCode = Object.keys(LANG_INDEX).find(k => LANG_INDEX[k] === idx) || 'en';
    document.documentElement.setAttribute('lang', langCode.split('-')[0]);

    _hasTranslated = (idx !== 0);
  }

  /**
   * Switch the active language at runtime.
   * Persists the choice to sessionStorage and immediately re-translates the DOM.
   * Fires a 'sovereignLangChanged' CustomEvent so pages can react (e.g. re-render
   * OCM messages, re-run axiom telemetry labels).
   * @param {string} langCode - e.g. 'zh-CN', 'en-US' (must exist in LANG_INDEX)
   */
  function setLanguage(langCode, isSync) {
    const code = langCode && langCode.trim();
    if (!code) return;
    // Normalise: accept both 'zh-CN' and 'ZH-CN'
    const normalised = Object.keys(LANG_INDEX).find(
      k => k.toLowerCase() === code.toLowerCase()
    ) || code;
    try {
      sessionStorage.setItem('sovereign_lang_mode', normalised);
      if (!isSync) {
        /* Write sov.lang.user_set.session flag so resolveIndex() knows this is intentional */
        sessionStorage.setItem('sov.lang.user_set.session', '1');
        /* FIX A1: Also write to localStorage['sovereign_lang'] for i18n.js.
         * Converts full BCP47 ('de-DE') to short code ('de').
         * Exception: zh-CN and zh-TW stay as-is (they're already in i18n.js LANGS). */
        const _FULL_TO_SHORT = { 'en-US':'en','de-DE':'de','fr-FR':'fr','es-ES':'es',
            'nl-NL':'nl','ja-JP':'ja','zh-CN':'zh-CN','zh-TW':'zh-TW',
            'sv-SE':'sv','nb-NO':'nb','da-DK':'da','fi-FI':'fi' };
        const shortCode = _FULL_TO_SHORT[normalised] || normalised.split('-')[0];
        localStorage.setItem('sovereign_lang', shortCode);
      }
    } catch (e) { /* private browsing — ignore */ }
    refresh();
    // Notify all listeners (e.g. HITL OCM re-greeting)
    try {
      window.dispatchEvent(new CustomEvent('sovereignLangChanged', { detail: { lang: normalised } }));
    } catch (_) {}
  }

  /**
   * Return the currently-active language code (e.g. 'zh-CN').
   * @returns {string}
   */
  function getCurrentLang() {
    const idx = resolveIndex();
    return Object.keys(LANG_INDEX).find(k => LANG_INDEX[k] === idx) || 'en-US';
  }

  // Public API — exposes refresh(), t(), setLanguage(), and lang getter
  W.SovereignI18n = {
    refresh,
    t,
    setLanguage,
    get lang() { return getCurrentLang(); }
  };

  // Listen for storage changes from other windows/iframes
  W.addEventListener('storage', function (e) {
    try {
      if (e.key === 'sovereign_lang' && e.newValue) {
        const cur = getCurrentLang();
        const shortMap = {
          'en-US':'en','de-DE':'de','fr-FR':'fr','es-ES':'es',
          'nl-NL':'nl','ja-JP':'ja','zh-CN':'zh-CN','zh-TW':'zh-TW',
          'sv-SE':'sv','nb-NO':'nb','da-DK':'da','fi-FI':'fi'
        };
        const currentShort = shortMap[cur] || cur.split('-')[0];
        if (e.newValue !== currentShort) {
          const longMap = {
            'en':'en-US','de':'de-DE','fr':'fr-FR','es':'es-ES',
            'nl':'nl-NL','ja':'ja-JP','zh-CN':'zh-CN','zh-TW':'zh-TW',
            'sv':'sv-SE','nb':'nb-NO','da':'da-DK','fi':'fi-FI'
          };
          const fullCode = longMap[e.newValue] || e.newValue;
          setLanguage(fullCode, true);
        }
      }
    } catch (_) {}
  });

  // Auto-refresh when the page finishes loading so static pages
  // (audit_report.html, landing.html) translate without manual calls.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refresh());
  } else {
    refresh();
  }

}(window));

