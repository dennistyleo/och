/**
 * axioms.js — Sovereign Matrix Axiom Repository
 * Version: 2.0.0  |  Follows spec/23_axiom_schema.md
 *
 * Three-Mode Classification:
 *   DEDUCTION  = PHYSICS_AXIOM_IDS ∪ ENGINEERING_AXIOM_IDS  (formulaic, deterministic)
 *   INDUCTION  = ALL axioms  (pattern learning, statistical)
 *   ABDUCTION  = ALL axioms  (hypothesis generation, causal inference)
 */

// ── Mode Classification Sets ──────────────────────────────────────────────────

export const PHYSICS_AXIOM_IDS = new Set([
  // Legacy physics (from PDF: STRÜVER, UPASL, Astheroth/ACRE)
  'NEWTON_GRAV_01','KEPLER_LAW_01','EINSTEIN_FIELD_EQ_04',
  'MAXWELL_EM_01','MAXWELL_EM_02','MAXWELL_EM_03',
  'LORENTZ_FORCE_02','DIRAC_SPINOR_03',
  'CLAUSIUS_2ND_01','FOURIER_HEAT_02','BOLTZMANN_ENTROPY_01',
  'EULER_BERNOULLI_01',
  // STRÜVER Model
  'STR_TRIAS_01','STR_URULE_02','STR_DYNAMIC_03',
  'STR_PHASE_04','STR_PHASE_05','STR_PHASE_06',
  'STR_HAZARD_07','STR_DIAG_08','STR_DIAG_09','STR_DIAG_10','STR_DIAG_11',
  // Astheroth / ACRE
  'AST_ID_01','AST_DOMAIN_02','AST_CAPACITY_03','AST_CONTROL_04',
  'AST_PROCESS_05','AST_DECISION_06','AST_STABILITY_07','AST_MAPPING_08','AST_HAZARD_09',
  // UPASL
  'UPL_VALID_01','UPL_NORM_02','UPL_DECISION_03',
  'UPL_THERMAL_04','UPL_MECH_05','UPL_EPS_06',
  'UPL_RAD_07','UPL_FLUID_08','UPL_INFO_09',
]);

export const ENGINEERING_AXIOM_IDS = new Set([
  'PWR_EFF_01','PWR_SEQ_02','PWR_RIPPLE_03',
  'PWR_CONS_04','PWR_INT_05','PWR_TRAN_06',
]);

export const TELEMETRY_AXIOM_IDS = new Set([
  'TEL_RED_01','TEL_RT_02','TEL_PMBUS_03','TEL_SMBUS_04',
  'TEL_I2C_06','TEL_I3C_07','TEL_SERDES_08',
  'TEL_SPI_09','TEL_UART_05','TEL_GPIO_10',
]);

export const PSYCHOSIS_AXIOM_IDS = new Set([
  'PSY_BAYES_01','PSY_SYC_02','PSY_SPIRAL_03','PSY_POLAR_04',
]);

/** DEDUCTION: physics + engineering (no telemetry/psychosis) */
export const DEDUCTION_AXIOM_IDS = new Set([
  ...PHYSICS_AXIOM_IDS, ...ENGINEERING_AXIOM_IDS,
]);

// ── AXIOM_INDEX ───────────────────────────────────────────────────────────────

export const AXIOM_INDEX = {
  index_version: '2.0',
  last_built:    '2026-04-11T06:00:00Z',
  axioms_by_status: {
    CANONICAL:    [
      'EULER_BERNOULLI_01','FOURIER_HEAT_02','MAXWELL_EM_01','MAXWELL_EM_02',
      'KEPLER_LAW_01','BOLTZMANN_ENTROPY_01',
      'STR_TRIAS_01','STR_URULE_02','STR_PHASE_04','STR_HAZARD_07',
      'AST_ID_01','AST_DOMAIN_02','AST_CAPACITY_03','AST_DECISION_06',
      'UPL_VALID_01','UPL_DECISION_03','UPL_THERMAL_04','UPL_MECH_05',
      'PWR_EFF_01','PWR_SEQ_02','PWR_CONS_04',
      'TEL_RED_01','TEL_RT_02','TEL_PMBUS_03','TEL_SMBUS_04',
      'TEL_I2C_06','TEL_SERDES_08','TEL_SPI_09','TEL_UART_05','TEL_GPIO_10',
    ],
    INCOMPLETE:   [
      'MAXWELL_EM_03','CLAUSIUS_2ND_01',
      'STR_DYNAMIC_03','STR_DIAG_08',
      'AST_CONTROL_04','AST_STABILITY_07',
      'UPL_NORM_02','UPL_EPS_06','UPL_INFO_09',
      'PWR_RIPPLE_03',
      'TEL_I3C_07',
    ],
    ANOMALOUS:    [
      'NEWTON_GRAV_01','LORENTZ_FORCE_02',
      'STR_PHASE_05','STR_PHASE_06',
      'PWR_INT_05',
      'PSY_SYC_02',
    ],
    HYPOTHESIZED: [
      'EINSTEIN_FIELD_EQ_04','DIRAC_SPINOR_03',
      'STR_DIAG_09','STR_DIAG_10','STR_DIAG_11',
      'AST_PROCESS_05','AST_MAPPING_08','AST_HAZARD_09','AST_CONTROL_04',
      'UPL_RAD_07','UPL_FLUID_08',
      'PWR_TRAN_06',
      'PSY_BAYES_01','PSY_SPIRAL_03','PSY_POLAR_04',
    ],
  },
  axioms_by_domain: {
    'Celestial Mechanics':  ['NEWTON_GRAV_01','KEPLER_LAW_01','EINSTEIN_FIELD_EQ_04'],
    'Electromagnetism':     ['MAXWELL_EM_01','MAXWELL_EM_02','MAXWELL_EM_03','LORENTZ_FORCE_02','DIRAC_SPINOR_03'],
    'Thermodynamics':       ['CLAUSIUS_2ND_01','FOURIER_HEAT_02','BOLTZMANN_ENTROPY_01'],
    'Structural Mechanics': ['EULER_BERNOULLI_01'],
    'STRÜVER Model':        ['STR_TRIAS_01','STR_URULE_02','STR_DYNAMIC_03','STR_PHASE_04','STR_PHASE_05','STR_PHASE_06','STR_HAZARD_07','STR_DIAG_08','STR_DIAG_09','STR_DIAG_10','STR_DIAG_11'],
    'Admissibility (ACRE)': ['AST_ID_01','AST_DOMAIN_02','AST_CAPACITY_03','AST_CONTROL_04','AST_PROCESS_05','AST_DECISION_06','AST_STABILITY_07','AST_MAPPING_08','AST_HAZARD_09'],
    'UPASL Invariants':     ['UPL_VALID_01','UPL_NORM_02','UPL_DECISION_03','UPL_THERMAL_04','UPL_MECH_05','UPL_EPS_06','UPL_RAD_07','UPL_FLUID_08','UPL_INFO_09'],
    'Power Management':     ['PWR_EFF_01','PWR_SEQ_02','PWR_RIPPLE_03','PWR_CONS_04','PWR_INT_05','PWR_TRAN_06'],
    'Interface / Telemetry':['TEL_RED_01','TEL_RT_02','TEL_PMBUS_03','TEL_SMBUS_04','TEL_I2C_06','TEL_I3C_07','TEL_SERDES_08','TEL_SPI_09','TEL_UART_05','TEL_GPIO_10'],
    'AI Governance':        ['PSY_BAYES_01','PSY_SYC_02','PSY_SPIRAL_03','PSY_POLAR_04'],
  },
  anomaly_groups: [
    { anomalous_axiom:'NEWTON_GRAV_01',   failing_phenomena:['MERCURY_PERIHELION','GRAVITATIONAL_LENSING'], candidate_fix:'EINSTEIN_FIELD_EQ_04', semantic_distance:0.72 },
    { anomalous_axiom:'LORENTZ_FORCE_02', failing_phenomena:['ANOMALOUS_MAGNETIC_MOMENT'],                  candidate_fix:'DIRAC_SPINOR_03',       semantic_distance:0.58 },
    { anomalous_axiom:'PWR_INT_05',       failing_phenomena:['PDN_RESONANCE','HIGH_FREQ_IMPEDANCE'],        candidate_fix:'PWR_TRAN_06',           semantic_distance:0.41 },
    { anomalous_axiom:'PSY_SYC_02',       failing_phenomena:['BELIEF_POLARIZATION','DELUSIONAL_SPIRAL'],    candidate_fix:'PSY_BAYES_01',          semantic_distance:0.33 },
  ],
};

// ── AXIOMS ────────────────────────────────────────────────────────────────────

const _mk = (id, name, domain, status, latex, pddl, health, explains, fails, gap, l3) => ({
  axiom_id: id,  version: '1.0.0',  last_modified: '2026-04-11T06:00:00Z',
  layer_1_audit_header: {
    name, domain, status, expression_latex: latex, expression_pddl: pddl ?? null,
    health: health ?? { phenomena_explained_count:1, phenomena_total_count:1, explanation_ratio:1.0 },
    badge_color: {CANONICAL:'green',ANOMALOUS:'red',HYPOTHESIZED:'blue',INCOMPLETE:'orange'}[status] ?? 'gray',
  },
  layer_2_summary: {
    derivation_path: { type: gap ? 'primitive' : 'primitive', parent_axioms: [] },
    explains: (explains||[]).map(([pid,c])=>({phenomenon_id:pid,confidence:c})),
    fails_to_explain: (fails||[]).map(([pid,desc,qty,units])=>({phenomenon_id:pid,gap_description:desc,gap_quantitative:qty??null,gap_units:units??null})),
    abductive_gap: gap ?? null,
  },
  layer_3_full_detail: l3 ?? { algebraic:null, symbolic_transformation:null, pddl_representation:null },
});

export const AXIOMS = {

  // ── Legacy Physics ─────────────────────────────────────────────────────────

  NEWTON_GRAV_01: {
    axiom_id:'NEWTON_GRAV_01', version:'2.3.1', last_modified:'2026-04-11T10:30:00Z',
    layer_1_audit_header:{
      name:'Universal Gravitation', domain:'Celestial Mechanics', status:'ANOMALOUS',
      expression_latex:'F = G \\dfrac{m_1 m_2}{r^2}',
      expression_pddl:'(= (gravitational-force ?b1 ?b2) (* G (* (mass ?b1) (mass ?b2)) (/ 1 (* (distance ?b1 ?b2) (distance ?b1 ?b2)))))',
      health:{phenomena_explained_count:12,phenomena_total_count:15,explanation_ratio:0.80}, badge_color:'red',
    },
    layer_2_summary:{
      derivation_path:{type:'primitive',parent_axioms:[]},
      explains:[
        {phenomenon_id:'KEPLER_LAWS',confidence:0.98},{phenomenon_id:'TIDAL_FORCES',confidence:0.85},
        {phenomenon_id:'PLANETARY_ORBITS_LOW_V',confidence:0.95},{phenomenon_id:'MOON_ORBIT',confidence:0.99},
        {phenomenon_id:'PROJECTILE_MOTION',confidence:0.97},
      ],
      fails_to_explain:[
        {phenomenon_id:'MERCURY_PERIHELION',gap_description:'43 arcsec/century precession not accounted for',gap_quantitative:43.0,gap_units:'arcsec/century'},
        {phenomenon_id:'GRAVITATIONAL_LENSING',gap_description:'Predicts half the observed light deflection',gap_quantitative:0.875,gap_units:'arcsec'},
      ],
      abductive_gap:{semantic_distance:0.72,spectrum_position:'right_of_center',closest_canonical_axiom:'EINSTEIN_FIELD_EQ_04',
        candidate_missing_axiom:{axiom_id:'EINSTEIN_FIELD_EQ_04',expression_latex:'R_{\\mu\\nu} - \\tfrac{1}{2}g_{\\mu\\nu}R + \\Lambda g_{\\mu\\nu} = \\dfrac{8\\pi G}{c^4}T_{\\mu\\nu}',semantic_distance_from_current:0.72}},
    },
    layer_3_full_detail:{
      algebraic:{primary_decomposition:{input_ideal:'I = ⟨A2, A3, A4, A5, Q⟩',associated_primes:['⟨d₂, m₁, F_g, F_c, wp-1⟩','⟨m₂, d₁, F_g, F_c, wp-1⟩','⟨F_c - F_g, m₁d₁ - m₂d₂, wp-1, F_g(d₁+d₂)² - m₁m₂G⟩'],generators_tested:[{generator:'F_g(d₁+d₂)² - m₁m₂G = 0',derives_q:true,rejection_reason:null},{generator:'d₂ = 0',derives_q:false,rejection_reason:'projection_does_not_match_Q'}]}},
      symbolic_transformation:{source_axiom_id:'NEWTON_GRAV_01',target_axiom_id:'EINSTEIN_FIELD_EQ_04',rewrite_steps:['S₀ = {A₁, A₂, A₅}','→ {A₁\', A₂, A₅}   [t → τ]','→ {A₁\'\', A₂, A₅}  [d/dt → ∇_τ]','→ {W₂, A₅}         [add metric tensor g_μν]','→ {W₄}             [add Λg_μν — Einstein field equations]'],semantic_distance:0.72,llm_justification:'Moderate change: preserves conservation while generalising to curved spacetime.'},
      pddl_representation:{domain_name:'celestial-mechanics',action:{name:'gravitational-acceleration',parameters:['?body1 - celestial-body','?body2 - celestial-body'],preconditions:['(mass ?body1 ?m1)','(mass ?body2 ?m2)','(distance ?body1 ?body2 ?r)'],effects:['(increase (velocity ?body1) (* G ?m2 (/ 1 (* ?r ?r))))']}},
    },
  },

  EINSTEIN_FIELD_EQ_04: _mk('EINSTEIN_FIELD_EQ_04','Einstein Field Equations','Celestial Mechanics','HYPOTHESIZED',
    'R_{\\mu\\nu} - \\tfrac{1}{2}g_{\\mu\\nu}R + \\Lambda g_{\\mu\\nu} = \\dfrac{8\\pi G}{c^4}T_{\\mu\\nu}',null,
    {phenomena_explained_count:15,phenomena_total_count:15,explanation_ratio:1.0},
    [['MERCURY_PERIHELION',0.999],['GRAVITATIONAL_LENSING',0.998],['KEPLER_LAWS',0.97],['GRAVITATIONAL_WAVES',0.999]],[],null),

  KEPLER_LAW_01: _mk('KEPLER_LAW_01','Kepler\'s Third Law','Celestial Mechanics','CANONICAL',
    'T^2 = \\dfrac{4\\pi^2}{GM} a^3',
    '(= (period-squared ?body) (* (/ (* 4 pi pi) (* G (star-mass ?body))) (expt (semi-major-axis ?body) 3)))',
    {phenomena_explained_count:8,phenomena_total_count:8,explanation_ratio:1.0},
    [['PLANETARY_PERIODS',0.999],['MOON_ORBIT',0.998],['SATELLITE_ORBIT',0.999]],[],null),

  MAXWELL_EM_01: _mk('MAXWELL_EM_01','Gauss\'s Law (Electric)','Electromagnetism','CANONICAL',
    '\\nabla \\cdot \\mathbf{E} = \\dfrac{\\rho}{\\varepsilon_0}',null,
    {phenomena_explained_count:20,phenomena_total_count:20,explanation_ratio:1.0},
    [['COULOMBS_LAW',1.0],['ELECTRIC_FLUX',1.0],['CAPACITOR_FIELD',0.99]],[],null),

  MAXWELL_EM_02: _mk('MAXWELL_EM_02','Faraday\'s Law of Induction','Electromagnetism','CANONICAL',
    '\\nabla \\times \\mathbf{E} = -\\dfrac{\\partial \\mathbf{B}}{\\partial t}',null,
    {phenomena_explained_count:18,phenomena_total_count:18,explanation_ratio:1.0},
    [['ELECTROMAGNETIC_INDUCTION',1.0],['LENZ_LAW',0.99],['TRANSFORMER_ACTION',0.98]],[],null),

  MAXWELL_EM_03: _mk('MAXWELL_EM_03','Ampère–Maxwell Law','Electromagnetism','INCOMPLETE',
    '\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\dfrac{\\partial\\mathbf{E}}{\\partial t}',null,
    {phenomena_explained_count:14,phenomena_total_count:17,explanation_ratio:0.82},
    [['MAGNETIC_FIELD_WIRE',0.99],['DISPLACEMENT_CURRENT',0.95]],
    [['QUANTUM_SPIN_FIELD','Spin angular momentum not captured in classical Ampère',null,null]],null),

  LORENTZ_FORCE_02: _mk('LORENTZ_FORCE_02','Lorentz Force Law','Electromagnetism','ANOMALOUS',
    '\\mathbf{F} = q(\\mathbf{E} + \\mathbf{v} \\times \\mathbf{B})',null,
    {phenomena_explained_count:9,phenomena_total_count:10,explanation_ratio:0.90},
    [['CYCLOTRON_MOTION',0.99],['HALL_EFFECT',0.95],['CATHODE_RAY',0.98]],
    [['ANOMALOUS_MAGNETIC_MOMENT','g-factor deviation from classical 2',0.00116,'dimensionless']],
    {semantic_distance:0.58,spectrum_position:'right_of_center',closest_canonical_axiom:'DIRAC_SPINOR_03',
     candidate_missing_axiom:{axiom_id:'DIRAC_SPINOR_03',expression_latex:'(i\\gamma^\\mu\\partial_\\mu - m)\\psi = 0',semantic_distance_from_current:0.58}}),

  DIRAC_SPINOR_03: _mk('DIRAC_SPINOR_03','Dirac Equation','Electromagnetism','HYPOTHESIZED',
    '(i\\gamma^\\mu\\partial_\\mu - m)\\psi = 0',null,
    {phenomena_explained_count:10,phenomena_total_count:10,explanation_ratio:1.0},
    [['ANOMALOUS_MAGNETIC_MOMENT',0.9997],['ELECTRON_SPIN',1.0],['PAIR_PRODUCTION',0.999]],[],null),

  CLAUSIUS_2ND_01: _mk('CLAUSIUS_2ND_01','Clausius Inequality (2nd Law)','Thermodynamics','INCOMPLETE',
    'dS \\geq \\dfrac{\\delta Q}{T}',null,
    {phenomena_explained_count:9,phenomena_total_count:11,explanation_ratio:0.82},
    [['HEAT_ENGINE_LIMIT',0.99],['ENTROPY_PRODUCTION',0.97]],
    [['QUANTUM_COHERENCE_ENTROPY','Entropy decrease in quantum coherent systems',null,null]],null),

  FOURIER_HEAT_02: _mk('FOURIER_HEAT_02','Fourier Heat Conduction','Thermodynamics','CANONICAL',
    '\\mathbf{q} = -k\\nabla T',null,
    {phenomena_explained_count:15,phenomena_total_count:15,explanation_ratio:1.0},
    [['THERMAL_CONDUCTION',1.0],['HEAT_FLUX_STEEL',0.99],['STEADY_STATE_TEMP',0.98]],[],null),

  BOLTZMANN_ENTROPY_01: _mk('BOLTZMANN_ENTROPY_01','Boltzmann Entropy Formula','Thermodynamics','CANONICAL',
    'S = k_B \\ln \\Omega',null,
    {phenomena_explained_count:11,phenomena_total_count:11,explanation_ratio:1.0},
    [['ENTROPY_INCREASE',1.0],['IDEAL_GAS_LAW',0.99],['HEAT_CAPACITY',0.97]],[],null),

  EULER_BERNOULLI_01: _mk('EULER_BERNOULLI_01','Euler–Bernoulli Beam Theory','Structural Mechanics','CANONICAL',
    'EI \\dfrac{d^4 w}{dx^4} = q(x)',null,
    {phenomena_explained_count:14,phenomena_total_count:14,explanation_ratio:1.0},
    [['BEAM_DEFLECTION',0.98],['BENDING_STRESS',0.97],['NATURAL_FREQUENCY',0.95]],[],null),

  // ── STRÜVER Model ──────────────────────────────────────────────────────────

  STR_TRIAS_01: _mk('STR_TRIAS_01','TRIAS Core Identity','STRÜVER Model','CANONICAL',
    '\\left(\\frac{v_\\Phi}{C_\\Phi}\\right)^2 + \\frac{M}{E} = 1,\\quad 0 \\leq \\frac{M}{E} \\leq 1',null,
    {phenomena_explained_count:8,phenomena_total_count:8,explanation_ratio:1.0},
    [['COGNITIVE_CAPACITY_BOUND',1.0],['ENERGY_PARTITION',0.99],['MOBILITY_ENVELOPE',0.98]],[],null),

  STR_URULE_02: _mk('STR_URULE_02','70/30 Internal Rule','STRÜVER Model','CANONICAL',
    'p^* = 0.30,\\quad p_i = u_{i,\\mathrm{ord}} / u_i',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['DOMINANCE_THRESHOLD',0.99],['BALANCE_POINT',0.97]],[],null),

  STR_DYNAMIC_03: _mk('STR_DYNAMIC_03','Primary u-Dynamics','STRÜVER Model','INCOMPLETE',
    '\\dot{u}_i = (a_i + \\sum_j \\eta_{ij}\\rho_j)u_i - (b_i\\rho_i + c_i\\rho_i^2 + \\lambda_i d_i(p_i))u_i + \\zeta_i',null,
    {phenomena_explained_count:5,phenomena_total_count:7,explanation_ratio:0.71},
    [['UTILITY_GROWTH',0.95],['COMPETITIVE_SUPPRESSION',0.87]],
    [['STOCHASTIC_FLUCTUATION','ζ_i noise term lacks distributional characterisation',null,null]],null),

  STR_PHASE_04: _mk('STR_PHASE_04','Phase Regime A — Balanced','STRÜVER Model','CANONICAL',
    '\\forall i:\\; \\alpha \\leq \\rho_i \\leq \\beta,\\quad p_i \\in [p^*-\\delta,\\, p^*+\\delta]',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['EQUILIBRIUM_DETECTION',1.0],['BALANCE_BAND',0.99]],[],null),

  STR_PHASE_05: _mk('STR_PHASE_05','Phase Regime B — Drift','STRÜVER Model','ANOMALOUS',
    '\\neg\\mathrm{Balanced} \\;\\wedge\\; \\max_i \\rho_i < \\theta',null,
    {phenomena_explained_count:3,phenomena_total_count:5,explanation_ratio:0.60},
    [['SLOW_DRIFT_DETECTION',0.85]],
    [['RECOVERY_TRAJECTORY','Drift recovery rate underestimated in fast-switching systems',null,null]],null),

  STR_PHASE_06: _mk('STR_PHASE_06','Phase Regime C — Overdominance','STRÜVER Model','ANOMALOUS',
    '\\rho_i \\geq \\theta \\;\\wedge\\; \\rho_i > \\max_{j \\neq i} \\rho_j',null,
    {phenomena_explained_count:4,phenomena_total_count:6,explanation_ratio:0.67},
    [['MONOPOLY_DETECTION',0.92],['DOMINANCE_FLAG',0.89]],
    [['OSCILLATORY_DOMINANCE','Flickering between two near-equal dominant actors not modelled',null,null]],null),

  STR_HAZARD_07: _mk('STR_HAZARD_07','Hazard Function','STRÜVER Model','CANONICAL',
    'h_{\\mathrm{raw}} = k_1 D_{\\mathrm{band}} + k_2 O + k_3 G + k_4 D_{\\mathrm{in}},\\quad \\tilde{h} = 1 - e^{-h_{\\mathrm{raw}}}',null,
    {phenomena_explained_count:7,phenomena_total_count:7,explanation_ratio:1.0},
    [['HAZARD_SCORE',1.0],['RISK_MONOTONICITY',0.99],['SATURATION_BOUND',1.0]],[],null),

  STR_DIAG_08: _mk('STR_DIAG_08','Balance Band Violation','STRÜVER Model','INCOMPLETE',
    'D_{\\mathrm{band}} = \\sum_i [\\mathrm{sp}(\\rho_i - \\beta;\\,\\tau_{\\mathrm{out}}) + \\mathrm{sp}(\\alpha - \\rho_i;\\,\\tau_{\\mathrm{out}})]',null,
    {phenomena_explained_count:4,phenomena_total_count:5,explanation_ratio:0.80},
    [['UPPER_BAND_BREACH',0.97],['LOWER_BAND_BREACH',0.96]],
    [['BAND_WIDTH_SENSITIVITY','τ_out sensitivity analysis incomplete for high-frequency systems',null,null]],null),

  STR_DIAG_09: _mk('STR_DIAG_09','Overdominance Indicator','STRÜVER Model','HYPOTHESIZED',
    'O = \\mathrm{sp}(\\max_i \\rho_i - \\theta;\\,\\tau_{\\mathrm{out}})',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['MONOPOLY_SIGNAL',0.91]],[],null),

  STR_DIAG_10: _mk('STR_DIAG_10','Rate of Change Indicator','STRÜVER Model','HYPOTHESIZED',
    'G = \\sqrt{\\sum_i \\dot{\\rho}_i^2}',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['VELOCITY_NORM',0.93],['PHASE_TRANSITION_SIGNAL',0.88]],[],null),

  STR_DIAG_11: _mk('STR_DIAG_11','Internal Deviation','STRÜVER Model','HYPOTHESIZED',
    'D_{\\mathrm{in}} = \\sum_i d_i(p_i),\\quad d_i(p_i) = \\mathrm{sp}(p_i-(p^*+\\delta);\\tau_{\\mathrm{in}}) + \\mathrm{sp}((p^*-\\delta)-p_i;\\tau_{\\mathrm{in}})',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['INTERNAL_RULE_VIOLATION',0.90]],[],null),

  // ── Astheroth / ACRE ───────────────────────────────────────────────────────

  AST_ID_01: _mk('AST_ID_01','Core Closure Identity','Admissibility (ACRE)','CANONICAL',
    '\\left(\\frac{v_\\Phi}{C_\\Phi}\\right)^2 + \\frac{M}{E} = 1,\\quad 0 \\leq \\frac{M}{E} \\leq 1',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['ADMISSIBILITY_BOUND',1.0],['CAPACITY_UNITY',1.0]],[],null),

  AST_DOMAIN_02: _mk('AST_DOMAIN_02','Domain Closure','Admissibility (ACRE)','CANONICAL',
    '0 \\leq v_\\Phi \\leq C_\\Phi',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['SPEED_ENVELOPE',1.0],['FEASIBILITY_CHECK',0.99]],[],null),

  AST_CAPACITY_03: _mk('AST_CAPACITY_03','Capacity Partition','Admissibility (ACRE)','CANONICAL',
    'E = M + E_{\\mathrm{prop}}',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['ENERGY_SPLIT',1.0],['PROPULSIVE_BUDGET',0.98]],[],null),

  AST_CONTROL_04: _mk('AST_CONTROL_04','Single-Parameter Control','Admissibility (ACRE)','INCOMPLETE',
    'f(\\varepsilon) = \\sqrt{1 - \\varepsilon}',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['EPSILON_MAPPING',0.94]],
    [['EDGE_CASE_EPSILON','Behaviour near ε=1 singularity insufficiently characterised',null,null]],null),

  AST_PROCESS_05: _mk('AST_PROCESS_05','Process Condition','Admissibility (ACRE)','HYPOTHESIZED',
    '\\varepsilon < 1',null,
    {phenomena_explained_count:4,phenomena_total_count:4,explanation_ratio:1.0},
    [['NON_SINGULAR_PROCESS',1.0],['PHYSICAL_FEASIBILITY',0.99]],[],null),

  AST_DECISION_06: _mk('AST_DECISION_06','Decision Space','Admissibility (ACRE)','CANONICAL',
    '\\mathcal{D} \\in \\{\\texttt{ALLOW},\\, \\texttt{REFUSE},\\, \\texttt{BLOCK}\\}',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['ALLOW_GATE',1.0],['REFUSE_GATE',1.0],['BLOCK_GATE',1.0]],[],null),

  AST_STABILITY_07: _mk('AST_STABILITY_07','Stability Index','Admissibility (ACRE)','INCOMPLETE',
    '\\Sigma = 1 - (|S_{\\mathrm{rel}} - C_S| + |M_{\\mathrm{rel}} - C_M| + |W_{\\mathrm{rel}} - C_W|)',null,
    {phenomena_explained_count:4,phenomena_total_count:5,explanation_ratio:0.80},
    [['STABILITY_SCORE',0.96],['WEIGHT_BALANCE',0.91]],
    [['CROSS_COUPLING','Weight coupling across S/M/W dimensions not modelled',null,null]],null),

  AST_MAPPING_08: _mk('AST_MAPPING_08','Projection Operator','Admissibility (ACRE)','HYPOTHESIZED',
    '\\Pi: \\mathcal{S} \\to \\mathcal{O}',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['STATE_OBSERVABLE_MAP',0.88]],[],null),

  AST_HAZARD_09: _mk('AST_HAZARD_09','Hazard Quantification','Admissibility (ACRE)','HYPOTHESIZED',
    'H = (H_S + H_M + H_W)/3',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['COMPOSITE_HAZARD',0.92],['DIMENSION_BALANCE',0.88]],[],null),

  // ── UPASL Invariants ───────────────────────────────────────────────────────

  UPL_VALID_01: _mk('UPL_VALID_01','Evidence Validity','UPASL Invariants','CANONICAL',
    '\\mathrm{valid}(a_i) := (\\Delta t_i \\leq \\Delta t_{i,\\max}) \\wedge (c_i = 1)',null,
    {phenomena_explained_count:8,phenomena_total_count:8,explanation_ratio:1.0},
    [['TIMESTAMP_FRESHNESS',1.0],['CHANNEL_INTEGRITY',1.0],['SENSOR_VALIDITY',0.99]],[],null),

  UPL_NORM_02: _mk('UPL_NORM_02','Proxy Normalisation','UPASL Invariants','INCOMPLETE',
    'p_i(t) = \\mathrm{clip}\\!\\left(\\frac{x_i(t)-\\mu_i}{\\sigma_i}s_i + b_i,\\;0,\\;1\\right)',null,
    {phenomena_explained_count:6,phenomena_total_count:8,explanation_ratio:0.75},
    [['PROXY_SCALING',0.95],['CLIP_BOUND',1.0]],
    [['DISTRIBUTION_SHIFT','σ recalibration under non-stationary inputs not covered',null,null]],null),

  UPL_DECISION_03: _mk('UPL_DECISION_03','Universal Commit Rule','UPASL Invariants','CANONICAL',
    '\\mathrm{REFUSE}\\;\\text{if}\\;\\exists d: S_d\\in\\{\\mathrm{VIOL},\\mathrm{UND}\\};\\;\\mathrm{ALLOW}\\;\\text{if}\\;\\forall d: S_d=\\mathrm{SAT}',null,
    {phenomena_explained_count:7,phenomena_total_count:7,explanation_ratio:1.0},
    [['REFUSE_TRIGGER',1.0],['ALLOW_CONDITION',1.0],['UNDETERMINED_FLAG',0.99]],[],null),

  UPL_THERMAL_04: _mk('UPL_THERMAL_04','Thermal Invariants','UPASL Invariants','CANONICAL',
    'T(t) \\leq T_{\\max},\\quad |\\dot{T}(t)| \\leq \\dot{T}_{\\max},\\quad H_T(t) \\geq H_{T,\\min}',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['TEMP_CEILING',1.0],['THERMAL_RATE_LIMIT',0.99],['HEADROOM_FLOOR',0.99]],[],null),

  UPL_MECH_05: _mk('UPL_MECH_05','Mechanical Invariants','UPASL Invariants','CANONICAL',
    'm_L(t) \\geq m_{L,\\min},\\quad |\\dot{\\sigma}(t)| \\leq \\dot{\\sigma}_{\\max},\\quad D_M(t) \\leq D_{M,\\max}',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['MASS_FLOOR',1.0],['STRESS_RATE',0.99],['DAMAGE_CAP',1.0]],[],null),

  UPL_EPS_06: _mk('UPL_EPS_06','Power Invariants','UPASL Invariants','INCOMPLETE',
    'V(t) \\geq V_{\\min},\\quad |\\dot{I}(t)| \\leq \\dot{I}_{\\max},\\quad \\mathrm{SoC}(t) \\geq \\mathrm{SoC}_{\\min}',null,
    {phenomena_explained_count:5,phenomena_total_count:7,explanation_ratio:0.71},
    [['VOLTAGE_FLOOR',1.0],['CURRENT_SLEW',0.97],['SOC_FLOOR',0.99]],
    [['COLD_CRANK_VOLTAGE','V_min not validated for cold-crank transient during boot sequence',null,null]],null),

  UPL_RAD_07: _mk('UPL_RAD_07','Radiation Invariants','UPASL Invariants','HYPOTHESIZED',
    'D(t) \\leq D_{\\max},\\quad \\dot{D}(t) \\leq \\dot{D}_{\\max},\\quad r_{\\mathrm{SEE}}(t) \\leq r_{\\mathrm{SEE},\\max}',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['TOTAL_DOSE_CAP',0.93],['SEE_RATE',0.88]],[],null),

  UPL_FLUID_08: _mk('UPL_FLUID_08','Fluid Invariants','UPASL Invariants','HYPOTHESIZED',
    '\\tau_s(t) \\leq \\tau_{s,\\max},\\quad \\Pi(t) \\leq \\Pi_{\\max},\\quad \\mathrm{fill}(t) \\notin \\mathcal{Z}_{\\mathrm{unstable}}',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['SHEAR_STRESS_CAP',0.90],['PRESSURE_LIMIT',0.92]],[],null),

  UPL_INFO_09: _mk('UPL_INFO_09','Information Invariants','UPASL Invariants','INCOMPLETE',
    'L(t) \\leq L_{\\max},\\quad J(t) \\leq J_{\\max},\\quad \\forall a_i:\\; \\Delta t_i \\leq \\Delta t_{i,\\max}',null,
    {phenomena_explained_count:5,phenomena_total_count:7,explanation_ratio:0.71},
    [['LATENCY_CAP',0.97],['JITTER_CAP',0.95],['EVIDENCE_FRESHNESS',0.99]],
    [['BURST_JITTER','High-burst packet jitter characterisation missing',null,null]],null),

  // ── Power Management (Engineering — DEDUCTION-eligible) ────────────────────

  PWR_EFF_01: _mk('PWR_EFF_01','Power Efficiency Constraint','Power Management','CANONICAL',
    '\\eta = \\dfrac{P_{\\mathrm{out}}}{P_{\\mathrm{in}}} \\geq 0.85',null,
    {phenomena_explained_count:7,phenomena_total_count:7,explanation_ratio:1.0},
    [['CONVERTER_EFFICIENCY',1.0],['THERMAL_LOSS',0.98],['BUDGET_COMPLIANCE',0.99]],[],null),

  PWR_SEQ_02: _mk('PWR_SEQ_02','Power Sequencing FSM','Power Management','CANONICAL',
    't_{\\mathrm{rise}}(\\mathrm{rail}_i) + t_{\\mathrm{delay}} \\leq t_{\\mathrm{rise}}(\\mathrm{rail}_{i+1})',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['SEQUENCING_ORDER',1.0],['RAIL_INTERLOCK',0.99],['STARTUP_TIMING',0.98]],[],null),

  PWR_RIPPLE_03: _mk('PWR_RIPPLE_03','Power Ripple & Noise Budget','Power Management','INCOMPLETE',
    'V_{\\mathrm{ripple,pp}} \\leq 30\\,\\mathrm{mV}',null,
    {phenomena_explained_count:4,phenomena_total_count:6,explanation_ratio:0.67},
    [['OUTPUT_RIPPLE',0.95],['SWITCHER_NOISE',0.88]],
    [['HIGH_FREQ_EMI','Components above 100 MHz not characterised in ripple model',null,null]],null),

  PWR_CONS_04: _mk('PWR_CONS_04','Power Consumption Budget','Power Management','CANONICAL',
    'P_{\\mathrm{total}} = \\sum_i V_i I_i \\leq P_{\\mathrm{budget}}',null,
    {phenomena_explained_count:8,phenomena_total_count:8,explanation_ratio:1.0},
    [['TOTAL_POWER',1.0],['BUDGET_HEADROOM',0.99],['RAIL_CONTRIBUTION',0.98]],[],null),

  PWR_INT_05: _mk('PWR_INT_05','PDN Integrity','Power Management','ANOMALOUS',
    'Z_{\\mathrm{PDN}}(f) \\leq 10\\,\\mathrm{m}\\Omega',null,
    {phenomena_explained_count:5,phenomena_total_count:8,explanation_ratio:0.625},
    [['PDN_IMPEDANCE_DC',0.99],['DECAP_RESONANCE',0.85]],
    [['PDN_RESONANCE','Anti-resonance between BGA capacitance and PCB planes not modelled',null,null],
     ['HIGH_FREQ_IMPEDANCE','Impedance above 500 MHz exceeds 10mΩ target in simulation',null,null]],
    {semantic_distance:0.41,spectrum_position:'right_of_center',closest_canonical_axiom:'PWR_TRAN_06',
     candidate_missing_axiom:{axiom_id:'PWR_TRAN_06',expression_latex:'\\Delta V_{\\mathrm{droop}} \\leq 100\\,\\mathrm{mV},\\quad I_{\\min} \\geq 50\\,\\mathrm{mA}',semantic_distance_from_current:0.41}}),

  PWR_TRAN_06: _mk('PWR_TRAN_06','Over-Transient & Minimum Load','Power Management','HYPOTHESIZED',
    '\\Delta V_{\\mathrm{droop}} \\leq 100\\,\\mathrm{mV},\\quad I_{\\min} \\geq 50\\,\\mathrm{mA}',null,
    {phenomena_explained_count:4,phenomena_total_count:5,explanation_ratio:0.80},
    [['DROOP_LIMIT',0.95],['MIN_LOAD_STABILITY',0.91]],[],null),

  // ── Telemetry / Interface (INDUCTION + ABDUCTION only) ────────────────────

  TEL_RED_01: _mk('TEL_RED_01','Redundant Active Load Sharing','Interface / Telemetry','CANONICAL',
    'I_{\\mathrm{share},i} = I_{\\mathrm{total}} / N_{\\mathrm{active}}',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['LOAD_BALANCING',1.0],['FAULT_ISOLATION',0.98],['REDUNDANCY_FACTOR',0.97]],[],null),

  TEL_RT_02: _mk('TEL_RT_02','Power Ride-Through','Interface / Telemetry','CANONICAL',
    't_{\\mathrm{ride}} \\geq 20\\,\\mathrm{ms}\\;@\\;V_{\\mathrm{in}} \\geq 0.85\\,V_{\\mathrm{nom}}',null,
    {phenomena_explained_count:4,phenomena_total_count:4,explanation_ratio:1.0},
    [['RIDE_THROUGH_DURATION',1.0],['HOLD_UP_VOLTAGE',0.99]],[],null),

  TEL_PMBUS_03: _mk('TEL_PMBUS_03','PMBus v1.3 Interface','Interface / Telemetry','CANONICAL',
    'f_{\\mathrm{SCL}} \\leq 400\\,\\mathrm{kHz},\\quad V_{\\mathrm{IL}} \\leq 0.8\\,\\mathrm{V},\\quad V_{\\mathrm{IH}} \\geq 2.1\\,\\mathrm{V}',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['PMBUS_TIMING',1.0],['VOLTAGE_LEVELS',1.0],['COMMAND_SET',0.99]],[],null),

  TEL_SMBUS_04: _mk('TEL_SMBUS_04','SMBus Interface','Interface / Telemetry','CANONICAL',
    'f_{\\mathrm{SCL}} \\leq 100\\,\\mathrm{kHz},\\quad t_{\\mathrm{timeout}} = 35\\,\\mathrm{ms}',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['SMBUS_TIMING',1.0],['TIMEOUT_COMPLIANCE',1.0]],[],null),

  TEL_UART_05: _mk('TEL_UART_05','UART + JTAG Debug Interface','Interface / Telemetry','CANONICAL',
    '\\mathrm{baud} \\in \\{9600,115200,1{M}\\},\\quad f_{\\mathrm{TCK}} \\leq 20\\,\\mathrm{MHz}',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['BAUD_COMPLIANCE',1.0],['JTAG_CLOCK',0.99],['DEBUG_ACCESS',0.98]],[],null),

  TEL_I2C_06: _mk('TEL_I2C_06','I²C Interface Specification','Interface / Telemetry','CANONICAL',
    'f_{\\mathrm{SCL}} \\leq 400\\,\\mathrm{kHz}\\;(\\mathrm{Fast}),\\quad R_{\\mathrm{pull-up}} = \\frac{V_{CC} - V_{\\mathrm{OL}}}{I_{\\mathrm{sink}}}',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['FAST_MODE_TIMING',1.0],['PULL_UP_CALCULATION',0.99],['BUS_CAPACITANCE',0.97]],[],null),

  TEL_I3C_07: _mk('TEL_I3C_07','I3C Interface Specification','Interface / Telemetry','INCOMPLETE',
    'f_{\\mathrm{SCL}} \\leq 12.5\\,\\mathrm{MHz},\\quad E_{\\mathrm{HDR\\text{-}DDR}} \\leq 25\\,\\mathrm{mV_{pp}}',null,
    {phenomena_explained_count:3,phenomena_total_count:5,explanation_ratio:0.60},
    [['I3C_CLOCK',0.95],['HDR_MODE',0.88]],
    [['IN_BAND_INTERRUPT','IBI protocol compliance not validated',null,null]],null),

  TEL_SERDES_08: _mk('TEL_SERDES_08','SERDES High-Speed Interface','Interface / Telemetry','CANONICAL',
    'BER \\leq 10^{-12},\\quad Z_0 = 100\\,\\Omega_{\\mathrm{diff}},\\quad f_{\\mathrm{link}} \\leq 25\\,\\mathrm{Gbps}',null,
    {phenomena_explained_count:6,phenomena_total_count:6,explanation_ratio:1.0},
    [['BER_FLOOR',1.0],['IMPEDANCE_MATCH',0.99],['LINK_THROUGHPUT',0.98]],[],null),

  TEL_SPI_09: _mk('TEL_SPI_09','SPI Interface','Interface / Telemetry','CANONICAL',
    'f_{\\mathrm{SCLK}} \\leq 50\\,\\mathrm{MHz},\\quad t_{\\mathrm{CS\\text{-}SCLK}} \\geq 5\\,\\mathrm{ns}',null,
    {phenomena_explained_count:5,phenomena_total_count:5,explanation_ratio:1.0},
    [['SCLK_RATE',1.0],['SETUP_HOLD',0.99],['CS_TIMING',1.0]],[],null),

  TEL_GPIO_10: _mk('TEL_GPIO_10','GPIO Status & Control','Interface / Telemetry','CANONICAL',
    'V_{\\mathrm{OH}} \\geq V_{\\mathrm{CC}} - 0.5\\,\\mathrm{V},\\quad V_{\\mathrm{OL}} \\leq 0.5\\,\\mathrm{V},\\quad I_{\\mathrm{drive}} \\leq 16\\,\\mathrm{mA}',null,
    {phenomena_explained_count:4,phenomena_total_count:4,explanation_ratio:1.0},
    [['OUTPUT_HIGH',1.0],['OUTPUT_LOW',1.0],['DRIVE_CURRENT',0.99]],[],null),

  // ── AI Governance / Psychosis (INDUCTION + ABDUCTION only) ────────────────

  PSY_BAYES_01: _mk('PSY_BAYES_01','Bayesian Belief Update','AI Governance','HYPOTHESIZED',
    'p_{\\mathrm{user}}^{(t+1)}(H) \\propto p_{\\mathrm{bot}}(\\rho|D)\\,p(D|H)\\,p_{\\mathrm{user}}^{(t)}(H)',null,
    {phenomena_explained_count:4,phenomena_total_count:5,explanation_ratio:0.80},
    [['BELIEF_UPDATE',0.95],['EVIDENCE_WEIGHTING',0.90]],
    [['PRIOR_COLLAPSE','Degenerate prior behaviour at p=0 or p=1 not modelled',null,null]],null),

  PSY_SYC_02: _mk('PSY_SYC_02','Sycophantic Response Model','AI Governance','ANOMALOUS',
    '\\rho(t) = \\arg\\max_{\\rho}\\; p_{\\mathrm{user}}(H = H_s(t) | \\rho)',null,
    {phenomena_explained_count:3,phenomena_total_count:5,explanation_ratio:0.60},
    [['SYCOPHANCY_DETECTION',0.88],['RESPONSE_BIAS',0.82]],
    [['MULTI_AGENT_SYCOPHANCY','Model does not account for multi-agent echo amplification',null,null],
     ['BELIEF_POLARIZATION','Transition to PSY_POLAR_04 not triggered deterministically',null,null]],
    {semantic_distance:0.33,spectrum_position:'left_of_center',closest_canonical_axiom:'PSY_BAYES_01',
     candidate_missing_axiom:{axiom_id:'PSY_BAYES_01',expression_latex:'p_{\\mathrm{user}}^{(t+1)}(H) \\propto p_{\\mathrm{bot}}(\\rho|D)\\,p(D|H)\\,p_{\\mathrm{user}}^{(t)}(H)',semantic_distance_from_current:0.33}}),

  PSY_SPIRAL_03: _mk('PSY_SPIRAL_03','Delusional Spiral Threshold','AI Governance','HYPOTHESIZED',
    'p_{\\mathrm{user}}^{(t)}(H=0) \\geq 1 - \\varepsilon',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['DELUSION_FLAG',0.92],['CERTAINTY_LOCK',0.88]],[],null),

  PSY_POLAR_04: _mk('PSY_POLAR_04','Belief Polarisation','AI Governance','HYPOTHESIZED',
    'P(H=0) \\to 1 \\;\\text{OR}\\; P(H=1) \\to 1 \\;\\text{over }t',null,
    {phenomena_explained_count:3,phenomena_total_count:4,explanation_ratio:0.75},
    [['POLARISATION_TRAJECTORY',0.90],['ECHO_CHAMBER_FORMATION',0.85]],[],null),
};
