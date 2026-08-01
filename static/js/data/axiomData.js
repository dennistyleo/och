/**
 * Module: axiomData
 * Version: 1.0.0
 * Description: Sovereign Matrix axiom repository data for all three reasoning modes.
 */

export const AXIOM_DOMAINS = {
  DEDUCTION: {
    'Capacity-Propagation Dynamics': {
      tag: 'CPD',
      axioms: [
        { id:'CPD-001', name:'Capacity-Propagation Closure',     formula:'(v_Φ/C_Φ)² + M/E = 1',             status:'CANONICAL',   description:'Fundamental boundary identity relating propagation velocity to capacity fraction.' },
        { id:'CPD-002', name:'Internal Order Ratio',             formula:'p* = 0.30, p_i = u_i_ord / u_i',   status:'CANONICAL',   description:'Target internal order proportion at 30%.' },
        { id:'CPD-003', name:'Structural Potency Dynamics',      formula:'du_i/dt = (a_i + Σ η_ij ρ_j)u_i - (b_i ρ_i + c_i ρ_i² + λ_i d_i(p_i))u_i + ζ_i', status:'CANONICAL', description:'Rate of change of structural potency under competitive influence.' },
        { id:'CPD-004', name:'Domain Share Balance',             formula:'D_band = Σ [sp(ρ_i − β; τ_out) + sp(α − ρ_i; τ_out)]', status:'CANONICAL', description:'Soft-plus penalty for out-of-band domain shares.' },
        { id:'CPD-005', name:'Monopolization Detection',         formula:'O = sp(max_i ρ_i − θ; τ_out)',      status:'CANONICAL',   description:'Detects when any single domain exceeds monopolization threshold θ.' },
        { id:'CPD-006', name:'State Transition Velocity',        formula:'G = √(Σ ρ̇_i²)',                    status:'CANONICAL',   description:'Euclidean norm of domain share rate-of-change vector.' },
        { id:'CPD-007', name:'Structural Integrity Deviation',   formula:'D_in = Σ d_i(p_i)',                 status:'CANONICAL',   description:'Sum of structural deviation penalties across all domains.' },
        { id:'CPD-008', name:'Early Warning Hazard Score',       formula:'h̃ = 1 − exp(−(k₁D_band + k₂O + k₃G + k₄D_in))', status:'CANONICAL', description:'Composite hazard score combining all four risk indicators.' },
        { id:'CPD-009', name:'Balanced Triad State',             formula:'∀i: α ≤ ρ_i ≤ β,  p_i ∈ [p*−δ, p*+δ]', status:'CANONICAL', description:'Necessary conditions for system to be in balanced triad state.' },
        { id:'CPD-010', name:'Drift State',                      formula:'¬Balanced ∧ max_i ρ_i < θ',         status:'CANONICAL',   description:'System is drifting but no single domain dominates.' },
        { id:'CPD-011', name:'Overdominance State',              formula:'ρ_i ≥ θ ∧ ρ_i > max_{j≠i} ρ_j',   status:'CANONICAL',   description:'One domain has achieved dominant share above threshold.' },
        { id:'CPD-012', name:'Scale Independence',               formula:'u → cu,  c > 0',                    status:'CANONICAL',   description:'System dynamics are invariant under uniform rescaling.' },
      ]
    },
    'Admissibility Framework': {
      tag: 'AF',
      axioms: [
        { id:'AF-001', name:'Admissibility Boundary Identity',   formula:'(v_Φ/C_Φ)² + M/E = 1,  0 ≤ M/E ≤ 1',  status:'CANONICAL', description:'Defines the admissibility ellipse in capacity-propagation space.' },
        { id:'AF-002', name:'Bounded Propagation',               formula:'0 ≤ v_Φ ≤ C_Φ',                     status:'CANONICAL',   description:'Propagation velocity cannot exceed capacity ceiling.' },
        { id:'AF-003', name:'Capacity Decomposition',            formula:'E = M + E_prop',                      status:'CANONICAL',   description:'Total capacity decomposes into mass-equivalent and propagation parts.' },
        { id:'AF-004', name:'Single-Parameter State Control',    formula:'f(ε) = √(1 − ε)',                    status:'CANONICAL',   description:'Admissibility function parametrized by single loading factor ε.' },
        { id:'AF-005', name:'Process Existence Condition',       formula:'ε < 1',                               status:'CANONICAL',   description:'Physical process can only exist below the capacity singularity.' },
        { id:'AF-006', name:'Deterministic Verdict Space',       formula:'{ALLOW, REFUSE, BLOCK}',              status:'CANONICAL',   description:'Precisely three and only three admissibility verdicts are possible.' },
        { id:'AF-007', name:'Admissibility Decision Logic',      formula:'ALLOW ⟺ invariants ∧ h̃≤bound; REFUSE ⟺ ¬evidence; BLOCK ⟺ invariant_violation', status:'CANONICAL', description:'Complete logical mapping from system state to admissibility verdict.' },
        { id:'AF-008', name:'Safe Failure Mode',                 formula:'UNDETERMINED → REFUSE → execution_blocked', status:'CANONICAL', description:'Any undetermined state defaults to REFUSE, preventing execution.' },
        { id:'AF-009', name:'Cross-Domain Consistency',          formula:'REFUSE if ∃ domain: VIOL ∨ UND',      status:'CANONICAL',   description:'Any domain violation or undetermined state triggers global REFUSE.' },
        { id:'AF-010', name:'Partial Admissibility Limit',       formula:'0 < ℓ(t) < 1',                       status:'CANONICAL',   description:'Partial admissibility is bounded strictly between 0 and 1.' },
        { id:'AF-011', name:'Irreversible Action Gate',          formula:'Decision ≠ ALLOW → execution_prevented', status:'CANONICAL', description:'Only an explicit ALLOW verdict permits execution of irreversible actions.' },
        { id:'AF-012', name:'Observable Projection',             formula:'Π: State → Observable',              status:'CANONICAL',   description:'Defines the projection function from full state space to observable subspace.' },
        { id:'AF-013', name:'State-Observable Mapping',          formula:'State ⇄ Observable',                  status:'CANONICAL',   description:'Bijective mapping that allows state inference from observables.' },
        { id:'AF-014', name:'Unified Measurement Range',         formula:'x_i ∈ [0,1]',                        status:'CANONICAL',   description:'All normalized measurements must fall within unit interval.' },
        { id:'AF-015', name:'Three-Axis System Representation',  formula:'F = {S, M, W}',                      status:'CANONICAL',   description:'System represented on three axes: Structural, Mass, World.' },
        { id:'AF-016', name:'System Stability Index',            formula:'Σ = 1 − (|S_rel−C_S| + |M_rel−C_M| + |W_rel−C_W|)', status:'CANONICAL', description:'Composite stability index across all three axes.' },
        { id:'AF-017', name:'System Hazard Score',               formula:'H = (H_S + H_M + H_W) / 3',         status:'CANONICAL',   description:'Mean hazard score across three system axes.' },
        { id:'AF-018', name:'Stability Classification Thresholds', formula:'Σ ≥ 0.8 → STABLE; 0.5 ≤ Σ < 0.8 → BORDERLINE; Σ < 0.5 → UNSTABLE', status:'CANONICAL', description:'Threshold-based stability classification from stability index Σ.' },
      ]
    },
    'Physical Domain Invariants': {
      tag: 'PDI',
      subDomains: ['Thermal','Mechanical','EPS','Radiation','Fluid','Information'],
      axioms: [
        { id:'PDI-T01', name:'Maximum Operating Temperature',    formula:'T(t) ≤ T_max',                       status:'CANONICAL',   subDomain:'Thermal',     description:'System temperature must remain below maximum rated value at all times.' },
        { id:'PDI-T02', name:'Temperature Change Rate Limit',    formula:'|Ṫ(t)| ≤ Ṫ_max',                    status:'CANONICAL',   subDomain:'Thermal',     description:'Rate of temperature change is bounded to prevent thermal shock.' },
        { id:'PDI-T03', name:'Thermal Safety Margin',            formula:'H_T(t) ≥ H_T_min',                  status:'CANONICAL',   subDomain:'Thermal',     description:'Thermal headroom must exceed minimum safety margin.' },
        { id:'PDI-T04', name:'Thermal Cycle Stress',             formula:'A_T(t) = max T(s) − min T(s)',       status:'CANONICAL',   subDomain:'Thermal',     description:'Amplitude of temperature cycling determines cumulative fatigue loading.' },
        { id:'PDI-M01', name:'Structural Load Margin',           formula:'m_L(t) ≥ m_L_min',                  status:'CANONICAL',   subDomain:'Mechanical',  description:'Structural load margin must remain above minimum design threshold.' },
        { id:'PDI-M02', name:'Stress Change Rate Limit',         formula:'|σ̇(t)| ≤ σ̇_max',                   status:'CANONICAL',   subDomain:'Mechanical',  description:'Rate of stress change is bounded to prevent fatigue crack nucleation.' },
        { id:'PDI-M03', name:'Cumulative Fatigue Damage',        formula:'D_M(t) ≤ D_M_max',                  status:'CANONICAL',   subDomain:'Mechanical',  description:'Miner rule cumulative fatigue damage must not exceed design limit.' },
        { id:'PDI-E01', name:'Minimum Bus Voltage',              formula:'V(t) ≥ V_min',                       status:'CANONICAL',   subDomain:'EPS',         description:'Electrical power bus voltage must remain above minimum operational threshold.' },
        { id:'PDI-E02', name:'Current Change Rate Limit',        formula:'|İ(t)| ≤ İ_max',                    status:'CANONICAL',   subDomain:'EPS',         description:'Current slew rate is bounded to prevent inductive spikes.' },
        { id:'PDI-E03', name:'Minimum Battery Charge',           formula:'SoC(t) ≥ SoC_min',                  status:'CANONICAL',   subDomain:'EPS',         description:'Battery state-of-charge must stay above minimum discharge threshold.' },
        { id:'PDI-E04', name:'Power Supply Margin',              formula:'m_P(t) ≥ m_P_min',                  status:'CANONICAL',   subDomain:'EPS',         description:'Available power headroom must exceed mission-critical minimum.' },
        { id:'PDI-R01', name:'Total Radiation Dose Limit',       formula:'D(t) ≤ D_max',                       status:'CANONICAL',   subDomain:'Radiation',   description:'Cumulative absorbed radiation dose must not exceed component tolerance.' },
        { id:'PDI-R02', name:'Radiation Dose Rate Limit',        formula:'Ḋ(t) ≤ Ḋ_max',                      status:'CANONICAL',   subDomain:'Radiation',   description:'Instantaneous dose rate is bounded to prevent acute single-event effects.' },
        { id:'PDI-R03', name:'Single Event Effect Rate Limit',   formula:'r_SEE(t) ≤ r_SEE_max',              status:'CANONICAL',   subDomain:'Radiation',   description:'Rate of single-event effects must not exceed design upset tolerance.' },
        { id:'PDI-F01', name:'Maximum Slosh Torque',             formula:'τ_s(t) ≤ τ_s_max',                  status:'CANONICAL',   subDomain:'Fluid',       description:'Fluid slosh-induced torque must not exceed structural and attitude limits.' },
        { id:'PDI-F02', name:'Fluid Instability Threshold',      formula:'Π(t) ≤ Π_max',                      status:'CANONICAL',   subDomain:'Fluid',       description:'Dimensionless instability parameter must remain below critical value.' },
        { id:'PDI-F03', name:'Safe Fill Level Zones',            formula:'fill(t) ∉ Z_unstable',              status:'CANONICAL',   subDomain:'Fluid',       description:'Tank fill level must avoid critical instability zones at all times.' },
        { id:'PDI-I01', name:'Maximum Control Loop Latency',     formula:'L(t) ≤ L_max',                       status:'CANONICAL',   subDomain:'Information', description:'End-to-end control loop latency must not exceed stability margin.' },
        { id:'PDI-I02', name:'Maximum Timing Jitter',            formula:'J(t) ≤ J_max',                       status:'CANONICAL',   subDomain:'Information', description:'Clock and sampling jitter must be bounded to maintain data integrity.' },
        { id:'PDI-I03', name:'Maximum Evidence Age',             formula:'Δt_i ≤ Δt_i_max',                   status:'CANONICAL',   subDomain:'Information', description:'Evidence freshness: no observation may be older than its maximum allowed age.' },
      ]
    }
  },

  INDUCTION: {
    'Statistical Inference': {
      tag: 'SI',
      axioms: [
        { id:'SI-001', name:'Bayesian Posterior Update',   formula:'P(H|E) = P(E|H)·P(H) / P(E)',         status:'CANONICAL',   description:'Core Bayes theorem for belief update given new evidence E.' },
        { id:'SI-002', name:'Likelihood Ratio',            formula:'LR = P(E|H) / P(E|¬H)',               status:'CANONICAL',   description:'Strength of evidence measured as ratio of likelihoods.' },
        { id:'SI-003', name:'Sycophancy Rate',             formula:'π = count(sycophantic) / count(total)', status:'HYPOTHESIZED', description:'Fraction of model outputs exhibiting sycophantic drift.' },
        { id:'SI-004', name:'Confidence Interval (95%)',   formula:'CI = x̄ ± 1.96·σ/√n',                 status:'CANONICAL',   description:'95% confidence interval for sample mean.' },
        { id:'SI-005', name:'Delusional Spiral Probability', formula:'P_spiral = 1 − exp(−λπt)',          status:'HYPOTHESIZED', description:'Probability of entering delusional spiral as a function of sycophancy rate and time.' },
      ]
    },
    'Bayesian Belief Update': {
      tag: 'BBU',
      axioms: [
        { id:'BBU-001', name:'Prior Initialization',       formula:'P(H) = 1/N  ∀H ∈ Ω',                  status:'CANONICAL',   description:'Uniform prior over N hypotheses at initialization.' },
        { id:'BBU-002', name:'Sequential Update Rule',     formula:'P_n(H) = P_{n-1}(H|E_n)',              status:'CANONICAL',   description:'Bayesian belief updated sequentially with each new observation.' },
        { id:'BBU-003', name:'Entropy Reduction Criterion', formula:'H(P_n) ≤ H(P_{n-1})',                status:'CANONICAL',   description:'Evidence must reduce epistemic entropy to be informative.' },
      ]
    },
    'Abductive Gap Closure': {
      tag: 'AGC',
      axioms: [
        { id:'AGC-001', name:'Missing Axiom Detection',    formula:'gap = H_prior − H_posterior',           status:'HYPOTHESIZED', description:'Information gap identifying missing causal links.' },
        { id:'AGC-002', name:'Counterfactual Distance',    formula:'d_CF = ||H_actual − H_counterfactual||', status:'HYPOTHESIZED', description:'Distance between actual and counterfactual hypothesis states.' },
      ]
    }
  },

  ABDUCTION: {
    'Hypothesis Generation': {
      tag: 'HG',
      axioms: [
        { id:'HG-001', name:'Inference to Best Explanation', formula:'H* = argmax_H P(E|H)·P(H)',          status:'HYPOTHESIZED', description:'Select hypothesis maximizing likelihood-weighted posterior.' },
        { id:'HG-002', name:'Parsimony Criterion',           formula:'|H*| = min{|H| : H explains E}',     status:'HYPOTHESIZED', description:'Prefer simplest hypothesis that fully explains the evidence.' },
        { id:'HG-003', name:'Abductive Closure',             formula:'AB(E) = {H : H ⊨ E ∧ H ∉ KB}',      status:'HYPOTHESIZED', description:'Set of abduced hypotheses not currently in knowledge base.' },
      ]
    },
    'Causal Drift Analysis': {
      tag: 'CDA',
      axioms: [
        { id:'CDA-001', name:'Causal Drift Score',           formula:'Δ_C = ||C_t − C_0||_F',              status:'HYPOTHESIZED', description:'Frobenius norm of causal structure change from baseline.' },
        { id:'CDA-002', name:'Interventional Do-Calculus',   formula:'P(Y | do(X=x)) = Σ_z P(Y|X=x,Z=z)P(Z)', status:'CANONICAL', description:'Pearl do-calculus for computing interventional distributions.' },
        { id:'CDA-003', name:'Backdoor Adjustment',          formula:'P(Y|do(X)) = Σ_z P(Y|X,Z)·P(Z)',     status:'CANONICAL',   description:'Blocks spurious back-door paths via adjustment set Z.' },
      ]
    }
  }
};

/** Flat index of all axioms by ID */
export const AXIOM_INDEX = {};
Object.values(AXIOM_DOMAINS).forEach(mode => {
  Object.values(mode).forEach(domain => {
    domain.axioms.forEach(ax => { AXIOM_INDEX[ax.id] = ax; });
  });
});

/** DEDUCTION-only axiom IDs for Op-Page 3 sidebar */
export const DEDUCTION_IDS = Object.values(AXIOM_DOMAINS.DEDUCTION)
  .flatMap(d => d.axioms.map(a => a.id));
