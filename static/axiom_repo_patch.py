#!/usr/bin/env python3
"""
Sovereign Axiom Repository — Complete Reorganization Patch
Adds: Alex's OCG_APP equations (OCP), International canonical laws (INTL)
Updates: All axiom descriptions with G3FP/SAA semantic routing fingerprints
Both IIFE and safety-net renderers updated simultaneously.
"""
import re, os

OP03 = '/Users/leodennis/MODULARIZED_XRAG/static/op_03.html'

# ════════════════════════════════════════════════════════════════════════════
# 7-DOMAIN AXIOM REPOSITORY  (28 axioms)
# Domains: FON | OCP | CAU | STAB | PAL | OCM | INTL
# Each axiom description precisely encodes:
#   G3FP: required_fields | SAA match_conditions | semantic_fingerprint
#   Discriminator: what makes THIS axiom unique from siblings
# ════════════════════════════════════════════════════════════════════════════

DC_IIFE = """        var DC = {
            FON: { badge:'#1A237E', bg:'#E8EAF6', border:'#283593', text:'#1A237E' },  /* deep indigo  — Foundational Ontology Logic */
            OCP: { badge:'#E65100', bg:'#FFF3E0', border:'#BF360C', text:'#E65100' },  /* deep amber   — Ontological Core Primitives (Alex/OCG_APP) */
            CAU: { badge:'#004D40', bg:'#E0F2F1', border:'#00695C', text:'#004D40' },  /* deep teal    — Causal Deduction Layer */
            STAB:{ badge:'#0D47A1', bg:'#E3F2FD', border:'#1565C0', text:'#0D47A1' }, /* deep navy    — Stability & Convergence */
            PAL: { badge:'#4A148C', bg:'#F3E5F5', border:'#6A1B9A', text:'#4A148C' }, /* deep purple  — Physical Admissibility Layer */
            OCM: { badge:'#B71C1C', bg:'#FFEBEE', border:'#C62828', text:'#B71C1C' }, /* maroon       — OCM Deduction-Lock Engine */
            INTL:{ badge:'#1B5E20', bg:'#E8F5E9', border:'#2E7D32', text:'#1B5E20' }  /* deep green   — International Canonical Laws */
        };"""

DC_SN = """        var DC = {
            FON: { badge:'#1A237E', bg:'#E8EAF6', border:'#283593' },
            OCP: { badge:'#E65100', bg:'#FFF3E0', border:'#BF360C' },
            CAU: { badge:'#004D40', bg:'#E0F2F1', border:'#00695C' },
            STAB:{ badge:'#0D47A1', bg:'#E3F2FD', border:'#1565C0' },
            PAL: { badge:'#4A148C', bg:'#F3E5F5', border:'#6A1B9A' },
            OCM: { badge:'#B71C1C', bg:'#FFEBEE', border:'#C62828' },
            INTL:{ badge:'#1B5E20', bg:'#E8F5E9', border:'#2E7D32' }
        };"""

PS_IIFE = """        var PHASE_SUBTITLE = {
            gnn:{
                FON:'GNN \u00b7 Ontological Soundness & Truth-Ordering Network',
                OCP:'GNN \u00b7 Ontological Core Primitive Basis (Alex/OCG_APP)',
                CAU:'GNN \u00b7 d-Separation Causal Identification Graph',
                STAB:'GNN \u00b7 Lyapunov-Banach Stability Parameter Space',
                PAL:'GNN \u00b7 Physical Admissibility Layer Grid',
                OCM:'GNN \u00b7 Deduction-Lock DSM Election Graph',
                INTL:'GNN \u00b7 International Canonical Laws Network'
            },
            wm:{
                FON:'WM \u00b7 Meta-Logic Completeness Manifold',
                OCP:'WM \u00b7 (E_prop, \u03b5, v_\u03a6) Ontological Primitive Manifold',
                CAU:'WM \u00b7 Do-Calculus Identifiability Surface',
                STAB:'WM \u00b7 (\u03a6*, V\u0307) Lyapunov Stability Manifold',
                PAL:'WM \u00b7 (h(t), E_prop) Admissibility Surface',
                OCM:'WM \u00b7 (Score, q) Deduction-Gate Design Space',
                INTL:'WM \u00b7 Canonical Laws Verification Manifold'
            },
            cm:{
                FON:'CM \u00b7 Soundness\u2192Completeness Closure Chain',
                OCP:'CM \u00b7 E_prop\u2192\u03b5\u2192v_\u03a6 Propagation Corridor (Alex)',
                CAU:'CM \u00b7 Root Cause Cardinality Corridor',
                STAB:'CM \u00b7 Banach Fixed-Point Convergence Corridor',
                PAL:'CM \u00b7 Hazard\u2192E_prop Causal Corridor',
                OCM:'CM \u00b7 Deduction-Lock\u2192DOE Closure Chain',
                INTL:'CM \u00b7 Physical Law Causal Verification Chain'
            }
        };"""

PS_SN = """        var PHASE_SUBTITLE = {
            gnn:{ FON:'GNN \u00b7 Ontological Soundness Network', OCP:'GNN \u00b7 Ontological Core Primitives (Alex)', CAU:'GNN \u00b7 d-Separation Causal Graph', STAB:'GNN \u00b7 Lyapunov-Banach Stability Space', PAL:'GNN \u00b7 Physical Admissibility Grid', OCM:'GNN \u00b7 Deduction-Lock DSM Graph', INTL:'GNN \u00b7 International Canonical Laws' },
            wm: { FON:'WM \u00b7 Meta-Logic Completeness Manifold', OCP:'WM \u00b7 (E_prop,\u03b5,v_\u03a6) Primitive Manifold', CAU:'WM \u00b7 Do-Calculus Surface', STAB:'WM \u00b7 (\u03a6*,V\u0307) Stability Manifold', PAL:'WM \u00b7 (h(t),E_prop) Admissibility Surface', OCM:'WM \u00b7 (Score,q) Deduction Space', INTL:'WM \u00b7 Canonical Laws Manifold' },
            cm: { FON:'CM \u00b7 Soundness->Completeness Chain', OCP:'CM \u00b7 E_prop->\u03b5->v_\u03a6 Corridor (Alex)', CAU:'CM \u00b7 Root Cause Corridor', STAB:'CM \u00b7 Banach Convergence Corridor', PAL:'CM \u00b7 Hazard->E_prop Corridor', OCM:'CM \u00b7 DeductionLock->DOE Chain', INTL:'CM \u00b7 Physical Law Verification Chain' }
        };"""

# ─────────────────────────────────────────────────────────────────────────────
#  AXIOM DATA — 7 domains × 4 axioms = 28 total
#  desc field = G3FP/SAA semantic routing fingerprint
# ─────────────────────────────────────────────────────────────────────────────
AXIOMS_JS = r"""        /* ═══════════════════════════════════════════════════════════════════════════
           SOVEREIGN DEDUCTION AXIOM REPOSITORY  v3 — 7 Domains · 28 Axioms
           ───────────────────────────────────────────────────────────────────
           Sources:
             OCG_APP_02042026 (Alex) — §0.1–§0.8 Ontological Core Primitives
             SoS spec/30 (PAL/SST/Causal/DOE axioms)
             SoS spec/23 v2.0 (Axiom Schema, match_conditions, election logic)
             arXiv:1305.5506 Pearl — Do-Calculus Rules 1–3
             arXiv:2308.07336 FLD — Deductive Confidence Benchmarks
             arXiv:2604.09567 — Belnap 4-valued Paraconsistent Logic
             Shannon 1948 — Information Entropy
             Clausius 1854 — 2nd Law of Thermodynamics
             Boltzmann 1877 — Statistical Entropy
             Einstein 1905  — Mass-Energy Equivalence

           Each axiom 'desc' field encodes the G3FP/SAA Semantic Contract:
             G3FP: required_fields the parameter mapper must extract
             SAA: match_conditions logic for election scoring
             Discriminator: what makes this axiom unique among siblings
           ═══════════════════════════════════════════════════════════════════════════ */
        var _INLINE_AXIOM_SETS = [

          /* ── FON: Foundational Ontology Logic ───────────────────────────────────── */
          { id:'FON', label:'Foundational Ontology Logic', domain:'FON',
            cascades:[['FON-001','FON-004']],
            axioms:[
              { id:'FON-001', name:'Proof System Soundness Gate',
                desc:'G3FP: {any deduction output} | SAA: mode="deduction" AND pipeline_stage\u2265L2 — always active | Discriminates from FON-002 (confidence score) by validating the PROOF SYSTEM itself: every derivable formula must be semantically true in all models. | SAA-TAGS: [METATHEORY] [PROOF-SOUNDNESS] [PRE-FLIGHT]',
                formula:'\u22a2\u03c6 \u27f9 \u22a8\u03c6 — every syntactically derivable formula is semantically true in all models',
                verdict:'ALLOW', computed:0, threshold:0, unit:'violations', ref:'arXiv:2308.07336, G\u00f6del Completeness' },
              { id:'FON-002', name:'FLD Deductive Confidence Floor Gate',
                desc:'G3FP: {chain_confidence: float} | SAA: semantic_fingerprint\u2283{confidence, threshold, deduction-score} AND chain_computed=TRUE | Discriminates from FON-001 (proof structure) by testing the NUMERIC SCORE against the arXiv:2308.07336 GPT-4 benchmark floor \u22650.85. | SAA-TAGS: [CONFIDENCE-FLOOR] [CHAIN-QUALITY] [FLD-BENCHMARK]',
                formula:'FLD_conf \u2265 0.85 — deductive chain confidence at or above GPT-4-level benchmark (arXiv:2308.07336)',
                verdict:'ALLOW', computed:0.91, threshold:0.85, unit:'conf', ref:'arXiv:2308.07336 §4' },
              { id:'FON-003', name:'Belnap Paraconsistent Truth-Value Gate',
                desc:'G3FP: {truth_values: [{P, truth_val}]} | SAA: entity_keywords\u2283{unknown, inconsistent, ambiguous, paraconsistent} — fires BEFORE classical contradiction check | Discriminates from FON-004 (P\u2227\u00acP) by handling Belnap UNKNOWNS \u22a5_k and INCONSISTENTS \u22a4_k that classical logic cannot distinguish. | SAA-TAGS: [PARACONSISTENT] [BELNAP] [TRUTH-VALUE-AMBIGUITY]',
                formula:'truth_val \u2209 {\u22a5_k, \u22a4_k} — no fact in KB may have unknown or inconsistent Belnap truth value',
                verdict:'ALLOW', computed:0, threshold:0, unit:'ambiguous', ref:'arXiv:2604.09567, Belnap 1977' },
              { id:'FON-004', name:'Non-Contradiction Hard Gate',
                desc:'G3FP: {proposition_pairs: [{P, not_P}]} | SAA: entity_keywords\u2283{contradiction, conflict, dual-assertion} — fires on ALL deduction mode runs | Discriminates from FON-003 (Belnap unknowns) by requiring BOTH P AND \u00acP to be EXPLICITLY simultaneously asserted in KB. | SAA-TAGS: [CONTRADICTION] [CLASSICAL-LOGIC] [KB-INTEGRITY] [HARD-GATE]',
                formula:'\u00ac(P \u2227 \u00acP) \u2200P in knowledge base — classical non-contradiction, zero tolerance',
                verdict:'ALLOW', computed:0, threshold:0, unit:'contradictions', ref:'Aristotle, Metaphysics \u0393; SoS global rules' }
            ]},

          /* ── OCP: Ontological Core Primitives — Alex's Equations (OCG_APP) ────── */
          { id:'OCP', label:'Ontological Core Primitives \u2014 Alex/OCG_APP', domain:'OCP',
            cascades:[['OCP-001','OCP-002'],['OCP-002','OCP-003'],['OCP-003','OCP-004']],
            axioms:[
              { id:'OCP-001', name:'Propositional Surplus Gate \u00b7 E\u2212M [Alex §0.1]',
                desc:'G3FP: {E: evidence_scalar\u22650, M: model_constraint_scalar\u22650} | SAA: domain\u2208[ANY] AND entity_keywords\u2283{evidence, model, constraint, surplus} | Discriminates from OCP-002 (regime ratio \u03b5=M/E) by testing the SIGN of E\u2212M (positive vs negative), not the ratio. Source: OCG_APP §0.1. | SAA-TAGS: [PROPOSITIONAL-SURPLUS] [E-MINUS-M] [ONTOLOGICAL-PRIMITIVE]',
                formula:'E_prop = E \u2212 M \u2265 0 — evidence scalar exceeds model constraint scalar; REFUSE if model over-constrains evidence',
                verdict:'ALLOW', computed:0.13, threshold:0.00, unit:'E\u2212M', ref:'OCG_APP_02042026 §0.1, Alex 2026' },
              { id:'OCP-002', name:'Regime Coordinate Gate \u00b7 \u03b5=M/E [Alex §0.1]',
                desc:'G3FP: {M, E} post OCP-001=ALLOW | SAA: OCP-001=ALLOW AND entity_keywords\u2283{regime, compression, constraint-ratio} | Discriminates from OCP-001 (surplus sign) by computing the REGIME RATIO \u03b5\u2208[0,1] — the unique coordinate of epistemic compression. Source: OCG_APP §0.1. | SAA-TAGS: [REGIME-COORDINATE] [EPISTEMIC-COMPRESSION] [EPSILON-GATE]',
                formula:'\u03b5 = M/E, \u03b5 \u2208 [0, 1] — unique regime coordinate; \u03b5\u21921 means model saturates all evidence (critical)',
                verdict:'ALLOW', computed:0.85, threshold:1.00, unit:'\u03b5', ref:'OCG_APP_02042026 §0.1, Alex 2026' },
              { id:'OCP-003', name:'Sovereign Propagation Speed Gate \u00b7 v\u03a6=C\u03a6\u00b7\u221a(1\u2212\u03b5) [Alex §0.1]',
                desc:'G3FP: {\u03b5 from OCP-002, C_Phi: sovereign_speed_constant} | SAA: OCP-002=ALLOW AND semantic_fingerprint\u2283{propagation, corridor, sovereign-speed, verdict-velocity} | Discriminates from Banach (STAB-003, discrete iteration) by measuring CONTINUOUS PROPAGATION VELOCITY of verdicts through the sovereign network — analogous to de Broglie wave speed in epistemic space. Source: OCG_APP §0.1. | SAA-TAGS: [PROPAGATION-SPEED] [SOVEREIGN-VELOCITY] [CORRIDOR-GATE]',
                formula:'v_\u03a6(\u03b5) = C_\u03a6 \u00b7 \u221a(1\u2212\u03b5), v_\u03a6/C_\u03a6 \u2208 [0,1] — verdict propagation speed; zero at \u03b5=1 (system frozen)',
                verdict:'ALLOW', computed:0.39, threshold:1.00, unit:'v\u03a6/C\u03a6', ref:'OCG_APP_02042026 §0.1, Alex 2026' },
              { id:'OCP-004', name:'Inverse Admissibility Cardinality Gate \u00b7 ALLOW\u21d4|\u03a0\u207b\u00b9|=1 [Alex §0.3]',
                desc:'G3FP: {O_obs: observable, Pi: frozen_projection} | SAA: mode="deduction" AND semantic_fingerprint\u2283{admissibility, singleton, cardinality, frozen-projection, deterministic-commitment} | Discriminates from ALL other gates by being the CARDINALITY CONDITION — the singular axiom of DECISION=PROOF. |Π⁻¹|=1→ALLOW, ≥2→REFUSE, ∅→BLOCK. Source: OCG_APP §0.3,§0.8. | SAA-TAGS: [INVERSE-ADMISSIBILITY] [CARDINALITY] [DECISION=PROOF] [HALLUCINATION-GATE]',
                formula:'ALLOW \u21d4 |\u03a0\u207b\u00b9(O_obs,\u03a0)|=1; REFUSE \u21d4 |\u03a0\u207b\u00b9|\u22652; BLOCK \u21d4 \u03a0\u207b\u00b9=\u2205 — no probabilistic tie-breaking permitted',
                verdict:'ALLOW', computed:1, threshold:1, unit:'|\u03a0\u207b\u00b9|', ref:'OCG_APP_02042026 §0.3, §0.8, Alex 2026' }
            ]},

          /* ── CAU: Causal Deduction Layer ─────────────────────────────────────────── */
          { id:'CAU', label:'Causal Deduction Layer', domain:'CAU',
            cascades:[['CAU-001','CAU-003'],['CAU-003','PAL-001']],
            axioms:[
              { id:'CAU-001', name:'Pearl Do-Rule 1 \u00b7 Observation Removal Gate',
                desc:'G3FP: {G_X_bar: mutilated_graph, Y,Z,X,W: node_sets, do_x: intervention} | SAA: semantic_fingerprint\u2283{do-calculus, observation-removal, d-separation, G-X-bar} AND do_operator_present=TRUE | Discriminates from CAU-002 (action\u2194observation EXCHANGE) by REMOVING Z from conditioning set only — not swapping it. | SAA-TAGS: [DO-RULE-1] [OBSERVATION-REMOVAL] [G-X-BAR] [D-SEPARATION]',
                formula:'P(y|do(x),z,w)=P(y|do(x),w) iff (Y\u22a5Z|X,W) in G_X\u0305 — observation Z dropped when d-separated in mutilated graph',
                verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'d-sep', ref:'arXiv:1305.5506, Pearl 2009' },
              { id:'CAU-002', name:'Pearl Do-Rule 2 \u00b7 Action\u2194Observation Exchange Gate',
                desc:'G3FP: {G_X_bar_Z_underline: doubly_mutilated_graph, do_z: intervention_variable} | SAA: semantic_fingerprint\u2283{action-exchange, do-swap, bidirectional, G-X-bar-Z-underline} AND both_do_x_and_do_z_present=TRUE | Discriminates from CAU-001 (drop Z) by performing BIDIRECTIONAL do(z)\u2194z EXCHANGE using doubly-mutilated graph. | SAA-TAGS: [DO-RULE-2] [ACTION-EXCHANGE] [G-X-BAR-Z-UNDERLINE]',
                formula:'P(y|do(x),do(z),w)=P(y|do(x),z,w) iff (Y\u22a5Z|X,W) in G_X\u0305Z\u0332 — action Z replaced by observation when d-sep in doubly-mutilated graph',
                verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'d-sep', ref:'arXiv:1305.5506, Pearl 2009' },
              { id:'CAU-003', name:'Pearl Do-Rule 3 \u00b7 Identifiability Lock Gate',
                desc:'G3FP: {causal_query: str, do_operators: list, G_X_bar_Z_bar: graph} | SAA: semantic_fingerprint\u2283{identifiability, do-elimination, non-identifiable, admissibility-lock, pipeline-final} — activate LAST after CAU-001/002 | Discriminates from CAU-001/002 (removal/exchange) by being the COMPLETENESS GATE: remaining do() → REFUSE (non-identifiable query triggers DOE). | SAA-TAGS: [DO-RULE-3] [IDENTIFIABILITY-LOCK] [PIPELINE-FINAL] [DOE-TRIGGER]',
                formula:'do() eliminable via Rules 1-3 — remaining do() \u21d2 causal query is non-identifiable; REFUSE \u2192 DOE branch',
                verdict:'REFUSE', computed:2, threshold:0, unit:'unident.', ref:'arXiv:1305.5506, arXiv:1206.6831 (Shpitser)' },
              { id:'CAU-004', name:'Root Cause Sparsity Gate \u00b7 |R|\u2248\u03b1N',
                desc:'G3FP: {root_cause_count: int, N: total_node_count} post causal graph build | SAA: entity_keywords\u2283{root-cause, sparse, cardinality, alpha-ratio} AND causal_graph_built=TRUE | Discriminates from CAU-001/002/003 (causal IDENTIFICATION) by validating QUANTITY of roots, not identifiability. \u03b1>0.01 \u21d2 over-attribution; \u03b1<0.001 \u21d2 under-detection. | SAA-TAGS: [ROOT-CAUSE-SPARSITY] [CARDINALITY-BOUND] [ALPHA-RATIO] [POST-GRAPH]',
                formula:'|R| \u2248 \u03b1N, \u03b1 \u2208 [0.001, 0.01] — 0.1\u20131% of nodes are root causes; remaining 99%+ are downstream consequences',
                verdict:'ALLOW', computed:0.008, threshold:0.01, unit:'\u03b1', ref:'OCG_APP §0.4, SoS spec/23' }
            ]},

          /* ── STAB: Stability & Convergence Verification ──────────────────────────── */
          { id:'STAB', label:'Stability & Convergence', domain:'STAB',
            cascades:[['STAB-001','STAB-002'],['STAB-003','STAB-004']],
            axioms:[
              { id:'STAB-001', name:'Lyapunov Energy Function Shape Gate',
                desc:'G3FP: {V_x: lyapunov_candidate, x_star: equilibrium} | SAA: semantic_fingerprint\u2283{lyapunov, positive-definite, energy-function, equilibrium} AND continuous_time_system=TRUE | Discriminates from STAB-002 (V\u0307 derivative sign) by validating SHAPE ONLY — V must be positive definite before derivative is meaningful. Must pass first. | SAA-TAGS: [LYAPUNOV-PD] [ENERGY-SHAPE] [STEP-1-OF-2] [STABILITY]',
                formula:'V(0)=0 \u2227 V(x)>0 \u2200x\u22600 — Lyapunov energy function strictly positive definite; validates SHAPE before derivative',
                verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'PD', ref:'Lyapunov 1892, arXiv AI Safety Lean4' },
              { id:'STAB-002', name:'Lyapunov Derivative Negativity Gate',
                desc:'G3FP: {V_dot: float, gradient_V, f_x: system_dynamics} | SAA: semantic_fingerprint\u2283{asymptotic, V-dot, derivative-sign, rate-of-decrease} AND STAB-001=ALLOW | Discriminates from STAB-001 (shape) by validating TEMPORAL EVOLUTION: V\u0307 = \u2207V\u00b7f(x) < 0 strictly along system trajectories. Advisory if V\u0307\u22640 only. | SAA-TAGS: [LYAPUNOV-DERIVATIVE] [ASYMPTOTIC-STABILITY] [V-DOT] [STEP-2-OF-2]',
                formula:'V\u0307(x) = \u2207V\u00b7f(x) < 0 \u2200x\u22600 — strict rate-of-decrease along trajectories confirms asymptotic stability',
                verdict:'ALLOW', computed:-0.23, threshold:0.00, unit:'V\u0307', ref:'Lyapunov 1892, arXiv AI Safety Lean4' },
              { id:'STAB-003', name:'Banach Fixed-Point Convergence Gate',
                desc:'G3FP: {T_operator: iterative_fn, q_ratio: contraction_coeff, domain_X: metric_space} | SAA: semantic_fingerprint\u2283{contraction, fixed-point, banach, iteration, convergence-guarantee} AND discrete_iterative_process=TRUE | Discriminates from STAB-001/002 (Lyapunov, continuous-time) by applying to DISCRETE ITERATIVE operators (value iteration, belief propagation, deductive closure). | SAA-TAGS: [BANACH-CONTRACTION] [FIXED-POINT] [DISCRETE-ITERATIVE] [CONVERGENCE]',
                formula:'\u2203q\u2208[0,1): d(T(x),T(y))\u2264q\u00b7d(x,y) \u2200x,y \u2014 Lipschitz ratio q<1 guarantees unique fixed point and geometric convergence',
                verdict:'ALLOW', computed:0.34, threshold:1.00, unit:'q', ref:'Banach 1922, arXiv RL/Belief Propagation' },
              { id:'STAB-004', name:'Sovereign Stability Triad Index Gate \u00b7 \u03a6*',
                desc:'G3FP: {G_star: gnn_score, R_star: rag_score, M_star: model_score, w_G, w_R, w_M: weights} | SAA: domain\u2208[ANY] AND entity_keywords\u2283{GNN-score, RAG-score, model-score, sovereign-stability, phi-star} AND all_three_scores_available=TRUE | Discriminates from STAB-001/002/003 (mathematical stability) by computing the SOS-SPECIFIC composite index \u03a6* across GNN/RAG/Model components. | SAA-TAGS: [SST] [COMPOSITE-SCORE] [SOS-SPECIFIC] [PHI-STAR]',
                formula:'\u03a6* = w_G\u00b7G*+w_R\u00b7R*+w_M\u00b7M* \u2265 \u03a6_thr — SoS composite stability; w_G+w_R+w_M=1.0',
                verdict:'ALLOW', computed:0.83, threshold:0.75, unit:'\u03a6*', ref:'SoS spec/30_deduction_mode.md §3.1' }
            ]},

          /* ── PAL: Physical Admissibility Layer ───────────────────────────────────── */
          { id:'PAL', label:'Physical Admissibility Layer', domain:'PAL',
            cascades:[['PAL-001','PAL-002'],['PAL-002','OCM-003']],
            axioms:[
              { id:'PAL-001', name:'Domain Hazard Integral Gate \u00b7 \u222bH(domain,t)dt',
                desc:'G3FP: {H_domain_t: hazard_time_series[], h_max: domain_limit, time_window: float} | SAA: semantic_fingerprint\u2283{hazard, temporal-integral, accumulation, domain-limit, session-duration} AND telemetry_available=TRUE | Discriminates from PAL-002 (epistemic E\u2212M) by requiring TIME-SERIES hazard data H(domain,t) for temporal integration. | SAA-TAGS: [HAZARD-INTEGRAL] [TEMPORAL-ACCUMULATION] [DOMAIN-SPECIFIC] [TELEMETRY]',
                formula:'h(t) = \u222bH(domain,t)dt < h_max over evaluation window — cumulative domain hazard must not exceed limit',
                verdict:'REFUSE', computed:2.31, threshold:1.80, unit:'bits', ref:'SoS spec/30_deduction_mode.md §3.2 DEDUCT_PAL_001' },
              { id:'PAL-002', name:'Epistemic Energy Budget Gate \u00b7 E_prop\u22650',
                desc:'G3FP: {E: evidence_richness, M: model_complexity} | SAA: semantic_fingerprint\u2283{epistemic, knowledge-budget, propositional, E-minus-M} AND E_and_M_quantified=TRUE | Discriminates from PAL-003 (PHYSICAL energy conservation) by measuring EPISTEMIC (knowledge vs. model complexity) energy — not physical Joules. | SAA-TAGS: [EPISTEMIC-ENERGY] [KNOWLEDGE-BUDGET] [E-MINUS-M] [PROPOSITIONAL]',
                formula:'E_prop = E \u2212 M \u2265 0 — epistemic energy surplus; negative means model over-constrains available evidence',
                verdict:'REFUSE', computed:-0.12, threshold:0.00, unit:'ratio', ref:'SoS spec/30_deduction_mode.md §2, OCG_APP §0.1' },
              { id:'PAL-003', name:'Physical Conservation Law Gate \u00b7 |\u0394E|\u2264\u03b5',
                desc:'G3FP: {delta_E: energy_change_J, delta_p: momentum_change, epsilon_E: tolerance} | SAA: domain\u2208[PHYSICS,AEROSPACE,HARDWARE,ENERGY] AND semantic_fingerprint\u2283{conservation, delta-E, momentum, physical-tolerance, joules} | Discriminates from PAL-002 (epistemic E\u2212M) by targeting PHYSICAL CONSERVATION quantities in SI units. | SAA-TAGS: [PHYSICAL-CONSERVATION] [ENERGY-MOMENTUM] [TOLERANCE-GATE] [SI-UNITS]',
                formula:'|\u0394E|\u2264\u03b5_E \u2227 |\u0394p|\u2264\u03b5_p, \u03b5\u22641% — physical energy and momentum conserved within 1% tolerance across state transitions',
                verdict:'ALLOW', computed:0.003, threshold:0.01, unit:'\u0394E', ref:'Newton/Lagrange, arXiv AQFT 2024, AX-PA3' },
              { id:'PAL-004', name:'State Vector Norm Boundedness Gate \u00b7 \u2016x\u2016\u2264X_max',
                desc:'G3FP: {x_state_vector: float[], X_max: domain_bound_norm} | SAA: semantic_fingerprint\u2283{boundedness, state-vector, norm-check, domain-bounds, out-of-distribution} AND state_variables_computed=TRUE | Discriminates from PAL-003 (transition DELTA) by checking ABSOLUTE MAGNITUDE \u2016x\u2016 of the CURRENT state, not changes between states. | SAA-TAGS: [STATE-BOUNDEDNESS] [NORM-CHECK] [DOMAIN-BOUNDS] [OOD-GATE]',
                formula:'\u2016x\u2016 \u2264 X_max \u2200 state variables — no component exceeds its defined physical or ontological maximum',
                verdict:'ALLOW', computed:0.87, threshold:1.00, unit:'\u2016x\u2016', ref:'arXiv AX-PA4, SoS spec/30' }
            ]},

          /* ── OCM: Deduction-Lock Engine ──────────────────────────────────────────── */
          { id:'OCM', label:'OCM \u00b7 Deduction-Lock Engine', domain:'OCM',
            cascades:[['OCM-001','OCM-002'],['OCM-003','HITL']],
            axioms:[
              { id:'OCM-001', name:'Deduction FSM Determinism Gate \u00b7 |\u03b4(s,a)|=1',
                desc:'G3FP: {state_set: str[], transition_function: {s,a:\u2192s}, input_alphabet: str[]} | SAA: semantic_fingerprint\u2283{deterministic, state-machine, transition-uniqueness, automaton, FSM} AND pipeline_states_enumerated=TRUE | Discriminates from OCM-002 (election score) by validating STRUCTURAL DETERMINISM of the deduction automaton — every (state,input) has exactly one successor. | SAA-TAGS: [FSM-DETERMINISM] [TRANSITION-UNIQUENESS] [AUTOMATON-INTEGRITY] [DSM1]',
                formula:'\u2200s\u2208States, \u2200a\u2208Inputs: |\u03b4(s,a)|=1 — each (state,input) pair has exactly one successor; no ambiguous branching',
                verdict:'ALLOW', computed:0, threshold:0, unit:'violations', ref:'arXiv DSM1, AX-DSM1, OCG_APP §0.3 Lemma 1' },
              { id:'OCM-002', name:'Axiom Election Score Gate \u00b7 R\u00d70.4+C\u00d70.3+H\u00d70.2+(1-Cost)\u00d70.1',
                desc:'G3FP: {Relevance, Consistency, Historical_success, Cost: all floats} | SAA: semantic_fingerprint\u2283{election, score, relevance, consistency, historical, weighted-formula} AND pipeline_stage=L3 | Discriminates from OCM-001 (automaton) by operating on CANDIDATE AXIOM RANKING at stage L3 — the SAA election formula itself. | SAA-TAGS: [ELECTION-SCORE] [AXIOM-RANKING] [L3-STAGE] [OCM-SPECIFIC]',
                formula:'Score = R\u00d70.4+C\u00d70.3+H\u00d70.2+(1-Cost)\u00d70.1 \u2265 \u03b8_elect — SAA election gate (spec/21 OCM formula)',
                verdict:'ALLOW', computed:0.76, threshold:0.65, unit:'score', ref:'SoS spec/21 §OCM, spec/23 §v2.0' },
              { id:'OCM-003', name:'SymPy Sole-Evaluator Lock \u00b7 Zero-Hallucination Gate',
                desc:'G3FP: {param_gaps: int, evaluator_identity: str} | SAA: semantic_fingerprint\u2283{sympy, sole-evaluator, param-gap, zero-hallucination, deduction-lock} AND (param_gap_detected OR evaluator_identity_check) | Discriminates from OCM-001 (automaton structure) by testing COMPUTATIONAL PURITY — SymPy must be the ONLY evaluator; any AI-generated number REFUSES (OCG_APP Corollary 4). | SAA-TAGS: [SYMPY-LOCK] [ZERO-HALLUCINATION] [PARAM-GAPS] [SOLE-EVALUATOR]',
                formula:'param_gaps=0, SymPy sole evaluator — no stochastic injection; any AI-generated number \u21d2 REFUSE + HITL (OCG_APP Cor.4)',
                verdict:'REFUSE', computed:2, threshold:0, unit:'gaps', ref:'SoS spec/25_aipmc_rtl_spec.md, OCG_APP §0.8 Cor.4' },
              { id:'OCM-004', name:'Causal Temporal Antecedence Gate \u00b7 t_cause<t_effect',
                desc:'G3FP: {causal_pairs: [{cause, effect, t_cause, t_effect}]} post CAU identification | SAA: entity_keywords\u2283{temporal-order, timestamp, cause-effect-pair, antecedence} AND causal_pairs_available=TRUE | Discriminates from CAU-001/002/003 (causal IDENTIFICATION) by validating TEMPORAL ORDER of already-identified causal pairs — a post-identification gate. | SAA-TAGS: [TEMPORAL-ANTECEDENCE] [STRICT-TIME-ORDER] [POST-IDENTIFICATION] [CLCP]',
                formula:'t_cause < t_effect \u2200 causal pairs — strict temporal ordering; simultaneity \u21d2 REFUSE (acausality detected)',
                verdict:'ALLOW', computed:0, threshold:0, unit:'violations', ref:'SoS spec/30 DEDUCT_CAUSAL_001, AX-PA2' }
            ]},

          /* ── INTL: International Canonical Scientific Laws ─────────────────────── */
          { id:'INTL', label:'International Canonical Laws', domain:'INTL',
            cascades:[['INTL-001','INTL-002'],['INTL-003','INTL-004']],
            axioms:[
              { id:'INTL-001', name:'Shannon Information Entropy Gate \u00b7 H=\u2212\u03a3p\u1d62\u00b7log\u2082(p\u1d62)',
                desc:'G3FP: {P_i: probability_distribution[], N: alphabet_size} | SAA: semantic_fingerprint\u2283{entropy, information, uncertainty, bits, probability-distribution} AND probability_computed=TRUE | Discriminates from Boltzmann (INTL-004, thermodynamic microstates) by measuring INFORMATION entropy of event probabilities, not physical microstates. | SAA-TAGS: [SHANNON-ENTROPY] [INFORMATION-THEORY] [UNCERTAINTY-GATE] [BITS]',
                formula:'H(X) = \u2212\u03a3\u1d62 P(x\u1d62)\u00b7log\u2082P(x\u1d62) \u2264 H_max = log\u2082(N) bits — information entropy bounded by alphabet size',
                verdict:'ALLOW', computed:2.31, threshold:3.00, unit:'bits', ref:'Shannon, Bell Syst. Tech. J., 1948' },
              { id:'INTL-002', name:'Einstein Mass-Energy Equivalence \u00b7 E=mc\u00b2',
                desc:'G3FP: {m: mass_kg, c: 2.998e8, gamma: lorentz_factor} | SAA: domain\u2208[PHYSICS,AEROSPACE,ENERGY,HARDWARE] AND semantic_fingerprint\u2283{mass, energy, relativistic, rest-energy, equivalence} | Discriminates from PAL-003 (mechanical energy/momentum conservation) by computing REST MASS energy equivalence — the fundamental energy admissibility bound. | SAA-TAGS: [MASS-ENERGY] [EINSTEIN] [RELATIVISTIC] [ENERGY-ADMISSIBILITY]',
                formula:'E_rest = mc\u00b2; E_total = \u03b3mc\u00b2, \u03b3=(1\u2212v\u00b2/c\u00b2)\u207b\u00bd \u2014 rest and total relativistic energy bound for physical admissibility',
                verdict:'ALLOW', computed:1.00, threshold:1.00, unit:'E/E\u2080', ref:'Einstein, Annalen der Physik, 1905' },
              { id:'INTL-003', name:'Clausius 2nd Law Gate \u00b7 dS\u2265\u03b4Q/T',
                desc:'G3FP: {Q: heat_joules, T: temperature_kelvin, delta_S: entropy_change_J_per_K} | SAA: domain\u2208[THERMAL,AEROSPACE,ENERGY,HARDWARE] AND semantic_fingerprint\u2283{entropy, thermodynamic, heat, temperature, irreversible} | Discriminates from Boltzmann (INTL-004, statistical microstate count) by constraining PROCESS DIRECTION via heat-flow-over-temperature ratio. | SAA-TAGS: [CLAUSIUS-2ND-LAW] [THERMODYNAMIC] [ENTROPY-INCREASE] [PROCESS-DIRECTION]',
                formula:'dS \u2265 \u03b4Q/T — entropy of isolated system never decreases; irreversibility constraint on all physical processes',
                verdict:'ALLOW', computed:0.12, threshold:0.08, unit:'J/K', ref:'Clausius, Annalen der Physik, 1854' },
              { id:'INTL-004', name:'Boltzmann Statistical Entropy Gate \u00b7 S=k_B\u00b7ln(\u03a9)',
                desc:'G3FP: {Omega: microstate_count, k_B: 1.380649e-23} | SAA: semantic_fingerprint\u2283{microstate, statistical-mechanics, partition-function, entropy, Boltzmann} | Discriminates from Clausius (INTL-003, heat flow over T) by grounding entropy in MICROSTATE ENUMERATION \u03a9 — the statistical definition. | SAA-TAGS: [BOLTZMANN-ENTROPY] [STATISTICAL-MECHANICS] [MICROSTATE-COUNT] [S=kln\u03a9]',
                formula:'S = k_B \u00b7 ln(\u03a9), k_B=1.380649\u00d710\u207b\u00b2\u00b3 J/K \u2014 thermodynamic entropy from microstate count',
                verdict:'ALLOW', computed:1.95, threshold:0.00, unit:'\u00d710\u207b\u00b2\u00b2 J/K', ref:'Boltzmann, Sitzungsber. Akad. Wien, 1877' }
            ]}
        ];"""

# Safety-net SETS (same data, slightly condensed format)
SETS_SN = r"""        var SETS = [
          { label:'Foundational Ontology Logic', domain:'FON', cascades:[['FON-001','FON-004']],
            axioms:[
              {id:'FON-001',name:'Proof System Soundness Gate',
               desc:'G3FP: {any deduction output} | SAA: mode="deduction" AND pipeline_stage\u2265L2 | Discriminates from FON-002 (confidence score) by validating the PROOF SYSTEM: every derivable formula is true in all models. | [METATHEORY][PROOF-SOUNDNESS]',
               formula:'\u22a2\u03c6 \u27f9 \u22a8\u03c6 — every derivable formula is semantically true in all models', verdict:'ALLOW',  computed:0,    threshold:0,    unit:'violations'},
              {id:'FON-002',name:'FLD Deductive Confidence Floor Gate',
               desc:'G3FP: {chain_confidence: float} | SAA: semantic_fingerprint\u2283{confidence,threshold,deduction-score} | Discriminates from FON-001 (proof structure) by testing the NUMERIC SCORE against the arXiv:2308.07336 GPT-4 floor \u22650.85. | [CONFIDENCE-FLOOR][FLD-BENCHMARK]',
               formula:'FLD_conf \u2265 0.85 — deductive chain confidence \u22650.85 (arXiv:2308.07336 GPT-4 benchmark floor)', verdict:'ALLOW',  computed:0.91, threshold:0.85, unit:'conf'},
              {id:'FON-003',name:'Belnap Paraconsistent Truth-Value Gate',
               desc:'G3FP: {truth_values:[{P,truth_val}]} | SAA: entity_keywords\u2283{unknown,inconsistent,ambiguous} — fires BEFORE FON-004 | Discriminates from FON-004 (P\u2227\u00acP) by detecting BELNAP UNKNOWNS \u22a5_k/\u22a4_k. | [PARACONSISTENT][BELNAP]',
               formula:'truth_val \u2209 {\u22a5_k, \u22a4_k} — no KB fact may have unknown or inconsistent Belnap truth value', verdict:'ALLOW',  computed:0,    threshold:0,    unit:'ambiguous'},
              {id:'FON-004',name:'Non-Contradiction Hard Gate',
               desc:'G3FP: {proposition_pairs:[{P,not_P}]} | SAA: entity_keywords\u2283{contradiction,dual-assertion} — always active | Discriminates from FON-003 (Belnap unknowns) by requiring BOTH P AND \u00acP simultaneously asserted. | [CONTRADICTION][CLASSICAL-LOGIC]',
               formula:'\u00ac(P \u2227 \u00acP) \u2200P in KB — classical non-contradiction, zero tolerance', verdict:'ALLOW',  computed:0,    threshold:0,    unit:'contradictions'}]},
          { label:'Ontological Core Primitives \u2014 Alex/OCG_APP', domain:'OCP', cascades:[['OCP-001','OCP-002'],['OCP-002','OCP-003'],['OCP-003','OCP-004']],
            axioms:[
              {id:'OCP-001',name:'Propositional Surplus Gate \u00b7 E\u2212M [Alex §0.1]',
               desc:'G3FP: {E: evidence_scalar, M: model_constraint_scalar} | SAA: entity_keywords\u2283{evidence,model,constraint,surplus} | Discriminates from OCP-002 (\u03b5=M/E ratio) by testing the SIGN of E\u2212M. Source: OCG_APP §0.1. | [E-MINUS-M][ONTOLOGICAL-PRIMITIVE]',
               formula:'E_prop = E \u2212 M \u2265 0 — evidence scalar exceeds model constraint scalar (OCG_APP §0.1, Alex 2026)', verdict:'ALLOW',  computed:0.13, threshold:0.00, unit:'E\u2212M'},
              {id:'OCP-002',name:'Regime Coordinate Gate \u00b7 \u03b5=M/E [Alex §0.1]',
               desc:'G3FP: {M,E} post OCP-001=ALLOW | SAA: semantic_fingerprint\u2283{regime,compression,constraint-ratio} | Discriminates from OCP-001 (surplus SIGN) by computing RATIO \u03b5\u2208[0,1]. Source: OCG_APP §0.1. | [REGIME-COORDINATE][EPSILON-GATE]',
               formula:'\u03b5 = M/E, \u03b5 \u2208 [0,1] — unique regime coordinate; \u03b5\u21921 means model saturates all evidence (OCG_APP §0.1, Alex 2026)', verdict:'ALLOW',  computed:0.85, threshold:1.00, unit:'\u03b5'},
              {id:'OCP-003',name:'Sovereign Propagation Speed \u00b7 v\u03a6=C\u03a6\u00b7\u221a(1\u2212\u03b5) [Alex §0.1]',
               desc:'G3FP: {\u03b5 from OCP-002, C_Phi} | SAA: semantic_fingerprint\u2283{propagation,corridor,sovereign-speed} AND OCP-002=ALLOW | Discriminates from Banach (STAB-003, discrete iteration) by measuring CONTINUOUS propagation velocity. Source: OCG_APP §0.1. | [PROPAGATION-SPEED][SOVEREIGN-VELOCITY]',
               formula:'v_\u03a6(\u03b5) = C_\u03a6 \u00b7 \u221a(1\u2212\u03b5), v_\u03a6/C_\u03a6\u2208[0,1] — verdict propagation speed; zero at \u03b5=1 (OCG_APP §0.1, Alex 2026)', verdict:'ALLOW',  computed:0.39, threshold:1.00, unit:'v\u03a6/C\u03a6'},
              {id:'OCP-004',name:'Inverse Admissibility Cardinality Gate \u00b7 |\u03a0\u207b\u00b9|=1 [Alex §0.3]',
               desc:'G3FP: {O_obs: observable, Pi: frozen_projection} | SAA: semantic_fingerprint\u2283{admissibility,singleton,cardinality,frozen-projection,decision=proof} | Discriminates from ALL others: the CARDINALITY CONDITION. Source: OCG_APP §0.3,§0.8. | [INVERSE-ADMISSIBILITY][DECISION=PROOF]',
               formula:'ALLOW\u21d4|\u03a0\u207b\u00b9|=1; REFUSE\u21d4|\u03a0\u207b\u00b9|\u22652; BLOCK\u21d4\u03a0\u207b\u00b9=\u2205 — no probabilistic tie-breaking permitted (OCG_APP §0.3, Alex 2026)', verdict:'ALLOW',  computed:1,    threshold:1,    unit:'|\u03a0\u207b\u00b9|'}]},
          { label:'Causal Deduction Layer', domain:'CAU', cascades:[['CAU-001','CAU-003'],['CAU-003','PAL-001']],
            axioms:[
              {id:'CAU-001',name:'Pearl Do-Rule 1 \u00b7 Observation Removal Gate',
               desc:'G3FP: {G_X_bar,Y,Z,X,W} | SAA: semantic_fingerprint\u2283{do-calculus,observation-removal,G-X-bar} AND do_x_present=TRUE | Discriminates from CAU-002 (exchange) by REMOVING Z from conditioning set only. | [DO-RULE-1][OBSERVATION-REMOVAL]',
               formula:'P(y|do(x),z,w)=P(y|do(x),w) iff (Y\u22a5Z|X,W) in G_X\u0305 — observation removed when d-sep in mutilated graph', verdict:'ALLOW',  computed:1.00, threshold:1.00, unit:'d-sep'},
              {id:'CAU-002',name:'Pearl Do-Rule 2 \u00b7 Action\u2194Observation Exchange Gate',
               desc:'G3FP: {G_X_bar_Z_underline, do_z} | SAA: semantic_fingerprint\u2283{action-exchange,do-swap,G-X-bar-Z-underline} AND both_do_x_and_do_z=TRUE | Discriminates from CAU-001 (drop) by BIDIRECTIONAL do(z)\u2194z exchange. | [DO-RULE-2][ACTION-EXCHANGE]',
               formula:'P(y|do(x),do(z),w)=P(y|do(x),z,w) iff (Y\u22a5Z|X,W) in G_X\u0305Z\u0332 — action\u2194observation exchange', verdict:'ALLOW',  computed:1.00, threshold:1.00, unit:'d-sep'},
              {id:'CAU-003',name:'Pearl Do-Rule 3 \u00b7 Identifiability Lock Gate',
               desc:'G3FP: {causal_query,do_operators} | SAA: semantic_fingerprint\u2283{identifiability,do-elimination,pipeline-final} — LAST after CAU-001/002 | Discriminates from CAU-001/002 by being COMPLETENESS GATE: remaining do()\u21d2REFUSE+DOE. | [DO-RULE-3][IDENTIFIABILITY-LOCK]',
               formula:'do() must be eliminable via Rules 1-3 — any remaining do() operator signals non-identifiable query', verdict:'REFUSE', computed:2,    threshold:0,    unit:'unident.'},
              {id:'CAU-004',name:'Root Cause Sparsity Gate \u00b7 |R|\u2248\u03b1N',
               desc:'G3FP: {root_cause_count,N} post graph build | SAA: entity_keywords\u2283{root-cause,sparse,cardinality,alpha} AND graph_built=TRUE | Discriminates from CAU-001/002/003 (IDENTIFICATION) by validating QUANTITY not identifiability. | [ROOT-CAUSE-SPARSITY][ALPHA-RATIO]',
               formula:'|R| \u2248 \u03b1N, \u03b1\u2208[0.001,0.01] — 0.1\u20131% of nodes are root causes; 99%+ are downstream consequences', verdict:'ALLOW',  computed:0.008,threshold:0.01, unit:'\u03b1'}]},
          { label:'Stability & Convergence', domain:'STAB', cascades:[['STAB-001','STAB-002'],['STAB-003','STAB-004']],
            axioms:[
              {id:'STAB-001',name:'Lyapunov Energy Function Shape Gate',
               desc:'G3FP: {V_x,x_star:equilibrium} | SAA: semantic_fingerprint\u2283{lyapunov,positive-definite,energy-function} AND continuous_time=TRUE | Discriminates from STAB-002 (V\u0307 derivative) by validating SHAPE ONLY — must pass before derivative is meaningful. | [LYAPUNOV-PD][STEP-1-OF-2]',
               formula:'V(0)=0 \u2227 V(x)>0 \u2200x\u22600 — Lyapunov energy function strictly positive definite; SHAPE validation only', verdict:'ALLOW',  computed:1.00, threshold:1.00, unit:'PD'},
              {id:'STAB-002',name:'Lyapunov Derivative Negativity Gate',
               desc:'G3FP: {V_dot,gradient_V,f_x} | SAA: semantic_fingerprint\u2283{asymptotic,V-dot,rate-of-decrease} AND STAB-001=ALLOW | Discriminates from STAB-001 (shape) by validating TEMPORAL EVOLUTION V\u0307<0 along trajectories. | [LYAPUNOV-DERIVATIVE][STEP-2-OF-2]',
               formula:'V\u0307(x) = \u2207V\u00b7f(x) < 0 \u2200x\u22600 — strict rate-of-decrease along system trajectories confirms asymptotic stability', verdict:'ALLOW',  computed:-0.23,threshold:0.00, unit:'V\u0307'},
              {id:'STAB-003',name:'Banach Fixed-Point Convergence Gate',
               desc:'G3FP: {T_operator,q_ratio} | SAA: semantic_fingerprint\u2283{contraction,fixed-point,banach,discrete-iteration} AND iterative_process=TRUE | Discriminates from STAB-001/002 (Lyapunov continuous) by applying to DISCRETE ITERATIVE operators. | [BANACH-CONTRACTION][FIXED-POINT]',
               formula:'\u2203q\u2208[0,1): d(T(x),T(y))\u2264q\u00b7d(x,y) \u2200x,y — Lipschitz ratio q<1 guarantees unique fixed point', verdict:'ALLOW',  computed:0.34, threshold:1.00, unit:'q'},
              {id:'STAB-004',name:'Sovereign Stability Triad Index Gate \u00b7 \u03a6*',
               desc:'G3FP: {G_star,R_star,M_star,w_G,w_R,w_M} | SAA: entity_keywords\u2283{GNN-score,RAG-score,model-score,phi-star} AND all_scores_available=TRUE | Discriminates from STAB-001/002/003 (mathematical stability) by computing SOS-SPECIFIC composite \u03a6*. | [SST][PHI-STAR][SOS-SPECIFIC]',
               formula:'\u03a6* = w_G\u00b7G*+w_R\u00b7R*+w_M\u00b7M* \u2265 \u03a6_thr — SoS composite stability index (w_G+w_R+w_M=1.0)', verdict:'ALLOW',  computed:0.83, threshold:0.75, unit:'\u03a6*'}]},
          { label:'Physical Admissibility Layer', domain:'PAL', cascades:[['PAL-001','PAL-002'],['PAL-002','OCM-003']],
            axioms:[
              {id:'PAL-001',name:'Domain Hazard Integral Gate \u00b7 \u222bH(domain,t)dt',
               desc:'G3FP: {H_domain_t:time_series,h_max,time_window} | SAA: semantic_fingerprint\u2283{hazard,temporal-integral,accumulation,domain-limit} AND telemetry_available=TRUE | Discriminates from PAL-002 (epistemic E\u2212M) by requiring TIME-SERIES hazard data. | [HAZARD-INTEGRAL][TELEMETRY]',
               formula:'h(t) = \u222bH(domain,t)dt < h_max over evaluation window — cumulative hazard must not exceed domain limit', verdict:'REFUSE', computed:2.31, threshold:1.80, unit:'bits'},
              {id:'PAL-002',name:'Epistemic Energy Budget Gate \u00b7 E_prop\u22650',
               desc:'G3FP: {E:evidence_richness,M:model_complexity} | SAA: semantic_fingerprint\u2283{epistemic,knowledge-budget,E-minus-M,propositional} AND E_and_M_quantified=TRUE | Discriminates from PAL-003 (PHYSICAL energy) by measuring EPISTEMIC energy. | [EPISTEMIC-ENERGY][KNOWLEDGE-BUDGET]',
               formula:'E_prop = E \u2212 M \u2265 0 — epistemic energy surplus; negative means model over-constrains evidence', verdict:'REFUSE', computed:-0.12,threshold:0.00, unit:'ratio'},
              {id:'PAL-003',name:'Physical Conservation Law Gate \u00b7 |\u0394E|\u2264\u03b5',
               desc:'G3FP: {delta_E,delta_p,epsilon_E} | SAA: domain\u2208[PHYSICS,AEROSPACE,HARDWARE] AND semantic_fingerprint\u2283{conservation,delta-E,momentum,joules} | Discriminates from PAL-002 (epistemic) by targeting PHYSICAL conservation in SI units. | [PHYSICAL-CONSERVATION][SI-UNITS]',
               formula:'|\u0394E|\u2264\u03b5_E \u2227 |\u0394p|\u2264\u03b5_p, \u03b5\u22641% — energy and momentum conserved within 1% tolerance', verdict:'ALLOW',  computed:0.003,threshold:0.01, unit:'\u0394E'},
              {id:'PAL-004',name:'State Vector Norm Boundedness Gate \u00b7 \u2016x\u2016\u2264X_max',
               desc:'G3FP: {x_state_vector,X_max} | SAA: semantic_fingerprint\u2283{boundedness,state-vector,norm-check,domain-bounds} AND state_computed=TRUE | Discriminates from PAL-003 (transition DELTA) by checking ABSOLUTE MAGNITUDE of current state. | [STATE-BOUNDEDNESS][OOD-GATE]',
               formula:'\u2016x\u2016 \u2264 X_max \u2200 state variables — no state exceeds its physical or ontological domain maximum', verdict:'ALLOW',  computed:0.87, threshold:1.00, unit:'\u2016x\u2016'}]},
          { label:'OCM \u00b7 Deduction-Lock Engine', domain:'OCM', cascades:[['OCM-001','OCM-002'],['OCM-003','HITL']],
            axioms:[
              {id:'OCM-001',name:'Deduction FSM Determinism Gate \u00b7 |\u03b4(s,a)|=1',
               desc:'G3FP: {state_set,transition_function,input_alphabet} | SAA: semantic_fingerprint\u2283{deterministic,state-machine,transition-uniqueness,automaton} AND FSM_enumerated=TRUE | Discriminates from OCM-002 (election score) by validating STRUCTURAL DETERMINISM of the deduction automaton. | [FSM-DETERMINISM][AUTOMATON-INTEGRITY]',
               formula:'\u2200s\u2208States, \u2200a\u2208Inputs: |\u03b4(s,a)|=1 — each (state,input) has exactly one successor; no ambiguous branching', verdict:'ALLOW',  computed:0,    threshold:0,    unit:'violations'},
              {id:'OCM-002',name:'Axiom Election Score Gate \u00b7 R\u00d70.4+C\u00d70.3+H\u00d70.2+(1-Cost)\u00d70.1',
               desc:'G3FP: {Relevance,Consistency,Historical_success,Cost: all floats} | SAA: semantic_fingerprint\u2283{election,score,relevance,consistency,weighted} AND pipeline_stage=L3 | Discriminates from OCM-001 (automaton) by operating on CANDIDATE AXIOM RANKING at L3. | [ELECTION-SCORE][L3-STAGE]',
               formula:'Score = R\u00d70.4+C\u00d70.3+H\u00d70.2+(1-Cost)\u00d70.1 \u2265 \u03b8_elect — SAA election formula (spec/21)', verdict:'ALLOW',  computed:0.76, threshold:0.65, unit:'score'},
              {id:'OCM-003',name:'SymPy Sole-Evaluator Lock \u00b7 Zero-Hallucination Gate',
               desc:'G3FP: {param_gaps:int,evaluator_identity:str} | SAA: semantic_fingerprint\u2283{sympy,sole-evaluator,param-gap,zero-hallucination} AND (param_gap_detected OR evaluator_check) | Discriminates from OCM-001 (automaton) by testing COMPUTATIONAL PURITY — SymPy must be ONLY evaluator. | [SYMPY-LOCK][ZERO-HALLUCINATION]',
               formula:'param_gaps=0, SymPy sole evaluator — no AI-generated numbers; any stochastic injection \u21d2 REFUSE + HITL', verdict:'REFUSE', computed:2,    threshold:0,    unit:'gaps'},
              {id:'OCM-004',name:'Causal Temporal Antecedence Gate \u00b7 t_cause<t_effect',
               desc:'G3FP: {causal_pairs:[{cause,effect,t_cause,t_effect}]} post CAU identification | SAA: entity_keywords\u2283{temporal-order,timestamp,antecedence} AND causal_pairs_available=TRUE | Discriminates from CAU-001/002/003 (causal IDENTIFICATION) by validating TEMPORAL ORDER of already-identified pairs. | [TEMPORAL-ANTECEDENCE][POST-IDENTIFICATION]',
               formula:'t_cause < t_effect \u2200 causal pairs — strict temporal ordering; simultaneity = REFUSE (acausality)', verdict:'ALLOW',  computed:0,    threshold:0,    unit:'violations'}]},
          { label:'International Canonical Laws', domain:'INTL', cascades:[['INTL-001','INTL-002'],['INTL-003','INTL-004']],
            axioms:[
              {id:'INTL-001',name:'Shannon Information Entropy Gate \u00b7 H=\u2212\u03a3p\u1d62log\u2082(p\u1d62)',
               desc:'G3FP: {P_i:probability_distribution[],N:alphabet_size} | SAA: semantic_fingerprint\u2283{entropy,information,uncertainty,bits,probability} AND probability_computed=TRUE | Discriminates from Boltzmann (INTL-004, microstates) by measuring INFORMATION entropy of probabilities, not physical microstates. | [SHANNON-ENTROPY][INFORMATION-THEORY]',
               formula:'H(X) = \u2212\u03a3\u1d62 P(x\u1d62)\u00b7log\u2082P(x\u1d62) \u2264 log\u2082(N) bits — information entropy bounded by alphabet size (Shannon 1948)', verdict:'ALLOW',  computed:2.31, threshold:3.00, unit:'bits'},
              {id:'INTL-002',name:'Einstein Mass-Energy Equivalence \u00b7 E=mc\u00b2',
               desc:'G3FP: {m:mass_kg,c:2.998e8,gamma:lorentz_factor} | SAA: domain\u2208[PHYSICS,AEROSPACE,ENERGY,HARDWARE] AND semantic_fingerprint\u2283{mass,energy,relativistic,rest-energy,equivalence} | Discriminates from PAL-003 (mechanical conservation) by computing REST MASS energy admissibility bound. | [MASS-ENERGY][EINSTEIN][RELATIVISTIC]',
               formula:'E_rest = mc\u00b2; E_total = \u03b3mc\u00b2 — rest and relativistic energy; \u03b3=(1\u2212v\u00b2/c\u00b2)\u207b\u00bd (Einstein 1905)', verdict:'ALLOW',  computed:1.00, threshold:1.00, unit:'E/E\u2080'},
              {id:'INTL-003',name:'Clausius 2nd Law of Thermodynamics \u00b7 dS\u2265\u03b4Q/T',
               desc:'G3FP: {Q:heat_J,T:temperature_K,delta_S:entropy_J_per_K} | SAA: domain\u2208[THERMAL,AEROSPACE,ENERGY,HARDWARE] AND semantic_fingerprint\u2283{thermodynamic,heat,temperature,irreversible} | Discriminates from Boltzmann (INTL-004, statistical) by constraining PROCESS DIRECTION via heat/temperature ratio. | [CLAUSIUS-2ND-LAW][PROCESS-DIRECTION]',
               formula:'dS \u2265 \u03b4Q/T — entropy never decreases in isolated system; process irreversibility constraint (Clausius 1854)', verdict:'ALLOW',  computed:0.12, threshold:0.08, unit:'J/K'},
              {id:'INTL-004',name:'Boltzmann Statistical Entropy Gate \u00b7 S=k_B\u00b7ln(\u03a9)',
               desc:'G3FP: {Omega:microstate_count,k_B:1.380649e-23} | SAA: semantic_fingerprint\u2283{microstate,statistical-mechanics,partition-function,Boltzmann} | Discriminates from Clausius (INTL-003, heat flow) by grounding entropy in MICROSTATE ENUMERATION \u03a9. | [BOLTZMANN-ENTROPY][STATISTICAL-MECHANICS]',
               formula:'S = k_B \u00b7 ln(\u03a9), k_B=1.380649\u00d710\u207b\u00b2\u00b3 J/K — thermodynamic entropy from microstate count \u03a9 (Boltzmann 1877)', verdict:'ALLOW',  computed:1.95, threshold:0.00, unit:'\u00d710\u207b\u00b2\u00b2 J/K'}]}
        ];"""

# ─────────────────────────────────────────────────────────────────────────────
#  RENDERER: add `desc` display row (compact, 2-line, gold-italic text)
# ─────────────────────────────────────────────────────────────────────────────
OLD_IIFE_ROW = """                    html+=\'<div style="padding:2px 8px 3px 60px;color:#777;font-size:9px;border-bottom:1px solid #e8e0d0;">\' +
                        \'<span style="font-style:italic;">\'+ax.formula+\'</span>\' +
                        (ax.ref ? \' <span style="color:#aaa;font-size:8px;margin-left:4px;">[&thinsp;\'+ax.ref+\'&thinsp;]</span>\' : \'\') +
                        \'</div>\';"""
NEW_IIFE_ROW = """                    html+=\'<div style="padding:2px 8px 3px 60px;color:#777;font-size:9px;border-bottom:1px solid #e8e0d0;">\' +
                        \'<span style="font-style:italic;">\'+ax.formula+\'</span>\' +
                        (ax.ref ? \' <span style="color:#aaa;font-size:8px;margin-left:4px;">[&thinsp;\'+ax.ref+\'&thinsp;]</span>\' : \'\') +
                        \'</div>\';
                    if(ax.desc) {
                        html+=\'<div style="padding:1px 8px 3px 60px;color:#a09060;font-size:8px;font-style:italic;border-bottom:1px solid #f0e8d0;line-height:1.4;">\' +
                            ax.desc.replace(/\\|/g,\'<span style="color:#ccc;margin:0 3px">·</span>\') +
                            \'</div>\';
                    }"""

OLD_SN_ROW = """                    html += '<div style="padding:2px 8px 3px 60px;color:#777;font-size:9px;border-bottom:1px solid #e8e0d0;">' +
                        '<span style="font-style:italic;">'+ax.formula+'</span>' +
                        (ax.ref ? ' <span style="color:#aaa;font-size:8px;margin-left:4px;">[&thinsp;'+ax.ref+'&thinsp;]</span>' : '') +
                        '</div>';"""
NEW_SN_ROW = """                    html += '<div style="padding:2px 8px 3px 60px;color:#777;font-size:9px;border-bottom:1px solid #e8e0d0;">' +
                        '<span style="font-style:italic;">'+ax.formula+'</span>' +
                        (ax.ref ? ' <span style="color:#aaa;font-size:8px;margin-left:4px;">[&thinsp;'+ax.ref+'&thinsp;]</span>' : '') +
                        '</div>';
                    if (ax.desc) {
                        html += '<div style="padding:1px 8px 3px 60px;color:#a09060;font-size:8px;font-style:italic;border-bottom:1px solid #f0e8d0;line-height:1.4;">' +
                            ax.desc.replace(/\|/g,'<span style=\"color:#ccc;margin:0 3px\">·</span>') +
                            '</div>';
                    }"""

# ─────────────────────────────────────────────────────────────────────────────
#  MODAL domain tabs: update to 7 domains
# ─────────────────────────────────────────────────────────────────────────────
OLD_MODAL_TABS = """                    <button class="ded-domain-tab active" onclick="dedModalDomain(0)" title="Foundational Ontology Logic">⬡ FON · Foundation</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(1)" title="Causal Deduction Layer">⟴ CAU · Causal</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(2)" title="Stability & Convergence">◈ STAB · Stability</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(3)" title="Physical Admissibility Layer">⊗ PAL · Admissibility</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(4)" title="OCM Deduction-Lock Engine">⚙ OCM · Lock</button>"""
NEW_MODAL_TABS = """                    <button class="ded-domain-tab active" onclick="dedModalDomain(0)" title="Foundational Ontology Logic">⬡ FON</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(1)" title="Alex's Ontological Core Primitives">⊛ OCP</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(2)" title="Causal Deduction Layer">⟴ CAU</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(3)" title="Stability & Convergence">◈ STAB</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(4)" title="Physical Admissibility Layer">⊗ PAL</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(5)" title="OCM Deduction-Lock Engine">⚙ OCM</button>
                    <button class="ded-domain-tab" onclick="dedModalDomain(6)" title="International Canonical Laws">⊞ INTL</button>"""

OLD_DOM_CLASS = "                var domClass = ['fon','cau','stab','pal','ocm'][domainIdx]||'fon';"
NEW_DOM_CLASS = "                var domClass = ['fon','ocp','cau','stab','pal','ocm','intl'][domainIdx]||'fon';"

NEW_BADGE_CSS = """    .xai-domain-badge.fon  { background:#0a0b1a; border-color:#1A237E; color:#7986CB; }
    .xai-domain-badge.ocp  { background:#1a0c00; border-color:#E65100; color:#FF8A65; }
    .xai-domain-badge.cau  { background:#0a1a18; border-color:#004D40; color:#4DB6AC; }
    .xai-domain-badge.stab { background:#0a0e1a; border-color:#0D47A1; color:#64B5F6; }
    .xai-domain-badge.pal  { background:#150a1a; border-color:#4A148C; color:#CE93D8; }
    .xai-domain-badge.ocm  { background:#1a0a0a; border-color:#B71C1C; color:#EF9A9A; }
    .xai-domain-badge.intl { background:#0a1a0a; border-color:#1B5E20; color:#A5D6A7; }"""

OLD_BADGE_CSS_5 = """    .xai-domain-badge.fon  { background:#0a0b1a; border-color:#1A237E; color:#7986CB; }  /* FON — deep indigo */
    .xai-domain-badge.cau  { background:#0a1a18; border-color:#004D40; color:#4DB6AC; }  /* CAU — deep teal */
    .xai-domain-badge.stab { background:#0a0e1a; border-color:#0D47A1; color:#64B5F6; }  /* STAB — deep navy */
    .xai-domain-badge.pal  { background:#150a1a; border-color:#4A148C; color:#CE93D8; }  /* PAL — deep purple */
    .xai-domain-badge.ocm  { background:#1a0a0a; border-color:#B71C1C; color:#EF9A9A; }  /* OCM — maroon */"""

# ─────────────────────────────────────────────────────────────────────────────
#  APPLY ALL CHANGES
# ─────────────────────────────────────────────────────────────────────────────
def apply_all():
    with open(OP03, encoding='utf-8') as f:
        s = f.read()
    changes = []

    # ── 1. IIFE DC (5→7 domains) ──
    old5 = ("        var DC = {\n"
            "            FON:{ badge:'#1A237E', bg:'#E8EAF6', border:'#283593', text:'#1A237E' },  /* deep indigo  — Foundational Ontology Logic */\n"
            "            CAU:{ badge:'#004D40', bg:'#E0F2F1', border:'#00695C', text:'#004D40' },  /* deep teal    — Causal Deduction Layer */\n"
            "            STAB:{ badge:'#0D47A1', bg:'#E3F2FD', border:'#1565C0', text:'#0D47A1' }, /* deep navy    — Stability & Convergence */\n"
            "            PAL:{ badge:'#4A148C', bg:'#F3E5F5', border:'#6A1B9A', text:'#4A148C' }, /* deep purple  — Physical Admissibility Layer */\n"
            "            OCM:{ badge:'#B71C1C', bg:'#FFEBEE', border:'#C62828', text:'#B71C1C' }  /* maroon       — OCM Deduction-Lock Engine */\n"
            "        };")
    if old5 in s:
        s = s.replace(old5, DC_IIFE, 1)
        changes.append('IIFE DC 5→7 domains')
    else:
        # partial fallback
        idx = s.find("        var DC = {\n            FON:{ badge:'#1A237E'")
        if idx >= 0:
            end = s.find('\n        };', idx) + len('\n        };')
            s = s[:idx] + DC_IIFE + s[end:]
            changes.append('IIFE DC 5→7 (fallback)')
        else:
            changes.append('WARN: IIFE DC not replaced')

    # ── 2. IIFE PHASE_SUBTITLE ──
    idx_ps = s.find("        var PHASE_SUBTITLE = {\n            gnn:{ FON:'GNN")
    if idx_ps >= 0:
        end_ps = s.find('\n        };\n', idx_ps) + len('\n        };\n')
        s = s[:idx_ps] + PS_IIFE + '\n' + s[end_ps:]
        changes.append('IIFE PHASE_SUBTITLE 5→7')
    else:
        changes.append('WARN: IIFE PHASE_SUBTITLE not found')

    # ── 3. IIFE _INLINE_AXIOM_SETS ──
    idx_ax = s.find("        /* ══")
    if idx_ax > 0:
        end_ax = s.find('        ];\n', idx_ax) + len('        ];\n')
        s = s[:idx_ax] + AXIOMS_JS + '\n' + s[end_ax:]
        changes.append('IIFE _INLINE_AXIOM_SETS 5→7 domains (28 axioms)')
    else:
        changes.append('WARN: IIFE _INLINE_AXIOM_SETS not found')

    # ── 4. Safety-net DC ──
    old_sn_dc = (
        "        var DC = {\n"
        "            FON:{ badge:'#1A237E', bg:'#E8EAF6', border:'#283593' },\n"
        "            CAU:{ badge:'#004D40', bg:'#E0F2F1', border:'#00695C' },\n"
        "            STAB:{ badge:'#0D47A1', bg:'#E3F2FD', border:'#1565C0' },\n"
        "            PAL:{ badge:'#4A148C', bg:'#F3E5F5', border:'#6A1B9A' },\n"
        "            OCM:{ badge:'#B71C1C', bg:'#FFEBEE', border:'#C62828' }\n"
        "        };"
    )
    if old_sn_dc in s:
        s = s.replace(old_sn_dc, DC_SN, 1)
        changes.append('Safety-net DC 5→7')
    else:
        changes.append('WARN: Safety-net DC not found')

    # ── 5. Safety-net PHASE_SUBTITLE ──
    idx_sn_ps = s.find("        var PHASE_SUBTITLE = {\n            gnn:{ FON:'GNN", s.find('dedRepoSafetyNet'))
    if idx_sn_ps > 0:
        end_sn_ps = s.find('\n        };\n', idx_sn_ps) + len('\n        };\n')
        s = s[:idx_sn_ps] + PS_SN + '\n' + s[end_sn_ps:]
        changes.append('Safety-net PHASE_SUBTITLE 5→7')
    else:
        changes.append('WARN: Safety-net PHASE_SUBTITLE not found')

    # ── 6. Safety-net SETS ──
    idx_sn_sets = s.find("        var SETS = [\n          { label:'Foundational Ontology Logic'")
    if idx_sn_sets > 0:
        end_sn_sets = s.find('        ];\n', idx_sn_sets) + len('        ];\n')
        s = s[:idx_sn_sets] + SETS_SN + '\n' + s[end_sn_sets:]
        changes.append('Safety-net SETS 5→7 domains (28 axioms)')
    else:
        changes.append('WARN: Safety-net SETS not found')

    # ── 7. IIFE renderer: add desc row ──
    if OLD_IIFE_ROW in s:
        s = s.replace(OLD_IIFE_ROW, NEW_IIFE_ROW, 1)
        changes.append('IIFE renderer: desc row added')
    else:
        changes.append('WARN: IIFE renderer desc row not matched')

    # ── 8. Safety-net renderer: add desc row ──
    if OLD_SN_ROW in s:
        s = s.replace(OLD_SN_ROW, NEW_SN_ROW, 1)
        changes.append('Safety-net renderer: desc row added')
    else:
        changes.append('WARN: Safety-net renderer desc row not matched')

    # ── 9. Modal domain tabs 5→7 ──
    if OLD_MODAL_TABS in s:
        s = s.replace(OLD_MODAL_TABS, NEW_MODAL_TABS, 1)
        changes.append('Modal domain tabs 5→7')
    else:
        changes.append('WARN: Modal domain tabs not matched')

    # ── 10. domClass mapping 5→7 ──
    if OLD_DOM_CLASS in s:
        s = s.replace(OLD_DOM_CLASS, NEW_DOM_CLASS, 1)
        changes.append('XAI domClass 5→7')
    else:
        changes.append('WARN: XAI domClass not found')

    # ── 11. Badge CSS: add ocp + intl classes ──
    if OLD_BADGE_CSS_5 in s:
        s = s.replace(OLD_BADGE_CSS_5, NEW_BADGE_CSS, 1)
        changes.append('Badge CSS: ocp/intl added')
    else:
        changes.append('WARN: Badge CSS 5-class not matched')

    with open(OP03, 'w', encoding='utf-8') as f:
        f.write(s)
    return changes

if __name__ == '__main__':
    chg = apply_all()
    print(f'Applied {len(chg)} changes:')
    for c in chg:
        icon = '✓' if not c.startswith('WARN') else '⚠'
        print(f'  {icon} {c}')

    # Final integrity check
    s = open(OP03, encoding='utf-8').read()
    checks = [
        ('7 domains in IIFE DC', "INTL:{ badge:'#1B5E20'" in s),
        ('OCP domain axioms present', 'OCP-001' in s and 'OCP-004' in s),
        ('INTL domain axioms present', 'INTL-001' in s and 'INTL-004' in s),
        ('Alex §0.1 equations', 'OCG_APP_02042026 §0.1' in s and 'v_\u03a6' in s),
        ('Shannon entropy formula', 'Shannon 1948' in s),
        ('Einstein E=mc²', 'Einstein 1905' in s),
        ('Clausius 2nd law', 'Clausius 1854' in s),
        ('Boltzmann entropy', 'Boltzmann 1877' in s),
        ('Propositional Surplus', 'Propositional Surplus Gate' in s),
        ('Inverse Admissibility', 'Inverse Admissibility' in s),
        ('G3FP routing in desc', 'G3FP:' in s and 'SAA:' in s),
        ('28 total axioms (FON-001→INTL-004)', all(f'{d}-00{n}' in s for d in ['FON','OCP','CAU','STAB','PAL','OCM','INTL'] for n in [1,4])),
        ('7 modal domain tabs', s.count('dedModalDomain(') >= 7),
        ('desc rows in renderer', 'ax.desc' in s),
        ('OCP badge CSS', '.xai-domain-badge.ocp' in s),
        ('INTL badge CSS', '.xai-domain-badge.intl' in s),
    ]
    print(f'\nFINAL INTEGRITY ({len(checks)} checks):')
    all_pass = True
    for label, ok in checks:
        if not ok: all_pass = False
        print(f'  {"✓" if ok else "✗ FAIL"}  {label}')
    print(f'\n{"ALL PASS ✓" if all_pass else "SOME FAILED — review WARNs above"}')
