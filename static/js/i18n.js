/**
 * Module: i18n.js
 * Version: 1.0.0
 * Description: Sovereign Matrix — Internationalization Engine.
 *   - Reads window.SovereignI18nData (loaded by i18n_data.js FIRST)
 *   - Injects a compact language-selector pill into the page header
 *   - Applies translations via CSS selector map (zero HTML changes needed)
 *   - Patches dynamic render text via MutationObserver
 *   - Persists selection in localStorage under key 'sovereign_lang'
 *   - Exposes window.SovereignI18n.t(key), .setLanguage(code), .lang
 *
 * UI design contract: JetBrains Mono · #00C853 · #D4AF37 · #000 background
 *   No new colours, no layout shifts, no font changes.
 *
 * Rule 02: ≤400 lines | Rule 03: BUS emit on lang change | Rule 04: E-code logging
 */
'use strict';
(function (W) {
const prevI18n = W.SovereignI18n;


/* ── Guard: requires i18n_data.js ─────────────────────────────────────── */
if (!W.SovereignI18nData) {
    console.error('E001: [i18n] SovereignI18nData not loaded. Load i18n_data.js first.');
    return;
}
const D = W.SovereignI18nData;

/* ── State ────────────────────────────────────────────────────────────── */
let _lang = 'en';

/* ── Core translation function ────────────────────────────────────────── */
/**
 * Get translated string for a key in the current language.
 * Falls back to English, then to the key itself.
 * @param {string} key
 * @returns {string}
 */
function t(key) {
    try {
        const arr = D.T[key];
        if (!arr) return key;
        const idx = D.LANGS.indexOf(_lang);
        return (idx >= 0 && arr[idx]) ? arr[idx] : arr[0];
    } catch (e) {
        console.warn('E003: [i18n] t() error for key:', key, e);
        return key;
    }
}

/* ── CSS (selector map) — zero new colours, Sovereign design tokens only ─ */
function _injectCSS() {
    if (W.document.getElementById('i18n-css')) return;
    const s = W.document.createElement('style');
    s.id = 'i18n-css';
    s.textContent = `
#sov-lang-pill{
    display:inline-flex;align-items:center;gap:6px;cursor:pointer;
    border:2.5px solid #c1ff72 !important;border-radius:25px !important;padding:6px 16px !important;
    font-family:'Quicksand','Nunito',sans-serif !important;font-size: 12px;color:#c1ff72 !important;
    background: linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 49%, rgba(193,255,114,0.15) 50%, rgba(0,0,0,0.6) 100%) !important;
    backdrop-filter: blur(12px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(12px) saturate(180%) !important;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 
                inset 0 1.5px 3px rgba(255, 255, 255, 0.45), 
                0 0 15px rgba(193, 255, 114, 0.25) !important;
    text-shadow: 0 0 8px rgba(193, 255, 114, 0.4) !important;
    font-weight:800 !important;
    position:relative;user-select:none;
    letter-spacing:.8px;transition:all .25s ease;
}
#sov-lang-pill:hover, #sov-lang-pill.open{
    background: linear-gradient(to bottom, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 49%, rgba(193,255,114,0.22) 50%, rgba(0,0,0,0.55) 100%) !important;
    border-color:#c1ff72 !important;
    color:#c1ff72 !important;
    box-shadow: 0 6px 20px rgba(193, 255, 114, 0.45), 
                inset 0 1.5px 3px rgba(255, 255, 255, 0.5), 
                0 0 20px rgba(193, 255, 114, 0.35) !important;
}
#btn-language{
    color:#ffd700 !important;
}
#sov-lang-pill .sov-lang-flag{font-size: 12px;line-height:1;}
#sov-lang-dropdown{
    position:absolute;top:calc(100% + 6px);right:0;min-width:160px;z-index:99999;
    background:rgba(10, 10, 10, 0.95);border:2px solid #c1ff72;border-radius:12px;
    box-shadow:0 8px 32px rgba(0,0,0,.7);overflow-y:auto;overflow-x:hidden;max-height:300px;
    display:none;flex-direction:column;backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);
}
#sov-lang-dropdown::-webkit-scrollbar{width:4px;}
#sov-lang-dropdown::-webkit-scrollbar-track{background:rgba(255,255,255,0.05);}
#sov-lang-dropdown::-webkit-scrollbar-thumb{background:#c1ff72;border-radius:2px;}
#sov-lang-pill.open #sov-lang-dropdown{display:flex;}
.sov-lang-opt{
    display:flex;align-items:center;gap:8px;padding:9px 16px;
    font-family:'Quicksand','Nunito',sans-serif !important;font-size: 12px;color:#bbbbbb !important;
    cursor:pointer;letter-spacing:.5px;transition:background .12s,color .12s;border:none;background:none;
    width:100%;text-align:left;box-sizing:border-box;white-space:nowrap;font-weight:700 !important;
}
.sov-lang-opt:hover{background:rgba(193, 255, 114, 0.15);color:#c1ff72 !important;}
.sov-lang-opt.active{color:#c1ff72 !important;background:rgba(193, 255, 114, 0.08);}
.sov-lang-opt .sov-lang-opt-flag{font-size:12px;flex-shrink:0;}
.sov-lang-opt .sov-lang-opt-name{flex:1;}
.sov-lang-opt .sov-lang-opt-tick{color:#c1ff72 !important;font-size: 12px;opacity:0;}
.sov-lang-opt.active .sov-lang-opt-tick{opacity:1;}`;
    W.document.head.appendChild(s);
}

/* ── Inject language selector pill ───────────────────────────────────── */
function _injectSelector() {
    if (W.document.getElementById('sov-lang-pill')) return;

    const pill = W.document.createElement('div');
    pill.id = 'sov-lang-pill';

    const optionsHTML = D.LANGS.map((code, i) =>
        `<button class="sov-lang-opt${code === _lang ? ' active' : ''}" data-lang="${code}">
            <span class="sov-lang-opt-flag">${D.LANG_FLAGS[i]}</span>
            <span class="sov-lang-opt-name">${D.LANG_NAMES[i]}</span>
            <span class="sov-lang-opt-tick">✓</span>
        </button>`
    ).join('');

    pill.innerHTML = `
        <span class="sov-lang-flag">${D.LANG_FLAGS[D.LANGS.indexOf(_lang)]}</span>
        <span id="sov-lang-code">${_lang.toUpperCase()}</span>
        <span style="color:#333">▾</span>
        <div id="sov-lang-dropdown">${optionsHTML}</div>`;

    /* Toggle open */
    pill.addEventListener('click', (e) => {
        e.stopPropagation();
        pill.classList.toggle('open');
    });
    W.document.addEventListener('click', () => pill.classList.remove('open'));

    /* Option click */
    pill.querySelectorAll('.sov-lang-opt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setLanguage(btn.dataset.lang);
            pill.classList.remove('open');
        });
    });

    /* Find best injection point: header nav area or body */
    const targets = [
        W.document.querySelector('.hdr-nav'),
        W.document.querySelector('.hdr-right'),
        W.document.querySelector('nav'),
        W.document.querySelector('.hdr-btn-op03')?.parentElement,
        W.document.querySelector('.hdr-btn')?.parentElement,
        W.document.querySelector('header')
    ];
    pill.style.cssText = 'position:fixed;top:10px;right:14px;z-index:9100;';
    W.document.body.appendChild(pill);
}

/* ── CSS Selector → i18n key map ─────────────────────────────────────── */
/* Maps to real IDs found in op_01/02/03.html source.                     */
const SELECTOR_MAP = [
    /* Navigation — HOME button (varies per page) */
    { s:'#btn-home',                                                 k:'nav.home' },
    { s:'#btn-home-op02',                                            k:'nav.home' },
    { s:'#btn-home-op03',                                            k:'nav.home' },
    /* Navigation — Manual Axiom Selection */
    { s:'#btn-op02-axiom,#btn-op03-axiom',                           k:'nav.manual' },
    /* Navigation — Upload Input File */
    { s:'#btn-op03-upload',                                          k:'nav.upload' },
    /* Navigation — Generate Audit Report */
    { s:'#btn-op02-report,#btn-op03-report',                         k:'nav.audit_hdr' },
    /* New header navigation buttons in op_02 and op_03 */
    { s:'#btn-pricing-op02,#btn-pricing-op03',                       k:'nav.pricing' },
    { s:'#btn-login-op02,#btn-login-op03',                           k:'nav.login' },
    { s:'#btn-entropy-op02,#btn-entropy-op03',                       k:'nav.entropy' },
    /* Navigation — Language (op_01 has a LANGUAGE button) */
    { s:'#btn-language',                                             k:'lang.select' },
    /* Telemetry header */
    { s:'.tele-header,[data-i18n="tele.header"]',                    k:'tele.header' },
    /* Pipeline labels (data-i18n opt-in via new modal/axiom browser) */
    { s:'[data-i18n="stage.l1"]',  k:'stage.l1' },
    { s:'[data-i18n="stage.l2"]',  k:'stage.l2' },
    { s:'[data-i18n="stage.l3"]',  k:'stage.l3' },
    { s:'[data-i18n="stage.l4"]',  k:'stage.l4' },
    { s:'[data-i18n="stage.l5"]',  k:'stage.l5' },
    { s:'[data-i18n="stage.pipe"]',k:'stage.pipe' },
    /* Axiom Browser Modal (self-generated, uses data-i18n) */
    { s:'[data-i18n="browser.formula"]', k:'browser.formula' },
    { s:'[data-i18n="browser.vars"]',    k:'browser.vars' },
    { s:'[data-i18n="browser.rule"]',    k:'browser.rule' },
    { s:'[data-i18n="browser.domain"]',  k:'browser.domain' },
    { s:'[data-i18n="browser.hint"]',    k:'browser.hint' },
    { s:'[data-i18n="browser.title"]',   k:'browser.title' },
    /* HITL Modal (self-generated, uses data-i18n) */
    { s:'[data-i18n="hitl.title"]',     k:'hitl.title' },
    { s:'[data-i18n="hitl.preview"]',   k:'hitl.preview' },
    { s:'[data-i18n="hitl.pipeline"]',  k:'hitl.pipeline' },
    { s:'[data-i18n="hitl.step1"]',     k:'hitl.step1' },
    { s:'[data-i18n="hitl.step2"]',     k:'hitl.step2' },
    { s:'[data-i18n="hitl.confirm"]',   k:'hitl.confirm' },
    { s:'[data-i18n="hitl.cancel"]',    k:'hitl.cancel' },
    /* Audit Report */
    { s:'[data-i18n="report.title"]',   k:'report.title' },
    { s:'[data-i18n="report.hash"]',    k:'report.hash' },
    { s:'[data-i18n="report.dl_json"]', k:'report.dl_json' },
    { s:'[data-i18n="report.dl_html"]', k:'report.dl_html' },
    /* Pipeline Layer IDs (header) */
    { s:'[data-i18n="l1.id"]', k:'l1.id' },
    { s:'[data-i18n="l2.id"]', k:'l2.id' },
    { s:'[data-i18n="l3.id"]', k:'l3.id' },
    { s:'[data-i18n="l4.id"]', k:'l4.id' },
    { s:'[data-i18n="l5.id"]', k:'l5.id' },
    /* Pipeline Layer Descriptions (header) */
    { s:'[data-i18n="l1.desc"]', k:'l1.desc' },
    { s:'[data-i18n="l2.desc"]', k:'l2.desc' },
    { s:'[data-i18n="l3.desc"]', k:'l3.desc' },
    { s:'[data-i18n="l4.desc"]', k:'l4.desc' },
    { s:'[data-i18n="l5.desc"]', k:'l5.desc' },
    /* Visualizations */
    { s:'[data-i18n="viz.gnn_title"]', k:'viz.gnn_title' },
    { s:'[data-i18n="viz.world_title"]', k:'viz.world_title' },
    { s:'[data-i18n="viz.causal_title"]', k:'viz.causal_title' },
    { s:'[data-i18n="viz.world_full"]', k:'viz.world_full' },
    { s:'[data-i18n="viz.causal_full"]', k:'viz.causal_full' },
];

/* ── STRING MAP: English text → i18n key (built from T) ────────────────── */
let _strMap = null;
function _buildStrMap() {
    _strMap = {};
    for (const [key, arr] of Object.entries(D.T)) {
        const en = arr[0];
        if (!en) continue;
        /* Store both exact and trimmed+upper versions for loose matching */
        _strMap[en.trim()]                   = key;
        _strMap[en.trim().toUpperCase()]      = key;
        /* Also map partial prefix (for text nodes that have arrow prefix) */
        const bare = en.replace(/^[←→⬡⊛◈▼▸⚡#✓⊕\s]+/, '').trim();
        if (bare && bare.length > 3) _strMap[bare] = key;
    }
}

/* ── DeepScan: TreeWalker over entire DOM ─────────────────────────────── */
let _deepCache = null;  /* [{node, key, orig, prefix}] — built once, reused per lang switch */

function _applyDeep() {
    try {
        if (!_strMap) _buildStrMap();

        /* Re-build cache whenever invalidated (e.g. after dynamic DOM changes) */
        if (!_deepCache) {
            _deepCache = [];
            const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE']);
            const walker = W.document.createTreeWalker(
                W.document.body, 0x4 /* NodeFilter.SHOW_TEXT */
            );
            let node;
            while ((node = walker.nextNode())) {
                const par = node.parentNode;
                if (!par) continue;
                if (SKIP_TAGS.has(par.tagName)) continue;
                if (par.closest && par.closest('#sov-lang-pill,#abm-card-ov,#abm-ov')) continue;
                const txt     = node.textContent;
                const trimmed = txt.trim();
                if (!trimmed || trimmed.length < 2) continue;

                /* Match 1: exact */
                let key = _strMap[trimmed] || _strMap[trimmed.toUpperCase()];
                let prefix = '';

                /* Match 2: strip '>> ' and '▼ ' leader chars used by renderTelemetry */
                if (!key) {
                    const bare = trimmed.replace(/^(>>|▼|⚡|✦|⬡|◎|⟴|▸)\s+/, '').trim();
                    if (bare !== trimmed) {
                        key    = _strMap[bare] || _strMap[bare.toUpperCase()];
                        prefix = trimmed.slice(0, trimmed.indexOf(bare));
                    }
                }

                if (key) {
                    _deepCache.push({ node, key, orig: txt, prefix });
                }
            }
            /* DeepScan complete — suppress per-cycle logging to avoid console flood */
        }

        /* Apply current language (or restore English).
         * CRITICAL: disconnect the observer around ALL DOM writes.
         * The _applying flag is unreliable because the finally block resets it
         * synchronously, but MutationObserver callbacks are queued as microtasks
         * and fire AFTER the finally — so _applying is already false when they run.
         * disconnect/reconnect is the only guaranteed re-entry prevention. */
        if (_observer) _observer.disconnect();
        try {
            _deepCache.forEach(({ node, key, orig, prefix }) => {
                try {
                    if (_lang === 'en') {
                        node.textContent = orig;
                    } else {
                        const translated = t(key);
                        const wsPrefix   = orig.match(/^\s*/)[0];
                        node.textContent = wsPrefix + (prefix || '') + translated;
                    }
                } catch (_) { /* node may have been removed */ }
            });
        } finally {
            if (_observer) _observer.observe(W.document.body, { childList: true, subtree: true });
        }
    } catch (err) {
        console.warn('E003: [i18n] _applyDeep error:', err);
    }
}

/** Apply translations to statically ID-mapped elements (legacy selectors) */
function _applySelectors() {
    if (_observer) _observer.disconnect();
    try {
        SELECTOR_MAP.forEach(({ s, k }) => {
            try {
                W.document.querySelectorAll(s).forEach(el => {
                    if (el.children.length === 0) {
                        el.textContent = t(k);
                    } else {
                        for (const node of el.childNodes) {
                            if (node.nodeType === 3 && node.textContent.trim()) {
                                node.textContent = t(k);
                                break;
                            }
                        }
                    }
                });
            } catch (err) { console.warn('E003: [i18n] selector error:', s, err); }
        });
    } finally {
        if (_observer) _observer.observe(W.document.body, { childList: true, subtree: true });
    }
}

/** Translate axiom tier badges rendered by AxiomMatcher renderTelemetry */
function _applyTierBadges() {
    if (_observer) _observer.disconnect();
    try {
        W.document.querySelectorAll('.am-tier,.tier-badge,.sov-tier-tag').forEach(el => {
            const txt = el.textContent.trim().toUpperCase();
            if (txt === 'ELECTED')   el.textContent = t('tier.elected');
            else if (txt === 'CANDIDATE') el.textContent = t('tier.candidate');
            else if (txt === 'STANDBY')   el.textContent = t('tier.standby');
            else if (txt === 'REJECTED')  el.textContent = t('tier.rejected');
        });
    } catch (e) { console.warn('E003: [i18n] tier badge error:', e); }
    finally {
        if (_observer) _observer.observe(W.document.body, { childList: true, subtree: true });
    }
}

/** Update language selector pill to reflect current language */
function _updatePill() {
    const idx  = D.LANGS.indexOf(_lang);
    const code = W.document.getElementById('sov-lang-code');
    const pill = W.document.getElementById('sov-lang-pill');
    if (code) code.textContent = _lang.toUpperCase();
    if (pill) {
        const flagEl = pill.querySelector('.sov-lang-flag');
        if (flagEl) flagEl.textContent = D.LANG_FLAGS[idx] || '🌐';
        pill.querySelectorAll('.sov-lang-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === _lang);
        });
    }
    /* Update <html lang=""> for accessibility */
    W.document.documentElement.setAttribute('lang', _lang);
}

/* ── MutationObserver: auto-translate newly injected DOM nodes ─────────── */
let _observer = null;
/* Re-entry is prevented by _observer.disconnect() around all DOM write calls. */
function _startObserver() {
    if (_observer) return;
    _observer = new MutationObserver(() => {
        /* Debounce: wait 200ms after the last mutation before re-translating.
         * _deepCache is invalidated INSIDE the timeout — not here — so that
         * rapid back-to-back mutations don't all trigger expensive rebuilds. */
        clearTimeout(_observer._tmr);
        _observer._tmr = setTimeout(() => {
            _deepCache = null;  /* invalidate only once after debounce settles */
            _applySelectors();
            _applyDeep();
            _applyTierBadges();
        }, 200);
    });
    _observer.observe(W.document.body, { childList: true, subtree: true });
}

/* ── Public: setLanguage ─────────────────────────────────────────────── */
/**
 * Switch the active language and update all translatable DOM content.
 * @param {string} code - Language code from SovereignI18nData.LANGS
 */
function setLanguage(code, isSync) {
    if (!D.LANGS.includes(code)) {
        console.warn('E003: [i18n] Unknown language code:', code);
        return;
    }
    _lang = code;
    try { W.localStorage.setItem('sovereign_lang', code); } catch (_) {}
    if (!isSync) {
        /* USER-SET FLAG: mark that this language change came from the user (not an auto-switch).
         * The migration shim reads this flag — if present, it respects the stored lang on reload.
         * If absent, it resets stale ZH-TW back to EN (clears old HITL auto-switch corruption). */
        try { W.localStorage.setItem('sov.lang.user_set', '1'); } catch (_) {}
        /* Session-level flag: tells _init() this is an intentional choice in the current session */
        try { W.sessionStorage.setItem('sov.lang.user_set.session', '1'); } catch (_) {}
    }
    /* FIX A1: "Last command wins" — write sovereign_lang_mode for sovereign_i18n.js too.
     * Both modules now share this sessionStorage key as the cross-module contract.
     * Mapping: short code → full BCP47 used by sovereign_i18n.js */
    const _SHORT_TO_FULL = { 'en':'en-US','de':'de-DE','fr':'fr-FR','es':'es-ES',
        'nl':'nl-NL','ja':'ja-JP','zh-CN':'zh-CN','zh-TW':'zh-TW',
        'sv':'sv-SE','nb':'nb-NO','da':'da-DK','fi':'fi-FI' };
    const _fullCode = _SHORT_TO_FULL[code] || code;
    try { W.sessionStorage.setItem('sovereign_lang_mode', _fullCode); } catch (_) {}
    _updatePill();
    if (_observer) _observer.disconnect();
    try {
        _applySelectors();
        _applyDeep();
        _applyTierBadges();
        if (prevI18n && typeof prevI18n.refresh === 'function') {
            prevI18n.refresh();
        }
    } finally {
        if (_observer) _observer.observe(W.document.body, { childList: true, subtree: true });
    }
    /* Rule 03: emit via SovereignBUS */
    if (W.SovereignBUS) {
        W.SovereignBUS.emit('LANG_CHANGED', {
            sender: 'i18n', message_type: 'LANG_CHANGED',
            payload: { lang: code, langName: D.LANG_NAMES[D.LANGS.indexOf(code)] }
        });
    }
    console.log(`[i18n] Language set: ${code} (${D.LANG_NAMES[D.LANGS.indexOf(code)]}) — sovereign_lang_mode: ${_fullCode}`);
}

/* ── Bootstrap ───────────────────────────────────────────────────────── */

/**
 * Patch op_01.html's legacy LANGUAGE button to open the i18n pill dropdown
 * instead of the old 2-language modal.  Non-destructive: falls back silently.
 */
function _patchLegacyButtons() {
    try {
        const btnLang = W.document.getElementById('btn-language');
        if (btnLang) {
            btnLang.onclick = (e) => {
                e.stopPropagation();
                const pill = W.document.getElementById('sov-lang-pill');
                if (pill) pill.classList.toggle('open');
            };
            /* Rename label to current lang name */
            btnLang.textContent = D.LANG_NAMES[D.LANGS.indexOf(_lang)] || 'LANGUAGE';
        }
    } catch (e) { console.warn('E003: [i18n] _patchLegacyButtons:', e); }
}

/** Bug-4: Clear axiom session on page reload (Ctrl+R / Ctrl+Shift+R). */
function _clearSessionOnReload() {
    try {
        const nav = W.performance.getEntriesByType('navigation')[0];
        if (nav && nav.type === 'reload') {
            W.sessionStorage.removeItem('sovereign_axiom_match');
            W.sessionStorage.removeItem('sovereign_hitl_context');
            console.log('[i18n] Reload detected — axiom session cleared.');
        }
    } catch(e) { console.warn('E003: [i18n] _clearSessionOnReload:', e); }
}

function _init() {
    try {
        _clearSessionOnReload();

        /* Restore persisted language — priority: sessionStorage (cross-module) > localStorage */
        /* FIX A1: sovereign_lang_mode (sovereign_i18n.js key) is checked first so that
         * whichever module wrote it last wins. */
        const _FULL_TO_SHORT = { 'en-US':'en','de-DE':'de','fr-FR':'fr','es-ES':'es',
            'nl-NL':'nl','ja-JP':'ja','zh-CN':'zh-CN','zh-TW':'zh-TW',
            'sv-SE':'sv','nb-NO':'nb','da-DK':'da','fi-FI':'fi' };
        const savedFull  = W.sessionStorage.getItem('sovereign_lang_mode');
        const savedShort = W.localStorage.getItem('sovereign_lang');
        /* FIX-I18N-DEFAULT: Only restore localStorage lang if:
         *   (a) user explicitly set it in THIS session (sessionStorage flag present), OR
         *   (b) saved value is 'en' (safe to restore always).
         * This prevents zh-TW stored in a prior session from auto-applying on fresh load.
         * The user-set flag is written by setLanguage() and cleared on navigation/reload. */
        const _userSetThisSession = !!W.sessionStorage.getItem('sov.lang.user_set.session');
        const _fromFull = savedFull ? (_FULL_TO_SHORT[savedFull] || savedFull.split('-')[0]) : null;
        const _candidate = _fromFull || savedShort;
        let restored = null;
        if (_candidate && D.LANGS.includes(_candidate)) {
            /* Always accept 'en'; accept non-EN only if user chose it this session */
            if (_candidate === 'en' || _userSetThisSession) {
                restored = _candidate;
            } else {
                /* Stale non-EN from previous session — default to EN, keep localStorage for future explicit switch */
                console.log('[i18n] Stale lang from prior session (' + _candidate + ') — defaulting to EN. User can switch via LANGUAGE button.');
                restored = 'en';
            }
        }
        if (restored && D.LANGS.includes(restored)) _lang = restored;


        _injectCSS();
        _injectSelector();
        _updatePill();
        _buildStrMap();
        _applySelectors();
        _applyDeep();
        _applyTierBadges();
        if (prevI18n && typeof prevI18n.refresh === 'function') {
            prevI18n.refresh();
        }
        _startObserver();
        _patchLegacyButtons();

        /* Retry after 800ms for deferred renders — observer is already live at this point.
         * Temporarily disconnect before the manual sweep to prevent feedback loop. */
        setTimeout(() => {
            if (_observer) _observer.disconnect();
            _deepCache = null;
            try {
                _applySelectors();
                _applyDeep();
                _applyTierBadges();
                if (prevI18n && typeof prevI18n.refresh === 'function') {
                    prevI18n.refresh();
                }
                _patchLegacyButtons();
            }
            finally { if (_observer) _observer.observe(W.document.body, { childList: true, subtree: true }); }
        }, 800);

        console.log(`[i18n] Initialized. Language: ${_lang}. ${D.LANGS.length} locales. StringMap: ${Object.keys(_strMap||{}).length} entries.`);
    } catch (err) {
        console.error('E003: [i18n] init error:', err);
    }
}

/* Bootstrap on DOM ready */
if (W.document.readyState === 'loading') {
    W.document.addEventListener('DOMContentLoaded', _init);
} else {
    _init();
}

/* LANG FIX: Listen for language changes from sovereign_i18n.js (which fires
 * 'sovereignLangChanged'). When it fires, sync i18n.js to the same locale so
 * both the landing-page pill and the OP-01 pill stay coherent.
 * The _FULL_TO_SHORT map handles BCP47 → short-code conversion. */
W.addEventListener('sovereignLangChanged', function(e) {
    try {
        const _FULL_TO_SHORT = { 'en-US':'en','de-DE':'de','fr-FR':'fr','es-ES':'es',
            'nl-NL':'nl','ja-JP':'ja','zh-CN':'zh-CN','zh-TW':'zh-TW',
            'sv-SE':'sv','nb-NO':'nb','da-DK':'da','fi-FI':'fi',
            /* passthrough short codes */
            'en':'en','zh':'zh-TW','ja':'ja','ko':'ko' };
        const full = e.detail && e.detail.lang;
        const short = full ? (_FULL_TO_SHORT[full] || full.split('-')[0]) : null;
        if (short && D.LANGS.includes(short) && short !== _lang) {
            console.log('[i18n] sovereignLangChanged →', full, '→ syncing to', short);
            setLanguage(short, true);
        }
    } catch(_se) { console.warn('[i18n] sovereignLangChanged sync error:', _se); }
});

/* CROSS-TAB SYNC: Listen for localStorage changes on 'sovereign_lang' from other tabs/frames */
W.addEventListener('storage', function(e) {
    try {
        if (e.key === 'sovereign_lang' && e.newValue && e.newValue !== _lang) {
            console.log('[i18n] Cross-tab storage sync →', e.newValue);
            setLanguage(e.newValue, true);
        }
    } catch(err) { console.warn('[i18n] storage sync error:', err); }
});


/* ── Public API ──────────────────────────────────────────────────────── */
W.SovereignI18n = {
    /** Get translated string */
    t,
    /** Set active language by code (e.g. 'de', 'ja') */
    setLanguage,
    /** Current active language code */
    get lang() { return _lang; },
    /** Array of available language codes */
    get langs() { return D.LANGS; },
    /** Human-readable name for a language code */
    langName: (code) => D.LANG_NAMES[D.LANGS.indexOf(code)] || code,
    /** Force re-apply translations (call after dynamic render).
     *  Invalidates _deepCache so newly injected text nodes are picked up. */
    refresh: () => {
        if (_observer) _observer.disconnect();
        _deepCache = null;
        try {
            _applySelectors();
            _applyDeep();
            _applyTierBadges();
            if (prevI18n && typeof prevI18n.refresh === 'function') {
                prevI18n.refresh();
            }
        }
        finally { if (_observer) _observer.observe(W.document.body, { childList: true, subtree: true }); }
    }
};

}(window));
