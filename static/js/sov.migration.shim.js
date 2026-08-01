/**
 * Module: sov.migration.shim.js
 * Version: 1.0.0
 * Description: Phase B-D storage key migration bridge.
 *
 * Canonical names (new)  →  Legacy names (old, still in use)
 * ─────────────────────────────────────────────────────────────
 * sessionStorage['sov.axiom.tiered']   ↔  sessionStorage['sovereign_tiered']
 * sessionStorage['sov.axiom.elected']  ↔  sessionStorage['sovereign_tiered_results']
 * sessionStorage['sov.axiom.ready']    ↔  localStorage['sovereign_tiered_ready']
 * localStorage['sov.lang']             ↔  localStorage['sovereign_lang']
 *                                         sessionStorage['sovereign_lang_mode']
 *
 * HOW IT WORKS
 * ─────────────
 * 1. Overrides sessionStorage.setItem / getItem / removeItem with a proxy
 *    that writes BOTH the new canonical key AND the legacy key simultaneously.
 * 2. getItem reads the canonical key first, falls back to the legacy key.
 * 3. Fires a 'SOV_KEY_MIGRATED' CustomEvent on first canonical write so
 *    modules can react without polling.
 * 4. Load this script FIRST — before any other sovereign script tag.
 *
 * REMOVAL
 * ───────
 * Once all files are updated to use canonical keys, delete this file and
 * remove the <script> tag. The shim is transparent — removing it only
 * stops the dual-write; existing data in canonical keys is preserved.
 */
(function (W) {
  'use strict';

  // ── Key alias tables ───────────────────────────────────────────────────────
  // Maps: legacyKey → canonicalKey
  const SS_MAP = {
    'sovereign_tiered':         'sov.axiom.tiered',
    'sovereign_tiered_results': 'sov.axiom.elected',
    'sovereign_tiered_ready':   'sov.axiom.ready',
    'sovereign_lang_mode':      'sov.lang',
  };
  // Maps: canonicalKey → [legacyKeys] (some canonical keys write multiple legacy keys)
  const SS_REVERSE = {
    'sov.axiom.tiered':   ['sovereign_tiered'],
    'sov.axiom.elected':  ['sovereign_tiered_results'],
    'sov.axiom.ready':    ['sovereign_tiered_ready'],
    'sov.lang':           ['sovereign_lang_mode'],
  };

  const LS_MAP = {
    'sovereign_lang':         'sov.lang',
    'sovereign_tiered_ready': 'sov.axiom.ready',
  };
  const LS_REVERSE = {
    'sov.lang':         ['sovereign_lang'],
    'sov.axiom.ready':  ['sovereign_tiered_ready'],
  };

  // ── Proxy factory ─────────────────────────────────────────────────────────
  function _proxyStorage(store, fwdMap, revMap, label) {
    const _origSet    = store.setItem.bind(store);
    const _origGet    = store.getItem.bind(store);
    const _origRemove = store.removeItem.bind(store);

    store.setItem = function (key, value) {
      // Always write the requested key
      _origSet(key, value);
      // If it's a legacy key → also write canonical
      if (fwdMap[key]) {
        _origSet(fwdMap[key], value);
        W.dispatchEvent(new CustomEvent('SOV_KEY_MIGRATED', {
          detail: { from: key, to: fwdMap[key], store: label }
        }));
      }
      // If it's a canonical key → also write all legacy aliases
      if (revMap[key]) {
        revMap[key].forEach(function (alias) { _origSet(alias, value); });
      }
    };

    store.getItem = function (key) {
      // Canonical key requested → prefer it, fall back to legacy
      if (revMap[key]) {
        var v = _origGet(key);
        if (v !== null) return v;
        // Fall back to first legacy alias
        for (var i = 0; i < revMap[key].length; i++) {
          v = _origGet(revMap[key][i]);
          if (v !== null) {
            // Backfill canonical key for next read
            _origSet(key, v);
            return v;
          }
        }
        return null;
      }
      // Legacy key requested → read legacy, also honour canonical if set
      if (fwdMap[key]) {
        var cv = _origGet(fwdMap[key]);
        if (cv !== null) return cv;
      }
      return _origGet(key);
    };

    store.removeItem = function (key) {
      _origRemove(key);
      if (fwdMap[key])  { _origRemove(fwdMap[key]); }
      if (revMap[key])  { revMap[key].forEach(function (a) { _origRemove(a); }); }
    };
  }

  // ── Apply proxies ─────────────────────────────────────────────────────────
  try {
    _proxyStorage(W.sessionStorage, SS_MAP, SS_REVERSE, 'sessionStorage');
    _proxyStorage(W.localStorage,   LS_MAP, LS_REVERSE, 'localStorage');
    console.log('[sov.migration.shim] ✓ Storage key bridges active');
  } catch (e) {
    console.warn('[sov.migration.shim] Could not install proxies:', e);
  }

  // ── Expose canonical constants so modules can reference names reliably ────
  W.SOV_KEYS = {
    AXIOM_TIERED:  'sov.axiom.tiered',
    AXIOM_ELECTED: 'sov.axiom.elected',
    AXIOM_READY:   'sov.axiom.ready',
    LANG:          'sov.lang',
    // Legacy (kept for backward compat reference, do not write directly)
    _LEGACY: {
      tiered:         'sovereign_tiered',
      tieredResults:  'sovereign_tiered_results',
      tieredReady:    'sovereign_tiered_ready',
      lang:           'sovereign_lang',
      langMode:       'sovereign_lang_mode',
    }
  };

  // ── One-time language reset (clears stale non-EN from prior sessions) ────────
  // If the user never explicitly chose a language in THIS session
  // (sov.lang.user_set.session is written to sessionStorage by setLanguage() in
  // both i18n.js and sovereign_i18n.js), AND localStorage['sovereign_lang'] holds
  // a non-EN value from a prior session — reset to EN to enforce the fresh-load default.
  try {
    var _userSetThisSession = W.sessionStorage.getItem('sov.lang.user_set.session');
    var _storedLang = W.localStorage.getItem('sovereign_lang') || W.localStorage.getItem('sov.lang');
    if (!_userSetThisSession && _storedLang && _storedLang !== 'en' && _storedLang.toLowerCase() !== 'en-us') {
      // Non-EN stored from a prior session and no explicit user choice this session — reset to EN
      W.localStorage.setItem('sovereign_lang', 'en');
      W.localStorage.setItem('sov.lang', 'en');
      W.sessionStorage.setItem('sovereign_lang_mode', 'en-US');
      W.sessionStorage.setItem('sov.lang', 'en-US');
      console.log('[sov.migration.shim] Lang reset: stale "' + _storedLang + '" → en (no sov.lang.user_set.session flag)');
    }
  } catch (_le) {}

}(window));
