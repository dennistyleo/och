#!/usr/bin/env python3
"""
op03_drift_fix.py - Fixes all 3 OP-03 drifts in one pass:
  1. Left axiom repo panels blank (scroll zone + DC.AGT + scroll refresh)
  2. GNN/WM/CM 3D labels show old FPGA/Vascular/Pathogenesis text
  3. 5L state machine sync improvement
"""
import sys, re

OP03 = '/Users/leodennis/MODULARIZED_XRAG/static/op_03.html'
HM3D = '/Users/leodennis/MODULARIZED_XRAG/static/js/visualizations/HealthcareMedical3D.js'

# ─── Load OP-03 ───────────────────────────────────────────────────────────────
with open(OP03, encoding='utf-8') as f:
    s = f.read()
print(f"Loaded op_03.html: {len(s)} chars")
changes = []

# ══════════════════════════════════════════════════════════════════════════════
# FIX 1A — Add DC.AGT to the palette (avoids DC.PAL fallback for AGT domain)
# ══════════════════════════════════════════════════════════════════════════════
OLD_DC_END = ("            INTL:{ badge:'#1B5E20', bg:'#E8F5E9', border:'#2E7D32', text:'#1B5E20' }  /* deep green   — International Canonical Laws */\n"
              "        };")
NEW_DC_END = ("            INTL:{ badge:'#1B5E20', bg:'#E8F5E9', border:'#2E7D32', text:'#1B5E20' },  /* deep green   — International Canonical Laws */\n"
              "            AGT: { badge:'#37474F', bg:'#ECEFF1', border:'#546E7A', text:'#37474F' }   /* blue-grey    — Agent Governance Theorem */\n"
              "        };")
if OLD_DC_END in s:
    s = s.replace(OLD_DC_END, NEW_DC_END, 1)
    changes.append('FIX 1A: DC.AGT added to palette')
else:
    # Try to add AGT as last entry before closing };
    idx = s.find("INTL:{ badge:'#1B5E20'")
    print(f'  FIX 1A: Exact match not found; INTL at char {idx}')
    if idx > 0:
        # Find the end of the INTL line
        end_intl = s.find('\n', idx)
        # Insert AGT after
        s = s[:end_intl] + ',  /* deep green — International Canonical Laws */' + \
            "\n            AGT: { badge:'#37474F', bg:'#ECEFF1', border:'#546E7A', text:'#37474F' }   /* blue-grey — Agent Governance Theorem */" + \
            s[end_intl+s[end_intl:].find('\n')+1:]
        changes.append('FIX 1A: DC.AGT inserted (partial match)')
    else:
        changes.append('WARN FIX 1A: DC.AGT - could not insert')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 1B — Force axiom-repo scroll zones to auto-height so content is visible
# ══════════════════════════════════════════════════════════════════════════════
# The scroll zone wraps zone2-axiom-repo with panel-ded-scroll
# We need to set the inner ded-body to scroll and override any fixed height

OLD_ZONE2_REPO = 'id="zone2-axiom-repo" style="padding:6px 8px;"'
NEW_ZONE2_REPO = 'id="zone2-axiom-repo" style="padding:6px 8px;overflow-y:auto;height:100%;min-height:60px;"'

OLD_ZONE3_REPO = 'id="zone3-axiom-repo" style="padding:6px 8px;"'
NEW_ZONE3_REPO = 'id="zone3-axiom-repo" style="padding:6px 8px;overflow-y:auto;height:100%;min-height:60px;"'

OLD_ZONE4_REPO = 'id="zone4-axiom-repo" style="padding:6px 8px;"'
NEW_ZONE4_REPO = 'id="zone4-axiom-repo" style="padding:6px 8px;overflow-y:auto;height:100%;min-height:60px;"'

for old, new, name in [(OLD_ZONE2_REPO, NEW_ZONE2_REPO, 'zone2'),
                        (OLD_ZONE3_REPO, NEW_ZONE3_REPO, 'zone3'),
                        (OLD_ZONE4_REPO, NEW_ZONE4_REPO, 'zone4')]:
    if old in s:
        s = s.replace(old, new, 1)
        changes.append(f'FIX 1B: {name}-axiom-repo — overflow-y:auto + min-height added')
    else:
        idx = s.find(f'id="{name}-axiom-repo"')
        changes.append(f'WARN FIX 1B: {name}-axiom-repo pattern not found (at {idx})')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 1C — After _initRepos(), call scrollbar refresh to expand scroll zones
# ══════════════════════════════════════════════════════════════════════════════
OLD_FIRE_REPOS = ("        function _fireRepos() {\n")
if OLD_FIRE_REPOS not in s:
    # Look for the function
    idx = s.find('function _fireRepos()')
    print(f'  FIX 1C: _fireRepos at {idx}')

# Find the _initRepos calls inside _fireRepos or in the init section, add scroll refresh
OLD_INIT_CALL = ("        try { _initRepos(); } catch(e) { console.warn('[DEDREPO] _initRepos() synchronous call failed:', e); }")
NEW_INIT_CALL = ("        try { _initRepos(); } catch(e) { console.warn('[DEDREPO] _initRepos() synchronous call failed:', e); }\n"
    "        /* Trigger scrollbar refresh so expanded axiom content is visible */\n"
    "        setTimeout(function() {\n"
    "            try {\n"
    "                /* Force panel-ded-scroll zones to recalculate height */\n"
    "                document.querySelectorAll('.panel-ded-scroll').forEach(function(el) {\n"
    "                    var inner = el.querySelector('.ded-body');\n"
    "                    if (inner && inner.scrollHeight > 0) {\n"
    "                        el.style.height = Math.min(inner.scrollHeight, 480) + 'px';\n"
    "                        el.style.overflowY = 'auto';\n"
    "                    }\n"
    "                });\n"
    "                if (window.SovereignScrollbar && SovereignScrollbar.refreshAll) SovereignScrollbar.refreshAll();\n"
    "                if (window.SovereignTubes && SovereignTubes.refresh) SovereignTubes.refresh();\n"
    "            } catch(_e) { console.warn('[DEDREPO] scroll refresh failed:', _e); }\n"
    "        }, 300);\n"
    "        setTimeout(function() {\n"
    "            try { _initRepos(); } catch(_e) {}\n"
    "        }, 600);")
if OLD_INIT_CALL in s:
    s = s.replace(OLD_INIT_CALL, NEW_INIT_CALL, 1)
    changes.append('FIX 1C: Scroll zone height refresh after _initRepos')
else:
    changes.append('WARN FIX 1C: _initRepos synchronous call pattern not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 1D — Add inline CSS override to force panel-ded-scroll to show content
# ══════════════════════════════════════════════════════════════════════════════
# Inject CSS override into the <style> section at char 55187
OLD_CSS_ANCHOR = "#ded-ts-panel,\n    .panel-ded-scroll,"
NEW_CSS_ANCHOR = (".panel-ded-scroll {\n"
    "        overflow-y: auto !important;\n"
    "        height: auto !important;\n"
    "        min-height: 80px;\n"
    "        max-height: 480px;\n"
    "    }\n"
    "    .panel-ded-scroll .ded-body {\n"
    "        height: auto !important;\n"
    "        overflow: visible !important;\n"
    "    }\n"
    "    #ded-ts-panel,\n    .panel-ded-scroll,")
if OLD_CSS_ANCHOR in s:
    s = s.replace(OLD_CSS_ANCHOR, NEW_CSS_ANCHOR, 1)
    changes.append('FIX 1D: CSS override — panel-ded-scroll auto height + overflow')
else:
    changes.append('WARN FIX 1D: CSS anchor not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 2 — GNN/WM/CM 3D Phase Labels: Override HM3D domain with arXiv mapping
# ══════════════════════════════════════════════════════════════════════════════
# The HealthcareMedical3D.js uses _currentDomain=0 → FPGA
# We inject a domain override hook in OP-03 that reads sovereign_domain from sessionStorage
# and maps to the correct HM3D domain index

OLD_CURRENT_DOM = "        var _currentDomain = 0;\n        var _rendered = {};"
NEW_CURRENT_DOM = ("        /* ── arXiv domain override: read sovereign_domain from sessionStorage ── */\n"
    "        var _arxivDomainMap = {\n"
    "            PHYSICS:1, PHYS:1, MATH:1, MATHEMATICS:1,\n"
    "            CS:2, ML:2, AI:2,\n"
    "            QBIO:3, BIO:3, HEALTHCARE:'QBIO', HEALTH:3, MED:3,\n"
    "            QFIN:4, FIN:4, FINANCE:4,\n"
    "            STAT:5, STATISTICS:5,\n"
    "            EESS:6, ECON:7,\n"
    "            /* legacy keys */\n"
    "            FPGA:0, AEROSPACE:0, SIGNAL:0, HARDWARE:0\n"
    "        };\n"
    "        var _sessionDomain = (function() {\n"
    "            try {\n"
    "                var td = sessionStorage.getItem('sovereign_domain') || '';\n"
    "                var tr = JSON.parse(sessionStorage.getItem('sovereign_tiered_results') || 'null');\n"
    "                var t  = JSON.parse(sessionStorage.getItem('sovereign_tiered') || 'null');\n"
    "                return ((tr && tr.domain) || (t && t.primaryDomain) || td || 'FPGA').toUpperCase();\n"
    "            } catch(_) { return 'FPGA'; }\n"
    "        })();\n"
    "        var _currentDomain = (_arxivDomainMap[_sessionDomain] !== undefined)\n"
    "            ? _arxivDomainMap[_sessionDomain] : 0;\n"
    "        var _rendered = {};")

if OLD_CURRENT_DOM in s:
    s = s.replace(OLD_CURRENT_DOM, NEW_CURRENT_DOM, 1)
    changes.append('FIX 2: _currentDomain now resolves from sessionStorage arXiv domain')
else:
    idx = s.find('var _currentDomain = 0;')
    print(f'  FIX 2: pattern not found; var _currentDomain at {idx}')
    if idx > 0:
        # Replace just the var declaration
        s = s[:idx] + NEW_CURRENT_DOM + s[idx + len('        var _currentDomain = 0;\n        var _rendered = {};'):]
        changes.append('FIX 2: _currentDomain — partial replacement')
    else:
        changes.append('WARN FIX 2: _currentDomain not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 2B — Update PHASE_MAP labels to match arXiv domain themes
# ══════════════════════════════════════════════════════════════════════════════
OLD_PHASE_MAP = ("            phase1:{ canvasId:'ded-modal-gnn', tabId:'ded-ptab-phase1', key:'gnn', label:'Phase 1 — GNN Axiom Skeleton' },")
NEW_PHASE_MAP = ("            phase1:{ canvasId:'ded-modal-gnn', tabId:'ded-ptab-phase1', key:'gnn',\n"
    "                      label: 'Phase 1 — GNN ' + (_sessionDomain !== 'FPGA' ? _sessionDomain + ' Axiom Network' : 'Axiom Skeleton') },")
if OLD_PHASE_MAP in s:
    s = s.replace(OLD_PHASE_MAP, NEW_PHASE_MAP, 1)
    changes.append('FIX 2B: Phase 1 label dynamic from session domain')
else:
    changes.append('WARN FIX 2B: phase1 label not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 3 — 5L State Machine: Add cross-page sync and clear stale demo state
# ══════════════════════════════════════════════════════════════════════════════
# The 5L bars get stale data from OP-02's demo injection
# Add a cleanup for demo_state_injected flag and ensure L bars read from real data

# Find the SovereignTubes initialization and add domain-aware state
OLD_TUBES_INIT = "if (window.SovereignTubes && SovereignTubes.refresh) SovereignTubes.refresh();"
NEW_TUBES_INIT = ("if (window.SovereignTubes && SovereignTubes.refresh) SovereignTubes.refresh();\n"
    "                /* Sync 5L state: if no real pipeline run, clear stale demo bars */\n"
    "                var _hasRealRun = sessionStorage.getItem('sovereign_pipeline_ran') === 'true';\n"
    "                if (!_hasRealRun && window.SovereignTubes && SovereignTubes.reset) SovereignTubes.reset();")
if OLD_TUBES_INIT in s:
    # This was added in FIX 1C — update that block
    s = s.replace(OLD_TUBES_INIT, NEW_TUBES_INIT, 1)
    changes.append('FIX 3: 5L SovereignTubes reset when no real pipeline run')
else:
    changes.append('INFO FIX 3: SovereignTubes.refresh pattern already handled or not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 4 — Add PHASE_SUBTITLE for arXiv domains (gnn/wm/cm subtitles per domain)
# ══════════════════════════════════════════════════════════════════════════════
OLD_PHASE_SUB_ANCHOR = "PHASE_SUBTITLE = {\n            gnn:{\n                FON:"
NEW_PHASE_SUB_PREFIX = ("/* arXiv domain subtitles for GNN/WM/CM phases */\n"
    "        var _ARXIV_PHASE_SUBTITLE = {\n"
    "            gnn: {\n"
    "                PHYSICS:'GNN · Noether-Symmetry & Quantum Axiom Graph',\n"
    "                MATHEMATICS:'GNN · Banach-Goedel Formal Proof Network',\n"
    "                CS:'GNN · PAC-Learning & Byzantine Fault Axiom Map',\n"
    "                QBIO:'GNN · Hardy-Weinberg & Hodgkin-Huxley Axiom Graph',\n"
    "                QFIN:'GNN · Black-Scholes & No-Arbitrage Constraint Map',\n"
    "                STAT:'GNN · CLT & Minimax Risk Parameter Space',\n"
    "                EESS:'GNN · Nyquist-Shannon & Lyapunov Stability Graph',\n"
    "                ECON:'GNN · Nash Equilibrium & Arrow Impossibility Map'\n"
    "            },\n"
    "            wm: {\n"
    "                PHYSICS:'WM · Bekenstein-Entropy Constraint Manifold',\n"
    "                MATHEMATICS:'WM · Hahn-Banach Extension Constraint Surface',\n"
    "                CS:'WM · VC-Dimension Hypothesis Space Manifold',\n"
    "                QBIO:'WM · Michaelis-Menten Kinetics Constraint Space',\n"
    "                QFIN:'WM · Kelly-CVaR Risk Surface Manifold',\n"
    "                STAT:'WM · Bayesian Posterior Constraint Manifold',\n"
    "                EESS:'WM · Bode-Shannon Channel Constraint Space',\n"
    "                ECON:'WM · Pareto-Revelation Mechanism Design Surface'\n"
    "            },\n"
    "            cm: {\n"
    "                PHYSICS:'CM · Bell-Tsirelson Residual Correlation Structure',\n"
    "                MATHEMATICS:'CM · Cramer-Rao Estimator Residual Matrix',\n"
    "                CS:'CM · SGD-Convergence Causal Residual Trace',\n"
    "                QBIO:'CM · Lotka-Volterra Causal Pathway Corridor',\n"
    "                QFIN:'CM · No-Arbitrage Causal Residual Structure',\n"
    "                STAT:'CM · Bonferroni-MiniMax Causal Correlation Map',\n"
    "                EESS:'CM · Lyapunov-Bode Causal Residual Structure',\n"
    "                ECON:'CM · Arrow-Nash Causal Impossibility Trace'\n"
    "            }\n"
    "        };\n"
    "        PHASE_SUBTITLE = {\n"
    "            gnn:{\n"
    "                FON:")
if OLD_PHASE_SUB_ANCHOR in s:
    s = s.replace(OLD_PHASE_SUB_ANCHOR, NEW_PHASE_SUB_PREFIX, 1)
    changes.append('FIX 4: arXiv domain PHASE_SUBTITLE added for GNN/WM/CM')
else:
    changes.append('WARN FIX 4: PHASE_SUBTITLE anchor not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 5 — Use arXiv PHASE_SUBTITLE in _renderAxiomRepo when domain is arXiv
# ══════════════════════════════════════════════════════════════════════════════
OLD_SUBTITLE_LINE = "                var subtitle=(PHASE_SUBTITLE[phaseKey]||{})[set.domain]||set.label;"
NEW_SUBTITLE_LINE = ("                /* Use arXiv subtitle if session domain is arXiv, else SoS subtitle */\n"
    "                var _arxivDom = (typeof _sessionDomain !== 'undefined') ? _sessionDomain : 'FPGA';\n"
    "                var _arxivSub = (_ARXIV_PHASE_SUBTITLE && _ARXIV_PHASE_SUBTITLE[phaseKey])\n"
    "                    ? (_ARXIV_PHASE_SUBTITLE[phaseKey][_arxivDom] || null) : null;\n"
    "                var subtitle = _arxivSub || (PHASE_SUBTITLE[phaseKey]||{})[set.domain]||set.label;")
if OLD_SUBTITLE_LINE in s:
    s = s.replace(OLD_SUBTITLE_LINE, NEW_SUBTITLE_LINE, 1)
    changes.append('FIX 5: _renderAxiomRepo uses arXiv subtitles when arXiv domain active')
else:
    changes.append('WARN FIX 5: subtitle line not found')

# ══════════════════════════════════════════════════════════════════════════════
# FIX 6 — HealthcareMedical3D.js: Add arXiv domain narrations to phase labels
# ══════════════════════════════════════════════════════════════════════════════
try:
    with open(HM3D, encoding='utf-8') as f:
        hm = f.read()

    # Find where _DEDUCTION_AXIOM_SETS is defined and add arXiv entries at start
    OLD_HM_SETS = "  var _DEDUCTION_AXIOM_SETS = [\n    { id:'FPGA_SIGNAL', label:'FPGA \\u00b7 Signal Integrity', domain:'FPGA',"
    ARXIV_HM_ENTRY = (
        "  var _DEDUCTION_AXIOM_SETS = [\n"
        "    /* ── arXiv index 0: PHYSICS (default, shown first) ── */\n"
        "    { id:'ARXIV_PHYSICS', label:'PHYSICS \\u00b7 Sovereign Axiom Network (arXiv)', domain:'PHYSICS',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps PHYSICS axiom nodes: Noether Conservation (symmetry invariants), Bell-Tsirelson quantum entanglement bounds, Bekenstein entropy constraints. Refuse nodes indicate constraint violations in the quantum-classical boundary.',\n"
        "        wm:  'World Model Phase 2 renders the Bekenstein-Entropy constraint manifold \\u03a9. The surface encodes thermodynamic admissibility: S \\u2264 2\\u03c0RE/(\\u0127c) for all candidate states. Gold rings mark cross-axiom identity preservation.',\n"
        "        cm:  'Causal Model Phase 3 traces Bell-Tsirelson residual correlations. \\u03a3R = E[\\u03b5\\u03b5T] \\u2212 \\u039b\\u03a3X\\u039bT. Corr(i,j) > 0.72 triggers HITL review: quantum non-locality cannot be classical-causally explained.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 1: MATHEMATICS ── */\n"
        "    { id:'ARXIV_MATH', label:'MATH \\u00b7 Formal Proof Network (arXiv)', domain:'MATHEMATICS',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps MATHEMATICS axiom nodes: Banach Fixed-Point (contraction convergence), Goedel Completeness (proof soundness), Cramer-Rao Lower Bound (estimator optimality). Refuse nodes indicate structural inconsistency.',\n"
        "        wm:  'World Model Phase 2 renders the Hahn-Banach extension constraint manifold. ||F|| = ||f|| norm-preservation defines the admissible functional space. Goedel completeness bounds the reachable proof space.',\n"
        "        cm:  'Causal Model Phase 3 traces Cramer-Rao residual correlations. Var(\\u03b8\\u0302) \\u2265 1/I(\\u03b8) bounds all estimator residuals. Outliers above the bound indicate under-specified causal structure.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 2: CS ── */\n"
        "    { id:'ARXIV_CS', label:'CS \\u00b7 Learning Theory Axiom Map (arXiv)', domain:'CS',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps CS axiom nodes: PAC Learning VC-dimension sample complexity, SGD convergence O(1/\\u221aT), Byzantine Fault Tolerance f<n/3. Refuse nodes indicate generalization bound violations.',\n"
        "        wm:  'World Model Phase 2 renders the VC-dimension hypothesis space manifold. PAC sample complexity m \\u2265 (1/\\u03b5)(d ln(1/\\u03b5) + ln(1/\\u03b4)) constrains the admissible learning region.',\n"
        "        cm:  'Causal Model Phase 3 traces SGD convergence residuals. E[||\\u2207f(xt)||\\u00b2] \\u2264 O(1/\\u221aT). Byzantine nodes (f < n/3 violated) appear as outliers in the causal correlation structure.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 3: QBIO ── */\n"
        "    { id:'ARXIV_QBIO', label:'QBIO \\u00b7 Biological Axiom Graph (arXiv)', domain:'QBIO',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps QBIO axiom nodes: Hardy-Weinberg allele equilibrium, Michaelis-Menten enzyme kinetics, Hodgkin-Huxley membrane dynamics. Refuse nodes indicate biological constraint violations.',\n"
        "        wm:  'World Model Phase 2 renders the Lotka-Volterra predator-prey constraint manifold. dx/dt = \\u03b1x \\u2212 \\u03b2xy; dy/dt = \\u03b4xy \\u2212 \\u03b3y. Admissible states lie within the ecological stability ellipse.',\n"
        "        cm:  'Causal Model Phase 3 traces Michaelis-Menten kinetic residuals. v = Vmax[S]/(Km+[S]). Corr(i,j) > 0.72 indicates coupled enzyme cascades requiring HITL review for pathway intervention.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 4: QFIN ── */\n"
        "    { id:'ARXIV_QFIN', label:'QFIN \\u00b7 Financial Axiom Network (arXiv)', domain:'QFIN',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps QFIN axiom nodes: Black-Scholes fair value, No-Arbitrage fundamental theorem, Kelly Criterion optimal fraction. Refuse nodes flag arbitrage opportunities or Kelly over-betting.',\n"
        "        wm:  'World Model Phase 2 renders the no-arbitrage constraint manifold. E^Q[X_T] \\u2264 X_0 e^{rT} defines the admissible pricing surface. CVaR \\u2265 VaR bounds the coherent risk region.',\n"
        "        cm:  'Causal Model Phase 3 traces Kelly-CVaR residual correlations. f* = (bp \\u2212 q)/b. CVaR/VaR > 1.18 triggers HITL review: tail risk exceeds expected-shortfall coherence threshold.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 5: STAT ── */\n"
        "    { id:'ARXIV_STAT', label:'STAT \\u00b7 Statistical Axiom Space (arXiv)', domain:'STAT',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps STAT axiom nodes: CLT asymptotic normality, Bayes optimal posterior, Minimax risk lower bound, Bonferroni FWER control. Refuse nodes flag multiple testing violations.',\n"
        "        wm:  'World Model Phase 2 renders the Bayesian posterior constraint manifold. P(\\u03b8|X) \\u221d P(X|\\u03b8)P(\\u03b8). Minimax risk floor inf sup R \\u2265 \\u03b5\\u00b2 bounds the admissible estimator region.',\n"
        "        cm:  'Causal Model Phase 3 traces Bonferroni-corrected residual correlations. \\u03b1_corrected = \\u03b1/m. Uncorrected p-values appearing as outliers trigger HITL statistical review.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 6: EESS ── */\n"
        "    { id:'ARXIV_EESS', label:'EESS \\u00b7 Systems Axiom Graph (arXiv)', domain:'EESS',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps EESS axiom nodes: Nyquist-Shannon sampling (f_s \\u2265 2B), Lyapunov asymptotic stability (V\\u0307 < 0), Shannon channel capacity. Refuse nodes flag aliasing or instability violations.',\n"
        "        wm:  'World Model Phase 2 renders the Lyapunov stability constraint manifold. V\\u0307(x) < 0 defines the asymptotically stable region. Bode gain-phase minimum-phase constraint bounds the frequency response surface.',\n"
        "        cm:  'Causal Model Phase 3 traces Nyquist-Shannon causal residuals. C = B log\\u2082(1+SNR). Aliased samples (f_s < 2B) appear as spurious correlations in the causal residual structure.'\n"
        "      }\n"
        "    },\n"
        "    /* ── arXiv index 7: ECON ── */\n"
        "    { id:'ARXIV_ECON', label:'ECON \\u00b7 Economic Axiom Network (arXiv)', domain:'ECON',\n"
        "      palette: _DOM_PALETTE.FPGA || _DOM_PALETTE[Object.keys(_DOM_PALETTE)[0]],\n"
        "      narrative: {\n"
        "        gnn: 'GNN Phase 1 maps ECON axiom nodes: Nash equilibrium (all finite games), Arrow impossibility (no SWF satisfies all three), Revelation principle, Pareto optimality. Refuse nodes flag mechanism failures.',\n"
        "        wm:  'World Model Phase 2 renders the Pareto-Nash constraint manifold. u_i(x) \\u2265 u_i(y) \\u2200i defines the Pareto admissible allocation surface. Nash equilibrium fixed points appear as stable manifold nodes.',\n"
        "        cm:  'Causal Model Phase 3 traces Arrow-Nash impossibility residuals. No SWF satisfies unanimity + IIA + non-dictatorship simultaneously. Paradox nodes trigger HITL mechanism design review.'\n"
        "      }\n"
        "    },\n"
        "    /* ── Legacy domains kept for backward compatibility ── */\n"
        "    { id:'FPGA_SIGNAL', label:'FPGA \\u00b7 Signal Integrity', domain:'FPGA',"
    )
    if OLD_HM_SETS in hm:
        hm = hm.replace(OLD_HM_SETS, ARXIV_HM_ENTRY, 1)
        with open(HM3D, 'w', encoding='utf-8') as f:
            f.write(hm)
        changes.append('FIX 6: HealthcareMedical3D.js — 8 arXiv domain sets added (indices 0-7)')
    else:
        print(f'  FIX 6: _DEDUCTION_AXIOM_SETS anchor not found exactly')
        idx_hm = hm.find('var _DEDUCTION_AXIOM_SETS')
        print(f'  _DEDUCTION_AXIOM_SETS at char {idx_hm}: {repr(hm[idx_hm:idx_hm+80])}')
        changes.append('WARN FIX 6: HM3D anchor not matched')

except Exception as e:
    changes.append(f'ERROR FIX 6: {e}')

# ══════════════════════════════════════════════════════════════════════════════
# WRITE OP-03
# ══════════════════════════════════════════════════════════════════════════════
with open(OP03, 'w', encoding='utf-8') as f:
    f.write(s)
print(f"Saved op_03.html: {len(s)} chars")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"CHANGES ({len(changes)}):")
for c in changes:
    tag = 'OK ' if not c.startswith('WARN') and not c.startswith('ERROR') else '!! '
    print(f"  {tag}{c}")

print(f"\n{'='*60}")
print('INTEGRITY CHECKS:')
s_fresh = open(OP03, encoding='utf-8').read()
hm_fresh = open(HM3D, encoding='utf-8').read() if __import__('os').path.exists(HM3D) else ''
checks = [
    ('DC.AGT added', 'AGT:' in s_fresh and 'blue-grey' in s_fresh),
    ('panel-ded-scroll override', 'overflow-y: auto !important' in s_fresh),
    ('scroll refresh setTimeout', 'SovereignScrollbar.refreshAll' in s_fresh),
    ('_currentDomain from session', '_sessionDomain' in s_fresh),
    ('_arxivDomainMap', '_arxivDomainMap' in s_fresh),
    ('arXiv PHASE_SUBTITLE', '_ARXIV_PHASE_SUBTITLE' in s_fresh),
    ('arXiv subtitles in _renderAxiomRepo', '_arxivSub' in s_fresh),
    ('HM3D ARXIV_PHYSICS', 'ARXIV_PHYSICS' in hm_fresh),
    ('HM3D ARXIV_QBIO', 'ARXIV_QBIO' in hm_fresh),
    ('HM3D ARXIV_ECON', 'ARXIV_ECON' in hm_fresh),
    ('HM3D 8 arXiv sets', hm_fresh.count('ARXIV_') >= 8),
    ('OP-03 OCP axioms intact', 'OCP-001' in s_fresh),
    ('OP-03 c_weights intact', 'c_weights' in s_fresh),
    ('OP-03 fingerprints intact', 'fingerprint' in s_fresh),
]
pass_n = sum(1 for _, ok in checks if ok)
for label, ok in checks:
    print(f"  {'PASS' if ok else 'FAIL'} {label}")
print(f"\n{pass_n}/{len(checks)} PASS")
