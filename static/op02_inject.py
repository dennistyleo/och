#!/usr/bin/env python3
"""
op02_inject.py - Injects arXiv DEMO rendering IIFE into original op_02.html
Single-pass, inserts before </body>.
"""
import sys

OP02 = '/Users/leodennis/MODULARIZED_XRAG/static/op_02.html'
with open(OP02, encoding='utf-8') as f:
    s = f.read()
print(f"Loaded: {len(s)} chars")

IIFE = r"""
<style>
/* arXiv Demo Axiom Panel Styles */
.arxiv-demo-header {
    padding: 5px 10px;
    font-size: 10px;
    color: #1565C0;
    background: #f0f5ff;
    border-bottom: 1px solid #dde8f8;
    font-family: Calibri, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.arxiv-demo-header .search-btn {
    cursor: pointer;
    color: #1565C0;
    font-weight: 700;
    background: none;
    border: 1px solid #1565C0;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 9px;
}
.arxiv-ax-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 11px;
    font-family: Calibri, sans-serif;
    background: #ffffff;
}
.arxiv-ax-id   { color: #888; font-weight: 700; min-width: 80px; font-size: 10px; }
.arxiv-ax-name { color: #333; flex: 1; }
.arxiv-ax-badge { color: #1565C0; font-size: 8px; font-weight: 700; white-space: nowrap; }
.arxiv-ax-fp   { color: #aaa; font-size: 8px; font-style: italic; margin-top: 2px; }
.arxiv-ax-val  { color: #666; font-size: 9px; white-space: nowrap; }
.arxiv-verdict-allow  { color: #2e7d32; font-weight: 700; min-width: 52px; font-size: 10px; }
.arxiv-verdict-refuse { color: #c62828; font-weight: 700; min-width: 52px; font-size: 10px; }

/* arXiv domain indicator badge */
#arxiv-domain-indicator {
    display: inline-flex; align-items: center; gap: 4px;
    background: #0d1117; border: 1px solid #30363d; border-radius: 4px;
    padding: 2px 8px; font-size: 9px; color: #58a6ff;
    font-family: Calibri, monospace; margin-top: 4px;
    cursor: pointer;
}
</style>

<script>
/* ============================================================
   SOVEREIGN OP-02 — arXiv Domain-Aware Axiom Panel Renderer
   Fills ded-body-op02-1 and ded-body-op02-2 with representative
   arXiv axioms when no live G3FP election data is present.
   Version: 2.0 (arXiv taxonomy, 8 domains, 32 axioms)
   ============================================================ */
(function op02ArxivRepoPanels() {

    /* ── 8 arXiv domain groups with representative axioms ── */
    var DEMO = {
        PHYSICS: [
          {id:'PHYS-T001', name:'Noether Conservation Theorem',
           formula:'dL/dt=0 => integral E dt = const',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'invariant',
           fingerprint:'Noether symmetry conservation energy Lagrangian invariant',
           arxiv:'math-ph/0206006', source:'arXiv'},
          {id:'PHYS-T002', name:'Von Neumann Entropy S(rho)>=0',
           formula:'S(rho)=-Tr(rho log rho)>=0',
           verdict:'ALLOW', computed:0.73, threshold:0.00, unit:'nats',
           fingerprint:'von Neumann entropy quantum density matrix information',
           arxiv:'quant-ph/0004017', source:'arXiv'},
          {id:'PHYS-T003', name:'Bell-Tsirelson Bound |S|<=2sqrt2',
           formula:'|S| <= 2*sqrt(2); |S|>2 => quantum entanglement',
           verdict:'ALLOW', computed:2.41, threshold:2.83, unit:'|S|',
           fingerprint:'Bell Tsirelson quantum entanglement CHSH bound violation',
           arxiv:'quant-ph/0402128', source:'arXiv'},
          {id:'PHYS-T004', name:'Bekenstein Entropy Bound',
           formula:'S <= 2*pi*R*E/(hbar*c)',
           verdict:'ALLOW', computed:0.89, threshold:1.00, unit:'S/Smax',
           fingerprint:'Bekenstein entropy holographic black hole energy radius',
           arxiv:'hep-th/9305016', source:'arXiv'}
        ],
        MATHEMATICS: [
          {id:'MATH-T001', name:'Banach Fixed-Point Theorem',
           formula:'exists! x*: T(x*)=x*, d(T(x),T(y))<=q*d(x,y) q<1',
           verdict:'ALLOW', computed:0.34, threshold:1.00, unit:'q',
           fingerprint:'Banach contraction fixed point convergence metric space unique',
           arxiv:'math/0602098', source:'arXiv'},
          {id:'MATH-T002', name:'Goedel Completeness Theorem',
           formula:'|- phi => |= phi (provable implies valid)',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'sound',
           fingerprint:'Godel completeness soundness first-order logic proof semantic',
           arxiv:'math/0501449', source:'arXiv'},
          {id:'MATH-T003', name:'Cramer-Rao Lower Bound Var>=1/I',
           formula:'Var(theta-hat) >= 1/I(theta)',
           verdict:'ALLOW', computed:0.12, threshold:0.10, unit:'Var',
           fingerprint:'Cramer Rao Fisher information estimator variance lower bound',
           arxiv:'math.ST/0306564', source:'arXiv'},
          {id:'MATH-T004', name:'Hahn-Banach Extension Theorem',
           formula:'||F|| = ||f||, F|V = f (norm-preserving extension)',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'norm',
           fingerprint:'Hahn Banach extension functional analysis bounded linear form',
           arxiv:'math.FA/0601618', source:'arXiv'}
        ],
        CS: [
          {id:'CS-T001', name:'PAC Learning VC-Dimension Bound',
           formula:'m >= (1/eps)*(d*ln(1/eps)+ln(1/delta))',
           verdict:'ALLOW', computed:1024, threshold:800, unit:'samples',
           fingerprint:'PAC learning VC dimension sample complexity generalization',
           arxiv:'cs.LG/0406013', source:'arXiv'},
          {id:'CS-T002', name:'SGD Convergence E[||grad||^2]<=O(1/sqrt(T))',
           formula:'E[||grad f||^2] <= O(1/sqrt(T))',
           verdict:'ALLOW', computed:0.031, threshold:0.10, unit:'||grad||^2',
           fingerprint:'SGD stochastic gradient descent convergence neural network',
           arxiv:'cs.LG/1609.04747', source:'arXiv'},
          {id:'CS-T003', name:'Transformer Attention O(n^2 d)',
           formula:'T_attn = O(n^2*d) -- quadratic complexity',
           verdict:'REFUSE', computed:16777216, threshold:10000000, unit:'ops',
           fingerprint:'transformer attention quadratic complexity BERT GPT compute',
           arxiv:'cs.CL/1706.03762', source:'arXiv'},
          {id:'CS-T004', name:'Byzantine Fault Tolerance f<n/3',
           formula:'f < n/3 (BFT consensus safety bound)',
           verdict:'ALLOW', computed:0.15, threshold:0.33, unit:'f/n',
           fingerprint:'Byzantine fault tolerance consensus distributed quorum BFT',
           arxiv:'cs.DC/9806016', source:'arXiv'}
        ],
        QBIO: [
          {id:'QBIO-T001', name:'Hardy-Weinberg Equilibrium p^2+2pq+q^2=1',
           formula:'p^2+2pq+q^2=1 (allele frequency stability)',
           verdict:'ALLOW', computed:0.998, threshold:1.00, unit:'p-val',
           fingerprint:'Hardy Weinberg equilibrium allele population genetics mating',
           arxiv:'q-bio.PE/0409009', source:'arXiv'},
          {id:'QBIO-T002', name:'Michaelis-Menten v=Vmax[S]/(Km+[S])',
           formula:'v = Vmax*[S]/(Km+[S])',
           verdict:'ALLOW', computed:42.3, threshold:48.0, unit:'uM/s',
           fingerprint:'Michaelis Menten enzyme kinetics substrate saturation',
           arxiv:'q-bio.BM/0306051', source:'arXiv'},
          {id:'QBIO-T003', name:'Hodgkin-Huxley Membrane Potential',
           formula:'Cm*dV/dt = I_ext - sum(g_i*(V-E_i))',
           verdict:'ALLOW', computed:-65.2, threshold:-90.0, unit:'mV',
           fingerprint:'Hodgkin Huxley membrane potential ion channel action potential',
           arxiv:'q-bio.NC/0410032', source:'arXiv'},
          {id:'QBIO-T004', name:'Lotka-Volterra Predator-Prey',
           formula:'dx/dt=a*x-b*x*y; dy/dt=d*x*y-g*y',
           verdict:'ALLOW', computed:0.91, threshold:0.50, unit:'stability',
           fingerprint:'Lotka Volterra predator prey population ecology equilibrium',
           arxiv:'q-bio.PE/0110053', source:'arXiv'}
        ],
        QFIN: [
          {id:'QFIN-T001', name:'Black-Scholes Option Pricing',
           formula:'C = S*N(d1) - K*exp(-rT)*N(d2)',
           verdict:'ALLOW', computed:12.4, threshold:10.0, unit:'USD',
           fingerprint:'Black Scholes option pricing arbitrage risk-neutral volatility',
           arxiv:'q-fin.PR/0102035', source:'arXiv'},
          {id:'QFIN-T002', name:'No-Arbitrage Fundamental Theorem',
           formula:'E^Q[X_T] <= X_0*exp(rT) (no risk-free excess)',
           verdict:'ALLOW', computed:0.00, threshold:0.00, unit:'arb',
           fingerprint:'no arbitrage martingale measure risk-neutral complete market',
           arxiv:'q-fin.GF/0303029', source:'arXiv'},
          {id:'QFIN-T003', name:'Kelly Criterion f*=(b*p-q)/b',
           formula:'f* = (b*p-q)/b (optimal bet fraction)',
           verdict:'ALLOW', computed:0.12, threshold:0.20, unit:'f*',
           fingerprint:'Kelly criterion optimal fraction log wealth growth investment',
           arxiv:'q-fin.PM/0101032', source:'arXiv'},
          {id:'QFIN-T004', name:'CVaR >= VaR Coherence Gate',
           formula:'CVaR_alpha(X) >= VaR_alpha(X)',
           verdict:'ALLOW', computed:1.18, threshold:1.00, unit:'CVaR/VaR',
           fingerprint:'CVaR Expected Shortfall coherent risk measure portfolio tail',
           arxiv:'q-fin.RM/0203063', source:'arXiv'}
        ],
        STAT: [
          {id:'STAT-T001', name:'Central Limit Theorem',
           formula:'(X_bar-mu)/(sigma/sqrt(n)) -> N(0,1) as n->inf',
           verdict:'ALLOW', computed:0.97, threshold:0.95, unit:'KS p-val',
           fingerprint:'central limit theorem CLT normal distribution iid asymptotic',
           arxiv:'math.ST/0411437', source:'arXiv'},
          {id:'STAT-T002', name:'Bayes Optimal Posterior',
           formula:'P(theta|X) proportional to P(X|theta)*P(theta)',
           verdict:'ALLOW', computed:0.83, threshold:0.60, unit:'MAP',
           fingerprint:'Bayes posterior prior likelihood inference optimal decision',
           arxiv:'stat.ML/0504094', source:'arXiv'},
          {id:'STAT-T003', name:'Minimax Risk Lower Bound',
           formula:'inf sup R(theta, theta-hat) >= eps^2',
           verdict:'ALLOW', computed:0.042, threshold:0.030, unit:'eps^2',
           fingerprint:'minimax risk lower bound estimator decision theory rate',
           arxiv:'stat.TH/0603065', source:'arXiv'},
          {id:'STAT-T004', name:'Bonferroni Correction alpha/m',
           formula:'alpha_corrected = alpha/m (FWER control)',
           verdict:'ALLOW', computed:0.005, threshold:0.05, unit:'alpha/m',
           fingerprint:'Bonferroni multiple testing family-wise error p-value',
           arxiv:'stat.ME/0507350', source:'arXiv'}
        ],
        EESS: [
          {id:'EESS-T001', name:'Nyquist-Shannon fs >= 2B',
           formula:'f_s >= 2*B (no aliasing condition)',
           verdict:'ALLOW', computed:44100, threshold:40000, unit:'Hz',
           fingerprint:'Nyquist Shannon sampling theorem bandwidth aliasing signal',
           arxiv:'eess.SP/0307016', source:'arXiv'},
          {id:'EESS-T002', name:'Lyapunov Asymptotic Stability V_dot<0',
           formula:'V_dot(x)<0 forall x!=0 (asymptotic stability)',
           verdict:'ALLOW', computed:-0.23, threshold:0.00, unit:'V_dot',
           fingerprint:'Lyapunov stability control energy function positive definite',
           arxiv:'eess.SY/0207001', source:'arXiv'},
          {id:'EESS-T003', name:'Bode Gain-Phase Relationship',
           formula:'angle H(jw) = -(d|H|/dw)*(pi/2) (minimum-phase)',
           verdict:'ALLOW', computed:-42.0, threshold:-90.0, unit:'deg',
           fingerprint:'Bode gain phase minimum-phase frequency response Hilbert',
           arxiv:'eess.SP/0109036', source:'arXiv'},
          {id:'EESS-T004', name:'Shannon Capacity C=B*log2(1+SNR)',
           formula:'C = B*log2(1+SNR)',
           verdict:'ALLOW', computed:28.4, threshold:25.0, unit:'Mbps',
           fingerprint:'Shannon capacity noise SNR bandwidth AWGN communication limit',
           arxiv:'eess.SP/0104019', source:'arXiv'}
        ],
        ECON: [
          {id:'ECON-T001', name:'Nash Equilibrium Existence',
           formula:'forall finite game: exists Nash equilibrium (Nash 1951)',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'exists',
           fingerprint:'Nash equilibrium mixed strategy game theory fixed point',
           arxiv:'econ.TH/0412098', source:'arXiv'},
          {id:'ECON-T002', name:"Arrow's Impossibility Theorem",
           formula:'no SWF satisfies unanimity+IIA+non-dictatorship',
           verdict:'REFUSE', computed:0.00, threshold:1.00, unit:'satisfied',
           fingerprint:'Arrow impossibility social choice welfare function voting',
           arxiv:'econ.TH/0109037', source:'arXiv'},
          {id:'ECON-T003', name:'Revelation Principle',
           formula:'forall M: exists truth-telling DSIC M-prime',
           verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'DSIC',
           fingerprint:'revelation principle mechanism design dominant strategy',
           arxiv:'econ.TH/0208046', source:'arXiv'},
          {id:'ECON-T004', name:'Pareto Optimality Gate',
           formula:'u_i(x)>=u_i(y) forall i, exists i: u_i(x)>u_i(y)',
           verdict:'ALLOW', computed:0.87, threshold:0.80, unit:'PO score',
           fingerprint:'Pareto optimality efficiency welfare utility allocation',
           arxiv:'econ.TH/0109027', source:'arXiv'}
        ]
    };

    /* ── Domain alias map: old/unknown -> arXiv group ── */
    var DOMAIN_ALIAS = {
        FPGA:'PHYSICS', AEROSPACE:'PHYSICS', SIGNAL:'EESS', HARDWARE:'EESS',
        HEALTHCARE:'QBIO', HEALTH:'QBIO', MED:'QBIO', CLIN:'QBIO', HC:'QBIO',
        FINANCE:'QFIN', FINANCIAL:'QFIN', ECONOMICS:'ECON',
        ML:'CS', AI:'CS', NEURAL:'CS', SOFTWARE:'CS',
        STATISTICS:'STAT', CONTROL:'EESS', THERMAL:'PHYSICS',
        GENERAL:'PHYSICS', DEFAULT:'PHYSICS'
    };

    /* ── Verdict color map ── */
    var VC = { ALLOW:'#2e7d32', REFUSE:'#c62828', WARN:'#e65100', REVIEW:'#1565C0' };

    /* ── Build the HTML for a set of axioms ── */
    function buildDemoHTML(axioms, domainLabel) {
        var h = '';
        h += '<div class="arxiv-demo-header">';
        h += '<span><strong>[arXiv] Demo Axioms</strong> &mdash; ' + domainLabel + '</span>';
        h += '<button class="search-btn" onclick="window._triggerArxivSearch&&window._triggerArxivSearch()">+ Search arXiv</button>';
        h += '</div>';

        axioms.forEach(function(ax) {
            var vc = VC[ax.verdict] || '#888';
            var cmp = (ax.computed != null) ? ax.computed : '-';
            var thr = (ax.threshold != null) ? ax.threshold : '-';
            var unt = ax.unit || '';
            var val = cmp + (unt ? ' ' + unt : '') + ' / thr: ' + thr + (unt ? ' ' + unt : '');

            h += '<div class="arxiv-ax-row">';
            h += '<span class="' + (ax.verdict === 'ALLOW' ? 'arxiv-verdict-allow' : 'arxiv-verdict-refuse') + '">' + ax.verdict + '</span>';
            h += '<span style="flex:1;">';
            h += '<span class="arxiv-ax-id">' + ax.id + '</span>';
            if (ax.source === 'arXiv') h += ' <span class="arxiv-ax-badge">[arXiv]</span>';
            h += '<br><span class="arxiv-ax-name">' + (ax.name || ax.id) + '</span>';
            if (ax.fingerprint) {
                var fp = ax.fingerprint.split(' ').slice(0,5).join(' | ');
                h += '<br><span class="arxiv-ax-fp">' + fp + '</span>';
            }
            h += '</span>';
            h += '<span class="arxiv-ax-val">' + val + '</span>';
            h += '</div>';
        });
        return h;
    }

    /* ── Detect domain from session ── */
    function getSessionDomain() {
        try {
            var tr = JSON.parse(sessionStorage.getItem('sovereign_tiered_results') || 'null');
            var t  = JSON.parse(sessionStorage.getItem('sovereign_tiered') || 'null');
            var dom = (tr && tr.domain)
                   || (t && t.primaryDomain)
                   || (t && t.detectedDomains && t.detectedDomains[0])
                   || sessionStorage.getItem('sovereign_domain')
                   || 'UNKNOWN';
            return dom.toUpperCase();
        } catch(_) { return 'UNKNOWN'; }
    }

    /* ── Render panels ── */
    function renderPanels() {
        var domain  = getSessionDomain();
        var resolved = DEMO[domain] ? domain : (DOMAIN_ALIAS[domain] || null);
        var axioms  = resolved ? DEMO[resolved] : null;

        /* If domain is UNKNOWN and no file uploaded: preserve static math formula */
        if (domain === 'UNKNOWN' && !axioms) return;

        /* Choose default PHYSICS if still no axioms */
        if (!axioms) { axioms = DEMO['PHYSICS']; resolved = 'PHYSICS'; }

        var html = buildDemoHTML(axioms, resolved);

        ['ded-body-op02-1', 'ded-body-op02-2'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            /* Skip if live elected axioms already loaded */
            if (el.querySelector('.am-ax')) return;
            el.innerHTML = html;
        });
    }

    /* ── arXiv dynamic search integration ── */
    window._triggerArxivSearch = function(domainOverride) {
        var dom = (domainOverride || getSessionDomain()).toUpperCase();
        if (dom === 'UNKNOWN') dom = 'PHYSICS';
        var prefixMap = {
            PHYSICS:'cond-mat.stat-mech+OR+quant-ph',
            MATHEMATICS:'math.ST+OR+math.DS',
            CS:'cs.LG+OR+cs.AI',
            QBIO:'q-bio.NC+OR+q-bio.PE',
            QFIN:'q-fin.RM+OR+q-fin.PR',
            STAT:'stat.TH+OR+stat.ML',
            EESS:'eess.SY+OR+eess.SP',
            ECON:'econ.TH+OR+econ.EM'
        };
        var ind = document.getElementById('arxiv-domain-indicator');
        if (ind) ind.textContent = 'Searching arXiv for ' + dom + '...';
        fetch('/api/arxiv_search?domain=' + encodeURIComponent(dom)
              + '&prefix=' + encodeURIComponent(prefixMap[dom] || 'cs.LG') + '&max=10')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data && data.axioms && data.axioms.length) {
                    DEMO[dom] = (DEMO[dom] || []).concat(data.axioms);
                    renderPanels();
                    if (ind) ind.textContent = '[arXiv] ' + data.axioms.length + ' new axioms for ' + dom;
                }
            }).catch(function(e) {
                if (ind) ind.textContent = '[arXiv] static mode';
                console.info('[arXiv] backend offline, using static demo');
            });
    };

    /* ── Run on load + delayed retries ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            renderPanels();
            setTimeout(renderPanels, 400);
            setTimeout(renderPanels, 1200);
        });
    } else {
        renderPanels();
        setTimeout(renderPanels, 400);
        setTimeout(renderPanels, 1200);
    }

    /* Auto-trigger arXiv search if domain known but axioms low */
    setTimeout(function() {
        var dom = getSessionDomain();
        if (dom !== 'UNKNOWN' && (!DEMO[dom] || DEMO[dom].length < 2)) {
            window._triggerArxivSearch(dom);
        }
    }, 2500);

    /* Expose DEMO globally for _updateXAI and ded-modal domain tabs */
    window._OP02_DEMO = DEMO;
    window._OP02_DOMAIN_ALIAS = DOMAIN_ALIAS;
    window._OP02_renderPanels = renderPanels;
    window._OP02_buildDemoHTML = buildDemoHTML;

})();
</script>
"""

# Inject before </body>
body_close_idx = s.rfind('</body>')
if body_close_idx < 0:
    print("ERROR: </body> not found")
    sys.exit(1)

s = s[:body_close_idx] + IIFE + s[body_close_idx:]
print(f"After injection: {len(s)} chars")

with open(OP02, 'w', encoding='utf-8') as f:
    f.write(s)
print("Saved op_02.html")

# Verify
print("\nIntegrity checks:")
for pat, desc in [
    ('Hardy-Weinberg', 'QBIO axiom'),
    ('Black-Scholes', 'QFIN axiom'),
    ('Nash', 'ECON axiom'),
    ('Nyquist', 'EESS axiom'),
    ('Cramer-Rao', 'MATH axiom'),
    ('PAC', 'CS axiom'),
    ('Noether', 'PHYSICS axiom'),
    ('Bonferroni', 'STAT axiom'),
    ('op02ArxivRepoPanels', 'IIFE present'),
    ('_triggerArxivSearch', 'arXiv search func'),
    ('renderPanels', 'render function'),
    ('ded-body-op02-1', 'container ID'),
    ('.am-ax', 'live axiom guard'),
    ('arxiv-ax-badge', 'arXiv badge CSS'),
    ('domain === \'UNKNOWN\' && !axioms) return', 'static formula preserved'),
]:
    ok = pat in s
    print(f"  {'OK' if ok else 'FAIL'} {desc}: {pat!r}")

sc_open = s.count('<script')
sc_close = s.count('</script>')
print(f"\n<script> tags: {sc_open} open, {sc_close} close — {'BALANCED' if sc_open==sc_close else 'IMBALANCED!'}")
print(f"Final file size: {len(s)} chars")
