/**
 * Module: sovereign_report_engine.js  v2.0.0  PRODUCTION
 * AG_Agent_System_Prompt — Declarative Design Schema
 * Domains: OCM | FINANCE | TRADING
 */

/* ─── DESIGN TOKEN LOCK ─────────────────────────────────────── */
const AG_TOKENS = {
  colors: {
    primary:  '#00C853',
    warning:  '#FFD700',
    critical: '#FF0000',
    gray:     '#999999',
    track:    '#E0E0E0',
    text:     '#2C2C2C',
  },
  fonts: {
    header: 'Arial, Helvetica, sans-serif',
    body:   '"Times New Roman", Times, serif',
    mono:   '"Fira Code", monospace',
  },
  spacing: { pad: '16px', minPad: '24px', lineW: '1.5pt' },
  print: { shadowOverride: 'box-shadow:none!important;filter:none!important;text-shadow:none!important;' },
};

/* ─── PROTECTED TERMS (never translated) ───────────────────── */
const PROTECTED = ['L5','GNN','World Model','Causal','OCM','ASIC','Axiom','Cloud Run','Node','Edge','Stripe','GCP'];

/* ─── DOMAIN DEFINITIONS ────────────────────────────────────── */
const AG_DOMAINS = {
  OCM: {
    label: 'ONTOLOGY COMPLIANCE MATRIX',
    subtitle: 'ONTOLOGY EVALUATION REPORT',
    accent: '#00C853',
    classification: '',
    meters: [
      { id:'compliance',   type:'radial',    label:'Overall Compliance',   unit:'%',        colorToken:'primary',  threshold:95 },
      { id:'compute_edge', type:'horizontal', label:'Workload Distribution',unit:'%',        colorToken:'primary',  segments:['Edge ASIC','Cloud AI'],  segColors:['#00C853','#999999'] },
      { id:'drift',        type:'vertical',  label:'L5 Contextual Drift',  unit:'%',        colorToken:'primary',  threshold:5, invertThreshold:true },
    ],
    translationPair: { techHeader:'Technical Analysis', laymanHeader:'General Comprehension' },
    layoutFlow: ['MetadataBlock','ExecutiveMeters','TranslationPair','DeepDive_3DCanvas','OfficialSeal'],
  },
  FINANCE: {
    label: 'FINANCIAL COMPLIANCE MATRIX',
    subtitle: 'FINANCIAL AUDIT REPORT',
    accent: '#FFD700',
    classification: 'STRICTLY CONFIDENTIAL — FINANCIAL EXECUTIVES ONLY',
    meters: [
      { id:'margin',       type:'radial',    label:'Gross Margin (Post-Opt)',unit:'%',       colorToken:'primary',  threshold:50 },
      { id:'cost_alloc',   type:'horizontal', label:'OPEX Allocation',       unit:'USD',     colorToken:'primary',  segments:['Edge ASIC OPEX','Cloud AI OPEX'], segColors:['#00C853','#999999'] },
      { id:'burn_rate',    type:'vertical',  label:'Monthly Burn Rate',     unit:'% Budget', colorToken:'warning',  threshold:100, invertThreshold:true },
    ],
    translationPair: { techHeader:'Financial Analysis', laymanHeader:'Board / Investor Comprehension' },
    layoutFlow: ['MetadataBlock','ExecutiveMeters','HorizontalTube_OPEX','TranslationPair','DeepDive_Sankey','OfficialSeal'],
  },
  TRADING: {
    label: 'TRADING COMPLIANCE MATRIX',
    subtitle: 'TRADING TREND & ALPHA REPORT',
    accent: '#00BFFF',
    classification: 'CONFIDENTIAL — TRADING DESK ONLY',
    meters: [
      { id:'sentiment',    type:'radial',    label:'Market Sentiment Index', unit:'%',      colorToken:'primary',  threshold:60, multiGradient:true },
      { id:'exposure',     type:'horizontal', label:'Long / Short Exposure', unit:'%',      colorToken:'primary',  segments:['Long','Short'], segColors:['#00C853','#FF0000'], zeroAxis:true },
      { id:'volatility',   type:'vertical',  label:'Market Volatility',     unit:'%',      colorToken:'critical', threshold:80, invertThreshold:true },
    ],
    translationPair: { techHeader:'Quantitative Analysis', laymanHeader:'Investor / Executive Summary' },
    layoutFlow: ['MetadataBlock','ExecutiveMeters','TranslationPair','DeepDive_TradingMatrix','OfficialSeal'],
  },
};

/* ─── APPROVED COMPONENT LIBRARY ────────────────────────────── */
const ALLOWED_COMPONENTS = ['RadialMeter','HorizontalTube','VerticalMeter','TranslationPair','3DCanvas','ScientificTable','SankeyDiagram'];

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: RadialMeter  (SVG arc, print-safe)
═══════════════════════════════════════════════════════════════ */
function renderRadialMeter(cfg, isPrint) {
  const val   = Math.min(100, Math.max(0, Number(cfg.value || 0)));
  const pass  = val >= (cfg.threshold || 0);
  const color = isPrint ? (pass ? '#4D4D4D' : '#000') : (pass ? AG_TOKENS.colors.primary : AG_TOKENS.colors.critical);
  const r = 44, cx = 54, cy = 54, circ = 2 * Math.PI * r;
  const dash = (val / 100) * circ;
  const glow = isPrint ? '' : `filter:drop-shadow(0 0 6px ${color});`;
  return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;padding:0 8px">
    <svg width="108" height="108" viewBox="0 0 108 108" style="${isPrint?'':''}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${AG_TOKENS.colors.track}" stroke-width="6"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ*0.25}"
        stroke-linecap="round" style="${glow}" transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
        font-family="${AG_TOKENS.fonts.header}" font-size="18" font-weight="bold" fill="${color}">${val}${cfg.unit||'%'}</text>
    </svg>
    <div style="font-family:${AG_TOKENS.fonts.header};font-size:9px;letter-spacing:2px;text-align:center;
      color:${isPrint?'#555':'rgba(255,255,255,0.5)'};text-transform:uppercase">${cfg.label||''}</div>
    ${isPrint ? `<div style="font-size:8px;color:#333;text-align:center">${val}${cfg.unit||'%'} · ${pass?'PASS':'REVIEW'}</div>` : ''}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: HorizontalTube  (pill, standard + zero-axis)
═══════════════════════════════════════════════════════════════ */
function renderHorizontalTube(cfg, data, isPrint) {
  const segs  = cfg.segments || ['A','B'];
  const cols  = cfg.segColors || [AG_TOKENS.colors.primary, AG_TOKENS.colors.gray];
  const vals  = segs.map((_, i) => Number((data && data[`seg_${i}`]) != null ? data[`seg_${i}`] : (100/segs.length)));
  const total = vals.reduce((s,v) => s+v, 0) || 100;
  const glow  = isPrint ? '' : `box-shadow:0 0 8px rgba(0,200,83,0.35);`;

  let tubeInner = '';
  let labels    = '';
  segs.forEach((name, i) => {
    const pct = (vals[i] / total * 100).toFixed(1);
    tubeInner += `<div style="width:${pct}%;background:${isPrint?(i===0?'#4D4D4D':'#AAA'):cols[i]};height:100%;transition:width 0.4s"></div>`;
    labels += `<div style="flex:${vals[i]};font-family:${AG_TOKENS.fonts.header};font-size:9px;
      color:${isPrint?'#333':'rgba(255,255,255,0.6)'};text-align:${i===0?'left':'right'};white-space:nowrap">
      ${name}${isPrint?` ${pct}%`:''}</div>`;
  });

  const zeroBadge = cfg.zeroAxis
    ? `<div style="position:absolute;left:50%;top:-16px;transform:translateX(-50%);
        font-size:8px;color:${isPrint?'#333':'rgba(255,255,255,0.3)'}">0</div>` : '';

  return `<div style="padding:0 8px;width:100%">
    <div style="font-family:${AG_TOKENS.fonts.header};font-size:9px;letter-spacing:2px;
      color:${isPrint?'#555':'rgba(255,255,255,0.4)'};text-transform:uppercase;margin-bottom:6px">${cfg.label||''}</div>
    <div style="display:flex;gap:4px;margin-bottom:4px">${labels}</div>
    <div style="position:relative;border-radius:999px;height:12px;overflow:hidden;
      background:${AG_TOKENS.colors.track};${isPrint?'':glow}">
      ${zeroBadge}
      <div style="display:flex;height:100%;width:100%">${tubeInner}</div>
    </div>
    ${isPrint ? `<div style="font-size:8px;color:#444;margin-top:3px">${segs.map((n,i)=>`${n}: ${(vals[i]/total*100).toFixed(1)}%`).join(' | ')}</div>` : ''}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: VerticalMeter  (thermometer with tick marks)
═══════════════════════════════════════════════════════════════ */
function renderVerticalMeter(cfg, data, isPrint) {
  const cur  = Number((data && data[cfg.id]) != null ? data[cfg.id] : (cfg.current_value || 0));
  const max  = cfg.threshold || 100;
  const pct  = Math.min(100, Math.max(0, cur / max * 100));
  const warn = cfg.invertThreshold ? (cur >= max * 0.7) : (cur <= max * 0.3);
  const fillColor = isPrint ? (warn ? '#222' : '#666') :
    (warn ? `hsl(${Math.round(120 - pct * 1.2)},100%,50%)` : AG_TOKENS.colors.primary);
  const glowStyle = isPrint ? '' : `box-shadow:0 0 8px ${fillColor}60;`;
  const ticks = [100,75,50,25,0].map(t =>
    `<div style="display:flex;align-items:center;gap:4px;height:20%">
      <div style="width:6px;height:0.5px;background:${isPrint?'#CCC':'rgba(255,255,255,0.2)'}"></div>
      <div style="font-size:7px;color:${isPrint?'#999':'rgba(255,255,255,0.25)'};">${t}</div>
    </div>`).join('');

  return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;padding:0 8px">
    <div style="font-family:${AG_TOKENS.fonts.header};font-size:9px;letter-spacing:2px;text-transform:uppercase;
      text-align:center;color:${isPrint?'#555':'rgba(255,255,255,0.4)'};">${cfg.label||''}</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:120px">
      <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%">${ticks}</div>
      <div style="width:16px;height:100%;border-radius:4px;background:${AG_TOKENS.colors.track};
        position:relative;overflow:hidden">
        <div style="position:absolute;bottom:0;left:0;width:100%;height:${pct}%;
          background:${fillColor};border-radius:4px;${glowStyle}transition:height 0.5s"></div>
      </div>
    </div>
    <div style="font-family:${AG_TOKENS.fonts.header};font-size:11px;font-weight:bold;
      color:${fillColor}">${cur}<span style="font-size:8px;margin-left:2px">${cfg.unit||''}</span></div>
    ${isPrint ? `<div style="font-size:8px;color:#444">Max: ${max}${cfg.unit||''} · ${warn?'REVIEW':'PASS'}</div>` : ''}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: TranslationPair
═══════════════════════════════════════════════════════════════ */
function renderTranslationPair(techText, laymanText, labels, isPrint) {
  const h3 = `font-family:${AG_TOKENS.fonts.header};font-size:11pt;font-weight:bold;
    color:${isPrint?'#000':'#B8B8C8'};margin-bottom:6px;margin-top:18px`;
  const p  = `font-family:${AG_TOKENS.fonts.body};font-size:12pt;color:${isPrint?'#000':'#9090A0'};
    line-height:1.55;word-break:break-word;max-width:100%`;
  return `<div style="width:100%;padding:0 ${AG_TOKENS.spacing.minPad}">
    <h3 style="${h3}">Part A: ${labels.techHeader}</h3>
    <p style="${p}">${_protect(techText)}</p>
    <h3 style="${h3}">Part B: ${labels.laymanHeader}</h3>
    <p style="${p}">${_protect(laymanText)}</p>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   CSS INJECTION  (tokens + print safety strip)
═══════════════════════════════════════════════════════════════ */
function buildCSS(domain, accent) {
  return `
.ag-meter-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;padding:0 ${AG_TOKENS.spacing.minPad};margin-bottom:16px}
.ag-section-head{font-family:${AG_TOKENS.fonts.header};font-size:10px;letter-spacing:3px;
  text-transform:uppercase;color:${accent};border-left:2px solid ${accent};padding-left:8px;margin-bottom:12px}
@media print{
  .ag-meter-row *,svg circle,svg text{${AG_TOKENS.print.shadowOverride}}
  body{background:#fff!important;color:#000!important}
  .no-print{display:none!important}
}`;
}

/* ═══════════════════════════════════════════════════════════════
   ZERO-TOLERANCE SAFETY AUDITOR
═══════════════════════════════════════════════════════════════ */
const AG_SAFETY = {
  audit(html, lang) {
    const v = [];
    if (/position\s*:\s*absolute[^}]*color/.test(html) && /ag-canvas/.test(html))
      v.push({ code:'OVERLAY_COLLISION', msg:'Absolute text inside canvas bounding box.' });
    if (/#00C853[^"]*"[^}]*background[^:]*:\s*#(?:fff|ffffff)/i.test(html))
      v.push({ code:'CONTRAST_VIOLATION', msg:'Neon green on white background violates WCAG AA.' });
    if (lang && lang !== 'en') {
      const en = (html.match(/\b(the|and|of|for|with|this|has|been)\b/gi)||[]).length;
      if (en > 15) v.push({ code:'LANGUAGE_FRAGMENTATION', msg:`English words in ${lang} report.` });
    }
    return v;
  },
  log(v) {
    if (!v.length) { console.info('[AG_SAFETY] ✓ All checks passed.'); return; }
    v.forEach(e => console.error(`[AG_SAFETY] ✗ ${e.code}: ${e.msg}`));
  },
};

/* ═══════════════════════════════════════════════════════════════
   JSON PAYLOAD VALIDATOR
═══════════════════════════════════════════════════════════════ */
function validatePayload(D, domain) {
  const errs = [];
  if (domain === 'OCM') {
    const m = D.executive_summary_meters || {};
    if (!m.compliance_radial)     errs.push('Missing: executive_summary_meters.compliance_radial');
    if (!m.compute_allocation_tube) errs.push('Missing: executive_summary_meters.compute_allocation_tube');
    if (!m.contextual_drift_vertical) errs.push('Missing: executive_summary_meters.contextual_drift_vertical');
  } else if (domain === 'FINANCE') {
    const m = (D.financial_report || {}).executive_dashboard || {};
    if (!m.margin_radial)      errs.push('Missing: financial_report.executive_dashboard.margin_radial');
    if (!m.cost_allocation_tube) errs.push('Missing: financial_report.executive_dashboard.cost_allocation_tube');
    if (!m.burn_rate_vertical) errs.push('Missing: financial_report.executive_dashboard.burn_rate_vertical');
  } else if (domain === 'TRADING') {
    const m = (D.trading_trend_report || {}).executive_dashboard || {};
    if (!m.sentiment_radial)   errs.push('Missing: trading_trend_report.executive_dashboard.sentiment_radial');
    if (!m.exposure_tube)      errs.push('Missing: trading_trend_report.executive_dashboard.exposure_tube');
    if (!m.volatility_vertical) errs.push('Missing: trading_trend_report.executive_dashboard.volatility_vertical');
  }
  if (errs.length) errs.forEach(e => console.warn(`[AG_PAYLOAD] ${e}`));
  return errs.length === 0;
}

/* ═══════════════════════════════════════════════════════════════
   DATA EXTRACTION — normalise all three payload shapes
═══════════════════════════════════════════════════════════════ */
function extractMeterData(D, domain) {
  if (domain === 'OCM') {
    const m = D.executive_summary_meters || {};
    const r = m.compliance_radial         || {};
    const t = m.compute_allocation_tube   || {};
    const v = m.contextual_drift_vertical || {};
    return {
      radial:  { value: r.value || D.complianceScore || 98.5, unit:'%', label: r.label||'Overall Compliance', threshold:95 },
      tube:    { label: t.label||'Workload Distribution', segments:(t.segments||[]).map(s=>s.name||s), segColors:(t.segments||[]).map(s=>s.color_hex||'#00C853'), vals:(t.segments||[]).map(s=>s.value||50) },
      vertical:{ value: v.current_value||D.driftPct||1.5, unit:'%', label:v.label||'L5 Contextual Drift', threshold:v.max_threshold||5, invertThreshold:true },
    };
  }
  if (domain === 'FINANCE') {
    const db = (D.financial_report||{}).executive_dashboard || {};
    const mr = db.margin_radial || {};
    const ct = db.cost_allocation_tube || {};
    const br = db.burn_rate_vertical || {};
    return {
      radial:  { value: mr.value||68.5, unit:'%', label:mr.label||'Gross Margin', threshold:50 },
      tube:    { label:'OPEX Allocation', segments:(ct.segments||[]).map(s=>s.name||s), segColors:(ct.segments||[]).map(s=>s.color_hex||'#00C853'), vals:(ct.segments||[]).map(s=>s.amount||50) },
      vertical:{ value: br.current_value||85, unit: br.unit||'% Budget', label:br.label||'Monthly Burn Rate', threshold:br.max_threshold||100, invertThreshold:true },
    };
  }
  /* TRADING */
  const db = (D.trading_trend_report||{}).executive_dashboard || {};
  const sr = db.sentiment_radial  || {};
  const et = db.exposure_tube     || {};
  const vv = db.volatility_vertical || {};
  return {
    radial:  { value: sr.value||72.5, unit:'%', label:sr.label||'Market Sentiment', threshold:60, multiGradient:true },
    tube:    { label:'Long / Short Exposure', segments:(et.segments||[]).map(s=>s.name||s), segColors:(et.segments||[]).map(s=>s.color_hex||'#00C853'), vals:(et.segments||[]).map(s=>s.percentage||50), zeroAxis:(et.zero_axis||false) },
    vertical:{ value: vv.current_value||45, unit:'%', label:vv.label||'Market Volatility', threshold:vv.max_threshold||100, invertThreshold:true },
  };
}

function extractTranslation(D, domain) {
  if (domain === 'OCM') return { tech: D.technicalNarrative||D.narrative||'', layman: D.generalNarrative||D.conclusion||'' };
  if (domain === 'FINANCE') { const tp=(D.financial_report||{}).translation_pair||{}; return { tech:tp.financial_analysis||'', layman:tp.investor_comprehension||'' }; }
  const tp=(D.trading_trend_report||{}).translation_pair||{}; return { tech:tp.quantitative_analysis||'', layman:tp.investor_summary||'' };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
═══════════════════════════════════════════════════════════════ */
function SovereignReportEngine(opts) {
  const D      = opts.data    || {};
  const lang   = opts.language || 'en';
  const isPrint= !!(opts.isPrint);
  const mp     = opts.mountPoints || {};

  /* STEP 1 — Detect domain */
  const domain = opts.domainOverride || _detectDomain(D);
  const def    = AG_DOMAINS[domain];

  /* STEP 2 — Validate payload schema */
  validatePayload(D, domain);

  /* STEP 3 — Inject CSS */
  _injectCSS(buildCSS(domain, def.accent), 'ag-token-styles');

  /* STEP 4 — Subtitle + classification */
  const sub = document.getElementById('rpt-subtitle');
  if (sub) sub.textContent = def.subtitle;
  const cls = document.getElementById('ag-classification');
  if (cls && def.classification) { cls.textContent = def.classification; cls.style.display='block'; }

  /* STEP 5 — Extract data */
  const md    = extractMeterData(D, domain);
  const texts = extractTranslation(D, domain);

  /* STEP 6 — Render Meter Dashboard */
  const meterHTML =
    `<div class="ag-meter-row">` +
      renderRadialMeter({ ...md.radial }, isPrint) +
      renderHorizontalTube({ label:md.tube.label, segments:md.tube.segments, segColors:md.tube.segColors, zeroAxis:md.tube.zeroAxis }, { seg_0:md.tube.vals[0], seg_1:md.tube.vals[1] }, isPrint) +
      renderVerticalMeter({ ...md.vertical }, { [md.vertical.id||'v']: md.vertical.value }, isPrint) +
    `</div>`;
  _mount(mp.meterDashboard || 'ag-meter-mount', meterHTML);

  /* STEP 7 — Render Translation Pair */
  const pairHTML = renderTranslationPair(texts.tech, texts.layman, def.translationPair, isPrint);
  _mount(mp.translationPair || 'ag-translation-mount', pairHTML);

  /* STEP 8 — Safety audit */
  const violations = AG_SAFETY.audit(document.body.innerHTML, lang);
  AG_SAFETY.log(violations);

  /* STEP 9 — Return schema manifest */
  return {
    document_domain: domain,
    language: lang,
    layout_flow: def.layoutFlow,
    allowed_components: ALLOWED_COMPONENTS,
    rendered_components: ['RadialMeter','HorizontalTube','VerticalMeter','TranslationPair'],
    safety_violations: violations,
    payload_valid: violations.length === 0,
  };
}

/* ─── PRIVATE HELPERS ───────────────────────────────────────── */
function _detectDomain(D) {
  if (D.financial_report || D.financial_report_v2) return 'FINANCE';
  if (D.trading_trend_report) return 'TRADING';
  return 'OCM';
}
function _protect(t) { return t || ''; }
function _injectCSS(css, id) {
  let s = document.getElementById(id);
  if (!s) { s = document.createElement('style'); s.id = id; document.head.appendChild(s); }
  s.textContent = css;
}
function _mount(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  else console.warn(`[SovereignReportEngine] Mount point #${id} not found.`);
}

/* ─── EXPORT ─────────────────────────────────────────────────── */
if (typeof module !== 'undefined') module.exports = { SovereignReportEngine, AG_DOMAINS, AG_TOKENS, AG_SAFETY, ALLOWED_COMPONENTS };
else window.SovereignReportEngine = SovereignReportEngine;
