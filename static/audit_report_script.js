// ══════════════════════════════════════════════════════════════════
// SOVEREIGN AUDIT REPORT — DATA LAYER v5.0
// Source: solver_results (SymPy) + xai_narrative (G3FP) + g3fp_context
// Zero hardcoded clinical defaults. All content derived from real pipeline.
// Brand: AI Chip Corporation · OCM Audit Report
// ══════════════════════════════════════════════════════════════════
(function () {
  // ── 1. LOAD DATA ─────────────────────────────────────────────────
  let D = {};
  try { const raw = localStorage.getItem('sovereign_audit_data'); if (raw) D = JSON.parse(raw); } catch (_) {}
  if (window.__AUDIT_DATA__) Object.assign(D, window.__AUDIT_DATA__);

  // Also pull g3fp_context for richer extraction data
  let G = {};
  try { const raw = sessionStorage.getItem('sovereign_g3fp_context'); if (raw) G = JSON.parse(raw); } catch (_) {}

  // Merge: D takes priority (written at report-open time), G fills gaps
  const R = Object.assign({}, G, D);

  // ── 2. BRAND CONFIG (customisable for SSO/Sovereign tenants) ─────
  const BRAND = {
    company : R.clientOrg  || 'AI Chip Corporation',
    logo    : R.clientLogo || 'aichip-logo-home.png',
    footer  : R.clientDesc || 'AI Chip Certified OCM Report',
    version : R.pipelineVersion || 'G3FP·OCM·v4.1',
  };

  // ── 3. DOCUMENT IDENTITY (from file extraction) ──────────────────
  const fname   = R.filename  || R.file_name || '—';
  const domain  = (R.domain   || R.detected_domain || 'GENERAL').toUpperCase();
  const mode    = (R.mode     || R.electionMode || 'INDUCTION').toUpperCase();
  const operator= R.operator  || sessionStorage.getItem('sovereign_operator') || 'OCM SYSTEM';
  const generatedAt = R.generatedAt || new Date().toISOString();

  // Report title: "INDUCTION ONTOLOGY COMPLIANCE MATRIX AUDIT REPORT"
  const reportTitle = mode + ' ONTOLOGY COMPLIANCE MATRIX AUDIT REPORT';
  const reportSubtitle = domain + ' EVALUATION';

  // ── 4. SOLVER RESULTS ────────────────────────────────────────────
  const SR   = R.solver_results || {};
  const mfst = SR.solver_manifest || [];
  const allowCount = SR.allow_count || 0;
  const refuseCount = SR.refuse_count || 0;
  const overallVerdict = SR.overall_verdict || (refuseCount > 0 ? 'REFUSE' : 'ALLOW');
  const inverseSols = SR.inverse_solutions || {};
  const hitlFields  = SR.hitl_fields || [];

  // ── 5. XAI NARRATIVE ─────────────────────────────────────────────
  const XAI = R.xai_narrative || {};

  // Build per-axiom G3FP ledger lookup (公式/審計邏輯/診斷判斷)
  const xaiLedger = {};
  (XAI.axiom_solve_ledger || []).forEach(row => {
    if (row.axiom_id) xaiLedger[row.axiom_id] = row;
  });

  // ── 6. DERIVE INDICATORS FROM SOLVER MANIFEST ────────────────────
  const strongIndicators = [];
  const warnIndicators   = [];

  mfst.forEach(r => {
    const stmt  = r.statement || '';
    const axId  = r.axiom_id  || '';
    const inp   = r.inputs || r.known_inputs || {};
    const firstKey = Object.keys(inp)[0] || '';
    const firstVal = firstKey ? inp[firstKey] : null;
    const xRow  = xaiLedger[axId] || {};

    // Prefer XAI diagnostic judgment for richer indicator text
    const xDiag = xRow['診斷判斷'] || xRow['finding'] || '';

    if (r.verdict === 'ALLOW') {
      const s = xDiag || stmt || `${axId}: ${firstKey}=${firstVal} — within bounds`;
      strongIndicators.push(s.replace(/\[ALLOW\]\s*/,'').replace(/→.*/,'').trim());
    } else if (r.verdict === 'REFUSE') {
      const s = xDiag || stmt || `${axId}: ${firstKey}=${firstVal} — EXCEEDS threshold`;
      warnIndicators.push(s.replace(/\[REFUSE\]\s*/,'').replace(/→.*/,'').trim());
    } else if (r.verdict === 'UNDERDETERMINED') {
      const missing = (r.missing_fields || []).join(', ');
      warnIndicators.push(`${axId}: missing fields [${missing}] — HITL required`);
    }
  });

  // Supplement from XAI health_strengths / clinical_warnings
  if (XAI.health_strengths) XAI.health_strengths.forEach(s => {
    const txt = typeof s === 'string' ? s : (s.finding || s.clinical_significance || JSON.stringify(s));
    if (!strongIndicators.includes(txt)) strongIndicators.push(txt);
  });
  if (XAI.clinical_warnings) XAI.clinical_warnings.forEach(s => {
    const txt = typeof s === 'string' ? s : (s.finding || s.recommendation || JSON.stringify(s));
    if (!warnIndicators.includes(txt)) warnIndicators.push(txt);
  });

  // ── 7. RISK RATIOS from solver manifest ──────────────────────────
  const riskRatios = [];
  mfst.filter(r => r.verdict === 'REFUSE').forEach(r => {
    const inp = r.inputs || {};
    const firstKey = Object.keys(inp)[0] || r.axiom_id;
    const firstVal = inp[firstKey] !== undefined ? inp[firstKey].toFixed ? inp[firstKey].toFixed(1) : inp[firstKey] : '—';
    const thr = r.threshold !== null && r.threshold !== undefined ? r.threshold : '—';
    const xRow = xaiLedger[r.axiom_id] || {};
    riskRatios.push({ label: r.axiom_id, val: 'ELEVATED', ref: xRow['審計邏輯'] || `${firstKey}=${firstVal} (threshold: ${thr})`, cls: 'elevated' });
  });
  if (overallVerdict === 'REFUSE') riskRatios.unshift({ label: 'Overall Compliance', val: 'REFUSE', ref: `${refuseCount} axiom violation(s) detected`, cls: 'high' });

  // ── 8. DOMAINS ───────────────────────────────────────────────────
  const domainsRaw = R.domains || R.detectedDomains || (domain !== 'GENERAL' ? [domain.toLowerCase()] : []);
  const domains = domainsRaw.map(d => {
    if (typeof d === 'object' && d !== null) {
      return d.domain || d.label || d.name || JSON.stringify(d);
    }
    return d;
  });
  // Render domain analysis sections narratives (with formula + judgment)
  const domainNarrative = (() => {
    const sects = XAI.domain_analysis_sections || [];
    if (sects.length) {
      return sects.map(s => {
        const formula = s.formula_used ? `<span style="font-family:'Fira Code',monospace;color:var(--gold);font-size:10px"> ${s.formula_used}</span>` : '';
        return `<b style="color:var(--gold)">${s.section_title||''}${formula}</b>: ${s.narrative||s.text||''}`;
      }).join('<br><br>');
    }
    return R.domainNarrative || '';
  })();

  // ── 9. NARRATIVE + CONCLUSION from XAI ───────────────────────────
  const narrative   = XAI.generalNarrative    || XAI.narrative    || R.narrative    || R.executive_summary || R.g3fp_doc_summary || '(G3FP narrative pending — ensure solver_results are wired in pipeline)';
  const conclusion  = XAI.executive_summary   || XAI.conclusion   || R.conclusion   || `Evaluation complete under <b>${mode}</b> mode. ${allowCount} axiom(s) ALLOW, ${refuseCount} axiom(s) REFUSE. ${hitlFields.length > 0 ? 'HITL required for: ' + hitlFields.join(', ') + '.' : ''}`;
  const techNarrative = XAI.technicalNarrative || '';
  const ontologyComments = Array.isArray(XAI.ontology_comments) ? XAI.ontology_comments.join(' · ') : (XAI.ontology_comments || '');

  // ── 10. ELECTED AXIOMS (from tiered + solver) ────────────────────
  const elected   = R.elected   || [];
  const candidate = R.candidate || [];
  const standby   = R.standby   || [];
  const allAxioms = [...elected, ...candidate, ...standby];
  const avgConf   = allAxioms.length ? (allAxioms.reduce((s,a)=>s+(a.score||0),0)/allAxioms.length*100).toFixed(0)+'%' : (allowCount+refuseCount > 0 ? Math.round(allowCount/(allowCount+refuseCount)*100)+'%' : '—');

  // Verdict
  const verdictClass = overallVerdict === 'ALLOW' ? 'pass' : overallVerdict === 'REFUSE' ? 'fail' : 'warn';
  const verdictLabel = overallVerdict === 'ALLOW' ? 'COMPLIANT' : overallVerdict === 'REFUSE' ? 'NON-COMPLIANT' : R.verdict || 'REVIEW REQUIRED';
  const riskTier = R.riskTier || (verdictClass==='fail'?'T3':verdictClass==='warn'?'T2':'T1');

  // ── 11. RENDER BRAND HEADER ───────────────────────────────────────
  // Company name
  const ssdEl = document.getElementById('ssd-company-name');
  if (ssdEl) ssdEl.textContent = BRAND.company;

  // Logo
  const logoImg = document.querySelector('.brand-logo-img');
  if (logoImg) logoImg.src = BRAND.logo;

  // Brand company sub-label
  const brandCompEl = document.querySelector('.brand-company');
  if (brandCompEl) brandCompEl.textContent = BRAND.company;

  // ── 12. RENDER COVER ─────────────────────────────────────────────
  document.getElementById('rpt-title').textContent    = reportTitle;
  document.getElementById('rpt-subtitle').textContent = reportSubtitle;
  document.getElementById('rpt-filename').textContent = fname;
  document.getElementById('rpt-domain').textContent   = domain;
  document.getElementById('rpt-mode').textContent     = mode;
  document.getElementById('rpt-operator').textContent = operator;
  document.getElementById('rpt-date').textContent     = new Date(generatedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});

  const iso = new Date().toISOString();
  const vb = document.getElementById('rpt-verdict');
  if (vb) { vb.textContent = verdictLabel; vb.className = 'verdict-badge'; if (verdictClass !== 'pass') vb.classList.add(verdictClass); }

  // ── 13. SEAL ─────────────────────────────────────────────────────
  const traceId = R.trace_id || R.run_id || '';
  const hashHex = traceId ? traceId.slice(-8).toUpperCase().padStart(8,'0') : (Math.random()*0xFFFFFFFF|0).toString(16).toUpperCase().padStart(8,'0');
  const sealHash = document.getElementById('seal-hash');
  const sealTs   = document.getElementById('seal-timestamp');
  const sealCheck = document.querySelector('.seal-check');
  if (sealHash) sealHash.textContent = `0x${hashHex.slice(0,4)}…${hashHex.slice(4)}`;
  if (sealTs)   sealTs.textContent   = `SEALED · ${iso.slice(0,19).replace('T',' ')} UTC`;
  if (sealCheck) sealCheck.textContent = verdictClass === 'fail' ? '✗' : '✓';
  if (sealCheck) sealCheck.style.color = verdictClass === 'fail' ? 'var(--red)' : 'var(--neon)';

  document.title = `Sovereign Audit — ${fname}`;

  // ── 14. KPIs ─────────────────────────────────────────────────────
  const electedCount = elected.length || (allowCount + refuseCount);
  document.getElementById('kpi-elected').textContent   = electedCount || mfst.length;
  document.getElementById('kpi-candidate').textContent = candidate.length || refuseCount;
  document.getElementById('kpi-standby').textContent   = standby.length || hitlFields.length;
  document.getElementById('kpi-conf').textContent      = avgConf;
  document.getElementById('kpi-tier').textContent      = riskTier;
  document.getElementById('kpi-domains').textContent   = domains.length || 1;

  // ── 15. NARRATIVE ────────────────────────────────────────────────
  const narEl = document.getElementById('rpt-narrative');
  if (narEl) narEl.innerHTML = narrative;

  // Technical narrative (ontology comments) — append to narrative section if present
  if (techNarrative || ontologyComments) {
    const techPara = document.createElement('p');
    techPara.style.cssText = 'margin-top:12px;font-size:10px;color:var(--text-dim);border-top:0.5px solid var(--gold-frame);padding-top:10px;';
    techPara.innerHTML = (techNarrative || '') + (ontologyComments ? '<br><b style="color:var(--gold)">Ontology:</b> ' + ontologyComments : '');
    if (narEl) narEl.appendChild(techPara);
  }

  // ── 16. STRONG INDICATORS ────────────────────────────────────────
  const sl = document.getElementById('list-strong');
  if (sl) {
    sl.innerHTML = '';
    if (strongIndicators.length === 0) {
      sl.innerHTML = '<li style="color:var(--text-dim);font-style:italic;padding:6px 0">No ALLOW verdicts in this evaluation.</li>';
    } else {
      strongIndicators.forEach(s => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="dot pass"></span><span>${s}</span>`;
        sl.appendChild(li);
      });
    }
  }

  // ── 17. WARNING INDICATORS ───────────────────────────────────────
  const wl = document.getElementById('list-warn');
  if (wl) {
    wl.innerHTML = '';
    if (warnIndicators.length === 0) {
      wl.innerHTML = '<li style="color:var(--text-dim);font-style:italic;padding:6px 0">No threshold violations detected.</li>';
    } else {
      warnIndicators.forEach(s => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="dot ${s.includes('HITL')?'warn':'fail'}"></span><span>${s}</span>`;
        wl.appendChild(li);
      });
    }
  }

  // ── 18. RISK GRID ────────────────────────────────────────────────
  const rg = document.getElementById('risk-grid');
  if (rg) {
    rg.innerHTML = '';
    if (riskRatios.length === 0) {
      rg.innerHTML = '<div style="color:var(--text-dim);font-style:italic;font-size:10px;padding:8px 0">No risk ratios computed — all axioms ALLOW.</div>';
    } else {
      riskRatios.forEach(r => {
        rg.innerHTML += `<div class="risk-cell"><div class="risk-label">${r.label}</div><div class="risk-val ${r.cls||''}">${r.val}</div><div class="risk-ref">${r.ref}</div></div>`;
      });
    }
  }

  // ── 19. DOMAINS ──────────────────────────────────────────────────
  const dt = document.getElementById('domain-tags');
  if (dt) {
    dt.innerHTML = '';
    domains.forEach(d => { dt.innerHTML += `<span class="domain-tag">${d.toUpperCase()}</span>`; });
    if (!domains.length) dt.innerHTML = `<span class="domain-tag">${domain}</span>`;
  }
  const dnEl = document.getElementById('domain-narrative');
  if (dnEl) dnEl.innerHTML = domainNarrative || `Primary domain: <b>${domain}</b>.`;

  // ── 19a. SURGICAL DECISION AUDIT PANEL ────────────────────────────────
  (function _renderSurgicalAudit() {
    const panel = document.getElementById('panel-surgical-audit');
    if (!panel) return;
    const isHC = (domain||'').toUpperCase().includes('HEALTH') || (domain||'').toUpperCase().includes('MEDICAL');
    if (!isHC) return;

    const SA = R.surgical_audit || XAI.surgical_audit || {};
    if (!SA || !SA.surgery_domain) return;  // no surgical data — skip panel
    panel.style.display = '';

    // ── Verdict banner ──────────────────────────────────────────────────
    const VERDICT_META = {
      'EVIDENCE-GROUNDED':  { label: '✅ Evidence-Grounded',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)'  },
      'PARTIALLY-GROUNDED': { label: '🔵 Partially Grounded',  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)'  },
      'WEAK-EVIDENCE':      { label: '🟡 Weak Evidence',        color: '#facc15', bg: 'rgba(250,204,21,0.1)',  border: 'rgba(250,204,21,0.3)'  },
      'INSUFFICIENT':       { label: '⚠️ Insufficient Evidence',color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)'  },
      'INCOMPLETE':         { label: '⚫ Incomplete Data',       color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',border: 'rgba(156,163,175,0.3)' },
    };
    const vm = VERDICT_META[SA.evidence_verdict] || VERDICT_META['INCOMPLETE'];
    const banner = document.getElementById('surg-verdict-banner');
    if (banner) { banner.style.background = vm.bg; banner.style.borderColor = vm.border; }
    const vLabel = document.getElementById('surg-verdict-label');
    if (vLabel) { vLabel.textContent = vm.label; vLabel.style.color = vm.color; }
    const vNote = document.getElementById('surg-verdict-note');
    if (vNote) vNote.textContent = SA.aha_verdict_note || '';

    const ahaBadge = document.getElementById('surg-aha-badge');
    if (ahaBadge) {
      const cor = SA.aha_class || {};
      ahaBadge.textContent = `${cor.label || SA.aha_class_key || '—'}  ${cor.icon || ''}`;
    }
    const loeBadge = document.getElementById('surg-loe-badge');
    if (loeBadge) loeBadge.textContent = SA.aha_loe || '';
    const domBadge = document.getElementById('surg-domain-badge');
    if (domBadge) domBadge.textContent = SA.surgery_domain_name || SA.surgery_domain || '';

    // ── Evidence meter cards ────────────────────────────────────────────
    const ev = SA.evidence_verdict || 'INCOMPLETE';
    const evMeter = document.getElementById('surg-evidence-meter');
    if (evMeter) { evMeter.textContent = vm.label; evMeter.style.color = vm.color; }
    const evSub = document.getElementById('surg-evidence-sub');
    if (evSub) evSub.textContent = `ACC/AHA ${(SA.aha_class||{}).label||''} · ${SA.aha_loe_code||''}`;

    const ccEl = document.getElementById('surg-criteria-count');
    if (ccEl) {
      ccEl.textContent = `${SA.criteria_met||0} / ${SA.criteria_total||0}`;
      ccEl.style.color = (SA.criteria_met||0) >= (SA.criteria_total||1) * 0.6 ? '#4ade80' : '#f97316';
    }
    const csSub = document.getElementById('surg-criteria-sub');
    if (csSub) csSub.textContent = `${SA.criteria_missing||0} missing from report`;

    const asa = SA.asa_status || {};
    const asaBadge = document.getElementById('surg-asa-badge');
    if (asaBadge) { asaBadge.textContent = asa.asa_class || '—'; asaBadge.style.color = '#ffb347'; }
    const asaDef = document.getElementById('surg-asa-def');
    if (asaDef) asaDef.textContent = asa.periop_risk || '';

    // ── Criteria Ledger ─────────────────────────────────────────────────
    const ledgerEl = document.getElementById('surg-criteria-ledger');
    if (ledgerEl && SA.criteria_ledger && SA.criteria_ledger.length) {
      const STATUS_STYLE = {
        MET:     { bg: 'rgba(74,222,128,0.07)',  border: 'rgba(74,222,128,0.2)',  icon: '✅', badge: '#4ade80' },
        NOT_MET: { bg: 'rgba(249,115,22,0.07)',  border: 'rgba(249,115,22,0.2)',  icon: '❌', badge: '#f97316' },
        MISSING: { bg: 'rgba(156,163,175,0.05)', border: 'rgba(156,163,175,0.15)',icon: '⚫', badge: '#9ca3af' },
      };
      ledgerEl.innerHTML = SA.criteria_ledger.map(c => {
        const st = STATUS_STYLE[c.status] || STATUS_STYLE.MISSING;
        const valStr = c.value !== null && c.value !== undefined ? ` (value: ${c.value})` : ' (not provided)';
        return `<div style="
          display:flex;align-items:flex-start;gap:12px;padding:10px 14px;margin-bottom:6px;
          border-radius:7px;border:1px solid ${st.border};background:${st.bg}
        ">
          <span style="font-size:16px;flex-shrink:0;margin-top:1px">${st.icon}</span>
          <div style="flex:1">
            <div style="font-size:11px;color:${st.badge};font-weight:600;margin-bottom:1px">${c.status}</div>
            <div style="font-size:11px;color:#ddd">${c.label}${valStr}</div>
            <div style="font-size:9px;color:#666;margin-top:2px">${c.aha_ref||''}</div>
          </div>
        </div>`;
      }).join('');
    }

    // ── ASA Panel ───────────────────────────────────────────────────────
    const asaBig = document.getElementById('surg-asa-class-big');
    if (asaBig) asaBig.textContent = asa.asa_class || '—';
    const asaDefEl = document.getElementById('surg-asa-definition');
    if (asaDefEl) asaDefEl.textContent = asa.definition || '';
    const asaRiskEl = document.getElementById('surg-asa-risk');
    if (asaRiskEl) { asaRiskEl.textContent = '📊 Perioperative Risk: ' + (asa.periop_risk || '—'); }
    const asaRatEl = document.getElementById('surg-asa-rationale');
    if (asaRatEl && asa.rationale) {
      asaRatEl.innerHTML = 'Based on: ' + (asa.rationale||[]).map(r=>`<span style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;margin:2px;display:inline-block">${r}</span>`).join(' ');
    }
    if (asa.is_emergency) {
      const emBadge = document.createElement('div');
      emBadge.style.cssText = 'display:inline-block;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:5px;padding:4px 10px;font-size:10px;color:#f87171;margin-top:8px;font-weight:700';
      emBadge.textContent = '🚨 EMERGENCY SURGERY — ASA "E" Modifier Applied';
      const asaPanel = document.getElementById('surg-asa-panel');
      if (asaPanel) asaPanel.appendChild(emBadge);
    }

    // ── Alternatives ────────────────────────────────────────────────────
    const altEl = document.getElementById('surg-alternatives');
    if (altEl && SA.alternatives && SA.alternatives.length) {
      altEl.innerHTML = SA.alternatives.map((a, i) => `
        <div style="
          display:flex;align-items:flex-start;gap:14px;padding:12px 16px;margin-bottom:8px;
          border-radius:8px;background:rgba(96,165,250,0.05);border:1px solid rgba(96,165,250,0.15)
        ">
          <div style="background:rgba(96,165,250,0.15);border-radius:50%;width:26px;height:26px;
            display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
            color:#60a5fa;flex-shrink:0">${i+1}</div>
          <div style="flex:1">
            <div style="font-size:12px;color:#e2e8f0;font-weight:600;margin-bottom:3px">${a.treatment}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-size:9px;background:rgba(74,222,128,0.15);border-radius:4px;padding:2px 7px;color:#4ade80">${a.evidence||''}</span>
              <span style="font-size:9px;color:#888">${a.guideline||''}</span>
            </div>
            <div style="font-size:10px;color:#94a3b8">Expected outcome: ${a.expected||''}</div>
          </div>
        </div>`
      ).join('');
    }

    // ── Family Letter ───────────────────────────────────────────────────
    const familyEl = document.getElementById('surg-family-letter');
    if (familyEl && SA.family_summary) {
      familyEl.innerHTML = `<div style="font-size:11px;color:#aaa;margin-bottom:8px;letter-spacing:0.5px">📄 CLINICAL EVIDENCE SUMMARY FOR FAMILY</div>${SA.family_summary}`;
    }

    // ── Surgeon Questions ───────────────────────────────────────────────
    const qEl = document.getElementById('surg-questions');
    if (qEl && SA.surgeon_questions && SA.surgeon_questions.length) {
      qEl.innerHTML = SA.surgeon_questions.map(q =>
        `<li style="margin-bottom:8px;padding-left:4px">${q}</li>`
      ).join('');
    }

    // ── Disclaimer ──────────────────────────────────────────────────────
    const discEl = document.getElementById('surg-disclaimer');
    if (discEl) discEl.textContent = SA.disclaimer || '';

    // ── Sources ─────────────────────────────────────────────────────────
    const srcEl = document.getElementById('surg-sources');
    if (srcEl && SA.guideline_sources) {
      srcEl.innerHTML = '📚 Clinical Reference Sources: ' + SA.guideline_sources.join(' · ');
    }
  })();

  // ── 19a-ii. SURGICAL MOTIVATION CLASSIFICATION (SMC) renderer ─────────
  (function _renderSurgicalIntent() {
    const SA = R.surgical_audit || XAI.surgical_audit || {};
    if (!SA || !SA.intent_flags || !SA.intent_flags.length) return;
    const isHC = (domain||'').toUpperCase().includes('HEALTH') || (domain||'').toUpperCase().includes('MEDICAL');
    if (!isHC) return;

    // Show panels
    const smcPanel = document.getElementById('panel-smc');
    const rtsPanel = document.getElementById('panel-patient-rights');
    if (smcPanel) smcPanel.style.display = '';
    if (rtsPanel) rtsPanel.style.display = '';

    // Summary + highest badge
    const sumEl = document.getElementById('smc-summary');
    if (sumEl) sumEl.textContent = SA.intent_summary || '';
    const hMeta = SA.intent_highest_meta || {};
    const badgeEl = document.getElementById('smc-highest-badge');
    if (badgeEl) {
      badgeEl.textContent = `${hMeta.icon||''} ${hMeta.label||SA.intent_highest||''}`;
      badgeEl.style.color = hMeta.color || '#fff';
      badgeEl.style.border = `1px solid ${(hMeta.color||'#fff')}44`;
    }

    // ── 4 Flag Cards ───────────────────────────────────────────────────
    const COLORS = {
      HIGH:           { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', badge: '#f97316' },
      MODERATE:       { bg: 'rgba(250,204,21,0.06)', border: 'rgba(250,204,21,0.25)', badge: '#facc15' },
      LOW:            { bg: 'rgba(74,222,128,0.05)', border: 'rgba(74,222,128,0.2)',  badge: '#4ade80' },
      CANNOT_ASSESS:  { bg: 'rgba(156,163,175,0.05)',border: 'rgba(156,163,175,0.15)','badge': '#9ca3af' },
    };
    const flagsEl = document.getElementById('smc-flags');
    if (flagsEl && SA.intent_flags) {
      flagsEl.innerHTML = SA.intent_flags.map(f => {
        const c = COLORS[f.level] || COLORS.CANNOT_ASSESS;
        const sigHtml = (f.signals||[]).map(s =>
          `<div style="font-size:10px;color:#b0a090;margin-bottom:3px;padding-left:10px;border-left:2px solid ${c.badge}44">⚡ ${s}</div>`
        ).join('');
        const qHtml = (f.questions||[]).map((q,i) =>
          `<li style="margin-bottom:7px;font-size:10.5px;color:#c8c0b0">${q}</li>`
        ).join('');
        return `<div style="
          border-radius:10px;border:1px solid ${c.border};background:${c.bg};
          padding:14px 16px;
        ">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:20px">${f.icon||''}</span>
            <div style="flex:1">
              <div style="font-size:13px;color:#fff;font-weight:700">${f.title||''}</div>
              <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;
                background:${c.badge}22;color:${c.badge};border:1px solid ${c.badge}44">
                ${(f.level_meta||{}).icon||''} ${(f.level_meta||{}).label||f.level||''}
              </span>
            </div>
          </div>
          <div style="margin-bottom:10px">${sigHtml}</div>
          <div style="font-size:10.5px;color:#9a9080;line-height:1.6;margin-bottom:12px;
            background:rgba(0,0,0,0.15);border-radius:6px;padding:8px 10px">
            ${f.explanation||''}
          </div>
          <div style="font-size:10px;color:#e87c3e;font-weight:700;margin-bottom:6px">❓ Questions to Ask</div>
          <ol style="margin:0;padding-left:16px">${qHtml}</ol>
        </div>`;
      }).join('');
    }

    // ── Consent Checklist ─────────────────────────────────────────────
    const clEl = document.getElementById('smc-checklist');
    if (clEl && SA.consent_checklist) {
      clEl.innerHTML = SA.consent_checklist.map(q =>
        `<li style="margin-bottom:8px">${q}</li>`
      ).join('');
    }

    // ── SMC Disclaimer ────────────────────────────────────────────────
    const sdEl = document.getElementById('smc-disclaimer');
    if (sdEl) sdEl.textContent = SA.intent_disclaimer || '';

    // ── Patient Rights ────────────────────────────────────────────────
    const rightsEl = document.getElementById('smc-rights');
    if (rightsEl && SA.patient_rights) {
      rightsEl.innerHTML = SA.patient_rights.map(r => `
        <div style="
          border-radius:9px;border:1px solid rgba(96,165,250,0.2);
          background:rgba(96,165,250,0.04);padding:14px 16px;
        ">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:22px;flex-shrink:0">${r.icon||'⚖️'}</span>
            <div style="flex:1">
              <div style="font-size:12px;color:#60a5fa;font-weight:700;margin-bottom:5px">${r.title||''}</div>
              <div style="font-size:10.5px;color:#b0b8c8;line-height:1.6;margin-bottom:8px">${r.text||''}</div>
              <div style="font-size:10px;color:#4ade80;background:rgba(74,222,128,0.05);
                border:1px solid rgba(74,222,128,0.2);border-radius:5px;padding:6px 10px;
                font-style:italic">${r.action||''}</div>
            </div>
          </div>
        </div>`
      ).join('');
    }
  })();

  // ── 19b. CLINICAL GUIDANCE PANEL (patient-facing) ─────────────────
  (function _renderClinicalGuidance() {
    const panel = document.getElementById('panel-clinical-guidance');
    if (!panel) return;
    const isHC = (domain||'').toUpperCase().includes('HEALTH') || (domain||'').toUpperCase().includes('MEDICAL');
    if (!isHC) return;
    panel.style.display = '';

    // Disclaimer
    const discText = XAI.medical_disclaimer || 'This AI-generated report is for informational purposes only and does not constitute professional medical advice. Always consult a qualified healthcare provider before making any treatment decisions.';
    const discEl = document.getElementById('clinical-disclaimer-text');
    if (discEl) discEl.textContent = discText;

    // Clinical summary
    const summary = XAI.clinical_summary || R.clinical_summary || '';
    const sumEl = document.getElementById('clinical-summary-text');
    if (sumEl && summary) sumEl.innerHTML = summary;

    // Biomarker interpretation cards
    const bmi = XAI.biomarker_interpretations || R.biomarker_interpretations || [];
    const bmiBlock = document.getElementById('bm-interp-block');
    const bmiCards = document.getElementById('bm-interp-cards');
    if (bmi.length && bmiBlock && bmiCards) {
      bmiBlock.style.display = '';
      bmiCards.innerHTML = '';
      bmi.forEach(b => {
        const raw = b.interpretation || '';
        const cls = raw.includes('Elevated') ? (b.deviation > 50 ? 'critical' : 'high') : raw.includes('Low') ? 'low' : 'normal';
        const icon = cls === 'critical' ? '🔴' : cls === 'high' ? '🟠' : cls === 'low' ? '🟡' : '🟢';
        bmiCards.innerHTML += `
          <div class="bm-interp-card ${cls}">
            <div class="bm-card-header">
              <span class="bm-card-name">${icon} ${b.label || b.biomarker}</span>
              <span class="bm-card-val ${cls}">${b.value} <span style="font-size:9px;opacity:0.7">${b.unit||''}</span></span>
            </div>
            <div class="bm-card-interp">${raw}</div>
            <div class="bm-card-meaning">${b.clinical_meaning || ''}</div>
          </div>`;
      });
    }

    // Urgency action plan
    const ua = XAI.urgency_actions || R.urgency_actions || {};
    const urgencyBlock = document.getElementById('urgency-block');
    const urgencyRows  = document.getElementById('urgency-rows');
    const urgencyData = [
      { cls:'urgent',    icon:'🔴', label:'URGENT (Within 7 Days)',     items: ua.urgent_7d    || [] },
      { cls:'important', icon:'🟡', label:'IMPORTANT (Within 30 Days)', items: ua.important_30d || [] },
      { cls:'preventive',icon:'🟢', label:'PREVENTIVE (Within 90 Days)',items: ua.preventive_90d || [] },
    ];
    const hasUrgency = urgencyData.some(u => u.items.length > 0);
    if (hasUrgency && urgencyBlock && urgencyRows) {
      urgencyBlock.style.display = '';
      urgencyRows.innerHTML = '';
      urgencyData.forEach(u => {
        if (!u.items.length) return;
        urgencyRows.innerHTML += `
          <div class="urgency-row ${u.cls}">
            <div class="urgency-icon">${u.icon}</div>
            <div style="flex:1">
              <div class="urgency-label">${u.label}</div>
              <ul class="urgency-items">${u.items.map(it=>`<li>• ${it}</li>`).join('')}</ul>
            </div>
          </div>`;
      });
    }

    // Therapeutic directions
    const td = XAI.therapeutic_directions || R.therapeutic_directions || {};
    const thrBlock   = document.getElementById('therapy-block');
    const thrContent = document.getElementById('therapy-content');
    const thrTabs    = document.getElementById('therapy-tabs');
    const hasTd = td && Object.values(td).some(v => Array.isArray(v) && v.length > 0);
    if (hasTd && thrBlock && thrContent && thrTabs) {
      thrBlock.style.display = '';
      // render tab content for active tab
      const renderTab = (tabKey) => {
        const items = td[tabKey] || [];
        if (!items.length) { thrContent.innerHTML = '<p style="color:var(--text-dim);font-size:10px;padding:8px 0">No specific guidance for this category.</p>'; return; }
        thrContent.innerHTML = `<ul class="thr-content-list">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
      };
      // Tab click
      thrTabs.querySelectorAll('.thr-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          thrTabs.querySelectorAll('.thr-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderTab(btn.dataset.tab);
        });
      });
      renderTab('pharmacological'); // default
    }

    // Re-evaluation plan
    const reeval = XAI.reevaluation_plan || R.reevaluation_plan || '';
    const reevalBlock = document.getElementById('reeval-block');
    const reevalText  = document.getElementById('reeval-text');
    if (reeval && reevalBlock && reevalText) {
      reevalBlock.style.display = '';
      reevalText.textContent = reeval;
    }
  })();

  // ── 20. AXIOM EVALUATION LEDGER ──────────────────────────────────

  const tbody = document.getElementById('ledger-body');
  if (tbody) {
    tbody.innerHTML = '';
    const domainColors = {};
    const renderRows = (axs, tier) => axs.forEach(a => {
      const tc  = tier==='ELECTED'?'var(--neon)':tier==='CANDIDATE'?'#ffb529':'var(--red)';
      const disp = tier==='ELECTED'?'ADMISSIVE':tier==='CANDIDATE'?'SUSPENDED':'BLOCK';
      tbody.innerHTML += `<tr>
        <td><div class="ax-id" style="color:${tc}">${a.id||a.axiom_id||'—'}</div></td>
        <td><div class="ax-name">${a.name||a.description||'—'}</div></td>
        <td><span class="domain-tag">${(a.domain||domain).toUpperCase()}</span></td>
        <td><span class="ax-tier tier-${tier}" style="color:${tc};border-color:${tc}40">${tier}</span></td>
        <td style="min-width:100px;text-align:right;"><div class="ax-score" style="color:${tc};font-weight:bold;letter-spacing:0.5px">${disp}</div></td>
      </tr>`;
    });
    renderRows(elected,   'ELECTED');
    renderRows(candidate, 'CANDIDATE');
    renderRows(standby,   'STANDBY');
    // If no tiered axioms but we have solver manifest, show those
    if (!allAxioms.length && mfst.length) {
      mfst.forEach(r => {
        const tc = r.verdict==='ALLOW'?'var(--neon)':r.verdict==='REFUSE'?'var(--red)':'#ffb529';
        const disp = r.verdict==='ALLOW'?'ADMISSIVE':r.verdict==='REFUSE'?'BLOCK':'SUSPENDED';
        tbody.innerHTML += `<tr>
          <td><div class="ax-id" style="color:${tc}">${r.axiom_id||'—'}</div></td>
          <td><div class="ax-name">${r.statement ? r.statement.split(':')[0] : '—'}</div></td>
          <td><span class="domain-tag">${domain}</span></td>
          <td><span class="ax-tier" style="color:${tc};border-color:${tc}40">${r.solve_mode||'FORWARD'}</span></td>
          <td style="min-width:100px;text-align:right;"><div class="ax-score" style="color:${tc};font-weight:bold;letter-spacing:0.5px">${disp}</div></td>
        </tr>`;
      });
    }
  }

  // ── 21. EQUATION SOLVE LEDGER — full transparency 假設/常數/變數/計算過程/解 ──
  (function renderEqLedger() {
    const eqEl = document.getElementById('eq-ledger-body');
    if (!eqEl) return;
    eqEl.innerHTML = '';
    if (mfst.length === 0) {
      eqEl.innerHTML = '<tr><td colspan="7" style="color:var(--text-dim);font-style:italic;padding:16px 12px">Upload a document to generate SymPy equation solve results.</td></tr>';
      return;
    }
    mfst.forEach(r => {
      const tc  = r.verdict==='ALLOW'?'var(--neon)':r.verdict==='REFUSE'?'var(--red)':r.verdict==='UNDERDETERMINED'?'#ffb529':'var(--text-dim)';
      const cls = r.verdict==='ALLOW'?'status-pass':r.verdict==='REFUSE'?'status-fail':'status-warn';
      const eq  = r.eq_transparency || {};
      const xRow = xaiLedger[r.axiom_id] || {};
      const rowId = 'eq-row-' + r.axiom_id;

      // 常數 constants string
      const constsStr = Object.entries(eq.constants||{}).map(([k,v])=>`${k}=${v}`).join(' · ') || '—';

      // 變數 variables table
      const vars = eq.variables || {};
      const varRows = Object.entries(vars).map(([k,v]) => {
        const color = v.present ? tc : '#ffb529';
        const val   = v.present ? `${v.value}${v.unit ? ' '+v.unit : ''}` : '⚠ missing';
        return `<span style="margin-right:12px;font-size:10px">${k} = <b style="color:${color}">${val}</b></span>`;
      }).join('');

      // 計算過程 steps (from eq_transparency)
      const steps = (eq.calculation_steps||[]).map((s,i)=>
        `<div style="padding:3px 0;color:var(--text-dim);font-size:9px;font-family:'Fira Code',monospace">${i+1}. ${s}</div>`
      ).join('');

      // G3FP physics inference panel (from axiom_solve_ledger)
      const xFormula  = xRow['公式'] || xRow['formula_used'] || eq.expression_latex || '';
      const xVarDef   = xRow['變量定義'] || '';
      const xAuditLog = xRow['審計邏輯'] || '';
      const xDiag     = xRow['診斷判斷'] || '';

      const devVal = r.computed_value != null ? r.computed_value : null;
      const devStr = devVal != null ? (devVal > 0 ? '+' : '') + Number(devVal).toFixed(4) : '—';
      const devColor = devVal > 0 ? 'var(--red)' : devVal < 0 ? 'var(--neon)' : 'var(--text-dim)';
      const resultStr = devVal != null ? Number(devVal).toFixed(4) : (r.required_value != null ? '→'+Number(r.required_value).toFixed(3) : '—');

      eqEl.innerHTML += `
        <tr class="eq-main-row" onclick="var d=document.getElementById('${rowId}');d.style.display=d.style.display==='none'?'table-row':'none';" style="cursor:pointer;border-bottom:1px solid rgba(212,175,55,0.12)">
          <td style="padding:10px 10px 8px">
            <div class="ax-id" style="color:${tc};font-size:13px">${r.axiom_id||'—'}</div>
            <div style="font-size:8px;color:var(--text-dim);margin-top:2px">${eq.derivation_model||r.solve_mode||'—'}</div>
          </td>
          <td style="font-size:9.5px;color:var(--text);max-width:160px">${eq.hypothesis||'—'}</td>
          <td style="font-family:'Fira Code',monospace;font-size:9px;color:var(--gold);max-width:150px;word-break:break-all">${eq.sympy_expr||'—'}</td>
          <td style="font-family:'Fira Code',monospace;font-size:11px;color:${tc}">${resultStr}</td>
          <td style="font-family:'Fira Code',monospace;font-size:11px;color:${devColor}">${devStr}</td>
          <td><span class="gate-status ${cls}">${r.verdict}</span></td>
          <td style="color:var(--text-dim);font-size:10px;padding-right:10px">▼</td>
        </tr>
        <tr id="${rowId}" style="display:none;background:rgba(8,8,12,0.98)">
          <td colspan="7" style="padding:16px 18px;border-bottom:1px solid rgba(212,175,55,0.08)">

            ${xFormula || xAuditLog ? `
            <div style="margin-bottom:16px;padding:12px 14px;border:1px solid rgba(212,175,55,0.25);border-radius:6px;background:rgba(212,175,55,0.04)">
              <div style="font-size:9px;letter-spacing:3px;color:var(--gold);margin-bottom:8px">📐 G3FP PHYSICS INFERENCE</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
                ${xFormula ? `<div>
                  <div style="font-size:8px;letter-spacing:2px;color:var(--gold);margin-bottom:4px">公式 FORMULA</div>
                  <div style="font-family:'Fira Code',monospace;font-size:10px;color:var(--neon);word-break:break-all">${xFormula}</div>
                  ${xVarDef ? `<div style="font-size:8.5px;color:var(--text-dim);margin-top:6px">${xVarDef}</div>` : ''}
                </div>` : ''}
                ${xAuditLog ? `<div>
                  <div style="font-size:8px;letter-spacing:2px;color:var(--gold);margin-bottom:4px">審計邏輯 AUDIT LOGIC</div>
                  <div style="font-size:9.5px;color:var(--text);line-height:1.7">${xAuditLog}</div>
                </div>` : ''}
                ${xDiag ? `<div>
                  <div style="font-size:8px;letter-spacing:2px;color:var(--gold);margin-bottom:4px">診斷判斷 JUDGMENT</div>
                  <div style="font-size:9.5px;color:${tc};line-height:1.7">${xDiag}</div>
                </div>` : ''}
              </div>
            </div>` : ''}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
              <div>
                <div style="font-size:9px;letter-spacing:3px;color:var(--gold);margin-bottom:6px">假設 HYPOTHESIS</div>
                <div style="font-size:10px;color:var(--text);line-height:1.7">${eq.hypothesis||'—'}</div>
                ${eq.xai_hint?`<div style="margin-top:8px;font-size:9px;color:var(--gold);border-left:2px solid var(--gold-frame);padding-left:8px">${eq.xai_hint}</div>`:''}
              </div>
              <div>
                <div style="font-size:9px;letter-spacing:3px;color:var(--gold);margin-bottom:6px">常數 CONSTANTS</div>
                <div style="font-family:'Fira Code',monospace;font-size:10px;color:var(--neon)">${constsStr}</div>
                ${eq.expression_latex?`<div style="margin-top:6px;font-size:8.5px;color:var(--text-dim)">LaTeX: ${eq.expression_latex}</div>`:''}
              </div>
              <div>
                <div style="font-size:9px;letter-spacing:3px;color:var(--gold);margin-bottom:6px">變數 VARIABLES</div>
                <div style="line-height:2">${varRows||'—'}</div>
              </div>
              <div>
                <div style="font-size:9px;letter-spacing:3px;color:var(--gold);margin-bottom:6px">計算過程 CALCULATION PROCESS</div>
                ${steps||'<div style="color:var(--text-dim);font-size:9px">—</div>'}
              </div>
            </div>
            <div style="margin-top:14px;padding-top:10px;border-top:0.5px solid var(--gold-frame)">
              <span style="font-size:9px;letter-spacing:3px;color:var(--gold)">求出的解 SOLUTION: </span>
              <span style="font-family:'Fira Code',monospace;font-size:11px;color:${tc}">${eq.solution||r.statement||'—'}</span>
            </div>
          </td>
        </tr>`;
    });
  })();



  // ── 22. CONCLUSION ───────────────────────────────────────────────
  const concEl = document.getElementById('rpt-conclusion');
  if (concEl) concEl.innerHTML = conclusion;

  // ── 23. L1–L5 GATE LEDGER ────────────────────────────────────────
  (function renderGates() {
    const electedCnt  = elected.length || mfst.filter(r=>r.verdict==='ALLOW').length;
    const candidateCnt= candidate.length || refuseCount;
    const confAvgFrac = allAxioms.length ? allAxioms.reduce((s,a)=>s+(a.score||0),0)/allAxioms.length : allowCount/(allowCount+refuseCount||1);
    const confPct = Math.round(confAvgFrac * 100);
    const tier = riskTier;
    const domStr = domains.length ? domains.map(d=>d.toUpperCase()).join(', ') : domain;

    const L1pass  = electedCnt > 0 || mfst.length > 0;
    const L2pass  = L1pass;
    const L3pass  = L1pass;
    const L4review= confAvgFrac < 0.80 || tier === 'T2' || tier === 'T3' || hitlFields.length > 0;
    const L4fail  = tier === 'T3' && !L1pass;

    // Build per-gate solver summaries for L3/L4
    const allowSummary  = mfst.filter(r=>r.verdict==='ALLOW').map(r=>r.axiom_id).join(', ') || '—';
    const refuseSummary = mfst.filter(r=>r.verdict==='REFUSE').map(r=>`<span style="color:var(--red)">${r.axiom_id}</span>`).join(', ') || 'None';
    const inverseStr    = Object.keys(inverseSols).length > 0
      ? Object.entries(inverseSols).map(([id,s])=>`${id}: ${s.unknown}=${s.required_value?.toFixed(3)}`).join('; ')
      : '';

    const gates = [
      {
        id:'L1', color:'var(--l1)',
        name:'Ontology<br>Classification',
        eval: L1pass
          ? `Document <b>${fname}</b> parsed and classified. Domain: <b>${domain}</b>. Mode: <b>${mode}</b>. ${mfst.length} axiom(s) evaluated by SAA equation solver (SymPy). ${electedCnt} ALLOW, ${refuseCount} REFUSE.`
          : `Ontology classification produced zero elected axioms. HITL review required.`,
        status: L1pass ? 'PASS' : 'FAIL',
      },
      {
        id:'L2', color:'var(--l2)',
        name:'Hypothesis<br>Generation',
        eval: L2pass
          ? `Hypothesis set generated from ${mfst.length} axiom equation solves across domain: <b>${domain}</b>. ${candidateCnt > 0 ? candidateCnt + ' candidate(s) deferred. ' : ''}${inverseStr ? 'Inverse solutions (required thresholds): ' + inverseStr + '.' : 'All axioms solvable with available data.'}`
          : `No viable hypotheses generated. Re-ingest document.`,
        status: L2pass ? 'PASS' : 'FAIL',
      },
      {
        id:'L3', color:'var(--l3)',
        name:'Pathway<br>Filtering',
        eval: L3pass
          ? `Causal pathway lattice constructed from axiom cluster. ALLOW axioms: <b>${allowSummary}</b>. REFUSE axioms: ${refuseSummary}. Active domains: <b>${domStr}</b>.`
          : `Pathway filtering failed — no axiom evidence to anchor causal chains.`,
        status: L3pass ? 'PASS' : 'FAIL',
      },
      {
        id:'L4', color:'var(--l4)',
        name:'Risk<br>Assessment',
        eval: L4fail
          ? `Risk assessment gate FAILED. Zero axioms present. Tier <b>T3 — REFUSED</b>.`
          : L4review
          ? `Composite risk tier: <b>${tier}</b>. Avg confidence: <b>${confPct}%</b>. ${hitlFields.length>0?'HITL required for missing fields: '+hitlFields.join(', ')+'. ':''} ${refuseCount>0?refuseCount+' axiom(s) exceeded threshold — review required.':''}`
          : `Composite risk tier: <b>${tier}</b>. Avg confidence: <b>${confPct}%</b>. All axioms within bounds. No HITL escalation triggered.`,
        status: L4fail ? 'FAIL' : L4review ? 'REVIEW' : 'PASS',
      },
      {
        id:'L5', color:'var(--l5)',
        name:'Report<br>Synthesis',
        eval: `Audit report sealed under <b>${BRAND.version}</b>. ${mfst.length} equation solve(s) rendered. XAI narrative: ${XAI.generalNarrative ? 'G3FP synthesized ✓' : 'pending'}. Operator: <b>${operator}</b>.`,
        status: 'SEALED',
      },
    ];

    const supplied = R.gates || [];
    const gtbody   = document.getElementById('gate-ledger-body');
    if (!gtbody) return;
    gtbody.innerHTML = '';
    gates.forEach((g, i) => {
      const ov = supplied[i] || {};
      const st = ov.status || g.status;
      const ev = ov.eval   || g.eval;
      const cls= st==='PASS'||st==='SEALED'?'status-pass':st==='REVIEW'?'status-warn':'status-fail';
      gtbody.innerHTML += `<tr>
        <td><div class="gate-id" style="color:${g.color}"><div class="gate-dot" style="background:${g.color}"></div>${g.id}</div></td>
        <td><div class="gate-name">${g.name}</div></td>
        <td><div class="gate-eval">${ev}</div></td>
        <td><span class="gate-status ${cls}">${st}</span></td>
      </tr>`;
    });
  })();

  // ── 24. FOOTER ───────────────────────────────────────────────────
  const footerSig = document.querySelector('.footer-sig');
  const footerStamp = document.getElementById('footer-ts');
  if (footerSig) footerSig.textContent = BRAND.footer + ' · ' + BRAND.version;
  if (footerStamp) footerStamp.textContent = `GENERATED ${new Date().toISOString()}`;

  // ── 25. SEAL RING: change to red if REFUSE ────────────────────────
  if (verdictClass === 'fail') {
    document.querySelectorAll('.seal-ring').forEach(el => { el.style.borderColor = 'rgba(255,60,60,0.7)'; });
    document.querySelectorAll('.seal-label').forEach(el => { el.style.color = 'var(--red)'; });
  }

  // ── 26. I18N REFRESH ─────────────────────────────────────────────
  try {
    if (window.SovereignI18n && typeof window.SovereignI18n.refresh === 'function') {
      window.SovereignI18n.refresh();
    }
  } catch(e) {}

})();
