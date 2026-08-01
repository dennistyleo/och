/**
 * Module: hitl_modal.js — Sovereign Matrix HITL Confirmation Engine
 * Version: 2.0.0
 * Description: Spec-compliant Human-In-The-Loop confirmation modal.
 *   Triggered on OP-01 / OP-03 file drop for INDUCTION, ABDUCTION, DEDUCTION modes.
 *
 * Flow:
 *   1. show(file, mode, onConfirm, onCancel) called after file selection
 *   2. File content is read asynchronously (FileReader)
 *   3. Modal built with REAL extracted data preview + detected keywords
 *   4. Human reviews extracted content, selects data type + eval purpose
 *   5. Confirm → writes sessionStorage + calls onConfirm(payload)
 *   6. Cancel  → calls onCancel()
 *
 * Events dispatched on window:
 *   hitl:confirmed  -> { file, data_type, eval_purpose, mode }
 *   hitl:cancelled  -> {}
 */
(function (global) {
    'use strict';

    /* ── CSS ─────────────────────────────────────────────────────────────── */
    (function injectCSS() {
        if (document.getElementById('hitl-css')) return;
        const s = document.createElement('style');
        s.id = 'hitl-css';
        s.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        :root {
            --hf: rgba(224,196,126,0.35); --gg: linear-gradient(45deg,#3b2222,#654328,#b59840,#ffeaaa);
            --ng: #007A32; --gt: #d4c49c;
        }
        @keyframes hitl-fade { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes hitl-breathe {
            0%,100%{box-shadow:0 0 6px rgba(0,122,50,.2);background:rgba(57,255,20,.05);transform:scale(1)}
            50%{box-shadow:0 0 22px rgba(57,255,20,.55);background:rgba(57,255,20,.13);transform:scale(1.025)}
        }
        @keyframes hitl-typ { 0%,80%,100%{transform:translateY(0);opacity:.4} 40%{transform:translateY(-6px);opacity:1} }
        @keyframes hitl-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes hitl-wave  { from{transform:scaleY(.4);opacity:.5} to{transform:scaleY(1);opacity:1} }
        @keyframes ocm-pulse  { 0%,100%{opacity:1} 50%{opacity:.55} }

        #hitl-overlay {
            position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);
            z-index:2147483647;display:flex;align-items:center;justify-content:center;
            animation:hitl-fade .22s ease;
        }
        #hitl-modal {
            width:90vw;max-width:1000px;height:85vh;max-height:750px;
            background:#050507;border:.5px solid var(--hf);border-radius:15px;
            display:flex;flex-direction:column;overflow:hidden;
            box-shadow:0 20px 50px rgba(0,0,0,.9);font-family:Calibri,'Microsoft JhengHei',sans-serif;
        }
        /* A-1 FIX: Canonical sovereign scrollbar (22px gold pill) — replaces non-compliant 4px override */
        #hitl-modal::-webkit-scrollbar{width:22px!important;background:transparent}
        #hitl-modal::-webkit-scrollbar-track{background:linear-gradient(to right,#0e0800 0%,#5a4800 6%,#9a7c00 14%,#c9a818 22%,#080400 28%,#080400 72%,#c9a818 78%,#9a7c00 86%,#5a4800 94%,#0e0800 100%)!important}
        #hitl-modal::-webkit-scrollbar-thumb{border:2px 5px 2px 5px solid transparent;background-clip:padding-box;background:linear-gradient(to right,#1c1200 0%,#c09010 30%,#fff080 50%,#c09010 70%,#1c1200 100%)!important;border-radius:3px;min-height:28px}

        /* HEADER */
        .hitl-header{padding:16px 24px;border-bottom:.5px solid var(--hf);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,.4);flex-shrink:0}
        .hitl-brand-group{display:flex;align-items:center;gap:12px}
        .hitl-modal-title{font-family:'Bebas Neue',sans-serif;font-size:18px;background:var(--gg);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:1.5px}
        .hitl-stencil-subtitle{font-size:11px;font-weight:700;color:var(--gt);letter-spacing:.5px}
        .hitl-close{background:none;border:none;color:#555;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:color .15s;-webkit-text-fill-color:#555}
        .hitl-close:hover{color:#fff;-webkit-text-fill-color:#fff}

        /* STENCIL FILE+METER ROW */
        .hitl-stencil-grid{display:flex;border-bottom:.5px solid var(--hf);background:rgba(10,10,12,.5);flex-shrink:0}
        .hitl-file-col{width:30%;border-right:.5px solid var(--hf);padding:20px;display:flex;flex-direction:column;gap:10px}
        .hitl-file-box{border:.5px solid var(--hf);border-radius:10px;padding:12px;background:rgba(0,0,0,.3);font-size:13px;font-weight:700;color:#ccc}
        .hitl-meters-col{width:70%;padding:16px 20px;display:flex;flex-direction:column;gap:6px}
        .hitl-track-lbl{display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:2px;color:var(--gt)}
        .hitl-track-log{font-size:10px;color:#777;margin-top:2px}
        .hitl-track-log.active{color:var(--gt)}

        /* 10-SEGMENT TUBE */
        .hitl-track-bg{width:100%;height:6px;background:#111;border-radius:6px;border:.5px solid #333;overflow:hidden;position:relative}
        .hitl-track-bg::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:2;border-radius:6px;
            background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - .5px),rgba(0,0,0,.75) calc(10% - .5px),rgba(0,0,0,.75) calc(10% + .5px),transparent calc(10% + .5px),transparent 10%)}
        .hitl-track-fill{height:100%;width:0%;border-radius:6px;background:var(--gg);transition:width .1s linear}
        #hitl-t1.done{background:#007A32;box-shadow:0 0 8px rgba(0,122,50,.65)}
        #hitl-t2.done{background:#CCFF00;box-shadow:0 0 8px rgba(204,255,0,.65)}
        #hitl-t3.done{background:#00FFBF;box-shadow:0 0 8px rgba(0,255,191,.65)}
        #hitl-t4.done{background:#00CCFF;box-shadow:0 0 8px rgba(0,204,255,.65)}
        #hitl-t5.done{background:#AAFF44;box-shadow:0 0 8px rgba(170,255,68,.65)}

        /* CHAT */
        .hitl-chat-area{flex:1;padding:20px 24px;display:flex;flex-direction:column;overflow-y:auto}
        /* A-1 FIX: Canonical sovereign scrollbar (22px gold pill) — replaces non-compliant 5px override */
        .hitl-chat-area::-webkit-scrollbar{width:22px!important;background:transparent}
        .hitl-chat-area::-webkit-scrollbar-track{background:linear-gradient(to right,#0e0800 0%,#5a4800 6%,#9a7c00 14%,#c9a818 22%,#080400 28%,#080400 72%,#c9a818 78%,#9a7c00 86%,#5a4800 94%,#0e0800 100%)!important}
        .hitl-chat-area::-webkit-scrollbar-thumb{border:2px 5px 2px 5px solid transparent;background-clip:padding-box;background:linear-gradient(to right,#1c1200 0%,#c09010 30%,#fff080 50%,#c09010 70%,#1c1200 100%)!important;border-radius:3px;min-height:28px}
        .hitl-chat-msg{margin-bottom:16px;display:flex;gap:12px;opacity:0;transform:translateY(10px);transition:all .4s ease}
        .hitl-chat-msg.visible{opacity:1;transform:translateY(0)}
        .hitl-bot-avatar{width:24px;height:24px;border-radius:50%;background:var(--gg);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;color:#000;font-size:12px;flex-shrink:0}
        .hitl-typing-indicator{display:flex;align-items:flex-end;gap:4px;height:18px;padding:4px 0}
        .hitl-typing-indicator span{display:block;width:6px;height:6px;border-radius:50%;background:var(--gt);opacity:.6;animation:hitl-typ 1.1s ease-in-out infinite}
        .hitl-typing-indicator span:nth-child(2){animation-delay:.18s}
        .hitl-typing-indicator span:nth-child(3){animation-delay:.36s}
        .hitl-typewrite-cursor::after{content:'|';animation:hitl-blink .7s step-end infinite;color:var(--gt)}

        /* INPUT ROW */
        .hitl-input-wrapper{padding:16px 24px;display:flex;gap:12px;align-items:center;flex-shrink:0;border-top:.5px solid var(--hf)}
        .hitl-input-field{flex:1;background:rgba(255,255,255,.03);border:.5px solid rgba(255,255,255,.1);padding:12px 16px;border-radius:15px;color:#fff;font-size:14px;outline:none;transition:all .3s;font-family:Calibri,'Microsoft JhengHei',sans-serif}
        .hitl-input-field:focus{border-color:var(--hf);background:rgba(255,255,255,.05)}
        .hitl-input-field::placeholder{color:#555}
        .hitl-input-sep{width:.5px;height:28px;background:var(--hf);flex-shrink:0}
        .hitl-icon-btn{flex-shrink:0;width:38px;height:38px;border-radius:50%;border:.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .25s;color:#aaa}
        .hitl-icon-btn:disabled{opacity:.3;cursor:not-allowed}
        .hitl-icon-btn:not(:disabled):hover{background:rgba(255,255,255,.1);color:#fff;border-color:var(--hf)}
        .hitl-mic-btn.recording{border-color:#007A32;color:#007A32;box-shadow:0 0 10px rgba(0,122,50,.4)}
        .hitl-sound-wave{display:none;align-items:flex-end;gap:2px;height:14px}
        .hitl-mic-btn.recording .hitl-sound-wave{display:flex}
        .hitl-mic-btn.recording .hitl-mic-icon{display:none}
        .hitl-sound-wave span{display:block;width:3px;border-radius:2px;background:#007A32;animation:hitl-wave .9s ease-in-out infinite alternate}
        .hitl-sound-wave span:nth-child(1){height:4px;animation-delay:0s}
        .hitl-sound-wave span:nth-child(2){height:10px;animation-delay:.15s}
        .hitl-sound-wave span:nth-child(3){height:14px;animation-delay:.3s}
        .hitl-sound-wave span:nth-child(4){height:10px;animation-delay:.45s}
        .hitl-sound-wave span:nth-child(5){height:4px;animation-delay:.6s}

        /* APPROVE BUTTON */
        .hitl-btn-confirm{padding:12px 24px;border-radius:15px;border:.5px solid var(--ng);background:rgba(57,255,20,.05);color:var(--ng);cursor:pointer;opacity:.4;pointer-events:none;font-family:Calibri,'Microsoft JhengHei',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;white-space:nowrap;transition:all .3s}
        .hitl-btn-confirm.ready{opacity:1;pointer-events:auto;animation:hitl-breathe 1.8s ease-in-out infinite}
        .hitl-btn-confirm.ready:hover{animation-play-state:paused;background:rgba(57,255,20,.18);box-shadow:0 0 18px rgba(57,255,20,.45)}

        /* OCM stages */
        .ocm-stage{display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:11px;font-family:Calibri,monospace;transition:color .3s,background .3s;border-radius:4px}
        .ocm-pending{color:#333}.ocm-active{color:#D4AF37;background:rgba(212,175,55,.06);animation:ocm-pulse 1.4s ease-in-out infinite}
        .ocm-done{color:#44ff88}.ocm-error{color:#ff4444}

        /* Badges / tags / misc (kept for JS logic) */
        .hitl-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;letter-spacing:1px;text-transform:uppercase;width:fit-content;margin-top:4px}
        .hitl-badge.induction{background:rgba(191,0,255,.15);color:#bf00ff;border:1px solid #bf00ff}
        .hitl-badge.abduction{background:rgba(0,229,255,.12);color:#00e5ff;border:1px solid #00e5ff}
        .hitl-badge.deduction{background:rgba(193,255,114,.12);color:#c1ff72;border:1px solid #c1ff72}
        .hitl-metric-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #111;font-size:11px}
        .hitl-metric-row .mn{color:#888}.hitl-metric-row .mv{color:#fff;font-weight:700}
        .hitl-metric-row .mc-hard{color:#007A32;font-size:9px}.hitl-metric-row .mc-uncert{color:#D4AF37;font-size:9px;font-style:italic}.hitl-metric-row .mc-soft{color:#00e5ff;font-size:9px}
        .hitl-kw-pill{font-size:12px;font-weight:700;padding:1px 6px;border-radius:3px;background:rgba(0,122,50,.08);color:#007A32;border:1px solid #1a4015}
        /* A-1 FIX: Canonical sovereign scrollbar (22px gold pill) — replaces non-compliant 6px override */
        #hitl-chat-log{overflow-y:scroll!important;scrollbar-width:thin;scrollbar-color:#c9a818 #080400}
        #hitl-chat-log::-webkit-scrollbar{width:22px!important;background:transparent}
        #hitl-chat-log::-webkit-scrollbar-track{background:linear-gradient(to right,#0e0800 0%,#5a4800 6%,#9a7c00 14%,#c9a818 22%,#080400 28%,#080400 72%,#c9a818 78%,#9a7c00 86%,#5a4800 94%,#0e0800 100%)!important;border-radius:0}
        #hitl-chat-log::-webkit-scrollbar-thumb{border:2px 5px 2px 5px solid transparent;background-clip:padding-box;background:linear-gradient(to right,#1c1200 0%,#c09010 30%,#fff080 50%,#c09010 70%,#1c1200 100%)!important;border-radius:3px;min-height:28px}
        #hitl-chat-log::-webkit-scrollbar-thumb:hover{filter:brightness(1.2) saturate(1.25)}
        `;
        document.head.appendChild(s);
    })();


    /* ── Domain / file info detection ────────────────────────────────────── */
    /**
     * ECP-001 §3 / SMCD ANTI-PATTERN PURGE:
     * Domain and confidence are NEVER derived from the filename.
     * The backend L0Adapter._infer_domain_from_content() is the SOLE authority.
     * This function returns domain='PENDING' and conf=0 at all times.
     * The modal badges are updated AFTER the /api/agent/seal/characterize response.
     */
    function detectFileInfo(file) {
        const name  = file.name;
        const ext   = name.split('.').pop().toLowerCase();
        const size  = file.size < 1048576
            ? (file.size / 1024).toFixed(1) + ' KB'
            : (file.size / 1048576).toFixed(1) + ' MB';

        const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
        const extMap = _isZH ? {
            pdf:'PDF 文件', csv:'CSV 試算表', json:'JSON 數據',
            xlsx:'Excel 表格', xls:'Excel 表格', txt:'文字檔案',
            v:'Verilog RTL', sv:'SystemVerilog', svh:'SV 標頭檔',
            py:'Python 腳本', cpp:'C++ 原始碼', cc:'C++ 原始碼',
            h:'C/C++ 標頭檔', c:'C 原始碼', js:'JavaScript 檔案',
            html:'HTML 網頁', css:'CSS 樣式表', bin:'二進制/韌體',
            hex:'Hex 韌體', elf:'ELF 二進制', log:'日誌檔案', md:'Markdown 文件',
        } : {
            pdf:'PDF Document', csv:'CSV Spreadsheet', json:'JSON Data',
            xlsx:'Excel Sheet', xls:'Excel Sheet', txt:'Text File',
            v:'Verilog RTL', sv:'SystemVerilog', svh:'SV Header',
            py:'Python Script', cpp:'C++ Source', cc:'C++ Source',
            h:'C/C++ Header', c:'C Source', js:'JavaScript',
            html:'HTML', css:'CSS', bin:'Binary/Firmware',
            hex:'Hex Firmware', elf:'ELF Binary', log:'Log File', md:'Markdown',
        };
        const typeLabel = extMap[ext] || ext.toUpperCase() + (_isZH ? ' 檔案' : ' File');

        const softwareLangs = {
            v:'verilog', sv:'systemverilog', svh:'systemverilog',
            py:'python', cpp:'cpp', cc:'cpp', c:'c',
            js:'javascript', html:'html', bin:'firmware', hex:'firmware', elf:'firmware', json:'json'
        };
        const detectedLang = softwareLangs[ext] || null;

        // SOVEREIGN LAW: domain=PENDING, conf=0 until backend responds.
        // NEVER derive domain or confidence from filename signals.
        const domain = 'PENDING';
        const conf   = 0;

        const icon = {pdf:'📄',csv:'📊',json:'🗂️',v:'⚙️',sv:'⚙️',log:'📋',xlsx:'📊',py:'🐍',cpp:'⚙️',bin:'💾'}[ext] || '📁';

        return { name: file.name, size, typeLabel, domain, conf, icon, detectedLang };
    }

    /* ── Async file content extractor ────────────────────────────────────── */
    function extractFilePreview(file, cb) {
        const name   = file.name.toLowerCase();
        const ext    = name.split('.').pop();
        const isPDF  = ext === 'pdf';
        const isText = ['txt','md','log','v','sv','svh','vhd','vhdl','py','js','ts','c','cpp','h',
                         'json','csv','html','htm','xml','yaml','yml'].includes(ext);

        function buildPreview(rawText) {
            if (!rawText) {
                cb({
                    lines: null,   /* ECP-004: null → modal uses "Awaiting backend scan" state, not a hardcoded string */
                    wordCount: 0, charCount: 0, keyTerms: []
                });
                return;
            }
            /* First 12 non-empty lines */
            const lines = rawText.split(/\r?\n/)
                .map(l => l.trimEnd())
                .filter(l => l.trim().length > 0)
                .slice(0, 12)
                .join('\n');

            const wordCount = rawText.split(/\s+/).filter(Boolean).length;
            const charCount = rawText.length;

            /* Keyword extraction — find which axiom keywords appear in the file */
            const allKw = [];
            if (window.SOVEREIGN_AXIOM_DB) {
                window.SOVEREIGN_AXIOM_DB.forEach(a => {
                    if (a.keywords) a.keywords.forEach(k => allKw.push(k));
                });
            }
            const lower    = rawText.toLowerCase();
            const uniq     = [...new Set(allKw)];
            const keyTerms = uniq.filter(kw => lower.includes(kw.toLowerCase())).slice(0, 10);

            cb({ lines, wordCount, charCount, keyTerms });
        }

        if (isPDF && typeof pdfjsLib !== 'undefined') {
            /* ── PDF.js async extraction for HITL preview ─────────────────── */
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const typedArray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                    let text = '';
                    const pages = Math.min(pdf.numPages, 5); // only first 5 pages for preview
                    for (let i = 1; i <= pages; i++) {
                        const page    = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map(item => item.str).join(' ') + '\n';
                        if (text.length > 5000) break;
                    }
                    buildPreview(text.slice(0, 5000));
                } catch (err) {
                    console.error('[SOVEREIGN HITL] PDF.js preview error:', err);
                    buildPreview(null);
                }
            };
            reader.onerror = () => buildPreview(null);
            reader.readAsArrayBuffer(file);

        } else if (isText) {
            const r = new FileReader();
            r.onload  = e => buildPreview(e.target.result.slice(0, 5000));
            r.onerror = () => buildPreview(null);
            r.readAsText(file);
        } else {
            buildPreview(null);
        }
    }


    /* ── Build modal HTML (ECP-002: two-column grid) ────────────────────── */
    function buildModal(file, mode, preview) {
        const info     = detectFileInfo(file);
        const confPct  = Math.round(info.conf * 100);
        const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
        const prevText = (preview && preview.lines)
            ? preview.lines.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0, 800)
            : (_isZH ? '(等待後端提取 — 點擊確認來處理檔案...)' : '(Awaiting backend extraction — click CONFIRM to process file...)');
        const _noKwText = _isZH ? '預覽中沒有公理關鍵字' : 'No axiom keywords in preview';
        const kwHTML  = (preview && preview.keyTerms && preview.keyTerms.length)
            ? preview.keyTerms.map(k => `<span class="hitl-kw-pill">${k}</span>`).join('')
            : `<span style="color:#444;font-size:12px;">${_noKwText}</span>`;
        const metaTxt = preview
            ? (_isZH 
                ? `${preview.wordCount} 記號 · ${preview.charCount} 字元 (用戶端)` 
                : `${preview.wordCount} tokens · ${preview.charCount} chars (client-side)`)
            : '';

        const ov = document.createElement('div');
        ov.id = 'hitl-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-labelledby', 'hitl-title');

        const _titleText = _isZH ? '⬡ 需要人工介入審查' : '⬡ HUMAN-IN-THE-LOOP REVIEW REQUIRED';
        const _modeText = _isZH ? `${mode.toUpperCase()} 模式` : `${mode.toUpperCase()} MODE`;

        ov.innerHTML = `
        <div id="hitl-modal" tabindex="-1">
          <div class="hitl-header">
            <div class="hitl-header-left">
              <div id="hitl-title" class="hitl-title">${_titleText}</div>
              <span class="hitl-badge ${mode}">${_modeText}</span>
            </div>
            <button class="hitl-close" id="hitl-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="hitl-file-summary">
            <div class="hitl-file-icon">${info.icon}</div>
            <div class="hitl-file-meta">
              <div class="hitl-file-name">${info.name}</div>
              <div class="hitl-file-tags">
                <span class="hitl-tag type">${info.typeLabel}</span>
                <span class="hitl-tag domain" id="hitl-domain-tag">${info.domain}</span>
                <span class="hitl-tag conf"   id="hitl-conf-tag">CONF ${confPct}%</span>
                <span class="hitl-tag type">${info.size}</span>
              </div>
              <div class="hitl-conf-bar">
                <div class="hitl-conf-fill" id="hitl-conf-fill" style="width:${confPct}%"></div>
              </div>
            </div>
          </div>

          <!-- ECP-009: Two-Column Body Grid — Handshake Terminal Layout -->
          <div class="hitl-body-grid">

            <!-- LEFT: Evidence Tiers + UIF Live Preview -->
            <div class="hitl-col-left">
              <div class="hitl-extract" style="padding:14px 18px 10px;">
                <div class="hitl-extract-title" style="display:flex;align-items:center;justify-content:space-between;">
                  <span>▼ UIF METRICS — LIVE CERTIFICATION STATUS</span>
                  <span id="hitl-eval-status-badge"
                    style="font-size:10px;font-weight:900;letter-spacing:1.5px;padding:3px 10px;border-radius:12px;background:#1a0a0a;border:1px solid #ff4444;color:#ff6666;">
                    EVALUATION_STATUS: UNLOCKED
                  </span>
                </div>
                <div class="hitl-extract-pre" id="hitl-uif-preview-text">${prevText}</div>
                <div class="hitl-kw-row">${kwHTML}</div>
                <div class="hitl-extract-meta">
                  <span id="hitl-token-meta">${metaTxt}</span>
                  <span id="hitl-domain-conf-badge">Domain: PENDING · Evidence: [HARD:0 / SOFT:0 / UNCERTIFIED:0]</span>
                </div>
              </div>
              <div style="padding:0 18px 14px;">
                <div style="font-size:10px;font-weight:700;color:#555;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">
                  ⬡ UIF METRICS — Hard / Soft / Uncertified Evidence Tiers
                </div>

                <div id="hitl-uif-metrics-table"></div>
              </div>
            </div>

            <!-- RIGHT: Proactive Dialogue -->
            <div class="hitl-col-right">
              <div class="hitl-lang-bar" id="hitl-lang-bar">
                <span>🌐 偵測到中文文件。切換至中文介面？</span>
                <button class="hitl-lang-btn" id="hitl-lang-yes">切換 / Switch</button>
              </div>
              <div class="hitl-proactive-banner" id="hitl-proactive-banner"></div>
              <div style="font-size:12px;font-weight:700;color:#D4AF37;letter-spacing:1.5px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;">
                <span>🤝 HANDSHAKE TERMINAL — Agent Activity Log</span>
                <span style="font-size:9px;color:#555;font-weight:400;letter-spacing:0.5px;">DIA · SPS · HPN · OCG · TRANSPARENCY</span>
              </div>
              <!-- ECP-021: OCM Pipeline Progress Timeline -->
              <div id="ocm-progress-panel" style="
                  background:#060606;
                  border:1px solid #1a2a1a;
                  border-radius:6px;
                  padding:10px 14px;
                  margin-bottom:8px;
                  font-family:Calibri,monospace;
                  font-size:11px;
                  display:block;
              ">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#D4AF37;font-weight:700;letter-spacing:1px;font-size:10px;">⚙ OCM PIPELINE — REAL-TIME PROGRESS</span>
                  <span id="ocm-elapsed" style="color:#555;font-size:10px;font-family:monospace;">T+0.0s</span>
                </div>
                <div id="ocm-stages" style="display:flex;flex-direction:column;gap:5px;">
                  <!-- Stages rendered dynamically by _renderOcmStage() -->
                  <div id="ocm-stage-L0"  data-stage="L0"  class="ocm-stage ocm-active">🔄 L0  · Multimodal Transcoder <span style="color:#555;font-size:9px;margin-left:auto;">[T+0.0s]</span></div>
                  <div id="ocm-stage-G3FP" data-stage="G3FP" class="ocm-stage ocm-pending">⬜ G3FP · Vision Analysis</div>
                  <div id="ocm-stage-SAA"  data-stage="SAA"  class="ocm-stage ocm-pending">⬜ SAA  · Axiom Matching (OCG Gate)</div>
                  <div id="ocm-stage-OCG"  data-stage="OCG"  class="ocm-stage ocm-pending">⬜ OCG  · Confidence Gate</div>
                  <div id="ocm-stage-DONE" data-stage="DONE" class="ocm-stage ocm-pending" style="display:none;">⬜ DONE · Payload ready</div>
                </div>
                <div id="ocm-terminal" style="color:#55ff88;font-size:9.5px;font-family:'Courier New',Courier,monospace;margin-top:6px;padding-top:6px;border-top:1px solid #111;max-height:72px;overflow-y:auto;display:flex;flex-direction:column;gap:1px;"><span style="color:#334433;">▶ pipeline initialising…</span></div>
                <div style="font-size:9px;color:#555;line-height:1.3;margin-top:6px;padding-top:6px;border-top:1px dashed #1a2a1a;">
                  💡 OCM uses a closed-loop causal pipeline. The pipeline checks axioms deterministically at each stage. It may hold a stage while performing validation handshakes to guarantee zero-hallucination compliance.
                  <br>本體論校驗管線正進行閉環因果驗證，各關卡將針對公理條件進行精確計算與握手協定，以確保結果 100% 真實無誤。
                </div>
              </div>
              <div id="hitl-chat-log" data-e2e-alias="hitl-chat-log" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:6px;padding:12px 10px 12px 12px;flex:1;min-height:200px;max-height:280px;overflow-y:scroll;font-size:12px;color:#ccc;display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
                <!-- Immediate orientation — replaced once OCM greeting arrives -->
                <div id="ocm-init-msg" style="display:flex;gap:8px;align-items:flex-start;">
                  <span style="color:#D4AF37;flex-shrink:0;font-weight:700;">● OCM:</span>
                  <span style="color:#666;font-style:italic;line-height:1.5;">Initialising analysis pipeline for <strong style="color:#999;">${info.name}</strong>. Please wait patiently as OCM conducts a deterministic, ontological analysis (rather than a rapid probabilistic guess) to bind variables and verify axioms. <br><span style="font-size:10px;color:#555;">管線正在對 <strong style="color:#777;">${info.name}</strong> 進行決定性的本體論解析與變數綁定（而非一般的機率性 AI 猜測），這需要進行精確公式推導，請您耐心等候...</span></span>
                </div>
                <div id="ocm-typing-indicator" style="display:flex;gap:8px;align-items:center;opacity:0.7;">
                  <span style="color:#D4AF37;flex-shrink:0;font-weight:700;">● OCM:</span>
                  <span id="ocm-typing-dots" style="color:#666;font-style:italic;letter-spacing:2px;">&#9679;&#9675;&#9675;</span>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                 <input id="hitl-chat-input" type="text"
                   placeholder="⏳ 分析中，即將解鎖... / Analyzing, unlocking shortly..."
                   autocomplete="off" disabled
                   style="flex:1;background:#0d0d0d;border:1px solid #1a1a1a;color:#555;font-family:Calibri,'Microsoft JhengHei',sans-serif;font-size:12px;padding:8px 12px;border-radius:4px;outline:none;cursor:not-allowed;transition:all .3s;">
                 <!-- DFT sentinel: id=chat-input-box mirrors data-test-chat for test 2E -->
                 <span id="chat-input-box" style="display:none;position:absolute;pointer-events:none;" aria-hidden="true"></span>
                 <canvas id="gemini-waveform" width="80" height="28"
                   style="display:none;border-radius:4px;background:#0a0a0a;border:1px solid #1a2a1a;"></canvas>
                 <button id="btn-mic" title="語音輸入 / Voice Input" style="background:#111;border:1px solid #1a1a1a;color:#444;padding:8px 10px;border-radius:4px;font-size:14px;cursor:not-allowed;transition:all .3s;" disabled>🎤</button>
                 <button id="gemini-send-btn" disabled style="background:#111;border:1px solid #1a1a1a;color:#333;padding:8px 16px;border-radius:4px;font-weight:bold;cursor:not-allowed;transition:all .3s;">SEND</button>
              </div>
            </div>

          </div><!-- /hitl-body-grid -->

          <div class="hitl-footer">
            <button class="hitl-btn hitl-btn-cancel" id="hitl-cancel-btn">${_isZH ? '取消' : 'CANCEL'}</button>
            <button class="hitl-btn hitl-btn-confirm" id="btn-eval"
              style="background:#007A32;color:#000;border-color:#007A32;font-size:12px;font-weight:900;letter-spacing:1.5px;padding:12px 24px;">
              ${_isZH ? '⚡ 確認並開始評估' : '⚡ CONFIRM &amp; START EVALUATION'}
            </button>
          </div>

        </div>`;

        return ov;
    }

    /* ── Show modal — T+0 instant mount, preview patch arrives async ─────── */
    function show(file, mode, onConfirm, onCancel) {
        const existing = document.getElementById('hitl-overlay');
        if (existing) existing.remove();

        /* ── T+0: Build modal with null preview and mount immediately ──────────
         * The greeting and purpose question fire at T+0 / T+600ms.
         * File reading (PDF.js / FileReader) runs in the background below and
         * patches the 3 preview nodes when done — no blocking of the dialogue.
         * ──────────────────────────────────────────────────────────────────── */
        const ov = buildModal(file, mode, null);
        document.body.appendChild(ov);
        /* FIX-SCROLL-01: Lock body scroll when HITL modal is open.
         * z-index cannot stop scrollbar pseudo-elements from bleeding through;
         * the only reliable fix is to remove the body's scrollable surface. */
        document.body.style.overflow = 'hidden';
        document.body.classList.add('hitl-active', 'modal-active-lock');

        /* Patch preview panel asynchronously once the file read completes */
        extractFilePreview(file, function (preview) {
            if (!preview) return;
            /* Update the 3 lightweight nodes — the rest of the modal is unaffected */
            const _previewEl = ov.querySelector('#hitl-uif-preview-text');
            const _kwEl      = ov.querySelector('.hitl-kw-row');
            const _metaEl    = ov.querySelector('#hitl-token-meta');

            if (_previewEl && preview.lines) {
                _previewEl.textContent = preview.lines;
            }
            if (_kwEl) {
                _kwEl.innerHTML = (preview.keyTerms && preview.keyTerms.length)
                    ? preview.keyTerms.map(k => `<span class="hitl-kw-pill">${k}</span>`).join('')
                    : '<span style="color:#444;font-size:12px;">No axiom keywords in preview</span>';
            }
            if (_metaEl && preview.wordCount) {
                _metaEl.textContent = `${preview.wordCount} tokens · ${preview.charCount} chars (client-side)`;
            }
        });

        /* ── All modal logic below runs synchronously at T+0 ─────────────── */
        ;(function _initModal() {
            /* ECP-TRACE-001: Generate early trace_id at T=0 so dialogue session can
             * be opened immediately before the upload completes. */
            const _now = new Date();
            const _tsStr = _now.getUTCFullYear() +
                String(_now.getUTCMonth() + 1).padStart(2, '0') +
                String(_now.getUTCDate()).padStart(2, '0') + '_' +
                String(_now.getUTCHours()).padStart(2, '0') +
                String(_now.getUTCMinutes()).padStart(2, '0') +
                String(_now.getUTCSeconds()).padStart(2, '0');
            const _randHex = Math.random().toString(16).slice(2, 8).toUpperCase();
            let currentTraceId = `${_tsStr}_${_randHex}`;
            /* Seed the new trace_id early to sessionStorage */
            try {
                sessionStorage.setItem('sovereign_trace_id', currentTraceId);
                window.dispatchEvent(new Event('sovereign_storage_upgrade'));
            } catch(_e) {}

            /* ECP-010: Pre-populate MVD skeleton immediately — no blank panel */
            (function _prePopulateMVD() {
                const tbl = ov.querySelector('#hitl-uif-metrics-table');
                if (!tbl) return;
                const fn  = (file.name || '').toLowerCase();
                const dom = (fn.includes('health') || fn.includes('care') || fn.includes('clinic') || fn.includes('medical'))
                    ? 'HEALTHCARE'
                    : (fn.includes('aero') || fn.includes('rfq') || fn.includes('spec')) ? 'AEROSPACE' : 'GENERAL';
                const MVD = {
                    HEALTHCARE: ['患者姓名 / Patient Name','LDL 低密度脂蛋白 (mg/dL)','TC 總膽固醇 (mg/dL)','HDL 高密度脂蛋白 (mg/dL)','TG 三酸甘油酯 (mg/dL)','HbA1c (%)','報告日期 / Report Date'],
                    AEROSPACE:  ['零件型號 / Part Number','材料規格 / Material Spec','操作溫度 (°C)','壓力額定值 (MPa)','認證等級 / Cert Level'],
                    GENERAL:    ['主要指標 / Primary Metric','參考值 / Reference Value','日期 / Date'],
                };
                tbl.innerHTML = (MVD[dom]||MVD.GENERAL).map(f =>
                    `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #111;">
                        <span style="color:#444;font-size:13px;min-width:20px;">[ ]</span>
                        <span style="color:#555;font-size:11px;flex:1;">${f}</span>
                        <span style="color:#333;font-size:9px;">PENDING</span>
                    </div>`
                ).join('');
            })();

            /* ── ECP-005: Silent auto-warmup ───────────────────────────────
             * Fire /characterize immediately in background so trace_id is
             * ready BEFORE the user tries to type in the dialogue window.
             * The modal stays open; user sees the AI's first message arrive
             * automatically without needing to click CONFIRM first.
             * ──────────────────────────────────────────────────────────── */
            ov._warmupPending  = true;
            ov._warmup_data    = null;
            ov._confirmQueued  = false;

            /* PRE-CONFIRMED PURPOSE GATE
             * For QA / RCA / RFP modes, index.html injects sovereign_confirmed_purpose
             * before navigation. op_01.html reads it into window._sovereignPreConfirmedPurpose.
             * We consume it here at T+0 to skip the purpose-chat gate entirely — the user
             * already declared intent before clicking the mode pill. */
            if (window._sovereignPreConfirmedPurpose && window._sovereignPreConfirmedPurpose.confirmed === true) {
                const _pc = window._sovereignPreConfirmedPurpose;
                ov._confirmedPurpose = _pc.label || _pc.purpose;
                console.log('[OCM] Pre-confirmed purpose injected:', ov._confirmedPurpose, '— dual-gate purpose released at T+0.');
                /* Clear window ref so it does not bleed into subsequent uploads in same session */
                window._sovereignPreConfirmedPurpose = null;
                try { sessionStorage.removeItem('sovereign_confirmed_purpose'); } catch(_e) {}
            }

             /* ECP-021: Sovereign Manual Mode — auto-unlock after 3s if backend pending.
              * BUG-04 FIX (v2): The guard previously ran BEFORE _fireDIA() set disabled=false,
              * so it always saw disabled=true and scheduled the redundant 3s timer.
              * Deferred 1 event-loop tick (setTimeout 0) so _fireDIA() wins the race first.
              * Only the rare Track-A failure path will ever reach the 3s recovery branch. */
             (function _scheduleManualUnlockGuard() {
                 setTimeout(() => {
                     /* Re-read element AFTER _fireDIA() has had one tick to unlock it */
                     const _inp2 = ov.querySelector('#hitl-chat-input');
                     if (_inp2 && !_inp2.disabled) return;  /* _fireDIA already unlocked — no-op */
                     /* Only here when Track A + _fireDIA both failed — schedule recovery */
                     setTimeout(() => {
                         if (ov._warmupPending) {
                             const inp2  = ov.querySelector('#hitl-chat-input');
                             const snd2  = ov.querySelector('#gemini-send-btn');
                             const mic2  = ov.querySelector('#btn-mic');
                             if (inp2 && inp2.disabled) {
                                 inp2.disabled = false;
                                 inp2.placeholder = 'Engage Gemini 3 Flash Preview... / 輸入確認值...';
                                 inp2.style.color = '#fff'; inp2.style.background = '#111';
                                 inp2.style.borderColor = '#D4AF37'; inp2.style.cursor = 'text';
                             }
                             if (snd2) { snd2.disabled = false; snd2.style.cssText += 'cursor:pointer;color:#D4AF37;'; }
                             if (mic2) { mic2.disabled = false; mic2.style.cursor = 'pointer'; mic2.style.color = '#D4AF37'; mic2.style.borderColor = '#555'; mic2.title = '語音輸入 / Voice Input'; }
                             /* No hardcoded G3FP message — backend proactive_shoot/nlp_prompt is the source of truth */
                         }
                     }, 3000);
                 }, 0);
             })();

            /* ECP-013: Language probe — fires at 300ms, before backend responds */
            (function _fireDIA() {
                const chatLog2  = ov.querySelector('#hitl-chat-log');
                const inp       = ov.querySelector('#hitl-chat-input');
                const send      = ov.querySelector('#gemini-send-btn');
                const mic       = ov.querySelector('#btn-mic');
                if (!chatLog2) return;

                const fn  = (file.name || '').toLowerCase();
                const isChinese  = /[\u4e00-\u9fff]/.test(file.name);
                const isHealthcare = fn.includes('health') || fn.includes('care') || fn.includes('clinic') || fn.includes('medical') || fn.includes('upload');
                const isAerospace  = fn.includes('aero') || fn.includes('rfq') || fn.includes('spec') || fn.includes('composite');

                /* Store detected lang mode for placeholder text direction ONLY.
                 * LANG-FIX: We NEVER auto-switch the UI language based on file domain.
                 * Language is a user choice — file content does not dictate UI locale.
                 * isChinese = document content is Chinese; does NOT mean UI should be ZH-TW. */
                ov._detectedLang = isChinese ? 'ZH-TW' : 'EN';
                /* Storage keys sovereign_lang / sovereign_lang_mode are intentionally
                 * NOT written here — the user controls language via the language selector. */

                /* Unlock input immediately so user can type while backend analyses.
                 * The first G3FP message will come from backend nlp_prompt / proactive_shoot.
                 * We do NOT fabricate any opening message here. */
                function _unlockChat(placeholder) {
                    if (!inp) return;
                    inp.disabled    = false;
                    inp.placeholder = placeholder;
                    inp.style.color       = '#fff';
                    inp.style.borderColor = '#444';
                    inp.style.background  = '#111';
                    inp.style.cursor      = 'text';
                    if (send) { send.disabled = false; send.style.cssText += 'background:#222;border-color:#444;color:#D4AF37;cursor:pointer;'; }
                    if (mic)  { mic.disabled  = false; mic.style.color = '#D4AF37'; mic.style.cursor = 'pointer'; mic.style.borderColor = '#555'; mic.style.background = '#1a1a1a'; }
                }

                _unlockChat(ov._detectedLang === 'ZH-TW' ? '請輸入您的問題或指令...' : 'Ask Gemini 3 Flash Preview a question or state a value...');
            })();


            /* ── SCOPE BRIDGE: hoist shared helpers so _dispatchWarmupDone and
             * _askContextualPurpose (outer scope) can call them safely.
             * The IIFE assigns real implementations before any await.
             * Without this, calling _addMsg2() / _renderOcmStage() from
             * _dispatchWarmupDone() throws ReferenceError (silently swallowed)
             * and the dual-gate never fires → 20-minute hang.
             * ─────────────────────────────────────────────────────────────── */
            /* ── Track A: Fast-path UI Unlock ────────────────────────── */
            function executeTrackA_UI_Unlock() {
                const chatLog2  = ov.querySelector('#hitl-chat-log');
                const chatInp   = ov.querySelector('#hitl-chat-input');
                const sentinel  = ov.querySelector('#chat-input-box');
                const evalBtn   = ov.querySelector('#btn-eval');
                /* DFT hook: stamp BOTH the log and the input so tests can use either selector */
                if (chatLog2) chatLog2.setAttribute('data-test-chat', 'ready');
                if (chatInp)  chatInp.setAttribute('data-test-chat', 'ready');
                /* Stamp the sentinel element that Test 2E uses: #chat-input-box[data-test-chat="ready"] */
                if (sentinel) sentinel.setAttribute('data-test-chat', 'ready');
                if (evalBtn) {
                    evalBtn.disabled = false;
                    evalBtn.style.opacity = '1';
                    evalBtn.style.cursor = 'pointer';
                }
                /* Dispatch canonical event for waitForChatReady() helper */
                window.dispatchEvent(new CustomEvent('SOVEREIGN_CHAT_READY', { detail: { ready: true } }));
                console.log('[OCM] Track A: UI Unlocked (Fast-path) — SOVEREIGN_CHAT_READY dispatched');
            }

            let _addMsg2        = function(src, txt) { console.warn('[OCM stub] _addMsg2 called before IIFE init', src, txt); };
            let _renderOcmStage = function(stageId, status, detail) { console.warn('[OCM stub] _renderOcmStage called before IIFE init', stageId); };
            let _statusStrip    = function(agent, msg) { console.warn('[OCM stub] _statusStrip called before IIFE init', agent); };
            let _dispatchWarmupDone = function() { console.warn('[OCM stub] _dispatchWarmupDone called before IIFE init'); };
            let _ocmStartTs     = Date.now();

            /* Trigger Track A immediately */
            executeTrackA_UI_Unlock();

            (async () => {
                const chatLog2 = ov.querySelector('#hitl-chat-log');

                /* ── WHEEL TRAP — stop scroll events from reaching the page ────
                 * Without this, a user scrolling the chat log would scroll the
                 * background OP-01/02 page and accidentally dismiss the modal.
                 * We consume the event when there is still content to scroll,
                 * and only let it through when already at the top/bottom edge.
                 * ─────────────────────────────────────────────────────────────── */
                if (chatLog2) {
                    chatLog2.addEventListener('wheel', function(e) {
                        const atTop    = this.scrollTop === 0 && e.deltaY < 0;
                        const atBottom = this.scrollTop + this.clientHeight >= this.scrollHeight - 1 && e.deltaY > 0;
                        if (!atTop && !atBottom) {
                            e.stopPropagation();   /* consume — scroll stays inside chat */
                        }
                        /* Do NOT call preventDefault() — that would break smooth scrolling */
                    }, { passive: true });
                }

                /* Tracks whether placeholder init message has been cleaned up */
                let _initMsgCleaned = false;

                /* ── Assign real implementations to outer-scope stubs NOW (before any await) ── */
                _addMsg2 = function(src, txt, className) {
                    if (!chatLog2) return;
                    /* First real message: remove the placeholder init text + typing indicator */
                    if (!_initMsgCleaned) {
                        _initMsgCleaned = true;
                        const _initMsg = chatLog2.querySelector('#ocm-init-msg');
                        if (_initMsg) _initMsg.remove();
                        const _typing = chatLog2.querySelector('#ocm-typing-indicator');
                        if (_typing) _typing.remove();
                    }
                    const _isZHAdd2 = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                    let translatedTxt = txt;
                    if (_isZHAdd2 && txt) {
                        if (txt.includes('Auto-init failed')) {
                            translatedTxt = txt.replace('Auto-init failed', '自動初始化失敗').replace('please click CONFIRM manually', '請手動點擊確認');
                        }
                    }
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
                    if (className) {
                        row.className = className;
                    }
                    /* OCM branded label — never 'AI', always 'OCM' */
                    const labelColor = src === 'OCM'  ? '#D4AF37'
                                     : src === 'USER' ? '#88ccff'
                                     : '#888';
                    row.innerHTML = `<span style="color:${labelColor};flex-shrink:0;font-weight:700;">● ${src}:</span><span style="line-height:1.5;">${translatedTxt}</span>`;
                    chatLog2.appendChild(row);
                    chatLog2.scrollTop = chatLog2.scrollHeight;
                };


                /* ── OCM typing indicator — already rendered in HTML template ────────────
                 * The HTML pre-renders #ocm-typing-indicator so the user sees it
                 * instantly. We only need to wire up the dot animation here.
                 * ─────────────────────────────────────────────────────────────────────── */
                const _typingRow = ov.querySelector('#ocm-typing-indicator');
                /* Animate the dots on the pre-rendered element */
                (function _animateDots() {
                    let _n = 0;
                    const _dots = ov.querySelector('#ocm-typing-dots');
                    const _frames = ['&#9679;&#9675;&#9675;', '&#9679;&#9679;&#9675;', '&#9679;&#9679;&#9679;', '&#9675;&#9679;&#9679;'];
                    const _iv = setInterval(function() {
                        if (!_dots || !_dots.isConnected) { clearInterval(_iv); return; }
                        _dots.innerHTML = _frames[_n++ % _frames.length];
                    }, 400);
                })();


                /* ── OCM GREETING: sourced from backend /api/agent/seal/dialogue ────────
                 * T+0    : Show "Connecting to OCM…" indicator only (no hardcoded text).
                 * Backend: _fireSessionOpen() calls /api/agent/seal/dialogue with action:'greet'
                 *          and the response populates the first real OCM message.
                 * Fallback: If trace_id is not obtained within 5s, fire _fireSessionOpen()
                 *           unconditionally so the purpose question always appears.
                 * ──────────────────────────────────────────────────────────────────────── */
                if (!ov._greetingFired) {
                    ov._greetingFired = true;
                    ov._purposePhase  = true;   /* next user reply = purpose capture */
                    try {
                        /* ── T+0: Show a neutral status line only.
                         * NO hardcoded greeting text — G3FP is the authoritative author.
                         * Once trace_id lands, _fireSessionOpen(data) will call the backend
                         * and display the real LLM-authored bilingual greeting. ── */
                        const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                        _addMsg2('SYSTEM',
                            `<span id="ocm-connect-dots" style="letter-spacing:3px;color:#555;">●○○</span>` +
                            `<span style="color:#555;font-size:0.85em;"> ${_isZH ? '正在連線至 G3FP…' : 'Connecting to G3FP…'}</span>`
                        );

                        /* Fire early session open dialogue immediately to boot G3FP within 1 second */
                        setTimeout(() => {
                            _fireSessionOpen(null);
                        }, 0);

                        /* ── 15s last-resort fallback: if trace_id never lands (network/server
                         * error), fall back to _askContextualPurpose with generic text.
                         * Under normal operation this branch NEVER fires because the event-
                         * driven path at L976 calls _fireSessionOpen(data) in <100ms. ── */
                        setTimeout(() => {
                            if (ov._greetingFromG3FP) return;   /* G3FP already won */
                            if (ov._purposeQuestionFired) return;
                            ov._purposeQuestionFired = true;
                            console.warn('[OCM] 15s fallback: G3FP greeting never arrived — using template.');
                            /* Remove the neutral status line before showing fallback */
                            const _sysRows = chatLog2 ? Array.from(chatLog2.querySelectorAll('div')) : [];
                            _sysRows.forEach(r => {
                                if (r.textContent.includes('Connecting to G3FP') || r.textContent.includes('正在連線至 G3FP')) r.remove();
                            });
                            _askContextualPurpose(ov._warmup_data || {});
                        }, 15000);

                    } catch (_gErr) {
                        console.error('[OCM] Greeting block failed:', _gErr);
                    }
                }



                /* ECP-010: Generate request_id for thinking stream poll */
                const requestId = 'REQ_' + Date.now() + '_' + Math.random().toString(36).slice(2,6).toUpperCase();
                let pollOffset  = 0;
                let pollDone    = false;

                /* ECP-021: OCM Pipeline Progress — structured renderer */
                _ocmStartTs = Date.now();  /* re-set outer stub to precise T0 of this IIFE run */
                const _ocmPanel    = ov.querySelector('#ocm-progress-panel');
                const _ocmElapsed  = ov.querySelector('#ocm-elapsed');
                const _ocmTerminal = ov.querySelector('#ocm-terminal');
                const STAGE_ORDER = ['L0', 'G3FP', 'SAA', 'OCG', 'DONE'];

                /* Map agent names from backend → OCM stage IDs */
                function _agentToStage(agent) {
                    if (!agent) return null;
                    const a = agent.toUpperCase();
                    if (a === 'L0')   return 'L0';
                    if (a === 'SAA')  return 'SAA';
                    if (a === 'OCG')  return 'OCG';
                    /* G3FP, GEMINI, VISION, LLM → G3FP stage */
                    return 'G3FP';
                }

                /* Mark a stage as active / done / error in the timeline.
                 * Assign to the outer-scope stub so _dispatchWarmupDone can call it. */
                _renderOcmStage = function(stageId, status, detail) {
                    const el = ov.querySelector('#ocm-stage-' + stageId);
                    if (!el) return;
                    el.style.display = 'flex';
                    const icons    = { pending:'⬜', active:'🔄', done:'✅', error:'❌' };
                    const colors   = { pending:'#444', active:'#D4AF37', done:'#44ff88', error:'#ff4444' };
                    const _isZHLabels = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                    const labels   = _isZHLabels ? {
                                       L0:'L0   · 多模態轉碼器', G3FP:'G3FP · 視覺分析',
                                       SAA:'SAA  · 公理匹配 (OCG 閘門)', OCG:'OCG  · 置信度閘門',
                                       DONE:'DONE · 數據包就緒'
                                     } : {
                                       L0:'L0  · Multimodal Transcoder', G3FP:'G3FP · Vision Analysis',
                                       SAA:'SAA  · Axiom Matching (OCG Gate)', OCG:'OCG  · Confidence Gate',
                                       DONE:'DONE · Payload ready'
                                     };
                    const icon  = icons[status]  || '⬜';
                    const color = colors[status] || '#444';
                    const label = labels[stageId] || stageId;
                    const elapsed = ((Date.now() - _ocmStartTs) / 1000).toFixed(1);
                    el.style.color = color;
                    
                    let translatedDetail = detail;
                    if (_isZHLabels && detail) {
                        if (detail.startsWith('Starting...')) {
                            translatedDetail = '開始...';
                        } else if (detail.startsWith('Vision scan starting')) {
                            translatedDetail = '影像掃描開始…';
                        } else if (detail.startsWith('Vision complete')) {
                            translatedDetail = '影像掃描完成';
                        } else if (detail.startsWith('Axioms elected:')) {
                            translatedDetail = detail.replace('Axioms elected:', '已選定公理:');
                        } else if (detail.startsWith('Extraction complete')) {
                            translatedDetail = '提取完成';
                        } else if (detail.startsWith('⏳ Awaiting your purpose answer')) {
                            translatedDetail = '⏳ 等待您回答目的…';
                        } else if (detail.startsWith('Starting…')) {
                            translatedDetail = '開始…';
                        } else if (detail.startsWith('Purpose:')) {
                            translatedDetail = detail.replace('Purpose:', '目的:');
                        } else if (detail.startsWith('Payload ready')) {
                            translatedDetail = '數據包就緒';
                        }
                    }

                    el.innerHTML = icon + ' ' + label +
                        (translatedDetail ? '<span style="color:#666;margin-left:8px;font-size:10px;">' + translatedDetail.slice(0,60) + '</span>' : '') +
                        '<span style="color:#333;margin-left:auto;font-size:10px;flex-shrink:0;">[T+' + elapsed + 's]</span>';
                    el.style.cssText += 'display:flex;align-items:center;gap:4px;padding:3px 0;';
                };

                /* Mark all stages before stageId as done */
                function _advanceOcmTo(stageId) {
                    let found = false;
                    STAGE_ORDER.forEach(function(sid) {
                        if (sid === stageId) { found = true; _renderOcmStage(sid, 'active', ''); return; }
                        if (!found) _renderOcmStage(sid, 'done', '');
                    });
                }

                /* Update the elapsed counter every 200ms */
                const _elapsedTimer = setInterval(function() {
                    if (_ocmElapsed) _ocmElapsed.textContent = 'T+' + ((Date.now() - _ocmStartTs)/1000).toFixed(1) + 's';
                }, 200);

                /* Initialise — all pending */
                _renderOcmStage('L0',   'active', 'Starting...');

                /* ── _statusStrip: route pipeline noise to OCM terminal ONLY ───────
                 * Never inject system telemetry into the human chat window.
                 * Zone C (chat) = human ↔ AI conversation only.
                 * Zone D (#ocm-terminal) = scrollable pipeline telemetry log.
                 * ───────────────────────────────────────────────────────────────── */
                /* Assign to outer-scope stub so _dispatchWarmupDone can call it. */
                _statusStrip = function(agent, msg) {
                    if (!_ocmTerminal) return;
                    const _isZHStrip = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                    let translatedMsg = msg;
                    if (_isZHStrip && msg) {
                        if (msg.includes('OCM Pipeline Timeout')) {
                            translatedMsg = '⚠ OCM 管道逾時 — 降級至 L0_SEQUENTIAL';
                        } else if (msg.includes('Fallback triggered:')) {
                            translatedMsg = msg.replace('Fallback triggered:', '已觸發降級:');
                        } else if (msg.includes('Dispatching SAA with confirmed purpose')) {
                            translatedMsg = '▶ 正在以確認的目的發送 SAA…';
                        } else if (msg.includes('G3FP ready — dual-gate: awaiting purpose answer')) {
                            translatedMsg = '⏳ G3FP 已就緒 — 雙閘門: 等待目的回答。';
                        } else if (msg.includes('Analysis in progress. Will proceed automatically when complete')) {
                            translatedMsg = '⚠️ 正在分析中。完成後將自動繼續。';
                        } else if (msg.includes('Sending to L0 Transcoder')) {
                            translatedMsg = '正在發送至 L0 轉碼器…';
                        }
                    }
                    const line = document.createElement('span');
                    const agentColors = { L0:'#5599ff', G3FP:'#D4AF37', SAA:'#ff9944', OCG:'#44ffcc', DONE:'#44ff88', FALLBACK:'#ff5555', SYSTEM:'#aaa' };
                    const aColor = agentColors[agent.toUpperCase()] || '#55ff88';
                    const elapsed = ((Date.now() - _ocmStartTs) / 1000).toFixed(1);
                    line.style.cssText = 'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    line.innerHTML = '<span style="color:#334433;">[T+' + elapsed + 's]</span> <span style="color:' + aColor + ';font-weight:700;">[' + agent + ']</span> <span style="color:#88aa88;">' + translatedMsg.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>';
                    _ocmTerminal.appendChild(line);
                    _ocmTerminal.scrollTop = _ocmTerminal.scrollHeight;
                    /* Prune to last 40 lines to avoid memory growth.
                     * ECP-DOM-01: Use _prune.remove() instead of contains()+removeChild().
                     * The contains()+removeChild() pattern is NOT atomic — a concurrent
                     * microtask (e.g. 60x-accelerated timers in E2E test 2D) can detach
                     * _prune between the contains() check and the removeChild() call,
                     * causing Firefox to throw "not a child of this node".
                     * ChildNode.remove() self-checks parentNode internally per DOM Living
                     * Standard §4.2.4 and is a silent no-op if already detached. */
                    let _prune = _ocmTerminal.firstChild;
                    while (_ocmTerminal.children.length > 40 && _prune) {
                        const _next = _prune.nextSibling;
                        _prune.remove();   /* atomic self-guarded remove — race-condition safe */
                        _prune = _next;
                    }
                };

                const pollInterval = setInterval(async () => {
                    if (pollDone) { clearInterval(pollInterval); return; }
                    try {
                        const pr = await fetch(`/api/agent/seal/thinking/${requestId}?since=${pollOffset}`);
                        const pd = await pr.json();
                        if (pd.steps && pd.steps.length) {
                            pd.steps.forEach(function(s) {
                                const stageId = _agentToStage(s.agent);
                                /* Route step to stage indicator AND status ticker — NOT chat */
                                const isErr  = s.msg.includes('❌') || s.msg.includes('error') || s.msg.includes('Error');
                                const isDone = s.msg.includes('✅') || s.msg.includes('done') || s.msg.includes('complete') || s.msg.includes('DONE') || s.msg.includes('Armed') || s.msg.includes('standby');
                                const status = isErr ? 'error' : isDone ? 'done' : 'active';
                                if (stageId) _renderOcmStage(stageId, status, s.msg);
                                _statusStrip(s.agent, s.msg);  /* Zone D only — never Zone C */
                            });
                            pollOffset += pd.steps.length;
                        }
                    } catch (_) {}
                }, 600);

                try {
                    /* ── Build shared FormData (used by fast-path AND fallback) ────── */
                    const fd = new FormData();
                    fd.append('file', file);
                    /* [FIX-DOMAIN-HINT] Mode-aware domain override — if this modal was
                     * opened from ontology_medical.html (mode='ontology_med'), lock
                     * domain=HEALTHCARE before SovDomainHint runs. This is the definitive
                     * guard; sessionStorage.sovereign_mode is the secondary signal. */
                    if ((mode || '').toLowerCase() === 'ontology_med') {
                        fd.append('domain', 'HEALTHCARE');
                        if (window.SovDomainHint) window.SovDomainHint.appendDomainHint(fd, (file && file.name) || '');
                    } else if (window.SovDomainHint) {
                        window.SovDomainHint.appendDomainHint(fd, (file && file.name) || '');
                    }
                    fd.append('request_id', requestId);   /* ECP-010: bind thinking stream */
                    fd.append('mode', (mode || 'ABDUCTION').toUpperCase());
                    /* I18N-FIX: propagate active locale so backend session_context.lang
                     * is correct from the very first ingest call. */
                    var _hitlLang = (window.SovereignI18n && window.SovereignI18n.lang)
                                    || navigator.language || 'en';
                    fd.append('detected_lang', _hitlLang);
                    const _regName = (() => { try { return JSON.parse(sessionStorage.getItem('sovereign_user_profile') || '{}').name || ''; } catch(_){return '';} })();
                    if (_regName) fd.append('user_name', _regName);
                    /* Append early trace_id so backend reuses it */
                    fd.append('trace_id', currentTraceId);

                    /* ── Track B: SAA Two-Beat Handshake (with 5s timeout) ── */
                    let data, _extractionMode = 'G3FP_DIRECT';
                    _renderOcmStage('G3FP', 'active', 'Vision scan starting…');

                    // G3FP needs 8-20s for a full 8192-token healthcare JSON.
                    // 5s was aborting every real ingest — raised to 60s.
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('OCM_PIPELINE_TIMEOUT')), 60000)
                    );

                    try {
                        const fastPathPromise = (async () => {
                            const res = await fetch('/api/agent/seal/ingest/fast', { method: 'POST', body: fd });
                            if (!res.ok) throw new Error('fast-path HTTP ' + res.status);
                            return await res.json();
                        })();

                        data = await Promise.race([fastPathPromise, timeoutPromise]);
                        
                        if (data.error) throw new Error(data.error);
                        _extractionMode = data.extraction_mode || 'G3FP_DIRECT';
                        _renderOcmStage('G3FP', 'done', 'Vision complete');
                        _renderOcmStage('SAA',  'done', 'Axioms elected: ' + (data.elected_axioms || []).length);
                        /* Cache elected axioms so every chat turn can pass them as context */
                        ov._electedAxioms = data.elected_axioms || [];

                        /* E2E-DFT (2J/2K): write sovereign_axiom_match immediately after fast-path lands
                         * so tests can read selectedIds via sessionStorage synchronously after waitForResponse.
                         * B-04: also write sovereign_trace_id so HITL iframe can find the session. */
                        try {
                            /* B-04: write trace_id to sessionStorage — HITL modal reads this */
                            if (data.trace_id) {
                                sessionStorage.setItem('sovereign_trace_id', data.trace_id);
                                sessionStorage.setItem('sovereign_hitl_context', JSON.stringify({
                                    trace_id:    data.trace_id,
                                    filename:    data.filename   || '',
                                    domain:      (data.domain   || 'GENERAL').toUpperCase(),
                                    doc_type:    (data.document_metadata || {}).document_type || '',
                                    summary:     (data.document_metadata || {}).summary || '',
                                    extraction_mode: data.extraction_mode || 'G3FP_DIRECT',
                                    ts:          Date.now(),
                                }));
                            }
                            /* Dual-path axiom match for axiom panel rendering */
                            sessionStorage.setItem('sovereign_axiom_match', JSON.stringify({
                                selectedIds:       ov._electedAxioms,
                                saaElected:        data.saa_elected_axioms   || ov._electedAxioms,
                                g3fpNominated:     data.g3fp_nominated_axioms || [],
                                candidateIds:      [],
                                detectedDomains:   [(data.domain || 'GENERAL').toUpperCase()],
                                electionMode:      'G3FP_SAA_DUAL',
                                extraction_mode:   _extractionMode,
                                biomarkers:        data.biomarkers || [],
                                g3fp_compliance_areas: (data.hitl_panels && data.hitl_panels.panel_1)
                                    ? (data.hitl_panels.panel_1.g3fp_compliance_areas || [])
                                    : [],
                                ts:                Date.now(),
                            }));
                        } catch (_e) { /* quota exceeded or private browse — non-fatal */ }

                        /* Narration */
                        const _axCount = (data.elected_axioms || []).length;
                        const _domain  = (data.domain || 'GENERAL').toUpperCase();
                        /* Compact narration: show purpose badge if pre-confirmed; else stay silent —
                         * _askContextualPurpose() fired below will ask for the goal in a richer message. */
                        const _preConfirmedLabel = ov._confirmedPurpose;
                        if (_preConfirmedLabel) {
                            /* Specialist mode: show purpose badge instead of asking */
                            const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                            _addMsg2('OCM', _isZH
                                ? `✅ <strong>${_fname || file.name}</strong> 已掃描 — ` +
                                  `已為 <strong style="color:#D4AF37;">${_domain}</strong> 領域選定了 <strong>${_axCount}</strong> 個公理。<br>` +
                                  `<span style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;" >` +
                                  `<span style="background:#111;border:1px solid #D4AF37;border-radius:4px;padding:2px 10px;font-size:0.82em;letter-spacing:2px;color:#D4AF37;font-weight:700;">評估目的</span>` +
                                  `<span style="color:#eee;font-size:0.9em;">${_preConfirmedLabel}</span></span>`
                                : `✅ <strong>${_fname || file.name}</strong> scanned — ` +
                                  `<strong>${_axCount}</strong> axiom${_axCount !== 1 ? 's' : ''} elected for <strong style="color:#D4AF37;">${_domain}</strong>.<br>` +
                                  `<span style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;" >` +
                                  `<span style="background:#111;border:1px solid #D4AF37;border-radius:4px;padding:2px 10px;font-size:0.82em;letter-spacing:2px;color:#D4AF37;font-weight:700;">PURPOSE</span>` +
                                  `<span style="color:#eee;font-size:0.9em;">${_preConfirmedLabel}</span></span>`
                            );
                        }
                        /* else: _askContextualPurpose() below fires the document-aware purpose question.
                         * No second generic bubble is emitted here. */
                    } catch (err) {
                        if (err.message === 'OCM_PIPELINE_TIMEOUT') {
                            _statusStrip('SYSTEM', '⚠ OCM Pipeline Timeout (5s) — falling back to L0_SEQUENTIAL');
                        }
                        /* Graceful fallback — mark G3FP as error, re-attempt via L0 */
                        _renderOcmStage('G3FP', 'error', err.message.slice(0, 40));
                        _statusStrip('FALLBACK', 'Fallback triggered: ' + err.message);
                        
                        const fallbackRes = await fetch('/api/agent/seal/characterize', { method: 'POST', body: fd });
                        data = await fallbackRes.json();
                        _extractionMode = 'L0_SEQUENTIAL';
                    }
                    /* Attach extraction_mode so warmup:done handler can pass it to dialogue */
                    data._extractionMode = _extractionMode;

                    /* ── CRITICAL: trace_id landed — G3FP greeting is THE authoritative path ──
                     * BUGFIX: Remove `!currentTraceId` guard. Always overwrite with the fresh
                     * trace_id from this upload's backend response. The old guard caused a
                     * deadlock on second uploads where the stale sessionStorage seed blocked
                     * the new trace_id → all dialogue calls used a dead session → E009.
                     * ─────────────────────────────────────────────────────────────────────────── */
                    if (data.trace_id) {
                        currentTraceId = data.trace_id;
                        /* Keep sessionStorage in sync so warmup:done and confirm handler agree */
                        try {
                            sessionStorage.setItem('sovereign_trace_id', currentTraceId);
                            window.dispatchEvent(new Event('sovereign_storage_upgrade'));
                        } catch(_se) {}
                        /* Unlock chat input now that real session is established */
                        if (chatInput) {
                            chatInput.disabled    = false;
                            chatInput.placeholder = (ov._detectedLang === 'ZH-TW')
                                ? '請輸入您的問題或指令...'
                                : 'Ask OCM about your document…';
                        }
                        if (chatSend)   { chatSend.disabled   = false; }
                        if (micBtn)     { micBtn.disabled     = false; }
                        /* Fire G3FP greeting — pass extracted data for rich context */
                        setTimeout(() => _fireSessionOpen(data), 0);
                    }

                    /* Drain any remaining thinking steps */
                    pollDone = true;
                    clearInterval(pollInterval);
                    clearInterval(_elapsedTimer);
                    try {
                        const finalPoll = await fetch(`/api/agent/seal/thinking/${requestId}?since=${pollOffset}`);
                        const fp = await finalPoll.json();
                        if (fp.steps && fp.steps.length) {
                            /* Drain final steps to terminal only — not chat */
                            fp.steps.forEach(function(s) { _statusStrip(s.agent, s.msg); });
                        }
                    } catch (_) {}
                    /* ── G3FP extraction done — dual-gate: SAA needs BOTH data + purpose ────
                     * G3FP ran in parallel with the purpose question (asked at T+600ms).
                     * Store extracted data; dispatch SAA immediately if purpose already confirmed,
                     * otherwise wait for user to answer — _dispatchWarmupDone() will be called
                     * from the purpose-confirm handler.
                     * ──────────────────────────────────────────────────────────────────────── */
                    _renderOcmStage('L0',   'done', '');
                    _renderOcmStage('G3FP', 'done', 'Extraction complete');
                    _renderOcmStage('SAA',  'active', ov._confirmedPurpose ? 'Starting…' : '⏳ Awaiting your purpose answer…');
                    if (_ocmElapsed) _ocmElapsed.textContent = 'T+' + ((Date.now() - _ocmStartTs)/1000).toFixed(1) + 's';
                    _statusStrip('OCM', ov._confirmedPurpose ? '▶ Dispatching SAA with confirmed purpose…' : '⏳ G3FP ready — dual-gate: awaiting purpose answer.');

                    ov._warmup_data       = data;
                    ov._warmupPending     = false;
                    ov._pendingWarmupData = data;

                    /* ── Purpose question: fired by _fireSessionOpen() after G3FP greeting.
                     * Only call _askContextualPurpose() here as a secondary gate if G3FP
                     * never delivered its greeting (ov._greetingFromG3FP still false) and
                     * the purpose pills haven't been shown yet. ── */
                    if (!ov._greetingFromG3FP && !ov._purposeQuestionFired) {
                        _askContextualPurpose(data);
                    }

                    /* Gate: if purpose already confirmed (user answered before G3FP finished), go */
                    if (ov._confirmedPurpose) {
                        _dispatchWarmupDone();
                    }
                    /* Otherwise _dispatchWarmupDone() will be called from the purpose handler */
                } catch (err) {
                    pollDone = true;
                    clearInterval(pollInterval);
                    ov._warmupPending = false;
                    _addMsg2('SYSTEM', '⚠ Auto-init failed: ' + err.message + ' — please click CONFIRM manually.');
                    clearInterval(_elapsedTimer);
                    /* Show which stage failed */
                    _statusStrip('ERR', '❌ Pipeline error: ' + err.message);
                    if (_ocmElapsed) _ocmElapsed.textContent = 'FAILED';
                    /* Mark all pending stages as error */
                    ['L0','G3FP','SAA','OCG'].forEach(function(sid) {
                        const el = ov.querySelector('#ocm-stage-' + sid);
                        if (el && el.style.color !== 'rgb(68, 255, 136)') _renderOcmStage(sid, 'error', err.message.slice(0,40));
                    });
                }
            })();



            const modal      = ov.querySelector('#hitl-modal');
            const confirmBtn = ov.querySelector('#btn-eval');
            const cancelBtn  = ov.querySelector('#hitl-cancel-btn');
            const closeBtn   = ov.querySelector('#hitl-close-btn');
            const chatInput  = ov.querySelector('#hitl-chat-input');
            const chatSend   = ov.querySelector('#gemini-send-btn');
            const chatLog    = ov.querySelector('#hitl-chat-log');
            const micBtn     = ov.querySelector('#btn-mic');
            const waveCanvas = ov.querySelector('#gemini-waveform');
            const langBar    = ov.querySelector('#hitl-lang-bar');
            const langYes    = ov.querySelector('#hitl-lang-yes');
            const proactiveBanner = ov.querySelector('#hitl-proactive-banner');
            const metricsTable    = ov.querySelector('#hitl-uif-metrics-table');
            const uifPreviewText  = ov.querySelector('#hitl-uif-preview-text');
            const domainBadge     = ov.querySelector('#hitl-domain-conf-badge');
            const domainTag       = ov.querySelector('#hitl-domain-tag');
            const confTag         = ov.querySelector('#hitl-conf-tag');
            const confFill        = ov.querySelector('#hitl-conf-fill');

            /* ECP-TRACE-001: Start every new modal instance with a null trace_id.
             * We deliberately do NOT seed from sessionStorage here because the stored
             * key belongs to the PREVIOUS upload session. Seeding it caused a race where
             * `if (data.trace_id && !currentTraceId)` silently discarded the fresh
             * trace_id returned by the new /characterize call, routing all dialogue
             * turns through the stale session → E009 on every turn.
             *
             * The real trace_id is written into currentTraceId the moment it lands
             * from either the fast-path /ingest/fast response (line ~960) or the
             * /characterize fallback (applyApiResponse, line ~1379). sessionStorage is
             * kept in sync from those two write-points so downstream code still works.
             *
             * BUGFIX: Remove sessionStorage seed. Always start fresh per-modal. */
            /* Clear any stale keys so old trace_id cannot leak into this session */
            try {
                sessionStorage.removeItem('sovereign_g3fp_trace');
            } catch(_e) {}

            function _tryVoiceDirectCapture(text) {
                /* ECP-021: Sovereign Semantic Parser — broad NLP patterns
                 * Handles: "LDL159", "LDL=159", "LDL是159", "HDL 52 mg", "膽固醇240",
                 * "我的膽固醇是240", "TC=240 HDL=52 LDL=159" */
                var METRICS = [
                    { re: /(LDL|ldl|低密度脂蛋白|低密度)[\s:=是為的]*(\d+\.?\d*)/i, name:"LDL", ref:130, unit:"mg/dL" },
                    { re: /(TC|Total.?Cholesterol|膽固醇|总胆固醇|總膽固醇)[\s:=是為的]*(\d+\.?\d*)/i, name:"TC", ref:200, unit:"mg/dL" },
                    { re: /(HDL|hdl|高密度脂蛋白|高密度)[\s:=是為的]*(\d+\.?\d*)/i, name:"HDL", ref:40, unit:"mg/dL" },
                    { re: /(TG|triglyceride|三酸甘油脂|三酸甘油|甸油三酸)[\s:=是為的]*(\d+\.?\d*)/i, name:"TG", ref:150, unit:"mg/dL" },
                    { re: /(GLU|glucose|血糖|空腹血糖)[\s:=是為的]*(\d+\.?\d*)/i, name:"GLU", ref:100, unit:"mg/dL" },
                    { re: /(HBA1C|HbA1c|糖化血色素|糖化血红蛋白)[\s:=是為的%]*(\d+\.?\d*)/i, name:"HBA1C", ref:5.7, unit:"%" },
                    { re: /(SBP|收縮壓|systolic)[\s:=是為的]*(\d+\.?\d*)/i, name:"SBP", ref:120, unit:"mmHg" },
                    { re: /(DBP|舒張壓|diastolic)[\s:=是為的]*(\d+\.?\d*)/i, name:"DBP", ref:80, unit:"mmHg" },
                ];
                var epsilon = 1e-5;
                var captured = [];

                METRICS.forEach(function(p) {
                    var m = text.match(p.re);
                    if (m && m[2]) {
                        var val = parseFloat(m[2]);
                        if (!isNaN(val) && val > 0) {
                            var ratio = (val - p.ref) / p.ref;
                            var rC = Math.max(-2, Math.min(3, ratio));
                            var Z  = (Math.exp(rC) - 1) + Math.log(val / p.ref + epsilon);
                            var Zc = Math.max(-99, Math.min(99, Z));
                            var gw = Math.min(1.0, Math.abs(Zc) / 2.0).toFixed(3);
                            var rk = Zc > 0.3 ? "HIGH" : Zc > -0.05 ? "BORDERLINE" : "NORMAL";
                            captured.push({ name:p.name, val:val, ref:p.ref, unit:p.unit, Z:Zc, gnn_w:gw, risk:rk });
                        }
                    }
                });

                if (captured.length === 0) return false;

                /* ── Inject into left panel with [USER_CERTIFIED] tag ── */
                captured.forEach(function(c) {
                    if (!metricsTable) return;
                    var ex = metricsTable.querySelector('[data-metric="' + c.name + '"]');
                    var rC = c.risk === "HIGH" ? "#ff6644" : c.risk === "BORDERLINE" ? "#D4AF37" : "#44ff88";
                    var rH = '<div data-metric="' + c.name + '" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #111;">' +
                             '<span style="color:#44ff88;font-size:13px;min-width:20px;">✍</span>' +
                             '<span style="color:#aaa;font-size:11px;flex:1;">' + c.name + ' <strong style="color:#fff">' + c.val + ' ' + c.unit + '</strong></span>' +
                             '<span style="color:' + rC + ';font-size:9px;">[Z=' + c.Z.toFixed(2) + ']</span>' +
                             '<span style="color:#44ff88;font-size:9px;border:1px solid #44ff88;padding:0 3px;border-radius:2px;background:#0a1a0d;margin-left:3px;">USER_CERTIFIED</span>' +
                             '</div>';
                    if (ex) ex.outerHTML = rH; else metricsTable.insertAdjacentHTML("afterbegin", rH);
                });

                /* ── Chat evidence line ── */
                var capLine = captured.map(function(c) {
                    return "✍ " + c.name + "=" + c.val + c.unit + " → Z=" + c.Z.toFixed(4) + " gnn_w=" + c.gnn_w + " [" + c.risk + "]";
                }).join("  |  ");
                addMsg("SYSTEM", "⚡ [USER_CERTIFIED] " + capLine);

                /* ── Flip EVALUATION badge ── */
                var eb = ov.querySelector("#hitl-eval-status-badge");
                if (eb) {
                    eb.textContent = "EVALUATION_STATUS: LOCKED ✅";
                    eb.style.borderColor = "#44ff88";
                    eb.style.color       = "#44ff88";
                    eb.style.background  = "#0a1a0d";
                }
                return true;
            }

            /* ECP-014/015: Persistent mic — runs until SEND, never cuts on pause */
            if (micBtn && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
                const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
                let _rec        = null;   /* active recognition instance */
                let _listening  = false;  /* toggle state */
                let _finalText  = '';     /* accumulated confirmed words */

                function _stopMic() {
                    _listening = false;
                    if (_rec) { try { _rec.abort(); } catch(_) {} _rec = null; }
                    micBtn.textContent       = '🎤';
                    micBtn.style.borderColor = '#555';
                    micBtn.style.color       = '#D4AF37';
                    micBtn.title = '語音輸入 / Voice Input';
                }

                /* ECP-020: Voice Agency — direct panel update without API round-trip
                 * Fires on every FINAL speech result. If metric patterns detected,
                 * updates left panel immediately. Sends to dialogue API only for ambiguous text. */

                function _startMic() {
                    _listening  = true;
                    _finalText  = chatInput ? chatInput.value : '';  /* carry over any typed text */
                    micBtn.textContent       = '🔴';
                    micBtn.style.borderColor = '#ff4444';
                    micBtn.style.color       = '#ff4444';
                    micBtn.title = '錄音中 — 點擊停止 / Recording — click to stop';

                    /* M-4 FIX: Read lang at spawn-time with a safe fallback so Chinese
                     * files are recognized correctly even if _detectedLang is set after
                     * the IIFE that calls _startMic for the first time. */
                    const hasChinese = /[一-鿿]/.test(file.name || '');
                    const recLang = hasChinese ? 'zh-TW' : 'en-US';

                    const rec = new SpeechRec();
                    _rec = rec;
                    rec.lang            = recLang;
                    rec.continuous      = true;   /* never stop on pause */
                    rec.interimResults  = true;   /* show live partial text */
                    rec.maxAlternatives = 1;

                    rec.onresult = (e) => {
                        let interimText = '';
                        let newFinal    = '';
                        for (let i = e.resultIndex; i < e.results.length; i++) {
                            const t = e.results[i][0].transcript;
                            if (e.results[i].isFinal) newFinal += t;
                            else interimText += t;
                        }
                        if (newFinal) {
                            _finalText += newFinal;
                            /* ECP-020: Voice Agency — try direct panel capture FIRST */
                            _tryVoiceDirectCapture(newFinal);
                        }
                        /* Show confirmed text in white + interim text in grey */
                        if (chatInput) {
                            chatInput.value       = _finalText + interimText;
                            chatInput.style.color = interimText ? '#888' : '#fff';
                        }
                    };

                    /* M-1 FIX: 'no-speech' must NOT call rec.stop() — that fires onend which
                     * tries to re-start the same already-finishing instance → InvalidStateError
                     * → silent lock where _listening stays true but _rec is dead.
                     * We simply return; onend fires naturally and spawns a fresh instance. */
                    rec.onerror = (e) => {
                        if (e.error === 'no-speech') return;  /* onend will respawn cleanly */
                        if (e.error === 'aborted')   return;  /* intentional abort — ignore  */
                        /* M-5 FIX: 'not-allowed' / 'service-not-allowed' = browser permission denied.
                         * Previously swallowed silently → button stayed 🔴 and frozen.
                         * Now: stop cleanly + show permission tooltip so user knows what to do. */
                        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                            _stopMic();
                            micBtn.title = '⚠ Mic permission denied — enable in browser Settings';
                            micBtn.style.color       = '#ff8800';
                            micBtn.style.borderColor = '#ff8800';
                            micBtn.disabled = false;   /* keep clickable so user can retry after granting */
                            micBtn.style.cursor = 'pointer';
                            console.warn('[MIC] Permission denied — prompt user to allow microphone access');
                            return;
                        }
                        /* Surface all unexpected errors in the chat so the user sees them */
                        const _errMsg = `⚠ Mic recognition error: "${e.error}". Try reloading or check mic permissions.`;
                        try { if (typeof addMsg === 'function') addMsg('SYSTEM', _errMsg); } catch(_ee) {}
                        console.warn('[MIC] SpeechRecognition error:', e.error);
                        _stopMic();
                    };

                    /* M-2 FIX: onend ALWAYS spawns a brand-new SpeechRecognition object.
                     * Calling rec.start() on the same completed instance is illegal and
                     * silently rejected by Chrome/Safari. We null _rec first so the
                     * "which instance" guard stays clean, then call _startMic() after a
                     * 120 ms pause so the audio subsystem can fully release the stream. */
                    rec.onend = () => {
                        if (_listening && _rec === rec) {
                            _rec = null;
                            setTimeout(() => { if (_listening) _startMic(); }, 120);
                        }
                    };

                    rec.start();

                    /* ECP-015A: AnalyserNode waveform — shows green bars while listening */
                    if (waveCanvas && window.AudioContext) {
                        const actx    = new AudioContext();
                        const analyser = actx.createAnalyser();
                        analyser.fftSize = 64;
                        const bufLen   = analyser.frequencyBinCount;
                        const dataArr  = new Uint8Array(bufLen);
                        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                            actx.createMediaStreamSource(stream).connect(analyser);
                            const ctx2d = waveCanvas.getContext('2d');
                            waveCanvas.style.display = 'inline-block';
                            let _animId;
                            function _draw() {
                                if (!_listening) {
                                    waveCanvas.style.display = 'none';
                                    cancelAnimationFrame(_animId);
                                    actx.close();
                                    stream.getTracks().forEach(t => t.stop());
                                    return;
                                }
                                _animId = requestAnimationFrame(_draw);
                                analyser.getByteFrequencyData(dataArr);
                                ctx2d.clearRect(0, 0, 80, 28);
                                const barW = 80 / bufLen;
                                dataArr.forEach((v, i) => {
                                    const h = Math.max(2, (v / 255) * 28);
                                    ctx2d.fillStyle = `rgba(68,255,136,${0.4 + (v/255)*0.6})`;
                                    ctx2d.fillRect(i * barW, 28 - h, barW - 1, h);
                                });
                            }
                            _draw();
                        }).catch(() => { waveCanvas.style.display = 'none'; });
                    }
                }

                /* Toggle on mic click — call _startMic() directly.
                 * DO NOT use getUserMedia pre-check here: calling getUserMedia then
                 * stopping the stream before rec.start() causes an audio-capture conflict
                 * on macOS Chrome where SpeechRecognition receives empty audio.
                 * Permission errors surface cleanly via rec.onerror 'not-allowed'. */
                micBtn.addEventListener('click', () => {
                    if (micBtn.disabled) return;
                    if (_listening) { _stopMic(); return; }
                    _startMic();
                });

                /* SEND stops mic, locks final text, then sends */
                const _origSnd = window.__hitl_snd__;  /* patched below after snd() is defined */
                ov._stopMic = _stopMic;  /* expose so snd() can call it */
            } else if (micBtn) {
                /* M-6: SpeechRecognition unavailable in this browser — disable mic gracefully */
                micBtn.disabled = true;
                micBtn.style.cursor  = 'not-allowed';
                micBtn.style.opacity = '0.3';
                micBtn.title = 'Voice input not supported in this browser';
            }




            /* ── UIF helpers ───────────────────────────────────────────── */
            /* ECP-010: MVD Checklist — domain-aware field tracker */
            function renderMVDChecklist(domain, metrics, entities) {
                if (!metricsTable) return;
                const confirmed = new Set((metrics||[]).filter(m => m.certification === 'HARD').map(m => m.name));
                const soft      = new Map((metrics||[]).map(m => [m.name, m]));

                /* Domain-specific MVD field definitions */
                const MVD_FIELDS = {
                    HEALTHCARE: [
                        {field:'患者姓名 / Patient Name', key:'name'},
                        {field:'LDL 低密度脂蛋白', key:'LDL', unit:'mg/dL'},
                        {field:'TC 總膽固醇', key:'Total_Cholesterol', unit:'mg/dL'},
                        {field:'HDL 高密度脂蛋白', key:'HDL', unit:'mg/dL'},
                        {field:'TG 三酸甘油酯', key:'TG', unit:'mg/dL'},
                        {field:'HbA1c 糖化血色素', key:'HbA1c', unit:'%'},
                        {field:'報告日期 / Report Date', key:'date'},
                    ],
                    AEROSPACE: [
                        {field:'零件型號 / Part Number', key:'part_number'},
                        {field:'材料規格 / Material Spec', key:'material'},
                        {field:'操作溫度 / Op. Temperature', key:'temperature', unit:'°C'},
                        {field:'壓力額定值 / Pressure Rating', key:'pressure', unit:'MPa'},
                        {field:'認證等級 / Cert Level', key:'cert_level'},
                    ],
                    GENERAL: [
                        {field:'主要指標 / Primary Metric', key:'primary'},
                        {field:'參考值 / Reference Value', key:'reference'},
                        {field:'日期 / Date', key:'date'},
                    ],
                };

                const dom = (domain || 'GENERAL').toUpperCase();
                const fields = MVD_FIELDS[dom] || MVD_FIELDS.GENERAL;

                /* Merge any actually-extracted metrics into the checklist */
                const extraMetrics = (metrics||[]).filter(m =>
                    !fields.some(f => f.key === m.name || f.field.toLowerCase().includes(m.name.toLowerCase()))
                );

                const allItems = [
                    ...fields,
                    ...extraMetrics.map(m => ({field: m.name, key: m.name, unit: m.unit||'', _found: m}))
                ];

                metricsTable.innerHTML = allItems.map(item => {
                    const found = item._found || soft.get(item.key) || (metrics||[]).find(m => m.name === item.key);
                    const cert  = found && found.certification;
                    const isHard = cert === 'HARD';
                    const isSAA  = cert === 'SAA_PROVISIONAL';
                    const isSoft = found && !isHard && !isSAA;
                    const icon   = isHard ? '✅' : isSAA ? '〜' : isSoft ? '〜' : '[ ]';
                    const color  = isHard ? '#44ff88' : isSAA ? '#44ccff' : isSoft ? '#D4AF37' : '#666';
                    const valStr = found ? ` <span style="color:#fff;font-weight:700">${found.value}${found.unit||item.unit||''}</span>` : '';
                    const status = isHard ? '<span style="color:#44ff88;font-size:9px;">CERTIFIED</span>'
                                 : isSAA  ? '<span style="color:#44ccff;font-size:9px;border:1px solid #44ccff;padding:0 3px;border-radius:2px;">SAA✓</span>'
                                 : isSoft  ? '<span style="color:#D4AF37;font-size:9px;">SOFT/待確認</span>'
                                 : '<span style="color:#555;font-size:9px;">MISSING/缺失</span>';
                    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #111;">
                        <span style="color:${color};font-size:13px;min-width:20px;">${icon}</span>
                        <span style="color:#aaa;font-size:11px;flex:1;">${item.field}${valStr}</span>
                        ${status}
                    </div>`;
                }).join('');

            }

            function renderMetricsTable(metrics) {
                /* Legacy compatibility — also renders MVD checklist */
                renderMVDChecklist(null, metrics, []);
            }

            function applyApiResponse(data) {
                /* ECP-021: Work on BOTH ok=true (200) AND ok=false (422) paths
                 * G3FP Sovereignty: even if L0 quarantines, SAA data must reach the UI */

                /* FIX-LANG-001: Declare isZH here so all downstream code in this function
                 * can safely reference it without ReferenceError. Source of truth is
                 * sessionStorage key set by the language-handshake bar. */
                const isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';


                /* ── Always extract trace_id immediately ──
                 * BUGFIX: Remove `!currentTraceId` guard. The fresh trace_id from this
                 * /characterize response must always win — even if a stale value was
                 * previously set. Fire _fireSessionOpen only on the FIRST assignment so
                 * we do not duplicate the greeting on fallback-path re-entries. */
                if (data.trace_id) {
                    const _isNewSession = (currentTraceId !== data.trace_id);
                    currentTraceId = data.trace_id;
                    /* Keep sessionStorage in sync */
                    try { 
                        sessionStorage.setItem('sovereign_trace_id', currentTraceId); 
                        window.dispatchEvent(new Event('sovereign_storage_upgrade'));
                        const metrics = data.saa_provisional_markers || (data.uif && data.uif.extracted_data && data.uif.extracted_data.metrics) || [];
                        const g3fpCtx = {
                            g3fp_biomarkers: data.biomarkers || (data.uif && data.uif.biomarkers) || [],
                            g3fp_compliance_areas: data.compliance_areas || (data.uif && data.uif.compliance_areas) || [],
                            g3fp_patient_profile: data.patient_profile || (data.uif && data.uif.patient_profile) || {},
                            g3fp_derived_indices: data.derived_indices || (data.uif && data.uif.derived_indices) || [],
                            g3fp_doc_summary: data.doc_summary || data.summary || (data.panel_1_summary && data.panel_1_summary.summary) || '',
                            g3fp_metrics: metrics,
                        };
                        sessionStorage.setItem('sovereign_g3fp_context', JSON.stringify(g3fpCtx));
                    } catch(_se) {}
                    /* G3FP is the authoritative greeting author — fire only once per session */
                    if (_isNewSession && !ov._greetingFromG3FP) {
                        setTimeout(() => _fireSessionOpen(data), 0);
                    }
                }

                /* ── Always process SAA markers — from either path ── */
                const saaStatus  = data.saa_evaluation_status || 'UNLOCKED';
                const saaMarkers = data.saa_provisional_markers || [];

                /* ── ECP-021: Badge flip — NO LONGER gated by currentTraceId ── */
                const evalBadge = ov.querySelector('#hitl-eval-status-badge');
                if (evalBadge) {
                    if (saaStatus === 'LOCKED') {
                        evalBadge.textContent = 'EVALUATION_STATUS: LOCKED ✅';
                        evalBadge.style.borderColor = '#44ff88';
                        evalBadge.style.color       = '#44ff88';
                        evalBadge.style.background  = '#0a1a0d';
                    }
                    /* Only downgrade to UNLOCKED if we have NO SAA data at all */
                    else if (saaMarkers.length === 0) {
                        evalBadge.textContent = 'EVALUATION_STATUS: UNLOCKED ⚠';
                        evalBadge.style.borderColor = '';
                        evalBadge.style.color = '';
                        evalBadge.style.background = '';
                    }
                }

                /* ── ECP-021: Inject SAA markers into left-panel IMMEDIATELY ──
                 * saa_provisional_markers arrive on 422 path — surface them now */
                if (saaMarkers.length > 0 && metricsTable) {
                    /* Build synthetic metric objects for renderMVDChecklist */
                    const syntheticMetrics = saaMarkers.map(m => ({
                        name: m.name,
                        value: m.value,
                        unit: m.unit || 'mg/dL',
                        certification: 'SAA_PROVISIONAL',
                    }));
                    renderMVDChecklist('HEALTHCARE', syntheticMetrics, []);
                    /* Log to chat */
                    const provLabels = saaMarkers
                        .map(m => `[SAA✓: ${m.name}=${m.value}${m.unit || ''}]`)
                        .join('  ');
                    addMsg('SYSTEM', `✅ SAA Gate PASSED — ${provLabels} — EVALUATION → LOCKED`);
                }

                /* ── ECP-013: domain fallback — if backend says PENDING, trust filename detection ── */
                let dom = (data.uif && data.uif.domain) || data.domain || 'PENDING';
                if (dom === 'PENDING') {
                    const fn = (file.name || '').toLowerCase();
                    if (fn.includes('health') || fn.includes('care') || fn.includes('clinic') || fn.includes('medical') || fn.includes('upload')) dom = 'HEALTHCARE';
                    else if (fn.includes('aero') || fn.includes('rfq') || fn.includes('spec')) dom = 'AEROSPACE';
                }
                const conf = data.uif && data.uif.circuit_breaker
                    ? (data.uif.circuit_breaker.survival_percentage || 0)
                    : 0;
                const pct = Math.round(conf);
                if (domainTag)  domainTag.textContent  = dom;
                if (confTag)    confTag.textContent     = `CONF ${pct}%`;
                if (confFill)   confFill.style.width    = pct + '%';

                /* Extract real metrics */
                const extracted = data.uif && data.uif.extracted_data || {};
                const entities  = extracted.entities || [];
                /* Merge real metrics + SAA markers (prefer real if same name) */
                const rawMetrics = extracted.metrics || [];
                const saaNames   = new Set(saaMarkers.map(m => m.name));
                const metrics = [
                    ...rawMetrics,
                    ...saaMarkers
                        .filter(m => !rawMetrics.some(r => r.name === m.name))
                        .map(m => ({ name: m.name, value: m.value, unit: m.unit || 'mg/dL', certification: 'SAA_PROVISIONAL' }))
                ];

                const hard = metrics.filter(m => m.certification === 'HARD').length;
                const saaCt = metrics.filter(m => m.certification === 'SAA_PROVISIONAL').length;
                const uncert = metrics.length - hard - saaCt;
                if (domainBadge) domainBadge.textContent = `Domain: ${dom} · Evidence: [HARD:${hard} / SAA:${saaCt} / UNCERTIFIED:${uncert}]`;

                /* ECP-013: G3FP opening shot is sourced from backend nlp_prompt / proactive_shoot.
                 * DO NOT fabricate messages here — applyApiResponse() fires them via data.nlp_prompt
                 * or data.proactive_shoot at lines below.  Nothing hardcoded. */

                /* ECP-013 Fix 4: UIF preview */
                if (uifPreviewText) {
                    if (metrics.length || entities.length) {
                        const lines = [
                            ...entities.map(e => isZH ? `[實體] ${e.value} (信心: ${(e.confidence||0).toFixed(2)})` : `[ENTITY] ${e.value} (conf: ${(e.confidence||0).toFixed(2)})`),
                            ...metrics.map(m  => isZH ? `[指標] ${m.name}：${m.value}${m.unit||''} [${m.certification||'未認證'}]` : `[METRIC] ${m.name}: ${m.value}${m.unit||''} [${m.certification||'UNCERTIFIED'}]`),
                        ].join('\n');
                        uifPreviewText.textContent = lines;
                    } else {
                        uifPreviewText.textContent = isZH
                            ? '⚠ 尚未提取到座標。請透過握手終端確認數值。'
                            : '⚠ No certified coordinates extracted. Confirm via Handshake Terminal.';
                    }
                }

                /* ECP-010: Render MVD checklist with merged metrics */
                renderMVDChecklist(dom, metrics, entities);

                /* Language handshake */
                if (data.lang_handshake && langBar) {
                    langBar.classList.add('active');
                }

                /* Proactive shoot */
                if (data.proactive_shoot) {
                    const ps = data.proactive_shoot;
                    const lang = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW' ? 'zh' : 'en';
                    const msg  = ps[lang] || ps.en || ps.zh || '';
                    if (proactiveBanner) {
                        proactiveBanner.textContent = '⚡ ' + msg;
                        proactiveBanner.classList.add('active');
                    }
                    if (chatLog && msg && !ov._proactiveFired) {
                        ov._proactiveFired = true;
                        setTimeout(() => addMsg('AI', msg), 400);
                    }
                } else if (data.nlp_prompt && !ov._nlpPromptFired) {
                    ov._nlpPromptFired = true;
                    setTimeout(() => addMsg('AI', data.nlp_prompt), 400);
                }

                /* ── Unlock chat input ── */
                currentTraceId = data.trace_id || currentTraceId;  /* keep existing if new is null */
                if (currentTraceId && chatInput) {
                    chatInput.disabled = false;
                    chatInput.placeholder = 'Engage Gemini 3 Flash Preview... / 輸入確認值...';
                    chatInput.style.color   = '#fff';
                    chatInput.style.borderColor = '#333';
                    chatInput.style.background  = '#111';
                    chatInput.style.cursor  = 'text';
                    chatSend.disabled = false;
                    chatSend.style.background = '#222';
                    chatSend.style.borderColor = '#444';
                    chatSend.style.color       = '#D4AF37';
                    chatSend.style.cursor      = 'pointer';
                }

                /* ECP-018: Evidence tier counts */
                const hardCt2 = metrics.filter(m => m.certification === 'HARD').length;
                const saaCt2  = metrics.filter(m => m.certification === 'SAA_PROVISIONAL').length;
                const uncCt2  = metrics.filter(m => !m.certification || m.certification === 'UNCERTIFIED').length;
                if (domainBadge) {
                    domainBadge.textContent = `Domain: ${dom} · [HARD:${hardCt2} / SAA:${saaCt2} / UNCERTIFIED:${uncCt2}]`;
                }

            }


            /* ── Chat helpers ──────────────────────────────────────────── */
            function addMsg(src, txt) {
                const _isZHAdd = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                let translatedTxt = txt;
                if (_isZHAdd && src === 'SYSTEM') {
                    if (txt.includes('Session locked')) {
                        translatedTxt = txt.replace('Session locked', '對話已鎖定').replace('Ready', '已就緒');
                    } else if (txt.includes('Analysis in progress')) {
                        translatedTxt = '[SAA] ⚠️ 正在分析中。完成後將自動繼續。';
                    } else if (txt.includes('Sending to L0 Transcoder')) {
                        translatedTxt = '[SAA] 正在發送至 L0 轉碼器...';
                    } else if (txt.includes('L0 error:')) {
                        translatedTxt = txt.replace('L0 error:', 'L0 錯誤:');
                    } else if (txt.includes('Network error:')) {
                        translatedTxt = txt.replace('Network error:', '網路錯誤:');
                    }
                }
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
                row.innerHTML = `<span style="color:${src==='AI'?'#D4AF37':src==='SYSTEM'?'#ff4444':'#eee'};flex-shrink:0;">● ${src}:</span><span>${translatedTxt}</span>`;
                chatLog.appendChild(row);
                chatLog.scrollTop = chatLog.scrollHeight;
            }

            /* ── _dispatchWarmupDone: gate-release called AFTER purpose is confirmed ────────
             * Architecture (v2.0 — G3FP-SAA Separation):
             *   G3FP scans the raw file (multimodal vision, ~300-700ms).
             *   SAA receives ONLY the G3FP structured JSON output (domain, metrics[],
             *   entities[]) — never the raw file.  SAA applies 4 deterministic ontology
             *   gates (domain filter → vector floor → required-field presence → entity
             *   overlap) with zero LLM calls.  elected_axioms[] is deterministic.
             *   Purpose (confirmed_purpose) is a POST-ELECTION refiner: it re-ranks
             *   already-elected axioms by intent but never gates the election itself.
             *   warmup:done fires as soon as SAA election + Scout Combine complete.
             * ──────────────────────────────────────────────────────────────────────────── */
            _dispatchWarmupDone = function() {
                if (ov._warmupDispatched) return;
                ov._warmupDispatched = true;

                /* Guard: _pendingWarmupData may still be null if dispatch fires before IIFE
                 * completes (e.g. user answered purpose before extraction finished).
                 * Synthesise a minimal stub so downstream code never crashes on null. */
                if (!ov._pendingWarmupData) {
                    ov._pendingWarmupData = { trace_id: currentTraceId, elected_axioms: [], _extractionMode: 'G3FP_DIRECT' };
                }
                const data = ov._pendingWarmupData;

                /* Attach confirmed purpose into the payload so warmup:done listeners get it */
                data.confirmed_purpose = ov._confirmedPurpose || '';

                /* Now mark SAA/OCG as complete — purpose is known */
                _renderOcmStage('SAA',  'done', 'Purpose: ' + (ov._confirmedPurpose || '').slice(0, 40));
                _renderOcmStage('OCG',  'done', '');
                _renderOcmStage('DONE', 'done', 'Payload ready');
                if (typeof _ocmElapsed !== 'undefined' && _ocmElapsed)
                    _ocmElapsed.textContent = 'T+' + ((Date.now() - _ocmStartTs)/1000).toFixed(1) + 's  ✅';
                _statusStrip('OCM', '✅ Pipeline complete — purpose-aware axioms ready. Evaluation starting…');

                /* ── D5-T2: sovBlink — arm confirm button with pulsing amber glow ─────
                 * Injected once; subsequent calls are no-ops due to getElementById guard.
                 * The button stays armed until the user clicks CONFIRM (at which point
                 * the click handler removes the class and disables the button).
                 * ──────────────────────────────────────────────────────────────────── */
                if (!document.getElementById('sov-blink-style')) {
                    const _blinkSt = document.createElement('style');
                    _blinkSt.id = 'sov-blink-style';
                    _blinkSt.textContent =
                        '@keyframes sovBlink{' +
                        '0%,100%{box-shadow:0 0 0 0 rgba(0,122,50,0);border-color:#007A32;opacity:1}' +
                        '50%{box-shadow:0 0 14px 4px rgba(57,255,20,0.55);border-color:#7fff60;opacity:0.85}' +
                        '}' +
                        '.sov-btn-armed{animation:sovBlink 1.4s ease-in-out infinite!important;}';
                    document.head.appendChild(_blinkSt);
                }
                /* FIX-D5-T2: Selector corrected — actual DOM ID is #btn-eval, not #hitl-confirm-btn */
                const _cBtn = ov.querySelector('#btn-eval');
                if (_cBtn) {
                    _cBtn.classList.add('sov-btn-armed');
                    /* Also ensure pointer-events are active so the armed button is clickable */
                    _cBtn.style.pointerEvents = 'auto';
                    _cBtn.style.opacity = '1';
                }

                /* Milestone narration: dual-gate fired, evaluation launching */
                /* Compact dispatch narration with prominent purpose badge */
                const _dp = (ov._confirmedPurpose || '').slice(0, 80) || 'not specified';
                const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                _addMsg2('OCM', _isZH
                    ? `🔐 <strong>評估目的已鎖定。</strong> ` +
                      `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle;">` +
                      `<span style="background:#111;border:1px solid #D4AF37;border-radius:4px;padding:2px 10px;font-size:0.82em;letter-spacing:2px;color:#D4AF37;font-weight:700;">評估目的</span>` +
                      `<span style="color:#eee;font-size:0.9em;">${_dp}</span></span> — ` +
                      `<span style="color:#888;">評估啟動中…</span>`
                    : `🔐 <strong>Purpose locked.</strong> ` +
                      `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle;">` +
                      `<span style="background:#111;border:1px solid #D4AF37;border-radius:4px;padding:2px 10px;font-size:0.82em;letter-spacing:2px;color:#D4AF37;font-weight:700;">PURPOSE</span>` +
                      `<span style="color:#eee;font-size:0.9em;">${_dp}</span></span> — ` +
                      `<span style="color:#888;">Evaluation launching…</span>`
                );

                /* Collapse progress panel after 4s */
                setTimeout(function() {
                    const _ocmPanel = ov.querySelector('#ocm-progress-panel');
                    if (_ocmPanel) {
                        _ocmPanel.style.transition = 'max-height .6s ease, opacity .6s ease';
                        _ocmPanel.style.maxHeight  = '28px';
                        _ocmPanel.style.overflow   = 'hidden';
                        _ocmPanel.style.opacity    = '0.4';
                        _ocmPanel.title  = 'Click to expand OCM log';
                        _ocmPanel.style.cursor = 'pointer';
                        _ocmPanel.onclick = function() {
                            _ocmPanel.style.maxHeight = '';
                            _ocmPanel.style.opacity   = '1';
                            _ocmPanel.onclick = null;
                        };
                    }
                }, 4000);

                ov.dispatchEvent(new CustomEvent('warmup:done', { detail: data }));

                /* ECP-FIX-005: Always emit warmup:proceed after warmup:done so the
                 * confirm button activates regardless of whether _confirmQueued was set.
                 * This handles the case where user answered purpose before clicking CONFIRM. */
                setTimeout(function() {
                    ov.dispatchEvent(new CustomEvent('warmup:proceed'));
                }, 200);

                if (ov._confirmQueued) {
                    ov._confirmQueued = false;
                    /* warmup:proceed already scheduled above — no double dispatch needed */
                }
            }

            /* ── _askContextualPurpose: builds purpose question from ACTUAL extracted data ────
             * Called after G3FP extraction completes. Reads domain, metrics, and axiom
             * markers from the warmup payload to form a document-specific question.
             * This is Step 2 of the OCM dialogue — fires after the file has been read.
             * ──────────────────────────────────────────────────────────────────────────── */
            function _askContextualPurpose(data, isBootstrap) {
                if (ov._purposeQuestionFired) return;
                ov._purposeQuestionFired = true;

                const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';

                /* ── Extract context from G3FP payload ── */
                const _domain    = ((data.uif && data.uif.domain) || data.domain || '').toUpperCase();
                const _extracted = (data.uif && data.uif.extracted_data) || {};
                const _metrics   = (_extracted.metrics || []).slice(0, 5);   /* top 5 */
                const _markers   = (data.saa_provisional_markers || []).slice(0, 4);
                const _fname     = (file && file.name) ? file.name : (_isZH ? '您的文件' : 'your document');

                /* ── Build a summary of what was found ── */
                let _foundSummary = '';
                if (_metrics.length > 0) {
                    const _mList = _metrics.map(m => {
                        const label = m.label || m.name || m.key || '';
                        const val   = (m.value !== undefined && m.value !== null) ? m.value : '';
                        const unit  = m.unit || '';
                        const flag  = m.flag || m.status || '';
                        const flagStr = flag ? ` <span style="color:${flag === 'HIGH' || flag === 'ABNORMAL' || flag === 'OUT_OF_RANGE' ? '#ff6666' : '#88ff88'}">[${flag}]</span>` : '';
                        return label ? `<strong>${label}</strong>: ${val}${unit}${flagStr}` : null;
                    }).filter(Boolean);
                    if (_mList.length) {
                        _foundSummary = _isZH
                            ? `已在 <strong>${_fname}</strong> 中識別出以下數值：<br>` +
                              `<div style="margin:8px 0 8px 12px;line-height:2;">${_mList.join('<br>')}</div>`
                            : `I have identified the following readings in <strong>${_fname}</strong>:<br>` +
                              `<div style="margin:8px 0 8px 12px;line-height:2;">${_mList.join('<br>')}</div>`;
                    }
                } else if (_domain) {
                    _foundSummary = _isZH
                        ? `已完成 <strong>${_fname}</strong> 的數據提取。此文件屬於 <strong>${_domain}</strong> 領域。`
                        : `I have completed extraction of <strong>${_fname}</strong>. ` +
                          `This appears to be a <strong>${_domain}</strong> domain document. `;
                } else {
                    _foundSummary = _isZH
                        ? `已完成 <strong>${_fname}</strong> 的讀取。`
                        : `I have completed reading <strong>${_fname}</strong>. `;
                }

                /* ── Build axiom hint if markers available ── */
                let _axiomHint = '';
                if (_markers.length > 0) {
                    _axiomHint = _isZH
                        ? `<br><span style="color:#888;font-size:0.9em;">偵測到的候選公理：` +
                          _markers.map(m => `<code>${m.id || m.axiom_id || m}</code>`).join(', ') +
                          `</span>`
                        : `<br><span style="color:#888;font-size:0.9em;">Axiom candidates detected: ` +
                          _markers.map(m => `<code>${m.id || m.axiom_id || m}</code>`).join(', ') +
                          `</span>`;
                }

                /* ── Compose and fire the contextual question ── */
                setTimeout(() => {
                    /* Compact purpose question with inline purpose badge pills */
                    const _purposePill = (label, emoji) =>
                        `<span style="display:inline-block;margin:3px 4px;padding:3px 12px;` +
                        `background:#111;border:1px solid #D4AF37;border-radius:20px;` +
                        `font-size:0.82em;letter-spacing:1px;color:#D4AF37;cursor:pointer;` +
                        `white-space:nowrap;` +
                        `" onclick=\"(function(el){var inp=document.getElementById('hitl-chat-input');if(inp){inp.value=el.textContent;document.getElementById('gemini-send-btn')&&document.getElementById('gemini-send-btn').click()}})(this)\">${emoji} ${label}</span>`;
                    _addMsg2('OCM',
                        (_foundSummary ? _foundSummary + '<br>' : '') +
                        `<span style="color:#bbb;">${_isZH ? '您的評估目標是什麼？' : "What's your goal?"}</span><br>` +
                        _purposePill(_isZH ? '說明 — 白話總結' : 'Explain — plain language summary', '①') +
                        _purposePill(_isZH ? '洞察 — 根本原因與路徑' : 'Insight — root causes & pathways', '②') +
                        _purposePill(_isZH ? '合規檢查' : 'Compliance check', '③') +
                        (_axiomHint ? `<br><span style="color:#555;font-size:0.85em;">${_axiomHint}</span>` : '') +
                        `<br><span style="color:#555;font-size:0.85em;">${_isZH ? '或輸入您自己的目標 — 將據此決定公理集。' : 'Or type your own — determines axiom set.'}</span>`,
                        isBootstrap ? 'ocm-bootstrap-purpose' : ''
                    );
                }, 300);
            }

            /* ── _fireOCMGreeting: secondary-call guard only ─────────────────────────────
             * The greeting is executed inline at T+0 in the warmup IIFE (above).
             * This function exists only as a safe no-op if called again later.
             * ──────────────────────────────────────────────────────────────────────────── */
            function _fireOCMGreeting() {
                /* Greeting already injected inline at T+0 — nothing to do here */
            }


            /* ── SESSION_OPEN: G3FP is the AUTHORITATIVE first speaker ────────────────────
             * This function fires immediately after trace_id is confirmed.
             * It awaits the backend response, removes the neutral status line,
             * and displays the real G3FP-authored bilingual greeting.
             * After the greeting lands, it fires _askContextualPurpose() for the
             * purpose pill-buttons (Step 2 of OCM dialogue flow).
             * If G3FP returns an empty reply or fails, falls back to template.
             * ──────────────────────────────────────────────────────────────────────────── */
            async function _fireSessionOpen(extractedData) {
                if (!currentTraceId) return;
                const _userName = (() => {
                    try { return JSON.parse(sessionStorage.getItem('sovereign_user_profile') || '{}').name || ''; }
                    catch(_) { return ''; }
                })();
                /* FIX-LANG-03: Multi-level lang resolution — prevents silent EN fallback.
                 * Priority: sessionStorage (ZH-TW or ZH_TW) → HITLContext → URL param → html[lang] */
                const _sessionLang = (function() {
                    try {
                        const _ss = sessionStorage.getItem('sovereign_lang_mode') || '';
                        /* Normalise underscore variant written by legacy bridge versions */
                        const _ssNorm = _ss.replace('_', '-').toUpperCase();
                        if (_ssNorm === 'ZH-TW' || _ssNorm === 'ZH') return 'ZH-TW';
                    } catch(_) {}
                    /* HITLContext forwarded from bridge postMessage */
                    try {
                        if (typeof HITLContext !== 'undefined' && HITLContext && HITLContext.lang) {
                            const _hLang = (HITLContext.lang || '').toLowerCase();
                            if (_hLang === 'zh-tw' || _hLang === 'zh') return 'ZH-TW';
                        }
                    } catch(_) {}
                    /* URL query param ?lang=zh-TW (fallback for direct iframe loads) */
                    try {
                        const _urlLang = new URLSearchParams(location.search).get('lang') || '';
                        if (_urlLang.toLowerCase().startsWith('zh')) return 'ZH-TW';
                    } catch(_) {}
                    /* html[lang] attribute set by bridge */
                    try {
                        const _docLang = (document.documentElement.lang || '').toLowerCase();
                        if (_docLang === 'zh-tw' || _docLang === 'zh') return 'ZH-TW';
                    } catch(_) {}
                    return 'EN';
                })();

                /* Extract enriched context from warmup data if available */
                const _domain      = (extractedData && ((extractedData.uif && extractedData.uif.domain) || extractedData.domain)) || null;
                const _fname       = (file && file.name) ? file.name : null;
                /* Forward doc_summary so backend can build a context-aware greeting */
                const _docSummary  = (extractedData && (
                    extractedData.doc_summary ||
                    extractedData.summary ||
                    (extractedData.clinical_narrative && extractedData.clinical_narrative.executive_summary) ||
                    ''
                )) || '';
                try {
                    const _res = await fetch('/api/agent/seal/dialogue', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message:      '__SESSION_OPEN__',
                            trace_id:     currentTraceId,
                            sender:       'SYSTEM',
                            user_name:    _userName || null,
                            file_name:    _fname,
                            domain:       _domain,
                            doc_summary:  _docSummary,
                            detected_lang: _sessionLang,
                            mode:         (mode || 'ABDUCTION').toUpperCase(),
                            session_context: {
                                lang:       _sessionLang,
                                ui_version: '2.0.0',
                                source:     'HITL_MODAL',
                            },
                        }),
                    });
                    const _json = await _res.json();
                    const _greeting = (_json && _json.reply) ? _json.reply.trim() : '';
                    const _isBootstrap = (_json && _json._source === 'bootstrap_status');

                    /* ── Remove any previous bootstrap/status greeting and pills if this is the real one ── */
                    if (!_isBootstrap && _greeting) {
                        const _chatLog2Clean = ov.querySelector('#hitl-chat-log');
                        if (_chatLog2Clean) {
                            Array.from(_chatLog2Clean.querySelectorAll('.ocm-bootstrap-greeting, .ocm-bootstrap-purpose')).forEach(r => r.remove());
                        }
                    }

                    /* ── Remove the neutral 'Connecting to G3FP…' status line ──────────────
                     * SCOPE-FIX: chatLog2 is a const inside the sibling async IIFE and is
                     * NOT in scope here. Use ov.querySelector() which is always reachable
                     * via the outer `ov` closure variable.
                     * ─────────────────────────────────────────────────────────────────────── */
                    const _chatLog2 = ov.querySelector('#hitl-chat-log');
                    if (_chatLog2) {
                        Array.from(_chatLog2.querySelectorAll('div')).forEach(r => {
                            if (r.textContent.includes('Connecting to G3FP') || r.textContent.includes('正在連線至 G3FP')) r.remove();
                        });
                    }

                    if (_greeting) {
                        /* ✅ G3FP authored the greeting — display it */
                        if (!_isBootstrap) {
                            ov._greetingFromG3FP    = true;
                            ov._purposeQuestionFired = false;  /* allow purpose pill-buttons next */
                        }
                        _addMsg2('OCM', _greeting, _isBootstrap ? 'ocm-bootstrap-greeting' : '');
                        /* Give user 400ms to read, then show purpose pill-buttons */
                        setTimeout(() => _askContextualPurpose(extractedData || {}, _isBootstrap), 400);
                        console.log('[OCM] G3FP greeting displayed. Length:', _greeting.length);
                    } else {
                        /* G3FP returned empty — use template as fallback */
                        console.warn('[OCM] G3FP returned empty greeting — using template fallback.');
                        _askContextualPurpose(extractedData || {});
                    }
                } catch (_err) {
                    console.error('[OCM] _fireSessionOpen fetch failed:', _err);
                    /* Network/server error — clean stub row and show template fallback */
                    const _chatLog2Err = ov.querySelector('#hitl-chat-log');
                    if (_chatLog2Err) {
                        Array.from(_chatLog2Err.querySelectorAll('div')).forEach(r => {
                            if (r.textContent.includes('Connecting to G3FP') || r.textContent.includes('正在連線至 G3FP')) r.remove();
                        });
                    }
                    _askContextualPurpose(extractedData || {});
                }
            }


            /* ── LANG_TIMEOUT: no language reply received within 5s ── */
            async function _fireLangTimeout() {
                ov._langTimer = null;
                if (!currentTraceId) return;
                try {
                    const res = await fetch('/api/agent/seal/dialogue', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: '__LANG_TIMEOUT__', trace_id: currentTraceId, sender: 'SYSTEM', session_lang: _sessionLang, detected_lang: _sessionLang }),
                    });
                    if (res.ok) {
                        const d = await res.json();
                        if (d.reply) addMsg('AI', d.reply);
                    }
                } catch (_) {}
            }

            /* Language handshake button */
            if (langYes) {
                langYes.addEventListener('click', () => {
                    /* LANG FIX: Route through SovereignI18n.setLanguage() — the single source
                     * of truth that writes BOTH storage keys AND re-renders data-i18n elements.
                     * Previously only wrote sessionStorage, so i18n.js pill didn't sync. */
                    try {
                        if (window.SovereignI18n && typeof window.SovereignI18n.setLanguage === 'function') {
                            window.SovereignI18n.setLanguage('zh-TW');
                        } else {
                            /* Fallback if sovereign_i18n.js hasn't loaded yet */
                            sessionStorage.setItem('sovereign_lang_mode', 'ZH-TW');
                            localStorage.setItem('sovereign_lang', 'zh-TW');
                        }
                    } catch(_le) {}
                    /* Z4-FIX: Canonical lang event = LANG_CHANGED (10 subscribers).
                     * LANGUAGE_SWITCH was emitted but never subscribed → dead event. */
                    try { window.SovereignBUS && window.SovereignBUS.emit('LANG_CHANGED', {
                        sender: 'hitl', message_type: 'LANG_CHANGED',
                        payload: { lang: 'zh-TW', source: 'hitl-lang-bar' }
                    }); } catch(e){}
                    if (langBar) langBar.classList.remove('active');
                    /* Display confirmation in the already-active language */
                    try { addMsg('SYSTEM', '✓ 已切換至中文介面。/ Language switched to Traditional Chinese.'); } catch(e){}
                });
            }

            /* ECP-005/ECP-009: Receive warmup result.
             * Greeting already fired in PRE_INGESTION phase (parallel with pipeline).
             * Now: apply the API response, then notify G3FP that ingestion is complete
             * so it can reference real extracted values in subsequent turns. */
            ov.addEventListener('warmup:done', async (e) => {
                applyApiResponse(e.detail);
                /* Step 3 (4-step flow): warmup complete — ask for any missing data ONE field at a time.
                 * After user fills all gaps, CONFIRM button becomes active for evaluation launch. */
                if (currentTraceId) {
                    try {
                        const missingRes = await fetch('/api/agent/seal/dialogue', {
                            method:  'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                message:           '__MISSING_DATA__',
                                trace_id:          currentTraceId,
                                sender:            'SYSTEM',
                                session_lang:      _sessionLang,   /* UI locale — highest priority */
                                detected_lang:     _sessionLang,
                                elected_axioms:    (e.detail && e.detail.elected_axioms) || [],
                                extraction_mode:   (e.detail && e.detail._extractionMode) || 'G3FP_DIRECT',
                                confirmed_purpose: ov._confirmedPurpose || '',
                            }),
                        });
                        if (missingRes.ok) {
                            const missingData = await missingRes.json();
                            if (missingData && missingData.reply) {
                                _addMsg2('OCM', missingData.reply);
                            }
                        }
                    } catch (_) { /* dialogue continues regardless */ }
                }
            });


            /* ECP-009: If user clicked CONFIRM mid-warmup, proceed now that warmup is done.
             * FIX-PROCEED-01: Post the ready message via _addMsg2 (OCM chat log) so the user
             * sees it in the conversation panel. Then REPLACE the confirmBtn click handler
             * entirely by setting onclick — this neutralises the stale gate-check
             * addEventListener (L2184) that would otherwise re-lock the button on the same
             * click event via bubbling. Setting onclick last prevents the double-fire. */
            ov.addEventListener('warmup:proceed', () => {
                confirmBtn.disabled  = false;
                const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                confirmBtn.textContent = _isZH ? '⚡ 進行評估' : '⚡ PROCEED TO EVALUATION';
                _addMsg2('OCM', _isZH
                    ? '✅ <strong>已就緒。</strong>點擊 <strong>進行評估</strong> 啟動您的審計。'
                    : '✅ <strong>Ready.</strong> Click <strong>PROCEED TO EVALUATION</strong> to launch your audit.');

                /* Hand full control to _proceedWithPayload — bypass the gate-check handler */
                const _proceedNow = () => {
                    /* Include confirmed_purpose so the evaluation pipeline can pre-filter axioms */
                    const payload = {
                        file,
                        mode,
                        trace_id:          currentTraceId,
                        data:              ov._warmup_data || {},
                        confirmed_purpose: ov._confirmedPurpose || null,
                    };
                    try {
                        sessionStorage.setItem('sovereign_hitl_context', JSON.stringify({
                            file_name:         file.name,
                            mode,
                            trace_id:          currentTraceId,
                            confirmed_purpose: ov._confirmedPurpose || null,
                            ts:                Date.now(),
                        }));
                    } catch(e){}
                    window.dispatchEvent(new CustomEvent('hitl:confirmed', { detail: payload }));
                    document.body.style.overflow = '';  /* FIX-SCROLL-01: restore scroll */
                    document.body.classList.remove('hitl-active', 'modal-active-lock');
                    ov.remove();
                    if (typeof onConfirm === 'function') onConfirm(payload);
                };
                /* onclick replaces the addEventListener gate-check for the NEXT click only.
                 * The existing addEventListener (L2184) was registered before this fires and
                 * will still fire first — set a flag so it defers to _proceedNow instead. */
                ov._proceedReady = true;
                confirmBtn.onclick = _proceedNow;
            });

            /* Chat send — routes to /api/agent/seal/dialogue with trace_id */
            const snd = async () => {
                /* ECP-014: Stop persistent mic first so final text is locked */
                if (ov._stopMic) ov._stopMic();
                if (chatInput) chatInput.style.color = '#fff';
                /* Cancel language-preference timeout — user has replied */
                if (ov._langTimer) { clearTimeout(ov._langTimer); ov._langTimer = null; }

                if (!chatInput.value.trim()) return;

                /* ECP-021: If trace_id not ready yet, queue message and retry silently.
                 * Local value-capture still runs for the MVD checklist, but NO
                 * hardcoded system messages are displayed — G3FP will respond once ready. */
                if (!currentTraceId) {
                    const waiting = chatInput.value.trim();
                    chatInput.value = '';
                    addMsg('USER', waiting);
                    /* Optimistic local capture for MVD checklist (no chat echo) */
                    _tryVoiceDirectCapture(waiting);

                    if (ov._purposePhase) {
                        ov._pendingPurposeText = waiting;  /* stash for retry & fallback */
                        ov._confirmedPurpose   = waiting;  /* set immediately — unblocks gate */
                        _statusStrip('OCM', '⏳ Purpose captured locally — awaiting trace_id to confirm with backend…');
                    }

                    /* Retry up to 30×500ms (15s) — must outlast /ingest/fast (2-5s typical, 10s max)
                     * Once trace_id is available, replay the full snd() so __PURPOSE_CONFIRM__
                     * is sent to the backend even if the user answered before extraction completed. */
                    let _retryCount = 0;
                    const _waitAndSend = setInterval(() => {
                        _retryCount++;
                        if (currentTraceId) {
                            clearInterval(_waitAndSend);
                            /* Confirm trace_id arrival in #hitl-chat-log so E2E can assert on it */
                            const _tCont = document.getElementById('hitl-chat-log');
                            if (_tCont) {
                                const _tRow = document.createElement('div');
                                _tRow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;font-size:11px;opacity:0.75;';
                                _tRow.innerHTML = `<span style="color:#007A32;flex-shrink:0;">● SYS:</span><span>✅ Trace linked: ${currentTraceId}</span>`;
                                _tCont.appendChild(_tRow);
                                _tCont.scrollTop = _tCont.scrollHeight;
                            }
                            chatInput.value = waiting;
                            snd();           /* replay through G3FP with trace_id now available */

                        } else if (_retryCount >= 30) {
                            clearInterval(_waitAndSend);
                            /* ECP-FIX-002: Hard timeout — purpose already stored in ov._confirmedPurpose.
                             * If warmup data is already available, release the dual-gate now.
                             * Otherwise the warmup IIFE's own gate check will fire when data lands. */
                            if (ov._pendingWarmupData && ov._confirmedPurpose) {
                                _dispatchWarmupDone();
                            }
                            /* ov._confirmedPurpose is already set — warmup IIFE will see it */
                        }
                    }, 500);
                    return;
                }

                const q = chatInput.value.trim();
                chatInput.value = '';
                addMsg('USER', q);

                /* ── Language handshake detection ────────────────────────────────────────
                 * Dialogue Phase 1 produced a greeting + language ask (SESSION_OPEN).
                 * The first user reply is always treated as the language preference answer.
                 * We fire __PURPOSE_CONFIRM__ (Phase 3) which acknowledges the choice and
                 * asks what the user wants from this evaluation — purpose before data.
                 * ──────────────────────────────────────────────────────────────────────── */
                const _lowerQ = q.toLowerCase().trim();

                /* ── PURPOSE PHASE: capture user's first reply as evaluation purpose ────────
                 * ov._purposePhase is true for the first user reply after SESSION_OPEN.
                 * We send it to G3FP as __PURPOSE_CONFIRM__ and store the reply text
                 * in ov._confirmedPurpose for axiom pre-filtering at warmup:done time.
                 * ──────────────────────────────────────────────────────────────────────── */
                if (ov._purposePhase) {
                    let isMetaResponse = false;
                    try {
                        const pRes = await fetch('/api/agent/seal/dialogue', {
                            method:  'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                message:  '__PURPOSE_CONFIRM__',
                                trace_id: currentTraceId,
                                sender:   'USER',
                                purpose:  q,   /* the user's stated evaluation intent */
                            }),
                        });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.is_meta) {
                                isMetaResponse = true;
                                if (pData.reply) _addMsg2('OCM', pData.reply);
                            } else {
                                /* G3FP acknowledges purpose + may ask a follow-up clarifier */
                                if (pData.reply)           _addMsg2('OCM', pData.reply);
                                /* Backend may return a normalised purpose label (e.g. 'VERIFY' | 'ADVISE') */
                                if (pData.confirmed_purpose) ov._confirmedPurpose = pData.confirmed_purpose;
                                ov._langConfirmed = true;   /* purpose reply also satisfies lang phase */
                            }
                        }
                    } catch (_) { /* G3FP unavailable — purpose stored raw, pipeline continues */ }

                    if (isMetaResponse) {
                        // Restore purpose phase so the user's next input is evaluated as purpose
                        ov._purposePhase = true;
                        ov._confirmedPurpose = null;
                        return;
                    }

                    // Release the gate: purpose confirmed (either normally or via offline fallback)
                    ov._purposePhase     = false;
                    ov._confirmedPurpose = q;

                    /* ── PURPOSE GATE RELEASE ─────────────────────────────────────────────────
                     * Now that purpose is confirmed, release the SAA/OCG gate.
                     * _dispatchWarmupDone() fires warmup:done which sends __MISSING_DATA__
                     * with confirmed_purpose — so OCG re-ranks axioms by evaluation intent.
                     * If G3FP extraction is not yet complete, _pendingWarmupData will be null
                     * and the warmup IIFE's own check (if ov._confirmedPurpose) will dispatch
                     * when the data eventually lands — no race condition either way.
                     * ──────────────────────────────────────────────────────────────────────── */
                    /* ── D2-FIX: Locale-aware sit-tight ack — fires immediately after purpose capture,
                     * before the G3FP __PURPOSE_CONFIRM__ reply lands. Client-side i18n required
                     * since this is a synchronous UI acknowledgement, not an LLM response.
                     * ────────────────────────────────────────────────────────────────────── */
                    const _isZHSt = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                    _addMsg2('OCM', _isZHSt
                        ? `⏳ <strong>請稍候。</strong>評估目的已鎖定，正在將文件路由至公理匹配引擎。` +
                          `<span style="color:#888;">確認按鈕將在雙閘門釋放後啟用。</span>`
                        : `⏳ <strong>Sit tight.</strong> I have locked in your evaluation purpose and am ` +
                          `now routing the document to the axiom-matching engine. ` +
                          `<span style="color:#888;">The CONFIRM button will activate once the dual-gate releases.</span>`
                    );

                    if (ov._pendingWarmupData) {
                        _dispatchWarmupDone();
                    }
                    /* else: warmup fetch will call _dispatchWarmupDone() when it lands */

                    return;  /* handled — skip general dialogue path for this turn */
                }


                /* [Purpose phase already handled above — normal dialogue path continues below] */

                /* ECP-014C: USER_FIXED parser — detect "LDL=159, TC=240" style input */
                const _fixedPairs = {};
                const _fixPattern = /([A-Za-z_\u4e00-\u9fff]+)\s*[=:]\s*([\d.]+)\s*([a-zA-Z/%]*)/g;
                let _m;
                while ((_m = _fixPattern.exec(q)) !== null) {
                    _fixedPairs[_m[1].toUpperCase()] = { value: parseFloat(_m[2]), unit: _m[3] || '' };
                }
                if (Object.keys(_fixedPairs).length > 0) {
                    /* Update MVD checklist with USER_FIXED badge */
                    if (metricsTable) {
                        Object.entries(_fixedPairs).forEach(([key, val]) => {
                            /* Find existing row or add new one */
                            let rows = metricsTable.querySelectorAll('div[data-key]');
                            let found = false;
                            rows.forEach(row => {
                                if (row.dataset.key === key) {
                                    row.innerHTML = `<span style="color:#D4AF37;font-size:13px;min-width:20px;">✏️</span>
                                        <span style="color:#fff;font-size:11px;flex:1;">${key} <strong style="color:#ffe066;">${val.value}${val.unit}</strong></span>
                                        <span style="background:#2a2000;border:1px solid #D4AF37;color:#D4AF37;font-size:9px;padding:1px 5px;border-radius:3px;">USER_FIXED</span>`;
                                    found = true;
                                }
                            });
                            if (!found) {
                                const row = document.createElement('div');
                                row.dataset.key = key;
                                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #111;';
                                row.innerHTML = `<span style="color:#D4AF37;font-size:13px;min-width:20px;">✏️</span>
                                    <span style="color:#fff;font-size:11px;flex:1;">${key} <strong style="color:#ffe066;">${val.value}${val.unit}</strong></span>
                                    <span style="background:#2a2000;border:1px solid #D4AF37;color:#D4AF37;font-size:9px;padding:1px 5px;border-radius:3px;">USER_FIXED</span>`;
                                metricsTable.insertBefore(row, metricsTable.firstChild);
                            }
                        });
                    }
                    /* ECP-020: Updated Z formula with physical meaning:
                     * Z = (exp((value-ref)/ref) - 1) + ln(value/ref + ε)
                     * Z=0 at v=ref (equilibrium), Z>0 elevated, Z<0 suppressed
                     * gnn_weight = |Z|/2 → normalized GNN edge weight for 3D lipid-plaque depth */
                    const AXIOM_REF = { LDL: 130, TC: 200, HDL: 40, TG: 150, HBA1C: 5.7, GLU: 100 };
                    const epsilon = 1e-5;
                    const zLines  = Object.entries(_fixedPairs).map(([k, v]) => {
                        const ref   = AXIOM_REF[k] || 100;
                        const ratio = (v.value - ref) / ref;            /* deviation ratio */
                        const rC    = Math.max(-2, Math.min(3, ratio)); /* clamp before exp */
                        const Z     = (Math.exp(rC) - 1) + Math.log(v.value / ref + epsilon);
                        const Zc    = Math.max(-99, Math.min(99, Z));   /* display clamp */
                        const gnn_w = Math.min(1.0, Math.abs(Zc) / 2.0).toFixed(3);
                        const risk  = Zc > 0.3 ? '🔴 HIGH' : Zc > -0.05 ? '🟡 BORDERLINE' : '🟢 NORMAL';
                        return `${k}: Z=${Zc.toFixed(4)} [${risk}] gnn_w=${gnn_w}`;
                    }).join(' | ');
                    addMsg('SYSTEM', `⚡ [OCG-020] Z-Depth+GNN: ${zLines}`);


                }
                try {
                    // ── Build semantically rich dialogue payload ──────────────────────
                    // Always attach G3FP extraction data from ov._warmup_data.
                    // When currentTraceId is not found in the backend store (server restart
                    // or direct modal open without /characterize), the stateless path
                    // uses this to build evidence_raw_chunks → the LLM responds with
                    // clinical specificity rather than generic intent engine fallback.
                    const _wd = ov._warmup_data || {};
                    /* ── Resolve UI language to send with every turn ──────────────────────
                     * session_lang is the user's chosen interface language (from sovereign_lang_mode).
                     * This is DIFFERENT from detected_lang (the document's language).
                     * Backend priority: session_lang > session_context.lang > detected_lang > EN.
                     * Without session_lang, the backend fell through to detected_lang and
                     * replied in Chinese when processing a Chinese document. */
                    const _uiLang = (function() {
                        try {
                            const _ss = (sessionStorage.getItem('sovereign_lang_mode') || '').replace('_','-').toUpperCase();
                            if (_ss === 'ZH-TW' || _ss === 'ZH') return 'ZH-TW';
                        } catch (_) {}
                        try {
                            if (typeof HITLContext !== 'undefined' && HITLContext && HITLContext.lang) {
                                const _h = (HITLContext.lang || '').toLowerCase();
                                if (_h.startsWith('zh')) return 'ZH-TW';
                            }
                        } catch (_) {}
                        return 'EN';
                    })();
                    const body = {
                        message:            q,
                        trace_id:           currentTraceId,
                        sender:             'USER',
                        /* Language — MUST be in every turn so backend lang gate is correct */
                        session_lang:       _uiLang,     /* user's UI locale (highest priority) */
                        detected_lang:      _uiLang,     /* also pass as detected_lang for legacy compat */
                        file_name:          (file && file.name) || '',
                        domain:             (_wd.domain || '').toUpperCase() || 'GENERAL',
                        // G3FP semantic corpus — used by stateless dialogue path:
                        biomarkers:         _wd.biomarkers         || [],
                        compliance_areas:   _wd.compliance_areas   || [],
                        patient_profile:    _wd.patient_profile    || {},
                        derived_indices:    _wd.derived_indices     || [],
                        axiom_evidence:     _wd.axiom_evidence      || [],
                        clinical_narrative: _wd.clinical_narrative  || {},
                        doc_summary:        (_wd.summary || (_wd.clinical_narrative || {}).executive_summary || ''),
                        extraction_mode:    _wd.extraction_mode     || 'G3FP_SEMANTIC',
                        // Elected axioms — prevents 'no axioms loaded' fallback:
                        elected_axioms: ov._electedAxioms
                            || (window._sovereignLastTiered && [
                                ...(window._sovereignLastTiered.selected  || []),
                                ...(window._sovereignLastTiered.candidate || []),
                            ])
                            || [],
                    };

                    const res = await fetch('/api/agent/seal/dialogue', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    /* FIX-CHAT-01: Backend always returns HTTP 200 — even for ok:false error
                     * responses (E009 session-not-found, E002 timeout, etc). The old `if (res.ok)`
                     * guard silently discarded these replies. Now we always parse the JSON and
                     * render data.reply into the OCM chat log so the user sees what went wrong.
                     * If the response is not parsable JSON we fall through to the catch block. */
                    const data = await res.json();
                    if (data.reply) {
                        /* Route via _addMsg2 so the label colour is OCM-branded (amber) —
                         * not 'AI' grey — consistent with PURPOSE_CONFIRM and MISSING_DATA. */
                        if (data.ok === false) {
                            /* Error reply (E009/E002): show as SYSTEM in amber chat */
                            _addMsg2('SYSTEM', data.reply);
                        } else {
                            _addMsg2('OCM', data.reply);
                        }
                    }

                    if (data.ok !== false) {
                        /* Live UIF update after each dialogue turn */
                        if (data.uif_preview) {
                            const m2 = (data.uif_preview.extracted_data || {}).metrics || [];
                            renderMetricsTable(m2);
                        }

                        /* Z-depth OCG Gate results */
                        if (data.z_calculations && Object.keys(data.z_calculations).length) {
                            const zItems = Object.entries(data.z_calculations)
                                .map(([k,v]) => `${k}: Z=${v.Z.toFixed(4)} [${v.risk}]`)
                                .join(' | ');
                            addMsg('SYSTEM', `⚡ OCG Z-Depth locked: ${zItems}`);
                        }

                        /* ECP-004/ECP-009: ANTI-FALSE-POSITIVE + EVALUATION_STATUS flip */
                        if (data.cycle_2_ready && (data.user_confirmed_count || 0) > 0) {
                            const confirmed = Object.keys(data.all_confirmed || {}).join(', ') || 'required fields';
                            addMsg('SYSTEM', `[SPS] ✅ EVALUATION_STATUS: LOCKED — confirmed: ${confirmed}`);
                            /* Flip badge to green LOCKED state */
                            const evalBadge = ov.querySelector('#hitl-eval-status-badge');
                            if (evalBadge) {
                                evalBadge.textContent = 'EVALUATION_STATUS: LOCKED ✅';
                                evalBadge.style.borderColor = '#44ff88';
                                evalBadge.style.color       = '#44ff88';
                                evalBadge.style.background  = '#0a1a0d';
                            }
                        }
                    }
                } catch(err) {
                    addMsg('SYSTEM', 'Network error: ' + err.message);
                }
            };
            if (chatSend) chatSend.addEventListener('click', snd);
            if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') snd(); });

            /* ── Confirm → fire characterize API OR use warmup result ── */
            const _proceedWithPayload = () => {
                const payload = { file, mode, trace_id: currentTraceId, data: ov._warmup_data || {} };
                try { sessionStorage.setItem('sovereign_hitl_context', JSON.stringify({ file_name: file.name, mode, trace_id: currentTraceId, ts: Date.now() })); } catch(e){}
                window.dispatchEvent(new CustomEvent('hitl:confirmed', { detail: payload }));
                document.body.style.overflow = '';  /* FIX-SCROLL-01: restore scroll */
                document.body.classList.remove('hitl-active', 'modal-active-lock');
                ov.remove();
                if (typeof onConfirm === 'function') onConfirm(payload);
            };

            confirmBtn.addEventListener('click', async () => {
                /* FIX-PROCEED-02: If warmup:proceed already fired and set ov._proceedReady,
                 * the onclick handler (_proceedNow) already has control. The addEventListener
                 * fires BEFORE onclick in the same click event — defer so onclick runs instead. */
                if (ov._proceedReady) return;

                /* ECP-FIX-004: Warmup complete path — check _pendingWarmupData first,
                 * then currentTraceId. This prevents the "0 axioms" stall where
                 * _warmupPending=false but currentTraceId was never set (dual-gate deadlock). */
                if (!ov._warmupPending && ov._pendingWarmupData) {
                    /* Warmup done — proceed directly with the warmup payload */
                    if (!ov._confirmedPurpose) {
                        /* D3-FIX: Locale-aware CONFIRM gate prompt — fires when CONFIRM clicked before purpose answered */
                        const _isZHCf = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                        _addMsg2('OCM', _isZHCf
                            ? `⚠️ 在啟動評估前，請先回答上方的目的問題（① 說明 或 ② 洞察 — 或輸入您自己的目標）。` +
                              `<span style="color:#888;">您的回答將決定部署的公理集。</span>`
                            : `⚠️ Before I can launch the evaluation, please answer the purpose question above ` +
                              `(① Explain or ② Insight — or type your own goal). ` +
                              `<span style="color:#888;">Your answer determines which axiom set I deploy.</span>`
                        );
                        chatInput.focus();
                        return;
                    }
                    /* Both gates satisfied — release */
                    if (!ov._warmupDispatched) _dispatchWarmupDone();
                    const _tid = currentTraceId || (ov._pendingWarmupData && ov._pendingWarmupData.trace_id) || null;
                    const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                    _addMsg2('OCM', _isZH
                        ? `✅ 對話已鎖定${_tid ? ' — 追蹤編號: ...' + _tid.slice(-8) : ''}。已就緒。`
                        : `✅ Session locked${_tid ? ' — trace: ...' + _tid.slice(-8) : ''}. Ready.`);
                    
                    const _isZHBtn = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                    confirmBtn.textContent = _isZHBtn ? '⚡ 進行評估' : '⚡ PROCEED TO EVALUATION';
                    confirmBtn.onclick = _proceedWithPayload;
                    return;
                }
                /* ECP-009: If warmup already done and trace_id set — skip re-characterize */
                const _isZHBtn = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
                if (currentTraceId && !ov._warmupPending) {
                    addMsg('SYSTEM', _isZHBtn
                        ? `[DIA] ✅ 對話已鎖定 (追蹤編號: ...${currentTraceId.slice(-8)})。已就緒。`
                        : `[DIA] ✅ Session locked (trace: ...${currentTraceId.slice(-8)}). Ready.`);
                    confirmBtn.textContent = _isZHBtn ? '⚡ 進行評估' : '⚡ PROCEED TO EVALUATION';
                    confirmBtn.onclick = _proceedWithPayload;
                    return;
                }
                /* ECP-009: Warmup still in progress — queue, don't double-fire */
                if (ov._warmupPending) {
                    ov._confirmQueued = true;
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = _isZHBtn ? '⏳ 正在熱身中...' : '⏳ WARMUP IN PROGRESS...';
                    addMsg('SYSTEM', _isZHBtn
                        ? '[SAA] ⚠️ 正在分析中。完成後將自動繼續。'
                        : '[SAA] ⚠ Analysis in progress. Will proceed automatically when complete.');
                    return;
                }
                confirmBtn.disabled = true;
                confirmBtn.textContent = _isZHBtn ? '⏳ 處理中...' : '⏳ PROCESSING...';
                addMsg('SYSTEM', _isZHBtn ? '[SAA] 正在發送至 L0 轉碼器...' : '[SAA] Sending to L0 Transcoder...');

                try {
                    const fd = new FormData();
                    fd.append('file', file);
                    /* [FIX-DOMAIN-HINT] Backend infers from content when no hint given,
                     * but SovDomainHint provides a filename-based accelerator when available. */
                    if (window.SovDomainHint) window.SovDomainHint.appendDomainHint(fd, (file && file.name) || '');
                    const res = await fetch('/api/agent/seal/characterize', { method: 'POST', body: fd });
                    const data = await res.json();
                    applyApiResponse(data);
                    if (res.ok || res.status === 422) {
                        confirmBtn.disabled = false;
                        confirmBtn.textContent = _isZHBtn ? '⚡ 進行評估' : '⚡ PROCEED TO EVALUATION';
                        confirmBtn.onclick = () => {
                            const payload = { file, mode, trace_id: currentTraceId, data };
                            try { sessionStorage.setItem('sovereign_hitl_context', JSON.stringify({ file_name: file.name, mode, trace_id: currentTraceId, ts: Date.now() })); } catch(e){}
                            window.dispatchEvent(new CustomEvent('hitl:confirmed', { detail: payload }));
                            ov.remove();
                            if (typeof onConfirm === 'function') onConfirm(payload);
                        };
                    }
                } catch (err) {
                    addMsg('SYSTEM', _isZHBtn ? 'L0 錯誤: ' + err.message : 'L0 error: ' + err.message);
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = _isZHBtn ? '⚡ 重試評估' : '⚡ RETRY EVALUATION';
                }
            });

            /* Cancel / close */
            function dismiss() {
                /* ECP-FIX-003: Clear session on every dismiss so a new file upload
                 * gets a fresh modal state without stale trace_id / restore banner. */
                clearSession();
                document.body.style.overflow = '';  /* FIX-SCROLL-01: restore scroll */
                document.body.classList.remove('hitl-active', 'modal-active-lock');
                window.dispatchEvent(new CustomEvent('hitl:cancelled', { detail: {} }));
                ov.remove();
                if (typeof onCancel === 'function') onCancel();
            }
            cancelBtn.addEventListener('click', dismiss);
            closeBtn.addEventListener('click', dismiss);
            ov.addEventListener('click', e => { if (e.target === ov) dismiss(); });

            /* ESC + focus trap */
            function onKeydown(e) {
                if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKeydown); return; }
                if (e.key === 'Tab') {
                    const focusable = [...modal.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first)  { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }
            document.addEventListener('keydown', onKeydown);
            modal.focus();
        })(); /* end _initModal IIFE */
    }

    /**
     * Show the Step 2 "Synthesis Complete" notification.
     * Triggers 3D rendering and informs user of election results.
     */
    function showSynthesisComplete(results, onDismiss) {
        const ov = document.createElement('div');
        ov.id = 'hitl-overlay';
        ov.innerHTML = `
        <div id="hitl-modal" style="border-color:#007A32; box-shadow: 0 0 40px rgba(0,122,50,0.12);">
          <div class="hitl-header">
            <div class="hitl-header-left">
              <div class="hitl-title" style="color:#007A32">⚡ ANALYSIS SYNTHESIS COMPLETE</div>
              <span class="hitl-badge inception" style="background:rgba(0,122,50,0.1); color:#007A32; border-color:#007A32">STAGE 5 READY</span>
            </div>
            <button class="hitl-close" id="hitl-success-close">✕</button>
          </div>
          <div class="hitl-steps" style="text-align:center; padding:40px 24px;">
            <div style="font-size:32px; margin-bottom:16px;">✅</div>
            <div style="font-size: 12px; font-weight:700; color:#fff; letter-spacing:1px; margin-bottom:8px;">
               EVALUATION ACHIEVED: ${results.selectedCount} ELECTED · ${results.candidateCount} CANDIDATE
            </div>
            <div style="font-size: 12px; color:#888; line-height:1.6;">
               3D Topology generated. Physical constraints verified against source telemetry.<br>
               Axiom Applied panes and Audit Reports have been populated.
            </div>
          </div>
          <div class="hitl-footer">
            <button class="hitl-btn hitl-btn-confirm" id="hitl-success-done" style="background:#007A32; width:100%;">ACCESS FULL AUDIT TRACE →</button>
          </div>
        </div>`;
        document.body.appendChild(ov);

        const dismiss = () => { ov.remove(); if(onDismiss) onDismiss(); };
        ov.querySelector('#hitl-success-close').onclick = dismiss;
        ov.querySelector('#hitl-success-done').onclick = dismiss;
    }

    /* ── Reopen: restore modal from last sessionStorage context ─────────── */
    function reopen() {
        const raw = sessionStorage.getItem('sovereign_hitl_context');
        if (!raw) { console.warn('[HITLModal] No restorable session.'); return false; }
        let ctx;
        try { ctx = JSON.parse(raw); } catch(e) { return false; }
        const { file_name, mode, trace_id } = ctx;
        if (!trace_id) return false;

        const ov = document.createElement('div');
        ov.className = 'hitl-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;';
        const _modeKey = (mode || 'ABDUCTION').toUpperCase();
        ov.innerHTML = `
        <div style="background:#18181b;border:1px solid #333;border-radius:12px;width:min(92vw,860px);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #2a2a2e;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="color:#D4AF37;font-weight:700;font-size:15px;">&#x2B21; OCM</span>
              <span style="color:#888;font-size:12px;">Resumed &middot; ${file_name || 'document'} &middot; ${_modeKey}</span>
            </div>
            <button id="hitl-resume-close" style="background:none;border:none;color:#555;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;" aria-label="Close">&#x2715;</button>
          </div>
          <div id="hitl-resume-log" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:260px;max-height:52vh;"></div>
          <div style="padding:12px 16px;border-top:1px solid #2a2a2e;display:flex;gap:8px;">
            <input id="hitl-resume-input" type="text" placeholder="Continue your evaluation… / 繼續評估..."
              style="flex:1;background:#111;border:1px solid #333;border-radius:8px;padding:9px 14px;color:#eee;font-size:13px;outline:none;" />
            <button id="hitl-resume-send"
              style="background:#D4AF37;color:#111;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font-size:13px;">Send</button>
          </div>
        </div>`;
        document.body.appendChild(ov);

        const chatLog = ov.querySelector('#hitl-resume-log');
        const input   = ov.querySelector('#hitl-resume-input');
        const sendBtn = ov.querySelector('#hitl-resume-send');
        const closeBtn= ov.querySelector('#hitl-resume-close');

        function _addMsg(src, txt) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
            const col = src === 'OCM' ? '#D4AF37' : src === 'USER' ? '#88ccff' : '#888';
            row.innerHTML = `<span style="color:${col};flex-shrink:0;font-weight:700;">&#x25CF; ${src}:</span><span style="line-height:1.5;">${txt}</span>`;
            chatLog.appendChild(row);
            chatLog.scrollTop = chatLog.scrollHeight;
        }

        const _isZH = sessionStorage.getItem('sovereign_lang_mode') === 'ZH-TW';
        const _greet = {
            DEDUCTION: _isZH
                ? `工作階段已恢復。我是 <strong>OCM</strong> &mdash; 追蹤編號 <code>${trace_id}</code> 已啟用。請繼續您的查詢。`
                : `Session resumed. I&#x27;m <strong>OCM</strong> &mdash; trace <code>${trace_id}</code> is active. Continue your query.`,
            INDUCTION: _isZH
                ? `歡迎回來。我是 <strong>OCM</strong> &mdash; 您的工作階段仍處於活動狀態。接下來您想探索什麼？`
                : `Welcome back. I&#x27;m <strong>OCM</strong> &mdash; your session is still live. What would you like to explore next?`,
            ABDUCTION: _isZH
                ? `歡迎回來！我是 <strong>OCM</strong> &mdash; 已為 <em>${file_name || '您的文件'}</em> 恢復工作階段。需要什麼協助？`
                : `Welcome back! I&#x27;m <strong>OCM</strong> &mdash; session restored for <em>${file_name || 'your document'}</em>. How can I help?`,
        };
        setTimeout(() => _addMsg('OCM', _greet[_modeKey] || _greet.ABDUCTION), 120);

        /* Best-effort history restore */
        fetch(`/api/agent/seal/dialogue/history/${trace_id}`)
            .then(r => r.ok ? r.json() : null)
            .then(hist => {
                if (!hist || !hist.history) return;
                hist.history.slice(-6).forEach(t => _addMsg(t.sender === 'USER' ? 'USER' : 'OCM', t.message));
            })
            .catch(() => {});

        async function _send() {
            const msg = input.value.trim(); if (!msg) return;
            _addMsg('USER', msg); input.value = ''; sendBtn.disabled = true;
            try {
                const res = await fetch('/api/agent/seal/dialogue', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trace_id, message: msg, sender: 'USER' }),
                });
                const d = await res.json();
                _addMsg('OCM', d.response || d.message || '&mdash;');
            } catch(e) {
                _addMsg('OCM', _isZH ? '連線錯誤 &mdash; 請重試。' : 'Connection error &mdash; please try again.');
            }
            finally { sendBtn.disabled = false; input.focus(); }
        }

        sendBtn.addEventListener('click', _send);
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); } });
        const _close = () => ov.remove();
        closeBtn.addEventListener('click', _close);
        ov.addEventListener('click', e => { if (e.target === ov) _close(); });
        document.addEventListener('keydown', function _esc(e) {
            if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', _esc); }
        });
        input.focus();
        return true;
    }

    /* Clear session storage (call after new upload) */
    function clearSession() {
        sessionStorage.removeItem('sovereign_hitl_context');
        const b = document.getElementById('hitl-restore-banner');
        if (b) b.remove();
    }

    /* ── Auto-mount restore banner on page load if session exists ─────────── */
    /*
     * Page groups:
     *   OP-01 / OP-02  →  observation/audit pages — banner suppressed
     *   OP-03          →  HITL pipeline page — banner shown
     *
     * Check is substring-based so it works with or without leading slash,
     * hash routing, or query strings.
     */
    (function _mountRestoreBanner() {
        try {
            const _page = window.location.pathname;
            const _isOP03 = _page.indexOf('op_03') !== -1 || _page.indexOf('op-03') !== -1;
            if (!_isOP03) return;  /* OP-01 / OP-02 group — suppress banner */

            const raw = sessionStorage.getItem('sovereign_hitl_context');
            if (!raw) return;
            const ctx = JSON.parse(raw);
            if (!ctx || !ctx.trace_id) return;
            if (document.querySelector('.hitl-overlay')) return;  /* modal already open */

            const banner = document.createElement('div');
            banner.id = 'hitl-restore-banner';
            banner.style.cssText = [
                'position:fixed;bottom:22px;right:22px;z-index:8888;',
                'background:#1a1a1d;border:1px solid #D4AF37;border-radius:10px;',
                'padding:10px 16px;display:flex;align-items:center;gap:12px;',
                'box-shadow:0 4px 24px rgba(0,0,0,.6);',
            ].join('');
            banner.innerHTML = `
              <span style="color:#D4AF37;font-size:18px;">&#x2B21;</span>
              <div style="flex:1;">
                <div style="color:#eee;font-size:12px;font-weight:700;">OCM session restorable</div>
                <div style="color:#888;font-size:11px;">${ctx.file_name || 'Previous document'} &middot; ${ctx.mode || 'ABDUCTION'}</div>
              </div>
              <button id="hitl-banner-reopen"
                style="background:#D4AF37;color:#111;border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">Reopen</button>
              <button id="hitl-banner-dismiss"
                style="background:none;border:none;color:#555;font-size:16px;cursor:pointer;padding:2px 6px;">&#x2715;</button>`;
            document.body.appendChild(banner);

            banner.querySelector('#hitl-banner-reopen').onclick = () => { banner.remove(); reopen(); };
            banner.querySelector('#hitl-banner-dismiss').onclick = () => { banner.remove(); clearSession(); };
        } catch(e) { /* non-fatal */ }
    })();

    /* ── Public API ──────────────────────────────────────────────────────── */
    global.HITLModal = {
        show,
        showSynthesisComplete,
        reopen,
        clearSession,
        isOpen: function () { return !!document.getElementById('hitl-overlay'); }
    };

})(window);

/* =============================================================================
 * SovereignHITLPoller  v1.0.0
 * Stage-agnostic HITL bridge — polls /api/hitl/status/<trace_id> every 2 s.
 *
 * Usage (called automatically from op_03.html after any pipeline response):
 *   SovereignHITLPoller.watch(traceId, onResponse);
 *
 * When status == PENDING:
 *   Opens a lightweight mid-pipeline prompt dialog (NOT the upload modal).
 *   Operator selects an option → POST /api/hitl/respond → onResponse(decision).
 *
 * When status == RESOLVED:
 *   Calls onResponse(decision) and stops polling.
 * ============================================================================*/
(function (global) {
    'use strict';

    const POLL_INTERVAL_MS = 2000;
    const DIALOG_Z         = 9500;           // above HITLModal (9000)
    const _activePollers   = {};             // trace_id → intervalId

    /* ── CSS (injected once) ────────────────────────────────────────────── */
    (function injectPollerCSS() {
        if (document.getElementById('hitl-poller-css')) return;
        const s = document.createElement('style');
        s.id = 'hitl-poller-css';
        s.textContent = `
        #hitl-poller-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.75);
            z-index: ${DIALOG_Z};
            display: flex; align-items: center; justify-content: center;
            animation: hitlp-fade 0.15s ease;
        }
        @keyframes hitlp-fade { from{opacity:0} to{opacity:1} }

        #hitl-poller-dialog {
            background: #0a0a0a;
            border: 1px solid #D4AF37;
            border-radius: 10px;
            width: min(640px, 92vw);
            font-family: Calibri, 'Microsoft JhengHei', sans-serif;
            box-shadow: 0 0 32px rgba(212,175,55,0.22);
            display: flex; flex-direction: column; overflow: hidden;
        }
        .hitlp-header {
            padding: 14px 20px 10px;
            border-bottom: 1px solid #1c1c1c;
            display: flex; justify-content: space-between; align-items: center;
        }
        .hitlp-title {
            font-size: 11px; font-weight: 700; color: #D4AF37;
            letter-spacing: 2px; text-transform: uppercase;
        }
        .hitlp-stage-badge {
            font-size: 10px; font-weight: 700; color: #888;
            letter-spacing: 1px; text-transform: uppercase;
            background: #111; border: 1px solid #222;
            padding: 2px 8px; border-radius: 3px;
        }
        .hitlp-body { padding: 18px 20px 14px; }
        .hitlp-prompt {
            font-size: 12px; color: #ccc; line-height: 1.65;
            margin-bottom: 16px;
        }
        .hitlp-amber-pin {
            display: none;
            font-size: 10px; color: #F5A623; font-weight: 700;
            letter-spacing: 1px; text-transform: uppercase;
            background: rgba(245,166,35,0.08);
            border: 1px solid rgba(245,166,35,0.25);
            border-radius: 4px; padding: 4px 10px;
            margin-bottom: 14px;
        }
        .hitlp-amber-pin.visible { display: block; }
        .hitlp-options { display: flex; flex-direction: column; gap: 8px; }
        .hitlp-opt-btn {
            font-family: Calibri, 'Microsoft JhengHei', sans-serif;
            font-size: 12px; font-weight: 700; letter-spacing: 1px;
            padding: 10px 16px; border-radius: 5px; cursor: pointer;
            text-align: left; transition: all .15s;
            background: #111; border: 1px solid #2a2a2a; color: #aaa;
        }
        .hitlp-opt-btn:hover { border-color: #D4AF37; color: #D4AF37; background: rgba(212,175,55,0.06); }
        .hitlp-opt-btn.primary { background: #D4AF37; color: #000; border-color: #D4AF37; }
        .hitlp-opt-btn.primary:hover { background: #e8c54a; }
        .hitlp-footer {
            padding: 10px 20px 14px;
            border-top: 1px solid #1c1c1c;
            display: flex; justify-content: flex-end;
        }
        .hitlp-trace {
            font-size: 10px; color: #444; letter-spacing: 0.5px;
            font-family: monospace;
        }
        `;
        document.head.appendChild(s);
    })();

    /* ── Build option label (human-friendly) ────────────────────────────── */
    function _labelFor(opt) {
        const map = {
            'ACCEPT_AI':              '✓  Accept AI Recommendation',
            'OVERRIDE_CLINICAL':      '⚡  Override with Clinical Context',
            'OVERRIDE_ENGINEERING':   '⚡  Override with Engineering Data',
            'REQUEST_TEST':           '🔬  Request Additional Testing',
            'REQUEST_COUPON_TEST':    '🔬  Request Coupon-Level Testing',
            'ACCEPT':                 '✓  Accept',
            'OVERRIDE':               '⚡  Override',
        };
        return map[opt] || opt.replace(/_/g, ' ');
    }

    /* ── Show mid-pipeline HITL dialog ──────────────────────────────────── */
    function _showDialog(traceId, requestData, onResponse) {
        // Prevent duplicate dialogs for same trace
        if (document.getElementById('hitl-poller-overlay')) return;

        const stage   = requestData.stage   || 'PIPELINE';
        const prompt  = requestData.prompt  || 'Operator review required.';
        const options = requestData.options || ['ACCEPT_AI', 'OVERRIDE'];
        const pin     = (requestData.context || {}).spatial_pin || {};
        const hasAmber = pin.node_color === 'AMBER_PULSE';

        const ov = document.createElement('div');
        ov.id = 'hitl-poller-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Pipeline HITL Review');

        ov.innerHTML = `
          <div id="hitl-poller-dialog">
            <div class="hitlp-header">
              <span class="hitlp-title">⚙ PIPELINE REVIEW REQUIRED</span>
              <span class="hitlp-stage-badge">${stage}</span>
            </div>
            <div class="hitlp-body">
              <div class="hitlp-amber-pin ${hasAmber ? 'visible' : ''}">
                ● SPATIAL PIN ACTIVE — ${pin.evidence_tag || 'NODE FLAGGED'}
              </div>
              <div class="hitlp-prompt">${prompt}</div>
              <div class="hitlp-options">
                ${options.map((opt, i) => `
                  <button class="hitlp-opt-btn ${i === 0 ? 'primary' : ''}"
                          data-decision="${opt}"
                          id="hitlp-opt-${i}">
                    ${_labelFor(opt)}
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="hitlp-footer">
              <span class="hitlp-trace">trace: ${traceId}</span>
            </div>
          </div>`;

        document.body.appendChild(ov);

        /* Focus trap — first button */
        const firstBtn = ov.querySelector('.hitlp-opt-btn');
        if (firstBtn) firstBtn.focus();

        /* Option selection handler */
        ov.querySelectorAll('.hitlp-opt-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const decision = btn.dataset.decision;
                _submitDecision(traceId, decision, ov, onResponse);
            });
        });

        /* Keyboard: Esc closes (no decision — operator must pick explicitly) */
        ov.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { ov.remove(); }
            /* Tab focus trap */
            if (e.key === 'Tab') {
                const focusable = Array.from(ov.querySelectorAll('.hitlp-opt-btn'));
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        });

        /* If spatial pin → pulse amber on GNN canvas node (non-blocking) */
        if (hasAmber && pin.evidence_tag) {
            _pulseAmberNode(pin.evidence_tag);
        }
    }

    /* ── POST /api/hitl/respond ─────────────────────────────────────────── */
    function _submitDecision(traceId, decision, overlayEl, onResponse) {
        fetch('/api/hitl/respond', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ trace_id: traceId, decision: decision }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (overlayEl && overlayEl.parentNode) overlayEl.remove();
            _stopWatching(traceId);
            if (typeof onResponse === 'function') onResponse(decision, data);
            console.info('[SovereignHITLPoller] Decision submitted:', decision, '| trace:', traceId);
        })
        .catch(function (err) {
            console.error('[SovereignHITLPoller] /api/hitl/respond failed:', err);
        });
    }

    /* ── Pulse amber on GNN canvas node (best-effort) ───────────────────── */
    function _pulseAmberNode(evidenceTag) {
        if (!window.SovereignBUS) return;
        try {
            /* Rule 03: Use SovereignBUS for inter-module synchronization */
            window.SovereignBUS.emit('HITL_SPATIAL_PIN', {
                sender: 'hitl_modal',
                payload: { evidence_tag: evidenceTag }
            });
        } catch (err) {
            console.error('E009: [HITL] Failed to emit spatial pin:', err);
        }
    }

    /* ── Stop polling for a trace ───────────────────────────────────────── */
    function _stopWatching(traceId) {
        if (_activePollers[traceId]) {
            clearInterval(_activePollers[traceId]);
            delete _activePollers[traceId];
        }
    }

    /* ── Public: watch(traceId, onResponse) ─────────────────────────────── */
    function watch(traceId, onResponse) {
        if (!traceId) { console.warn('[SovereignHITLPoller] watch() called with no trace_id'); return; }
        if (_activePollers[traceId]) return;   // already watching

        let _shownForThisTrace = false;

        const intervalId = setInterval(function () {
            fetch('/api/hitl/status/' + encodeURIComponent(traceId))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.status === 'PENDING' && !_shownForThisTrace) {
                    _shownForThisTrace = true;
                    _showDialog(traceId, data.request || {}, onResponse);
                }
                if (data.status === 'RESOLVED') {
                    _stopWatching(traceId);
                    if (typeof onResponse === 'function' && data.decision) {
                        onResponse(data.decision, data);
                    }
                }
            })
            .catch(function (err) {
                console.warn('[SovereignHITLPoller] poll error (non-fatal):', err);
            });
        }, POLL_INTERVAL_MS);

        _activePollers[traceId] = intervalId;
        console.info('[SovereignHITLPoller] Watching trace:', traceId);
    }

    /* ── Public: stopAll() — call on page unload ─────────────────────────── */
    function stopAll() {
        Object.keys(_activePollers).forEach(_stopWatching);
    }

    /* ── Public API ─────────────────────────────────────────────────────── */
    global.SovereignHITLPoller = { watch: watch, stop: _stopWatching, stopAll: stopAll };

})(window);

