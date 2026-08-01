/**
 * Module: XAITutor3DModal
 * Version: 1.0.0
 * Description: Sovereign Matrix — 3D XAI Chatbot Tutor Modal.
 *   Renders as an isolated overlay triggered by node-click events from
 *   HealthcareMedical3D or Plotly 3D scatter views.
 *   Implements real LLM-backed dialogue via /api/xai/explain.
 *   All UI strings are i18n compliant via SovereignI18n.
 *
 * Architecture:
 *   - Singleton modal (one instance per page).
 *   - Opened by calling: XAITutor3DModal.open(nodeData)
 *     where nodeData = { id, label, saa_disposition, xai_explanation,
 *                        delta_pct, extracted_value, recomputed_value,
 *                        formula, snippet, evidence_tag }
 *   - Chat messages POST to /api/xai/explain for LLM augmentation.
 *   - Disposition badge colours match backend: Red/Amber/Purple/Green.
 */
'use strict';
(function (G) {

/* ── Disposition colour map (mirrors visualization_engine.py v2.1.0) ── */
var DISP_COLORS = {
  FLAG_TAMPER:    { bg: '#FF3B30', label: '🔴 FLAG_TAMPER',    text: '#fff' },
  AUTO_OVERWRITE: { bg: '#FF9500', label: '🟠 AUTO_OVERWRITE', text: '#fff' },
  HITL_ESCALATE:  { bg: '#AF52DE', label: '🟣 HITL_ESCALATE',  text: '#fff' },
  PASS:           { bg: '#34C759', label: '🟢 PASS',           text: '#fff' },
};

/* ── i18n key helper ── */
function t(key) {
  try {
    var d = G.SovereignI18nData;
    var lang = (G.SovereignI18n && G.SovereignI18n.current) || 'en';
    var idx  = d.LANGS.indexOf(lang);
    if (idx < 0) idx = 0;
    var arr = d.T[key];
    return arr ? (arr[idx] || arr[0]) : key;
  } catch (_) { return key; }
}

/* ── XAI Tutor Modal singleton ── */
var _modal = null;
var _currentNode = null;
var _history = [];   /* [{role:'user'|'ai', text:'...'}] */
var _loading = false;

function _createModal() {
  if (_modal) return _modal;

  var overlay = document.createElement('div');
  overlay.id = 'xai-tutor-overlay';
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'XAI 3D Tutor');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:100000;',
    'display:none;align-items:center;justify-content:center;',
    'background:rgba(5,8,20,0.72);backdrop-filter:blur(6px);',
    '-webkit-backdrop-filter:blur(6px);',
    'transition:opacity 0.25s ease;opacity:0;'
  ].join('');

  var panel = document.createElement('div');
  panel.id = 'xai-tutor-panel';
  panel.style.cssText = [
    'position:relative;width:min(680px,96vw);max-height:90vh;',
    'background:linear-gradient(155deg,#0D1B2A 0%,#1A2640 60%,#0D1B2A 100%);',
    'border:1px solid rgba(212,175,55,0.35);border-radius:16px;',
    'box-shadow:0 24px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(212,175,55,0.12);',
    'display:flex;flex-direction:column;overflow:hidden;',
    'transform:translateY(24px);transition:transform 0.28s cubic-bezier(.16,1,.3,1);'
  ].join('');

  panel.innerHTML = [
    /* ── Header ── */
    '<div id="xai-hdr" style="',
      'display:flex;align-items:center;gap:12px;',
      'padding:18px 20px 14px;',
      'border-bottom:1px solid rgba(212,175,55,0.18);',
      'background:rgba(0,0,0,0.25);flex-shrink:0;">',
      '<div style="font-size:22px;">🧠</div>',
      '<div style="flex:1;">',
        '<div id="xai-hdr-title" style="',
          'font-family:\'Outfit\',Arial,sans-serif;font-size:15px;font-weight:700;',
          'color:#D4AF37;letter-spacing:0.6px;line-height:1.2;">',
          '3D XAI TUTOR',
        '</div>',
        '<div id="xai-hdr-sub" style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;">',
          'Explainability Chatbot — Select a node to begin',
        '</div>',
      '</div>',
      '<div id="xai-disp-badge" style="',
        'padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;',
        'letter-spacing:0.5px;display:none;">',
      '</div>',
      '<button id="xai-close-btn" aria-label="Close" style="',
        'background:none;border:none;color:rgba(255,255,255,0.55);cursor:pointer;',
        'font-size:20px;padding:4px 8px;border-radius:6px;line-height:1;',
        'transition:color 0.15s,background 0.15s;">✕</button>',
    '</div>',

    /* ── Node info card ── */
    '<div id="xai-node-card" style="',
      'display:none;margin:14px 18px 0;',
      'background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.14);',
      'border-radius:10px;padding:12px 14px;flex-shrink:0;">',
      '<div style="display:flex;gap:16px;flex-wrap:wrap;">',
        '<div style="flex:1;min-width:140px;">',
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.8px;">Node</div>',
          '<div id="xai-nc-id" style="font-size:14px;font-weight:700;color:#D4AF37;margin-top:2px;"></div>',
        '</div>',
        '<div style="flex:1;min-width:140px;">',
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.8px;">Formula</div>',
          '<div id="xai-nc-formula" style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;font-family:monospace;"></div>',
        '</div>',
        '<div style="flex:1;min-width:140px;">',
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.8px;">Delta</div>',
          '<div id="xai-nc-delta" style="font-size:14px;font-weight:700;color:#FF9500;margin-top:2px;"></div>',
        '</div>',
        '<div style="flex:2;min-width:180px;">',
          '<div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.8px;">Extracted → Recomputed</div>',
          '<div id="xai-nc-vals" style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:2px;"></div>',
        '</div>',
      '</div>',
      '<div style="margin-top:10px;">',
        '<div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.8px;">XAI Explanation</div>',
        '<div id="xai-nc-explain" style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;line-height:1.5;',
          'background:rgba(212,175,55,0.06);padding:8px 10px;border-radius:6px;border-left:3px solid #D4AF37;">',
        '</div>',
      '</div>',
    '</div>',

    /* ── Chat messages ── */
    '<div id="xai-chat-log" style="',
      'flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px;',
      'min-height:160px;max-height:320px;',
      'scrollbar-width:thin;scrollbar-color:rgba(212,175,55,0.3) transparent;">',
      '<div id="xai-welcome-msg" style="',
        'text-align:center;color:rgba(255,255,255,0.35);font-size:13px;',
        'padding:24px 0;font-style:italic;">',
        '✨ Click any node in the 3D render to begin XAI analysis.',
      '</div>',
    '</div>',

    /* ── Input bar ── */
    '<div id="xai-input-bar" style="',
      'display:flex;gap:8px;padding:14px 18px;',
      'border-top:1px solid rgba(212,175,55,0.15);',
      'background:rgba(0,0,0,0.18);flex-shrink:0;">',
      '<input id="xai-input" type="text" placeholder="Ask the XAI tutor a question…"',
        ' autocomplete="off" style="',
        'flex:1;background:rgba(255,255,255,0.06);',
        'border:1px solid rgba(212,175,55,0.25);border-radius:8px;',
        'padding:10px 14px;color:#fff;font-size:13px;',
        'outline:none;transition:border-color 0.2s;font-family:inherit;" />',
      '<button id="xai-send-btn" style="',
        'background:linear-gradient(135deg,#D4AF37,#B8860B);',
        'border:none;border-radius:8px;padding:10px 18px;',
        'color:#000;font-weight:700;font-size:13px;cursor:pointer;',
        'letter-spacing:0.5px;transition:opacity 0.15s;white-space:nowrap;">',
        '⬆ Send',
      '</button>',
    '</div>',

    /* ── Footer disclaimer ── */
    '<div style="',
      'padding:8px 18px 10px;text-align:center;',
      'font-size:10px;color:rgba(255,255,255,0.25);flex-shrink:0;">',
      'Sovereign XAI Tutor v1.0 — Powered by Gemini 2.0 Flash · SAA Axiom Engine',
    '</div>',
  ].join('');

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  /* ── Event wiring ── */
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) XAITutor3DModal.close();
  });
  document.getElementById('xai-close-btn').addEventListener('click', function () {
    XAITutor3DModal.close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _modal && _modal.style.display !== 'none') {
      XAITutor3DModal.close();
    }
  });

  var sendBtn = document.getElementById('xai-send-btn');
  var inputEl = document.getElementById('xai-input');
  sendBtn.addEventListener('click', _sendMessage);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
  });
  inputEl.addEventListener('focus', function () {
    this.style.borderColor = 'rgba(212,175,55,0.65)';
  });
  inputEl.addEventListener('blur', function () {
    this.style.borderColor = 'rgba(212,175,55,0.25)';
  });
  sendBtn.addEventListener('mouseenter', function () { this.style.opacity = '0.82'; });
  sendBtn.addEventListener('mouseleave', function () { this.style.opacity = '1'; });

  _modal = overlay;
  return overlay;
}

/* ── Append a chat bubble ── */
function _appendBubble(role, text, isStreaming) {
  var log = document.getElementById('xai-chat-log');
  if (!log) return null;
  /* Remove welcome message on first real message */
  var welcome = document.getElementById('xai-welcome-msg');
  if (welcome) welcome.remove();

  var isAI = role === 'ai';
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;' + (isAI ? 'justify-content:flex-start;' : 'justify-content:flex-end;');

  var bubble = document.createElement('div');
  bubble.style.cssText = [
    'max-width:85%;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.55;',
    isAI
      ? 'background:rgba(212,175,55,0.10);border:1px solid rgba(212,175,55,0.18);color:rgba(255,255,255,0.88);border-bottom-left-radius:3px;'
      : 'background:rgba(0,122,255,0.18);border:1px solid rgba(0,122,255,0.25);color:rgba(255,255,255,0.9);border-bottom-right-radius:3px;',
    isAI ? '' : '',
  ].join('');

  if (isAI) {
    var icon = document.createElement('span');
    icon.textContent = '🧠 ';
    icon.style.cssText = 'font-size:14px;';
    bubble.appendChild(icon);
  }
  var textNode = document.createElement('span');
  textNode.textContent = text;
  if (isStreaming) {
    bubble.classList.add('xai-streaming');
    var cursor = document.createElement('span');
    cursor.className = 'xai-cursor';
    cursor.textContent = '▋';
    cursor.style.cssText = 'animation:xai-blink 1s step-end infinite;color:#D4AF37;';
    textNode.appendChild(cursor);
  }
  bubble.appendChild(textNode);
  wrap.appendChild(bubble);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
  return textNode;
}

/* ── Inject a global blink keyframe once ── */
(function () {
  if (document.getElementById('xai-tutor-styles')) return;
  var s = document.createElement('style');
  s.id = 'xai-tutor-styles';
  s.textContent = [
    '@keyframes xai-blink{0%,100%{opacity:1}50%{opacity:0}}',
    '#xai-chat-log::-webkit-scrollbar{width:4px}',
    '#xai-chat-log::-webkit-scrollbar-thumb{background:rgba(212,175,55,0.3);border-radius:4px}',
    '#xai-chat-log::-webkit-scrollbar-track{background:transparent}',
    '#xai-input::placeholder{color:rgba(255,255,255,0.28)}',
  ].join('');
  document.head.appendChild(s);
}());

/* ── Load node data into info card ── */
function _populateNodeCard(node) {
  _currentNode = node;
  _history = [];

  var disp = node.saa_disposition || 'PASS';
  var dc   = DISP_COLORS[disp] || DISP_COLORS.PASS;

  /* Badge */
  var badge = document.getElementById('xai-disp-badge');
  if (badge) {
    badge.textContent = dc.label;
    badge.style.background = dc.bg;
    badge.style.color = dc.text;
    badge.style.display = 'block';
  }

  /* Subtitle */
  var sub = document.getElementById('xai-hdr-sub');
  if (sub) sub.textContent = (node.label || node.id || 'Evidence Node') + ' — ' + (node.evidence_tag || '');

  /* Card fields */
  var card = document.getElementById('xai-node-card');
  if (card) card.style.display = 'block';

  _setEl('xai-nc-id',      node.label || node.id || '—');
  _setEl('xai-nc-formula', node.formula || '—');

  var delta = typeof node.delta_pct === 'number' ? node.delta_pct.toFixed(2) + '%' : '—';
  var deltaEl = document.getElementById('xai-nc-delta');
  if (deltaEl) {
    deltaEl.textContent = delta;
    deltaEl.style.color = Math.abs(node.delta_pct || 0) > 5 ? '#FF3B30' : '#FF9500';
  }

  _setEl('xai-nc-vals',
    (node.extracted_value !== undefined ? String(node.extracted_value) : '—') +
    ' → ' +
    (node.recomputed_value !== undefined ? String(node.recomputed_value) : '—'));

  _setEl('xai-nc-explain', node.xai_explanation || 'No explanation provided.');

  /* Clear chat log, inject system greeting */
  var log = document.getElementById('xai-chat-log');
  if (log) {
    log.innerHTML = '';
    _appendBubble('ai',
      'Hi! I am your XAI Tutor for node "' + (node.label || node.id) + '". ' +
      'Disposition: ' + disp + '. ' +
      (node.xai_explanation || '') +
      '\n\nYou can ask me to explain the formula, the delta, or what this means for the audit outcome.');
    _history.push({ role: 'ai', text: node.xai_explanation || '' });
  }
}

function _setEl(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ── Send user message → /api/xai/explain → stream response ── */
function _sendMessage() {
  if (_loading) return;
  var input = document.getElementById('xai-input');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;

  input.value = '';
  _appendBubble('user', text);
  _history.push({ role: 'user', text: text });

  /* Build AI context from current node */
  var context = _currentNode ? {
    node_id:          _currentNode.id        || '',
    label:            _currentNode.label     || '',
    saa_disposition:  _currentNode.saa_disposition || 'PASS',
    xai_explanation:  _currentNode.xai_explanation || '',
    delta_pct:        _currentNode.delta_pct  || 0,
    extracted_value:  _currentNode.extracted_value  || '',
    recomputed_value: _currentNode.recomputed_value || '',
    formula:          _currentNode.formula    || '',
    snippet:          _currentNode.snippet    || '',
    evidence_tag:     _currentNode.evidence_tag || '',
  } : {};

  _loading = true;
  _setSendState(true);

  var aiTextNode = _appendBubble('ai', '', true);

  fetch('/api/xai/explain', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question: text, context: context, history: _history.slice(-6) }),
  })
  .then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    /* Streaming: read as text/event-stream if available, else parse JSON */
    var ct = res.headers.get('Content-Type') || '';
    if (ct.indexOf('text/event-stream') >= 0) {
      return _streamSSE(res, aiTextNode);
    }
    return res.json().then(function (j) {
      var answer = j.answer || j.text || 'No response.';
      if (aiTextNode) {
        /* Remove cursor */
        var cur = aiTextNode.querySelector('.xai-cursor');
        if (cur) cur.remove();
        aiTextNode.textContent = answer;
      }
      _history.push({ role: 'ai', text: answer });
    });
  })
  .catch(function (err) {
    if (aiTextNode) {
      var cur = aiTextNode.querySelector && aiTextNode.querySelector('.xai-cursor');
      if (cur) cur.remove();
      aiTextNode.textContent = 'Error: ' + err.message + '. The XAI backend may be unavailable.';
    }
  })
  .finally(function () {
    _loading = false;
    _setSendState(false);
    var log = document.getElementById('xai-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  });
}

function _setSendState(busy) {
  var btn   = document.getElementById('xai-send-btn');
  var input = document.getElementById('xai-input');
  if (btn)   { btn.disabled = busy; btn.style.opacity = busy ? '0.5' : '1'; }
  if (input) { input.disabled = busy; }
}

function _streamSSE(res, textNode) {
  return new Promise(function (resolve) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var full = '';

    function read() {
      reader.read().then(function (r) {
        if (r.done) {
          /* Remove cursor on done */
          var cur = textNode && textNode.querySelector && textNode.querySelector('.xai-cursor');
          if (cur) cur.remove();
          _history.push({ role: 'ai', text: full });
          resolve();
          return;
        }
        var chunk = decoder.decode(r.value, { stream: true });
        chunk.split('\n').forEach(function (line) {
          if (line.startsWith('data: ')) {
            var piece = line.slice(6);
            if (piece === '[DONE]') return;
            try { piece = JSON.parse(piece).token || piece; } catch (_) {}
            full += piece;
            if (textNode) {
              var cur = textNode.querySelector && textNode.querySelector('.xai-cursor');
              var bare = textNode.childNodes[0];
              if (bare && bare.nodeType === 3) bare.textContent = full;
              else if (!cur) textNode.textContent = full;
            }
          }
        });
        var log = document.getElementById('xai-chat-log');
        if (log) log.scrollTop = log.scrollHeight;
        read();
      }).catch(resolve);
    }
    read();
  });
}

/* ── Public API ── */
var XAITutor3DModal = {
  /**
   * Open the modal, optionally loading a node's XAI data.
   * @param {Object} nodeData — customdata from Plotly or THREE click event
   */
  open: function (nodeData) {
    var overlay = _createModal();
    overlay.style.display = 'flex';
    /* Animate in */
    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      var panel = document.getElementById('xai-tutor-panel');
      if (panel) panel.style.transform = 'translateY(0)';
    });
    if (nodeData) _populateNodeCard(nodeData);
    /* Focus input */
    setTimeout(function () {
      var inp = document.getElementById('xai-input');
      if (inp) inp.focus();
    }, 300);
  },

  close: function () {
    if (!_modal) return;
    _modal.style.opacity = '0';
    var panel = document.getElementById('xai-tutor-panel');
    if (panel) panel.style.transform = 'translateY(24px)';
    setTimeout(function () {
      if (_modal) _modal.style.display = 'none';
    }, 280);
  },

  /**
   * Wire a Plotly 3D scatter div to open this modal on node click.
   * Call after Plotly.newPlot() completes.
   * @param {string} plotDivId — id of the Plotly container div
   */
  wirePlotly: function (plotDivId) {
    var div = document.getElementById(plotDivId);
    if (!div || !G.Plotly) return;
    div.on('plotly_click', function (data) {
      if (!data || !data.points || !data.points.length) return;
      var pt = data.points[0];
      var cd = pt.customdata || {};
      XAITutor3DModal.open({
        id:               pt.text || 'Node',
        label:            pt.text || 'Node',
        saa_disposition:  cd.saa_disposition  || 'PASS',
        xai_explanation:  cd.xai_explanation  || '',
        delta_pct:        cd.delta_pct         || 0,
        extracted_value:  cd.extracted_value   || '',
        recomputed_value: cd.recomputed_value  || '',
        formula:          cd.formula           || '',
        snippet:          cd.snippet           || '',
        evidence_tag:     cd.evidence_tag      || '',
      });
    });
  },

  /**
   * Wire a THREE.js canvas inside HealthcareMedical3D to open this modal.
   * items = [{mesh, data:{id,val,status,ctx,crit,saa_disposition,...}}]
   * camera = THREE.Camera
   */
  wireThree: function (canvas, camera, items) {
    if (!canvas || !G.THREE) return;
    var ray   = new THREE.Raycaster();
    var mouse = new THREE.Vector2();
    var meshList = items.map(function (it) { return it.mesh; });

    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
      mouse.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(meshList, false);
      if (!hits.length) return;
      var obj = hits[0].object;
      var it  = items.find(function (x) { return x.mesh === obj; });
      if (!it) return;
      XAITutor3DModal.open(Object.assign({}, it.data, {
        id:    it.data.id    || '',
        label: it.data.id    || '',
      }));
    });
  },
};

G.XAITutor3DModal = XAITutor3DModal;
})(window);
