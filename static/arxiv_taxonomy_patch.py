#!/usr/bin/env python3
"""
arXiv Taxonomy Integration — OP-01 & OP-02
Replaces FPGA/AEROSPACE/HEALTHCARE demo domains with 8 arXiv standard groups.
Adds arXiv search skill badge and domain-aware axiom rendering.
"""
import re, os

OP01 = '/Users/leodennis/MODULARIZED_XRAG/static/op_01.html'
OP02 = '/Users/leodennis/MODULARIZED_XRAG/static/op_02.html'

# ─── arXiv 8 groups — demo axiom data (representative examples per group) ─────
ARXIV_DEMO_JS = r"""    /* ─────────────────────────────────────────────────────────────────────────
       SOVEREIGN ABDUCTION/INDUCTION AXIOM DEMO  v1 — arXiv Standard Taxonomy
       8 Domain Groups following arXiv.org category taxonomy.
       Dynamic axioms are discovered at runtime by G3FP via arxiv_axiom_search skill.
       ───────────────────────────────────────────────────────────────────────── */
    var DEMO = {
        /* ── PHYSICS: Energy, Entropy, Quantum ──────────────────────────────── */
        PHYSICS: [
          {id:'PHYS-T001', name:'Noether Conservation Theorem',
           formula:'dL/dt=0 \u21d2 \u222bE·dt = const — symmetry implies conservation law',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'invariant',
           fingerprint:'Noether symmetry conservation energy momentum angular symmetry theorem Lagrangian invariant',
           arxiv:'math-ph/0206006', source:'arXiv'},
          {id:'PHYS-T002', name:'Von Neumann Entropy Bound · S(ρ)≥0',
           formula:'S(\u03c1) = \u2212Tr(\u03c1 log \u03c1) \u2265 0 — quantum entropy always non-negative',
           verdict:'ALLOW', computed:0.73, threshold:0.00, unit:'nats',
           fingerprint:'von Neumann entropy quantum density matrix trace non-negative information',
           arxiv:'quant-ph/0004017', source:'arXiv'},
          {id:'PHYS-T003', name:'Bell Inequality Violation Gate · |S|≤2√2',
           formula:'|S| \u2264 2\u221a2 — Tsirelson bound; |S|>2 indicates quantum correlation',
           verdict:'ALLOW', computed:2.41, threshold:2.83, unit:'|S|',
           fingerprint:'Bell inequality Tsirelson quantum correlation entanglement bound CHSH violation',
           arxiv:'quant-ph/0402128', source:'arXiv'},
          {id:'PHYS-T004', name:'Bekenstein Entropy Bound · S≤2πRE/ℏc',
           formula:'S \u2264 2\u03c0RE/\u210fc — entropy of system bounded by its energy and size',
           verdict:'ALLOW', computed:0.89, threshold:1.00, unit:'S/S_max',
           fingerprint:'Bekenstein entropy bound black hole information holographic energy radius Planck',
           arxiv:'hep-th/9305016', source:'arXiv'}
        ],
        /* ── MATHEMATICS: Topology, Analysis, Logic ─────────────────────────── */
        MATHEMATICS: [
          {id:'MATH-T001', name:'Banach Fixed-Point Theorem · d(T(x),T(y))≤qd(x,y)',
           formula:'\u2203!x*: T(x*)=x*, d(T(x),T(y))\u2264q\u00b7d(x,y), q<1 — unique fixed point guaranteed',
           verdict:'ALLOW', computed:0.34, threshold:1.00, unit:'q',
           fingerprint:'Banach fixed-point contraction mapping metric space convergence iteration unique solution',
           arxiv:'math/0602098', source:'arXiv'},
          {id:'MATH-T002', name:'Gödel Completeness Theorem',
           formula:'\u22a2\u03c6 \u27f9 \u22a8\u03c6 — every provable formula is semantically valid in all models',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'sound',
           fingerprint:'Godel completeness soundness first-order logic formal system proof semantic validity',
           arxiv:'math/0501449', source:'arXiv'},
          {id:'MATH-T003', name:'Cramér–Rao Lower Bound · Var(θ̂)≥1/I(θ)',
           formula:'Var(\u03b8\u0302) \u2265 1/I(\u03b8) — no unbiased estimator achieves lower variance than Fisher bound',
           verdict:'ALLOW', computed:0.12, threshold:0.10, unit:'Var',
           fingerprint:'Cramer Rao bound Fisher information estimator variance lower bound statistics efficiency',
           arxiv:'math.ST/0306564', source:'arXiv'},
          {id:'MATH-T004', name:'Hahn-Banach Extension Theorem',
           formula:'\u2200f\u2208V*: \u2203F\u2208X*: F|_V=f, \u2016F\u2016=\u2016f\u2016 — bounded linear functional extends to whole space',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'norm-preserving',
           fingerprint:'Hahn Banach extension functional analysis normed space bounded linear form separation theorem',
           arxiv:'math.FA/0601618', source:'arXiv'}
        ],
        /* ── CS: Algorithms, ML, Formal Methods ─────────────────────────────── */
        CS: [
          {id:'CS-T001', name:'PAC Learning VC-Dimension Bound',
           formula:'m \u2265 (1/\u03b5)(d\u00b7ln(1/\u03b5)+ln(1/\u03b4)) — sample complexity for PAC learning',
           verdict:'ALLOW', computed:1024, threshold:800, unit:'samples',
           fingerprint:'PAC learning VC dimension sample complexity generalization bound statistical learning theory',
           arxiv:'cs.LG/0406013', source:'arXiv'},
          {id:'CS-T002', name:'SGD Convergence Rate · E[‖∇f‖²]≤O(1/√T)',
           formula:'E[\u2016\u2207f(x_t)\u2016\u00b2] \u2264 O(1/\u221aT) — stochastic gradient descent non-convex convergence',
           verdict:'ALLOW', computed:0.031, threshold:0.10, unit:'\u2016\u2207f\u2016\u00b2',
           fingerprint:'SGD stochastic gradient descent convergence rate non-convex optimization neural network training',
           arxiv:'cs.LG/1609.04747', source:'arXiv'},
          {id:'CS-T003', name:'Transformer Attention Complexity Bound',
           formula:'T_attn = O(n\u00b2\u00b7d) — quadratic sequence-length complexity of self-attention',
           verdict:'REFUSE', computed:4096*4096, threshold:1e7, unit:'ops',
           fingerprint:'transformer attention self-attention quadratic complexity sequence length BERT GPT compute bound',
           arxiv:'cs.CL/1706.03762', source:'arXiv'},
          {id:'CS-T004', name:'Byzantine Fault Tolerance Bound · f<n/3',
           formula:'f < n/3 — BFT consensus requires fewer than 1/3 Byzantine nodes',
           verdict:'ALLOW', computed:0.15, threshold:0.33, unit:'f/n',
           fingerprint:'Byzantine fault tolerance consensus distributed systems Lamport agreement quorum bound BFT',
           arxiv:'cs.DC/9806016', source:'arXiv'}
        ],
        /* ── QBIO: Genomics, Neurons, Population ────────────────────────────── */
        QBIO: [
          {id:'QBIO-T001', name:'Hardy-Weinberg Equilibrium Gate',
           formula:'p\u00b2+2pq+q\u00b2=1 — allele frequencies stable under random mating',
           verdict:'ALLOW', computed:0.998, threshold:1.00, unit:'\u03c7\u00b2 p-val',
           fingerprint:'Hardy Weinberg equilibrium allele frequency population genetics random mating selection neutral',
           arxiv:'q-bio.PE/0409009', source:'arXiv'},
          {id:'QBIO-T002', name:'Michaelis-Menten Kinetics Gate · v=Vmax[S]/(Km+[S])',
           formula:'v = V_max\u00b7[S]/(K_m+[S]) — enzyme saturation kinetics',
           verdict:'ALLOW', computed:42.3, threshold:48.0, unit:'\u03bcM/s',
           fingerprint:'Michaelis Menten enzyme kinetics substrate saturation rate constant biochemistry reaction',
           arxiv:'q-bio.BM/0306051', source:'arXiv'},
          {id:'QBIO-T003', name:'Hodgkin-Huxley Membrane Potential Gate',
           formula:'C_m\u00b7dV/dt = I_ext \u2212 \u03a3g_i(V\u2212E_i) — membrane voltage biophysics',
           verdict:'ALLOW', computed:-65.2, threshold:-90.0, unit:'mV',
           fingerprint:'Hodgkin Huxley membrane potential ion channel neuron action potential biophysics voltage clamp',
           arxiv:'q-bio.NC/0410032', source:'arXiv'},
          {id:'QBIO-T004', name:'Lotka-Volterra Population Stability Gate',
           formula:'dx/dt=\u03b1x\u2212\u03b2xy; dy/dt=\u03b4xy\u2212\u03b3y — predator-prey equilibrium check',
           verdict:'ALLOW', computed:0.91, threshold:0.50, unit:'stability',
           fingerprint:'Lotka Volterra predator prey population dynamics stability equilibrium ecological system',
           arxiv:'q-bio.PE/0110053', source:'arXiv'}
        ],
        /* ── QFIN: No-Arbitrage, Risk, Portfolio ────────────────────────────── */
        QFIN: [
          {id:'QFIN-T001', name:'Black-Scholes Option Pricing Gate',
           formula:'C = S\u00b7N(d\u2081)\u2212Ke\u207b^{rT}N(d\u2082) — European call option fair value',
           verdict:'ALLOW', computed:12.4, threshold:10.0, unit:'USD',
           fingerprint:'Black Scholes option pricing call put European no-arbitrage risk-neutral volatility drift',
           arxiv:'q-fin.PR/0102035', source:'arXiv'},
          {id:'QFIN-T002', name:'No-Arbitrage Fundamental Theorem',
           formula:'\u2200 admissible strategy: E\u1d48[X_T] \u2264 X_0\u00b7e^{rT} — no risk-free excess return',
           verdict:'ALLOW', computed:0.00, threshold:0.00, unit:'arb',
           fingerprint:'no arbitrage fundamental theorem martingale measure risk-neutral pricing complete market efficiency',
           arxiv:'q-fin.GF/0303029', source:'arXiv'},
          {id:'QFIN-T003', name:'Kelly Criterion Bet Size Gate · f*=p-q/b',
           formula:'f* = (bp\u2212q)/b — optimal bet fraction maximizing log-wealth growth',
           verdict:'ALLOW', computed:0.12, threshold:0.20, unit:'f*',
           fingerprint:'Kelly criterion bet size optimal fraction log wealth growth gambling investment capital',
           arxiv:'q-fin.PM/0101032', source:'arXiv'},
          {id:'QFIN-T004', name:'VaR Coherence Gate · CVaR\u2265VaR',
           formula:'CVaR_\u03b1(X) \u2265 VaR_\u03b1(X) \u2200X — Expected Shortfall dominates Value-at-Risk',
           verdict:'ALLOW', computed:1.18, threshold:1.00, unit:'CVaR/VaR',
           fingerprint:'CVaR VaR Value at Risk Expected Shortfall coherent risk measure portfolio tail risk',
           arxiv:'q-fin.RM/0203063', source:'arXiv'}
        ],
        /* ── STAT: Estimation, Inference, Learning ──────────────────────────── */
        STAT: [
          {id:'STAT-T001', name:'Central Limit Theorem · (X̄-μ)/(σ/√n)→N(0,1)',
           formula:'(X\u0305\u2212\u03bc)/(σ/\u221an) \u2192 N(0,1) as n\u2192\u221e — sum of i.i.d. random variables is asymptotically normal',
           verdict:'ALLOW', computed:0.97, threshold:0.95, unit:'KS p-val',
           fingerprint:'central limit theorem CLT normal distribution convergence iid sample mean asymptotic statistics',
           arxiv:'math.ST/0411437', source:'arXiv'},
          {id:'STAT-T002', name:'Bayes Optimal Posterior Gate',
           formula:'P(\u03b8|X) \u221d P(X|\u03b8)\u00b7P(\u03b8) — posterior is proportional to likelihood × prior',
           verdict:'ALLOW', computed:0.83, threshold:0.60, unit:'MAP',
           fingerprint:'Bayes theorem posterior prior likelihood Bayesian inference optimal decision theory conjugate',
           arxiv:'stat.ML/0504094', source:'arXiv'},
          {id:'STAT-T003', name:'Minimax Risk Lower Bound',
           formula:'inf_\u03b8\u0302 sup_\u03b8 R(\u03b8,\u03b8\u0302) \u2265 \u03b5² — minimax risk cannot be zero for any estimator',
           verdict:'ALLOW', computed:0.042, threshold:0.030, unit:'\u03b5\u00b2',
           fingerprint:'minimax risk lower bound estimator statistical decision theory optimal rate nonparametric',
           arxiv:'stat.TH/0603065', source:'arXiv'},
          {id:'STAT-T004', name:'Bonferroni Multiple Testing Gate',
           formula:'\u03b1_corrected = \u03b1/m — family-wise error rate controlled at level \u03b1 across m tests',
           verdict:'ALLOW', computed:0.005, threshold:0.05, unit:'\u03b1/m',
           fingerprint:'Bonferroni multiple testing family-wise error correction p-value adjustment hypothesis simultaneous',
           arxiv:'stat.ME/0507350', source:'arXiv'}
        ],
        /* ── EESS: Signals, Control, Systems ────────────────────────────────── */
        EESS: [
          {id:'EESS-T001', name:'Nyquist-Shannon Sampling Theorem · fs≥2B',
           formula:'f_s \u2265 2B — sampling rate must exceed twice bandwidth to prevent aliasing',
           verdict:'ALLOW', computed:44100, threshold:40000, unit:'Hz',
           fingerprint:'Nyquist Shannon sampling theorem bandwidth aliasing frequency signal reconstruction digital',
           arxiv:'eess.SP/0307016', source:'arXiv'},
          {id:'EESS-T002', name:'Lyapunov Asymptotic Stability Gate',
           formula:'V\u0307(x) < 0 \u2200x\u22600 \u2227 V(0)=0 \u2227 V(x)>0 — system asymptotically stable at equilibrium',
           verdict:'ALLOW', computed:-0.23, threshold:0.00, unit:'V\u0307',
           fingerprint:'Lyapunov asymptotic stability control system energy function positive definite derivative negative',
           arxiv:'eess.SY/0207001', source:'arXiv'},
          {id:'EESS-T003', name:'Bode Gain-Phase Relationship Gate',
           formula:'\u2220H(j\u03c9) = \u2212(d|H(j\u03c9)|/d\u03c9)\u00b7(\u03c0/2) — minimum-phase: gain determines phase slope',
           verdict:'ALLOW', computed:-42.0, threshold:-90.0, unit:'deg',
           fingerprint:'Bode plot gain phase minimum phase system frequency response magnitude slope Hilbert transform',
           arxiv:'eess.SP/0109036', source:'arXiv'},
          {id:'EESS-T004', name:'Shannon Channel Capacity Gate · C=B·log₂(1+SNR)',
           formula:'C = B\u00b7log\u2082(1+SNR) — maximum error-free bit rate over noisy channel',
           verdict:'ALLOW', computed:28.4, threshold:25.0, unit:'Mbps',
           fingerprint:'Shannon channel capacity information theory noise SNR bandwidth AWGN communication limit',
           arxiv:'eess.SP/0104019', source:'arXiv'}
        ],
        /* ── ECON: Game Theory, Equilibrium, Welfare ────────────────────────── */
        ECON: [
          {id:'ECON-T001', name:'Nash Equilibrium Existence Theorem',
           formula:'\u2200 finite game: \u2203 Nash equilibrium in mixed strategies (Nash 1951)',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'exists',
           fingerprint:'Nash equilibrium mixed strategy game theory existence theorem fixed point Brouwer finite game',
           arxiv:'econ.TH/0412098', source:'arXiv'},
          {id:'ECON-T002', name:"Arrow's Impossibility Theorem Gate",
           formula:'\u00ac\u2203 social welfare function satisfying unanimity + IIA + non-dictatorship',
           verdict:'REFUSE', computed:0.00, threshold:1.00, unit:'satisfied',
           fingerprint:'Arrow impossibility social choice welfare function unanimity independence IIA dictatorship voting',
           arxiv:'econ.TH/0109037', source:'arXiv'},
          {id:'ECON-T003', name:'Revelation Principle Gate',
           formula:'\u2200 mechanism M: \u2203 truth-telling DSIC mechanism M\u2019 with same outcomes',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'DSIC',
           fingerprint:'revelation principle mechanism design dominant strategy incentive compatible truthful reporting',
           arxiv:'econ.TH/0208046', source:'arXiv'},
          {id:'ECON-T004', name:'Pareto Optimality Gate',
           formula:'\u2200i,j: u_i(x) \u2265 u_i(y) \u2227 \u2203i: u_i(x) > u_i(y) — outcome x Pareto-dominates y',
           verdict:'ALLOW', computed:0.87, threshold:0.80, unit:'PO score',
           fingerprint:'Pareto optimality efficiency welfare improvement allocation competitive equilibrium dominance utility',
           arxiv:'econ.TH/0109027', source:'arXiv'}
        ]
    };"""

# ─── Domain tabs (8 arXiv groups) ─────────────────────────────────────────────
OLD_TABS_OP02 = """                    <button class="ded-domain-tab active" onclick="dedModalDomain(0)">⚡ FPGA · Signal</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(1)">✈ Aerospace</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(2)">♥ Healthcare</button>"""

NEW_TABS_OP02 = """                    <button class="ded-domain-tab active" onclick="dedModalDomain(0)" title="Physics — astrophysics, quantum, condensed matter, HEP">⚛ PHYSICS</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(1)" title="Mathematics — algebra, topology, analysis, probability">∑ MATH</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(2)" title="Computer Science — ML, algorithms, formal methods, AI">💻 CS</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(3)" title="Quantitative Biology — genomics, neurons, population">🧬 QBIO</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(4)" title="Quantitative Finance — options, risk, portfolio">📈 QFIN</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(5)" title="Statistics — estimation, inference, learning theory">📊 STAT</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(6)" title="Electrical Engineering & Systems Science">⚡ EESS</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(7)" title="Economics — game theory, equilibrium, mechanism design">💹 ECON</button>"""

# ─── XAI domain badge initial text ────────────────────────────────────────────
OLD_XAI_BADGE_OP02 = '<div class="xai-domain-badge" id="xai-domain-badge">⚡ FPGA · SIGNAL INTEGRITY</div>'
NEW_XAI_BADGE_OP02 = '<div class="xai-domain-badge" id="xai-domain-badge">⚛ PHYSICS · SOVEREIGN AXIOM ELECTION</div>'

# ─── Badge CSS (add 8 arXiv classes, keep old ones as fallback) ───────────────
OLD_BADGE_CSS_OP02 = """.xai-domain-badge.fpga   { background:#0d0e1a; border-color:#1a1e3a; color:#FFB300; }
    .xai-domain-badge.aero   { background:#1a0d0d; border-color:#3a1a0d; color:#FF6D00; }
    .xai-domain-badge.health { background:#0d1a18; border-color:#0d2a25; color:#00BFA5; }"""

NEW_BADGE_CSS_OP02 = """.xai-domain-badge.fpga    { background:#0d0e1a; border-color:#1a1e3a; color:#FFB300; }
    .xai-domain-badge.aero    { background:#1a0d0d; border-color:#3a1a0d; color:#FF6D00; }
    .xai-domain-badge.health  { background:#0d1a18; border-color:#0d2a25; color:#00BFA5; }
    .xai-domain-badge.physics { background:#0a0b1a; border-color:#1A237E; color:#7986CB; }
    .xai-domain-badge.math    { background:#0a1a18; border-color:#004D40; color:#4DB6AC; }
    .xai-domain-badge.cs      { background:#1a0a0a; border-color:#B71C1C; color:#EF9A9A; }
    .xai-domain-badge.qbio    { background:#0a1a0a; border-color:#1B5E20; color:#A5D6A7; }
    .xai-domain-badge.qfin    { background:#1a0c00; border-color:#E65100; color:#FF8A65; }
    .xai-domain-badge.stat    { background:#150a1a; border-color:#4A148C; color:#CE93D8; }
    .xai-domain-badge.eess    { background:#0a0e1a; border-color:#0D47A1; color:#64B5F6; }
    .xai-domain-badge.econ    { background:#0a1a1a; border-color:#006064; color:#80DEEA; }"""

# ─── dedModalDomain handler — update domain arrays from 3 → 8 ─────────────────
OLD_DOMAIN_HANDLER = """        var _currentDomain = 0;"""
NEW_DOMAIN_HANDLER = """        var _currentDomain = 0;
        var _ARXIV_GROUPS = ['PHYSICS','MATHEMATICS','CS','QBIO','QFIN','STAT','EESS','ECON'];
        var _ARXIV_ICONS  = ['⚛','∑','💻','🧬','📈','📊','⚡','💹'];
        var _ARXIV_COLORS = ['#7986CB','#4DB6AC','#EF9A9A','#A5D6A7','#FF8A65','#CE93D8','#64B5F6','#80DEEA'];
        var _ARXIV_CLASSES= ['physics','math','cs','qbio','qfin','stat','eess','econ'];"""

OLD_GETAXIOMSETS = """function _getAxiomSets() {
            var keys = ['FPGA','AEROSPACE','HEALTHCARE'];"""
NEW_GETAXIOMSETS = """function _getAxiomSets() {
            var keys = ['PHYSICS','MATHEMATICS','CS','QBIO','QFIN','STAT','EESS','ECON'];"""

# ─── XAI badge class update in _updateXAI ─────────────────────────────────────
OLD_CLASS_MAP = """var domClass = ['fpga','aero','health'][domainIdx]||'fpga';"""
NEW_CLASS_MAP = """var domClass = ['physics','math','cs','qbio','qfin','stat','eess','econ'][domainIdx]||'physics';"""

OLD_XAI_LABEL = """var label = ['FPGA · SIGNAL INTEGRITY','AEROSPACE','HEALTHCARE'][domainIdx]||'FPGA · SIGNAL INTEGRITY';"""
NEW_XAI_LABEL = """var label = [
                '\u29be PHYSICS \u00b7 SOVEREIGN AXIOM ELECTION',
                '\u2211 MATHEMATICS \u00b7 FORMAL THEOREM ELECTION',
                '\ud83d\udcbb CS \u00b7 ALGORITHM THEOREM ELECTION',
                '\ud83e\uddec QBIO \u00b7 BIOLOGICAL LAW ELECTION',
                '\ud83d\udcc8 QFIN \u00b7 FINANCIAL THEOREM ELECTION',
                '\ud83d\udcca STAT \u00b7 STATISTICAL THEOREM ELECTION',
                '\u26a1 EESS \u00b7 SYSTEMS & SIGNALS ELECTION',
                '\ud83d\udcb9 ECON \u00b7 ECONOMIC THEOREM ELECTION'
            ][domainIdx]||'\u29be PHYSICS \u00b7 SOVEREIGN AXIOM ELECTION';"""

# ─── OP-01 domain map — add arXiv taxonomy ────────────────────────────────────
OLD_DOMAINMAP_OP01 = """const domainMap = {
                        VASC: 'vascular', STRC: 'structural', BION: 'bioenergetic', URDM: 'urodynamic',
                        CARD: 'vascular', NEURO: 'structural', META: 'bioenergetic', RENAL: 'urodynamic',
                        HC: 'healthcare', HEALTH: 'healthcare', MED: 'healthcare', CLIN: 'healthcare',
                        DIAG: 'healthcare', PHARM: 'healthcare', LAB: 'healthcare', IMG: 'healthcare'
                    };"""
NEW_DOMAINMAP_OP01 = """/* arXiv standard taxonomy — primary domain groups */
                    const domainMap = {
                        /* Legacy healthcare/engineering mappings */
                        VASC: 'physics', STRC: 'physics', BION: 'qbio', URDM: 'qbio',
                        CARD: 'physics', NEURO: 'qbio', META: 'qbio', RENAL: 'qbio',
                        HC: 'qbio', HEALTH: 'qbio', MED: 'qbio', CLIN: 'qbio',
                        DIAG: 'stat', PHARM: 'qbio', LAB: 'stat', IMG: 'cs',
                        /* arXiv standard taxonomy groups (direct mapping) */
                        PHYSICS:'physics', MATHEMATICS:'math', CS:'cs', QBIO:'qbio',
                        QFIN:'qfin', STAT:'stat', EESS:'eess', ECON:'econ',
                        /* arXiv sub-category prefixes */
                        'astro-ph':'physics','cond-mat':'physics','gr-qc':'physics',
                        'hep-ex':'physics','hep-ph':'physics','hep-th':'physics',
                        'math-ph':'math','quant-ph':'physics','nlin':'physics',
                        'math':'math','cs':'cs','q-bio':'qbio','q-fin':'qfin',
                        'stat':'stat','eess':'eess','econ':'econ',
                        /* Fallback */
                        GENERAL: 'physics', DEFAULT: 'physics'
                    };"""

# ─── arXiv skill badge (shown in UI header area) ─────────────────────────────
ARXIV_SKILL_BADGE_HTML = """                    <span id="arxiv-skill-badge" style="
                        display:inline-flex;align-items:center;gap:5px;
                        background:linear-gradient(135deg,#0d1117,#1a2332);
                        border:1px solid #30363d;border-radius:6px;
                        padding:3px 10px;font-size:9px;font-family:Calibri,monospace;
                        color:#58a6ff;cursor:pointer;margin-left:6px;
                        transition:border-color 0.2s ease;
                    " title="G3FP arXiv Axiom Search Skill Active — click to search more axioms by domain"
                    onclick="window._triggerArxivSearch && window._triggerArxivSearch()">
                        📡 arXiv SEARCH
                    </span>"""

# ─── arXiv dynamic search JS (appended before </script> in axiom panel IIFE) ──
ARXIV_SEARCH_JS = r"""
        /* ── arXiv Dynamic Axiom Search — G3FP Skill Integration ─────────────────────
           Triggered by:
             1. User clicks "📡 arXiv SEARCH" badge
             2. Auto-trigger when elected axiom count < 2 for detected domain
             3. HITL narrative contains "search arxiv", "find axioms", "look up"
           Calls /api/arxiv_search backend endpoint (falls back to static demo if unavailable)
           ──────────────────────────────────────────────────────────────────────────── */
        window._triggerArxivSearch = function(domainOverride) {
            var domain = domainOverride || sessionStorage.getItem('sovereign_domain') || 'PHYSICS';
            domain = domain.toUpperCase();

            /* Map to arXiv prefix */
            var prefixMap = {
                PHYSICS:'cond-mat.stat-mech+OR+quant-ph+OR+hep-th',
                MATHEMATICS:'math.ST+OR+math.DS+OR+math.OC',
                CS:'cs.LG+OR+cs.AI+OR+cs.SY',
                QBIO:'q-bio.NC+OR+q-bio.PE+OR+q-bio.MN',
                QFIN:'q-fin.RM+OR+q-fin.PR+OR+q-fin.MF',
                STAT:'stat.TH+OR+stat.ML+OR+stat.ME',
                EESS:'eess.SY+OR+eess.SP',
                ECON:'econ.TH+OR+econ.EM'
            };
            var prefix = prefixMap[domain] || 'cond-mat.stat-mech';

            /* Show searching indicator */
            var badge = document.getElementById('arxiv-skill-badge');
            if (badge) {
                var orig = badge.innerHTML;
                badge.innerHTML = '🔍 Searching arXiv...';
                badge.style.color = '#D4AF37';
                setTimeout(function() { badge.innerHTML = orig; badge.style.color = ''; }, 4000);
            }

            /* Call backend or fallback */
            fetch('/api/arxiv_search?domain=' + encodeURIComponent(domain) + '&prefix=' + encodeURIComponent(prefix) + '&max=10')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data && data.axioms && data.axioms.length > 0) {
                        console.log('[arXiv] Received', data.axioms.length, 'dynamic axioms for', domain);
                        /* Merge into DEMO and refresh */
                        if (typeof DEMO !== 'undefined') {
                            DEMO[domain] = (DEMO[domain] || []).concat(data.axioms);
                        }
                        if (typeof _op02AxiomRepoPanelRefresh === 'function') _op02AxiomRepoPanelRefresh();
                        /* Show HITL notification */
                        _arxivNotify(data.axioms.length, domain, data.query_used || '');
                    }
                })
                .catch(function(e) {
                    console.info('[arXiv] Backend unavailable, using static demo:', e.message);
                    /* Graceful degradation — static demo still renders */
                });
        };

        function _arxivNotify(count, domain, query) {
            /* Insert a small notification row at top of elected panel */
            var panels = document.querySelectorAll('.am-list-container, [id*="axm-elect"]');
            panels.forEach(function(p) {
                var note = document.createElement('div');
                note.style.cssText = 'padding:4px 10px;font-size:9px;color:#58a6ff;background:#0d1117;border-bottom:1px solid #30363d;font-family:Calibri,sans-serif;';
                note.innerHTML = '\ud83d\udce1 <strong>arXiv skill</strong> found <strong>' + count + '</strong> new axioms for <em>' + domain + '</em>';
                if (p.firstChild) p.insertBefore(note, p.firstChild);
            });
        }

        /* Auto-trigger arXiv search if domain is known and axiom count is low */
        setTimeout(function() {
            var dom = sessionStorage.getItem('sovereign_domain');
            if (dom && typeof DEMO !== 'undefined') {
                var key = dom.toUpperCase();
                if (!DEMO[key] || DEMO[key].length < 2) {
                    console.info('[arXiv] Auto-triggering search for low-axiom domain:', key);
                    window._triggerArxivSearch(key);
                }
            }
        }, 1500);
"""

# ══════════════════════════════════════════════════════════════════════════════
#  APPLY TO OP-02
# ══════════════════════════════════════════════════════════════════════════════
print("=== Applying arXiv taxonomy to OP-02 ===")
with open(OP02, encoding='utf-8') as f:
    s2 = f.read()

changes2 = []

# 1. Replace DEMO object
old_demo_start = s2.find('var DEMO = {')
if old_demo_start >= 0:
    old_demo_end = s2.find('\n    };\n', old_demo_start) + len('\n    };\n')
    s2 = s2[:old_demo_start] + ARXIV_DEMO_JS + '\n' + s2[old_demo_end:]
    changes2.append('✓ DEMO replaced (3→8 arXiv domains, 32 axioms)')
else:
    changes2.append('⚠ DEMO object not found')

# 2. Replace domain tabs
if OLD_TABS_OP02 in s2:
    s2 = s2.replace(OLD_TABS_OP02, NEW_TABS_OP02, 1)
    changes2.append('✓ Domain tabs 3→8 arXiv groups')
else:
    changes2.append('⚠ Domain tabs not found')

# 3. XAI badge
if OLD_XAI_BADGE_OP02 in s2:
    s2 = s2.replace(OLD_XAI_BADGE_OP02, NEW_XAI_BADGE_OP02, 1)
    changes2.append('✓ XAI badge updated to PHYSICS')
else:
    changes2.append('⚠ XAI badge not found')

# 4. Badge CSS
if OLD_BADGE_CSS_OP02 in s2:
    s2 = s2.replace(OLD_BADGE_CSS_OP02, NEW_BADGE_CSS_OP02, 1)
    changes2.append('✓ Badge CSS: 8 arXiv classes added')
else:
    changes2.append('⚠ Badge CSS not matched')

# 5. _currentDomain + ARXIV arrays
if OLD_DOMAIN_HANDLER in s2:
    s2 = s2.replace(OLD_DOMAIN_HANDLER, NEW_DOMAIN_HANDLER, 1)
    changes2.append('✓ _ARXIV_GROUPS array added')
else:
    changes2.append('⚠ _currentDomain line not found')

# 6. _getAxiomSets keys
if OLD_GETAXIOMSETS in s2:
    s2 = s2.replace(OLD_GETAXIOMSETS, NEW_GETAXIOMSETS, 1)
    changes2.append('✓ _getAxiomSets keys 3→8')
else:
    changes2.append('⚠ _getAxiomSets not found')

# 7. domClass mapping
if OLD_CLASS_MAP in s2:
    s2 = s2.replace(OLD_CLASS_MAP, NEW_CLASS_MAP, 1)
    changes2.append('✓ domClass mapping 3→8')
else:
    changes2.append('⚠ domClass mapping not found')

# 8. label array
if OLD_XAI_LABEL in s2:
    s2 = s2.replace(OLD_XAI_LABEL, NEW_XAI_LABEL, 1)
    changes2.append('✓ XAI label array 3→8')
else:
    changes2.append('⚠ XAI label array not found')

# 9. Add arXiv dynamic search JS before last </script> in IIFE section
# Find the closing of the axiom panel IIFE
iife_close = s2.rfind('})();\n', 0, s2.find('op02AxiomRepoPanelsDomainAware') + 5000)
if iife_close > 0:
    # Insert after the IIFE
    insert_pt = iife_close + len('})();\n')
    s2 = s2[:insert_pt] + '\n<script>\n' + ARXIV_SEARCH_JS + '\n</script>\n' + s2[insert_pt:]
    changes2.append('✓ arXiv dynamic search JS injected')
else:
    changes2.append('⚠ IIFE close not found for JS injection')

with open(OP02, 'w', encoding='utf-8') as f:
    f.write(s2)

for c in changes2:
    print(' ', c)

# ══════════════════════════════════════════════════════════════════════════════
#  APPLY TO OP-01
# ══════════════════════════════════════════════════════════════════════════════
print("\n=== Applying arXiv taxonomy to OP-01 ===")
with open(OP01, encoding='utf-8') as f:
    s1 = f.read()

changes1 = []

# 1. Update domainMap
if OLD_DOMAINMAP_OP01 in s1:
    s1 = s1.replace(OLD_DOMAINMAP_OP01, NEW_DOMAINMAP_OP01, 1)
    changes1.append('✓ domainMap updated with arXiv taxonomy')
else:
    changes1.append('⚠ domainMap not found')

# 2. Null-guard for crash (same pattern as op_03): data.selectedIds
for old, new in [
    ("db.filter(a => data.selectedIds.includes(a.id))",
     "db.filter(a => (data.selectedIds||[]).includes(a.id))"),
    ("db.filter(a => data.candidateIds.includes(a.id))",
     "db.filter(a => (data.candidateIds||[]).includes(a.id))"),
    ("db.filter(a => data.standbyIds.includes(a.id))",
     "db.filter(a => (data.standbyIds||[]).includes(a.id))"),
    ("tiered.selected.length + ' ELECTED'",
     "(tiered.selected||[]).length + ' ELECTED'"),
]:
    if old in s1:
        s1 = s1.replace(old, new)
        changes1.append(f'✓ Crash fix: {old[:50]}...')

with open(OP01, 'w', encoding='utf-8') as f:
    f.write(s1)

for c in changes1:
    print(' ', c)

# ══════════════════════════════════════════════════════════════════════════════
#  FINAL VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════
print("\n=== FINAL INTEGRITY CHECKS ===")
for fname, s in [('OP-02', s2), ('OP-01', s1)]:
    print(f"\n{fname}:")
    checks = []
    if fname == 'OP-02':
        checks = [
            ('8 arXiv domain tabs', 'dedModalDomain(7)' in s),
            ('PHYSICS demo axioms', 'PHYSICS:' in s and 'Noether' in s),
            ('MATHEMATICS demo axioms', 'MATHEMATICS:' in s and 'Banach' in s),
            ('CS demo axioms', 'CS:' in s and 'PAC' in s),
            ('QBIO demo axioms', 'QBIO:' in s and 'Hardy-Weinberg' in s),
            ('QFIN demo axioms', 'QFIN:' in s and 'Black-Scholes' in s),
            ('STAT demo axioms', 'STAT:' in s and 'Central Limit' in s),
            ('EESS demo axioms', 'EESS:' in s and 'Nyquist' in s),
            ('ECON demo axioms', 'ECON:' in s and 'Nash' in s),
            ('arXiv badge CSS', '.xai-domain-badge.physics' in s),
            ('arXiv search JS', '_triggerArxivSearch' in s),
            ('_ARXIV_GROUPS array', '_ARXIV_GROUPS' in s),
        ]
    else:
        checks = [
            ('arXiv taxonomy in domainMap', 'PHYSICS:' in s and 'astro-ph' in s),
            ('crash fix selectedIds', "(data.selectedIds||[])" in s),
        ]
    for label, ok in checks:
        print(f"  {'✓' if ok else '✗ FAIL'} {label}")

print("\nDone.")
