/**
 * Module: axiom_matcher.js — Ontology Compliance Matrix (OCM) Election Engine
 * Version: 2.1.0
 * Description: Two-pass election engine:
 *   PASS-1  Domain Signal Strength  — certainty gap ≥ 0.35 → DETERMINISTIC HIERARCHY
 *   PASS-2  Multi-dimensional Topology — cosine similarity for cross-domain signals
 *   GUARD   contradiction_signals[] — disqualifies axiom regardless of score
 *
 * Rule 03: After election, emits ONTOLOGY_CLASSIFIED + DATA_EXTRACTED via
 *          window.SovereignBUS (set by sovereign_bus_compat.js) so GNN, World Model
 *          and Causal Matrix can subscribe without direct calls.
 *
 * Tiers:
 *   ELECTED  (score ≥ 0.50) — bright green · breathing glow
 *   CANDIDATE(score ≥ 0.15) — gold  · match-%
 *   STANDBY  (score <  0.15 OR contradicted) — grey
 *
 * Result extends with:
 *   .electionMode    'HIERARCHY' | 'TOPOLOGY'
 *   .certaintygap    number  (max − 2nd_max of domain vector)
 *   .domainVector    { DOMAIN: weight }
 *
 * API (window.AxiomMatcher):
 *   .matchFromText(text, fileExt)    → tiered result
 *   .matchFromFile(file, cb)         → async → tiered result
 *   .renderTelemetry(panelId, tiered, animate)
 *   .resetTelemetry(panelId)         → all axioms in STANDBY
 *   .processFile(file, panelId, onDone)  → full pipeline (OP-01 / OP-03)
 *   .loadFromSession(panelId)        → restore from sessionStorage (OP-02)
 */

(function (global) {
    'use strict';

    /* ── Tier thresholds ────────────────────────────────────────────────── */
    const T_ELECTED = 0.50;
    const T_CANDIDATE = 0.15;
    const T_CERTAINTY = 0.35;   // gap threshold: HIERARCHY vs TOPOLOGY

    /* ── RTL file extensions ────────────────────────────────────────────── */
    const RTL_EXTENSIONS = new Set(['v', 'sv', 'svh', 'vhd', 'vhdl']);

    /* ── Domain signal dictionary ───────────────────────────────────────── */
    const DOMAIN_SIGNALS = {
        ELECTRONICS: [
            'fpga', 'rtl', 'verilog', 'xilinx', 'zynq', 'axi', 'spi', 'i2c', 'uart', 'gpio', 'pcie', 'ddr',
            'adc', 'dac', 'clk', 'pll', 'ldo', 'buck', 'boost', 'flyback', 'schematic', 'pcb', 'gerber',
            'altium', 'kicad', 'vivado', 'quartus', 'pmbus', 'smbus', 'sensor', 'converter', 'cdc',
            'power rail', 'pgood', 'fanout', 'esd', 'decoupling', 'impedance'
        ],
        RTL: [
            'module', 'endmodule', 'always_ff', 'always_comb', 'always_latch', 'posedge', 'negedge',
            'assign', 'wire', 'reg', 'logic', 'input', 'output', 'inout', 'parameter', 'localparam',
            'case', 'casez', 'casex', 'endcase', 'begin', 'end', 'generate', 'endgenerate',
            'initial', 'task', 'function', 'typedef', 'struct', 'enum', 'interface', 'modport',
            'clocking', 'systemverilog', 'verilog', 'synthesis', 'netlist', 'iverilog', 'verilator',
            'vivado', 'quartus', 'synopsys', 'cadence', 'latch', 'flip-flop', 'fsm', 'state machine',
            'blocking', 'non-blocking', 'sensitivity list', 'combinational loop', 'x propagation'
        ],
        FIRMWARE: [
            'firmware', 'bios', 'uefi', 'embedded', 'rtos', 'freertos', 'microcontroller', 'mcu', 'arm',
            'cortex', 'stm32', 'nxp', 'microchip', 'bare metal', 'hal', 'driver', 'peripheral',
            'flash', 'rom', 'bootloader', 'linker', 'post', 'interrupt vector', 'watchdog', 'wdt',
            'secure boot', 'ota', 'over-the-air', 'mcuboot', 'u-boot'
        ],
        SOFTWARE: [
            'python', 'javascript', 'java', 'c++', 'golang', 'rust', 'api', 'rest', 'http', 'json', 'xml',
            'database', 'sql', 'class', 'function', 'method', 'exception', 'async', 'thread', 'process',
            'docker', 'kubernetes', 'microservice', 'graphql', 'websocket'
        ],
        IOT: [
            'mqtt', 'coap', 'iot', 'internet of things', 'sensor', 'gateway', 'edge', 'telemetry',
            'ble', 'bluetooth', 'zigbee', 'lorawan', 'aws iot', 'azure iot', 'google cloud iot',
            'device twin', 'device shadow', 'thing', 'connected device', 'actuator', 'm2m',
            'machine to machine', 'pub-sub', 'publish', 'subscribe', 'broker', 'topic',
            'qos', 'quality of service', 'retained', 'last will', 'lwt', 'keepalive'
        ],
        IPC: [
            'ipc-2221', 'ipc-a-610', 'ipc-2152', 'j-std-001', 'ipc-7711', 'ipc-7721',
            'pcb', 'printed circuit', 'trace width', 'trace current', 'conductor width',
            'clearance', 'creepage', 'solder joint', 'reflow', 'wave solder', 'surface finish',
            'hasl', 'enig', 'osp', 'immersion silver', 'annular ring', 'via aspect', 'fr4',
            'laminate', 'tg', 'glass transition', 'delamination', 'measling', 'stackup',
            'panelization', 'fiducial', 'tooling hole', 'solder mask', 'solder bridge',
            'roh', 'lead-free', 'sac305', 'class 1', 'class 2', 'class 3', 'acceptance'
        ],
        IOT_SECURITY: [
            'default password', 'unique password', 'device credential', 'hardcoded credential',
            'firmware signature', 'ota verification', 'ecdsa', 'rsa signature', 'signature verify',
            'device identity', 'uuid', 'device certificate', 'x.509', 'hardware root of trust',
            'tls 1.2', 'tls 1.3', 'dtls', 'encrypted transport', 'cipher suite', 'mutual auth',
            'certificate pinning', 'attack surface', 'open port', 'disable service',
            'secure storage', 'tpm', 'secure element', 'efuse', 'key store', 'kek',
            'rate limiting', 'dos protection', 'brute force', 'vulnerability disclosure',
            'cvss', 'cve', 'etsi en 303 645', 'nist sp 800', 'iec 62443', 'cryptographic agility'
        ],
        THERMAL: [
            'thermal', 'temperature', 'heat', 'junction temperature', 'tj', 'theta_ja', 'theta_jb',
            'heat flux', 'fourier', 'thermal resistance', 'thermal cycle', 'thermal via',
            'heatsink', 'heat sink', 'thermal pad', 'copper fill', 'junction cooling',
            'dissipation', 'power dissipation', 'hotspot', 'ambient temperature',
            'cooling', 'convection', 'conduction', 'radiation', 'delta t', 'temperature rise'
        ],
        MECHANICS: [
            'stress', 'strain', 'delamination', 'fracture', 'fatigue', 'crack', 'void',
            'flex', 'bending', 'shear', 'compression', 'tensile', 'torsion', 'creep',
            'cfrp', 'carbon fiber', 'carbon fibre', 'composite', 'fiber reinforced',
            'matrix', 'fiber', 'resin', 'interlaminar', 'impact', 'failure mode',
            'flaw', 'defect', 'discontinuity', 'ultrasonic', 'eddy current', 'ndt', 'nde'
        ],
        COMPOSITE: [
            'cfrp', 'carbon fibre', 'carbon fiber', 'composite', 'fiber volume', 'Vf', 'layup', 'prepreg',
            'autoclave', 'cure', 'void content', 'porosity', 'interlaminar', 'ILSS', 'delamination',
            'ASTM D3039', 'ASTM D2344', 'ASTM D3171', 'ASTM D7136', 'EN 2564', 'AMS 2770',
            'NADCAP', 'ply', 'draping', 'resin', 'matrix cracking', 'burnoff', 'specimen',
            'nominal', 'pass', 'fail', 'inspection report', 'test report', 'MRL'
        ],
        AEROSPACE: [
            'EASA', 'FAA', 'CAAC', 'airworthiness', 'CS-25', 'FAR 25', 'type certificate', 'DOA',
            'DO-178', 'DO-254', 'DO-160', 'AS9100', 'EN 9100', 'ARP 4761', 'FMEA', 'FMECA',
            'damage tolerance', 'safe-life', 'fail-safe', 'ultimate load', 'limit load',
            'margin of safety', 'buckling', 'fatigue life', 'BVID', 'CAI', 'EDT',
            'NAS 410', 'EN 4179', 'POD', 'C-scan', 'phased array', 'thermography', 'shearography',
            'saab', 'hitachi', 'aeronautics'
        ],
        PHYSICS_CLASSICAL: [
            'newton', 'force', 'mass', 'velocity', 'acceleration', 'momentum', 'gravity',
            'kinematic', 'inertia', 'classical mechanics', 'f=ma', 'torque', 'angular',
            'orbital', 'gravitational', 'potential energy', 'kinetic energy', 'conservation'
        ],
        PHYSICS_QUANTUM: [
            'quantum', 'planck', 'schrodinger', 'wavefunction', 'eigenvalue', 'hamiltonian',
            'heisenberg', 'uncertainty', 'entanglement', 'superposition', 'photon', 'quanta',
            'de broglie', 'matter wave', 'spin', 'orbital', 'electron', 'bohr', 'pauli',
            'e=mc', 'mass energy', 'relativistic', 'rest mass'
        ],
        CAUSALITY: [
            'cause', 'effect', 'trace', 'causal', 'dependency', 'provenance', 'root cause',
            'traceability', 'attribution', 'fault tree', 'failure', 'incident', 'finding',
            'analysis', 'status', 'report', 'observation', 'propagation', 'corridor'
        ],
        CONTRACT: [
            'contract', 'obligation', 'breach', 'penalty', 'clause', 'indemnif', 'liability',
            'party', 'agreement', 'terms', 'conditions', 'compliance'
        ],
        FINANCIAL: [
            'revenue', 'cost', 'profit', 'margin', 'balance', 'asset', 'liability', 'cash flow',
            'audit', 'financial', 'accounting', 'ifrs', 'gaap'
        ],
        PRODUCT_SPEC: [
            'product spec', 'datasheet', 'architecture', 'interface definition', 'pinout', 'mechanical spec',
            'functional requirement', 'design constraint', 'hardware spec'
        ],
        QA_REPORT: [
            'qa report', 'inspection report', 'metrology', 'non-conformance', 'quality assurance',
            'methodology', 'regulation', 'discrepancy', 'validation result'
        ],
        HEALTHCARE: [
            /* Core domain identifiers */
            'healthcare', 'health', 'medical', 'clinical', 'patient', 'diagnosis', 'prognosis',
            /* Blood chemistry & labs */
            'blood', 'serum', 'plasma', 'hemoglobin', 'hematocrit', 'hba1c', 'glucose', 'creatinine',
            'egfr', 'bun', 'urea', 'uric acid', 'alt', 'ast', 'alp', 'bilirubin', 'albumin',
            'ldl', 'hdl', 'cholesterol', 'triglycerides', 'tg', 'psa', 'tsh', 't3', 't4',
            'ferritin', 'transferrin', 'sodium', 'potassium', 'chloride', 'bicarbonate', 'calcium',
            'magnesium', 'phosphate', 'anion gap', 'osmolality', 'inr', 'pt', 'aptt', 'cbc',
            /* Vitals & metrics */
            'systolic', 'diastolic', 'blood pressure', 'heart rate', 'pulse', 'bmi',
            'weight', 'height', 'temperature', 'spo2', 'oxygen saturation', 'qtc', 'map',
            /* Imaging */
            'cardiothoracic', 'hu', 'hounsfield', 'lvef', 'ejection fraction', 'psv',
            'adc', 'mri', 'ct scan', 'ultrasound', 'echocardiogram', 'x-ray', 'radiology',
            /* Conditions */
            'diabetes', 'hypertension', 'renal', 'hepatic', 'cardiac', 'vascular',
            'nephropathy', 'neuropathy', 'retinopathy', 'ckd', 'copd', 'asthma',
            'metabolic', 'dyslipidemia', 'obesity', 'proteinuria', 'microalbuminuria',
            /* Procedures & clinical context */
            'prescription', 'medication', 'dosage', 'therapy', 'treatment', 'surgery',
            'consultation', 'follow-up', 'discharge', 'admission', 'ward', 'clinic',
            'specimen', 'sample', 'wintrobe', 'laboratory', 'pathology'
        ]
    };

    /* ── Category formula fallbacks (for axioms without _formula) ───────── */
    const CAT_FORMULA = {
        causality: 'E(t) = ⋂{Cᵢ(t)}  ∧  B(t) < B_max',
        determinism: 'f(x₁) = f(x₂) ⟺ x₁ = x₂  ∀x ∈ X',
        resource_integrity: 'Σ alloc(t) = Σ free(t) + Δ_held(t)',
        data_integrity: '∀x ∈ X_ext : x ∈ [x_min, x_max]',
        control_flow: '∀p ∈ paths(G) : |p| < K_max',
        concurrency: 'P(race) = 0  ∧  P(deadlock) = 0',
        security: 'priv(ρ) = min { p ∣ p ≥ req(ρ) }',
        firmware: 'POST(t) = ∫₀^T_boot seq(t)dt = PASS',
        electronics: 'Z_PDN(f) = V_noise(f)/I_load(f) ≤ Z_target(f)',
        rtl: 'f_clk ≤ 1/(t_su + t_hold + t_prop)',
        common_sense: '0 < T_timeout ≤ T_max  ∧  retry ≤ N_max',
        ipc_pcb: 'I = k · ΔT^b · A^c  ∧  d_air ≥ V_peak/E_bd  (IPC-2152)',
        iot_security: 'TLS_ver ≥ 1.2  ∧  cipher ∈ NIST_approved  ∧  cert_valid(server)',
        iot_protocol: 'QoS(msg) ≥ 1  ∀ msg ∈ critical_topics  (MQTT at-least-once)',
        iot_reliability: 'heartbeat ≤ T_WDT/3  ∧  offline_duration ≤ T_autonomous',
        materials_science: 'σ = E·ε  ∧  Tg_service ≤ Tg − ΔT_margin  ∧  Vf ∈ [Vf_nom ± 0.02]',
        structural_mechanics: 'P_ult ≥ 1.5 × P_limit  ∧  P_residual ≥ P_limit after BVID',
        aero_mfg: 'θ_ply ∈ [θ_nom ± 2°]  ∧  V_void ≤ 0.02  ∧  MRL ≥ 4',
        ndt_inspection: 'POD(a₉₀/₉₅) ≤ a_critical/SF  ∧  coverage = 100%  ∧  GR&R ≤ 30%',
        airworthiness: 'DOA ∈ approved_orgs  ∧  DAL(SW) ≥ required  ∧  AS9100D certified',
        healthcare: 'A(p) ∈ [A_{min}, A_{max}] ∧ Risk(p) ≤ R_{critical}'
    };

    /* ── Tokenizer ──────────────────────────────────────────────────────── */
    function tokenize(text) {
        const lower = (text || '').toLowerCase();
        const raw = lower.split(/[^a-z0-9\-\.]+/);
        const freq = {};
        raw.forEach(w => { if (w.length > 1) freq[w] = (freq[w] || 0) + 1; });
        return { freq, total: Math.max(raw.length, 1), text: lower };
    }

    /* ── Compute normalized domain coverage vector ──────────────────────── */
    function computeDomainVector(tokens) {
        const vec = {};
        for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS)) {
            const hits = signals.filter(s => tokens.text.includes(s.toLowerCase())).length;
            vec[domain] = hits / Math.max(signals.length, 1);
        }
        const total = Object.values(vec).reduce((s, v) => s + v, 0);
        if (total > 0) {
            for (const d of Object.keys(vec)) vec[d] /= total;
        }
        return vec;
    }

    /* ── Certainty gap: max − 2nd_max of domain vector ─────────────────── */
    function certaintygap(domainVec) {
        const vals = Object.values(domainVec).sort((a, b) => b - a);
        return vals.length >= 2 ? vals[0] - vals[1] : (vals[0] || 0);
    }

    /* ── Contradiction guard ────────────────────────────────────────────── */
    function isContradicted(axiom, textLower) {
        return (axiom.contradiction_signals || []).some(s => textLower.includes(s.toLowerCase()));
    }

    /* ── Score single axiom (keyword TF-IDF + domain boost + severity) ─── */
    function scoreAxiom(axiom, tokens, detectedDomains) {
        let raw = 0;
        const matchedKw = [];
        (axiom.keywords || []).forEach(kw => {
            const kwl = kw.toLowerCase();
            if (tokens.text.includes(kwl)) {
                const freq = tokens.freq[kwl] || 1;
                const spec = Math.min(3, kw.split(/\s+/).length); // multi-word bonus
                raw += (freq / tokens.total) * spec * 100;
                matchedKw.push(kw);
            }
        });
        const domainBoost = (axiom.domain || []).some(d => detectedDomains.includes(d)) ? 2.5 : 1.0;
        const severityBoost = axiom.severity === 'CRITICAL' ? 1.15
            : axiom.severity === 'HIGH' ? 1.05 : 1.0;
        return { score: Math.min(1.0, raw * domainBoost * severityBoost), matchedKw };
    }

    /* ── Resolve formula: per-axiom _formula > category fallback ───────── */
    function resolveFormula(axiom) {
        if (axiom._formula) return axiom._formula;
        const catKey = (axiom.category || 'causality').toLowerCase().replace(/[^a-z_]/g, '_');
        return CAT_FORMULA[catKey] || 'f(x) ∈ Ω_valid';
    }

    /* ── PASS-1: Deterministic hierarchy (clear-winner domain) ─────────── */
    function electByHierarchy(tokens, detectedDomains, domainVec, primaryDomain, fileExt) {
        const isRTL = fileExt && RTL_EXTENSIONS.has(fileExt);
        const db = window.SOVEREIGN_AXIOM_DB || [];
        return db.map(ax => {
            if (isContradicted(ax, tokens.text)) {
                return { ...ax, score: 0, _matchedKw: [], _formula: resolveFormula(ax), _contradicted: true };
            }
            let { score, matchedKw } = scoreAxiom(ax, tokens, detectedDomains);
            // Primary domain hard boost
            const isPrimary = (ax.domain || []).some(d => d.toUpperCase() === primaryDomain);
            if (isPrimary) score = Math.min(1.0, score * 2.8);
            // RTL file extension boost
            if (isRTL && (ax.category === 'rtl' || ax.category === 'electronics')) {
                score = Math.min(1.0, score * 2.0 + 0.20);
            }
            return { ...ax, score, _matchedKw: matchedKw, _formula: resolveFormula(ax) };
        }).sort((a, b) => b.score - a.score);
    }

    /* ── PASS-2: Multi-dimensional topology (cross-domain signal) ───────── */
    function electByTopology(tokens, detectedDomains, domainVec, fileExt) {
        const isRTL = fileExt && RTL_EXTENSIONS.has(fileExt);
        const db = window.SOVEREIGN_AXIOM_DB || [];
        return db.map(ax => {
            if (isContradicted(ax, tokens.text)) {
                return { ...ax, score: 0, _matchedKw: [], _formula: resolveFormula(ax), _contradicted: true };
            }
            const { score: kwScore, matchedKw } = scoreAxiom(ax, tokens, detectedDomains);
            // Domain alignment: weighted cosine-like dot product
            const axiomDoms = (ax.domain || []).map(d => d.toUpperCase());
            const domainAlignment = axiomDoms.reduce((sum, d) => sum + (domainVec[d] || 0), 0)
                / Math.max(axiomDoms.length, 1);
            const severityWeight = ax.severity === 'CRITICAL' ? 1.15
                : ax.severity === 'HIGH' ? 1.05 : 1.0;
            // Topology similarity: 60% keyword evidence + 40% domain alignment
            const topoSim = Math.min(1.0, (kwScore * 0.60 + domainAlignment * 0.40) * severityWeight);
            if (isRTL && (ax.category === 'rtl' || ax.category === 'electronics')) {
                return { ...ax, score: Math.min(1.0, topoSim * 2.0 + 0.10), _matchedKw: matchedKw, _formula: resolveFormula(ax) };
            }
            return { ...ax, score: topoSim, _matchedKw: matchedKw, _formula: resolveFormula(ax) };
        }).sort((a, b) => b.score - a.score);
    }

    /* ── G3FP Semantic Boost (ECP-G3FP-02) ─────────────────────────────────
     * Reads sovereign_g3fp_context from sessionStorage and applies a 1.6×
     * multiplicative boost to any axiom whose ID appears in G3FP's elected
     * list. Also pins primaryDomain to the authoritative G3FP domain when
     * present. This is a post-election re-ranker — TF-IDF scores are enriched,
     * not replaced, ensuring the engine degrades gracefully when G3FP context
     * is absent (private browsing, G3FP timeout, etc.).
     *
     * Contract:
     *   Input : tiered result object from electByHierarchy / electByTopology
     *   Output: mutated-in-place tiered object (scored axioms re-sorted)
     * ─────────────────────────────────────────────────────────────────────── */
    function applyG3fpBoost(tiered, detectedDomains, domainVec) {
        let ctx = null;
        try {
            const raw = sessionStorage.getItem('sovereign_g3fp_context');
            if (raw) ctx = JSON.parse(raw);
        } catch (_) { /* sessionStorage unavailable — degrade silently */ }

        if (!ctx) return tiered;  // No G3FP context → unmodified result

        /* Build a lookup set of G3FP-elected axiom IDs (support both key names) */
        const g3fpElected = new Set(
            (ctx.g3fp_elected_axioms || ctx.elected_axioms || []).map(a =>
                typeof a === 'string' ? a : (a.axiom_id || a.id || '')
            ).filter(Boolean)
        );

        /* Pin primaryDomain to G3FP authoritative domain when detected */
        const g3fpDomain = (ctx.domain || ctx.detected_domain || '').toUpperCase();
        if (g3fpDomain && g3fpDomain !== 'GENERAL') {
            tiered.primaryDomain = g3fpDomain;
            /* Reinforce domain vector so downstream consumers see the same signal */
            domainVec[g3fpDomain] = Math.max(domainVec[g3fpDomain] || 0, 0.75);
            if (!detectedDomains.includes(g3fpDomain)) detectedDomains.unshift(g3fpDomain);
        }

        if (g3fpElected.size === 0) {
            console.log('[G3FP-BOOST] No elected axioms in context — boost skipped.');
            return tiered;
        }

        /* Apply 1.6× boost and re-sort all tier arrays */
        const G3FP_BOOST = 1.6;
        function boostList(list) {
            return list
                .map(ax => {
                    if (g3fpElected.has(ax.id || ax.axiom_id)) {
                        const boosted = Math.min(1.0, (ax.score || 0) * G3FP_BOOST);
                        console.log(`[G3FP-BOOST] ${ax.id} ${((ax.score||0)*100).toFixed(0)}% → ${(boosted*100).toFixed(0)}% (×1.6)`);
                        return { ...ax, score: boosted, _g3fpBoosted: true };
                    }
                    return ax;
                })
                .sort((a, b) => b.score - a.score);
        }

        tiered.selected  = boostList(tiered.selected  || []);
        tiered.candidate = boostList(tiered.candidate || []);
        tiered.standby   = boostList(tiered.standby   || []);

        /* Re-tier: boosted axioms may now cross the T_ELECTED threshold */
        const promoted  = tiered.candidate.filter(a => a._g3fpBoosted && a.score >= T_ELECTED);
        const demoted   = tiered.selected.filter(a => !a._g3fpBoosted && a.score < T_ELECTED && tiered.selected.length > 3);
        if (promoted.length) {
            tiered.selected  = tiered.selected.concat(promoted).sort((a, b) => b.score - a.score);
            tiered.candidate = tiered.candidate.filter(a => !promoted.includes(a));
            console.log(`[G3FP-BOOST] ${promoted.length} axiom(s) promoted from CANDIDATE → ELECTED`);
        }

        tiered._g3fpBoostApplied = true;
        tiered._g3fpDomain = g3fpDomain || null;
        tiered._g3fpElectedCount = g3fpElected.size;
        return tiered;
    }

    /* ── Main election engine ───────────────────────────────────────────── */
    function tierAxioms(text, fileExt) {
        const tokens = tokenize(text);
        const domainVec = computeDomainVector(tokens);
        const gap = certaintygap(domainVec);

        // Force RTL domain signals for RTL file extensions
        if (fileExt && RTL_EXTENSIONS.has(fileExt)) {
            domainVec['RTL'] = Math.max(domainVec['RTL'] || 0, 0.50);
            domainVec['ELECTRONICS'] = Math.max(domainVec['ELECTRONICS'] || 0, 0.30);
        }

        // Detected domains sorted by weight (> 3% threshold — lowered to catch sparse HC/niche signals)
        const detectedDomains = Object.entries(domainVec)
            .filter(([, v]) => v > 0.03)
            .sort((a, b) => b[1] - a[1])
            .map(([d]) => d);

        const primaryDomain = detectedDomains[0] || '';
        let electionMode, scored;

        if (gap >= T_CERTAINTY) {
            electionMode = 'HIERARCHY';
            scored = electByHierarchy(tokens, detectedDomains, domainVec, primaryDomain, fileExt);
        } else {
            electionMode = 'TOPOLOGY';
            scored = electByTopology(tokens, detectedDomains, domainVec, fileExt);
        }

        const telemetryMapping = {
            ALLOW: scored.filter(a => a.score >= T_ELECTED && !a._contradicted),
            REFUSE: scored.filter(a => a.score >= T_CANDIDATE && a.score < T_ELECTED && !a._contradicted),
            BLOCK: scored.filter(a => a.score < T_CANDIDATE || !!a._contradicted)
        };

        const tiered = {
            detectedDomains,
            domainVector: domainVec,
            electionMode,
            certaintygap: gap,
            primaryDomain,
            selected: telemetryMapping.ALLOW,
            candidate: telemetryMapping.REFUSE,
            standby: telemetryMapping.BLOCK,
            // Proxy Normalization Bounds mapping
            spacetimeTopology: {
                ALLOW: telemetryMapping.ALLOW,
                REFUSE: telemetryMapping.REFUSE,
                BLOCK: telemetryMapping.BLOCK
            }
        };

        /* ── G3FP semantic boost: re-rank using authoritative document evidence ── */
        return applyG3fpBoost(tiered, detectedDomains, domainVec);
    }

    /* ── Read text from file (backend PDF.js → client-side fallback) ─────── */
    function readFileText(file, cb) {
        const name = file.name.toLowerCase();
        const ext = name.split('.').pop();
        const nameSignal = name.replace(/[._-]/g, ' ');
        const isRTL = RTL_EXTENSIONS.has(ext);
        const isPDF = ext === 'pdf';
        const isText = ['txt', 'md', 'log', 'v', 'sv', 'svh', 'vhd', 'vhdl', 'py', 'js', 'json', 'ts',
            'c', 'cpp', 'h', 'html', 'htm', 'xml', 'csv', 'rtf', 'yaml', 'yml']
            .some(e => name.endsWith('.' + e));
        const readLen = isRTL ? 32768 : 8192;

        if (isPDF) {
            async function extractPDFClientSide(arrayBuf) {
                const bytes = new Uint8Array(arrayBuf);
                const raw = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 200000)));
                const parts = [];
                const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
                let m;
                while ((m = streamRe.exec(raw)) !== null) {
                    const pre = raw.slice(Math.max(0, m.index - 300), m.index);
                    if (!pre.includes('FlateDecode') && !pre.includes('/Fl ')) continue;
                    const startIdx = m.index + m[0].indexOf('\n') + 1;
                    const endTag = 'endstream';
                    const streamBytes = bytes.slice(
                        m.index + m[0].search(/\n/) + 1,
                        m.index + m[0].length - endTag.length - 1
                    );
                    try {
                        const ds = new DecompressionStream('deflate-raw');
                        const writer = ds.writable.getWriter();
                        writer.write(streamBytes); writer.close();
                        const decompressed = await new Response(ds.readable).arrayBuffer();
                        const text = new TextDecoder('latin-1').decode(decompressed);
                        const btEtRe = /BT\s([\s\S]*?)\sET/g;
                        let bm;
                        while ((bm = btEtRe.exec(text)) !== null) {
                            const block = bm[1];
                            const tjRe = /\(([^)]*)\)\s*Tj/g; let tm;
                            while ((tm = tjRe.exec(block)) !== null) {
                                const t = tm[1].replace(/\\r|\\n/g, ' ').trim();
                                if (t) parts.push(t);
                            }
                            const tjArrRe = /\(([^)]{1,200})\)/g; let ta;
                            while ((ta = tjArrRe.exec(block)) !== null) {
                                const t = ta[1].trim(); if (t) parts.push(t);
                            }
                        }
                    } catch (_) { }
                }
                return parts.join(' ');
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const buf = e.target.result;
                // Try backend first
                try {
                    const fd = new FormData(); fd.append('file', file);
                    const resp = await fetch('/api/extract-text', {
                        method: 'POST', body: fd,
                        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
                    });
                    if (resp.ok) {
                        const res = await resp.json();
                        if (res.ok && res.text && res.text.length > 10) {
                            console.log(`[OCM] Backend RAG: ${res.chars} chars, ${res.pages} pages`);
                            cb(nameSignal + ' ' + res.text, ext); return;
                        }
                    }
                } catch (backendErr) {
                    console.warn('[OCM] Backend unavailable, using client-side:', backendErr.message);
                }
                // Client-side fallback
                try {
                    const text = await extractPDFClientSide(buf);
                    console.log(`[OCM] Client-side PDF: ${text.length} chars`);
                    cb(nameSignal + (text ? ' ' + text : ''), ext);
                } catch (err) {
                    console.error('[OCM] PDF extraction error:', err);
                    cb(nameSignal, ext);
                }
            };
            reader.onerror = () => cb(nameSignal, ext);
            reader.readAsArrayBuffer(file);

        } else if (isText) {
            const r = new FileReader();
            r.onload = e => {
                try {
                    const text = nameSignal + ' ' + e.target.result.slice(0, readLen);
                    console.log(`[OCM] FileReader: ${file.name} | ${text.length} chars`);
                    cb(text, ext);
                } catch (err) { console.error('[OCM] FileReader error:', err); cb(nameSignal, ext); }
            };
            r.onerror = () => cb(nameSignal, ext);
            r.readAsText(file);
        } else {
            console.log('[OCM] Non-text file, using filename signal:', nameSignal);
            cb(nameSignal, ext);
        }
    }

    /* ── Render telemetry panel ─────────────────────────────────────────── */
    function renderTelemetry(panelId, tiered, animate) {
        const panel = document.getElementById(panelId);
        if (!panel) return;

        /* i18n helper — uses SovereignI18n when loaded, else English fallback */
        const _t = (k, fb) => (window.SovereignI18n ? window.SovereignI18n.t(k) : (fb || k));

        const ordered = [
            ...tiered.selected.map(a => ({ ...a, _tier: 'ELECTED' })),
            ...(tiered.candidate || []).map(a => ({ ...a, _tier: 'CANDIDATE' })),
            ...tiered.standby.map(a => ({ ...a, _tier: 'STANDBY' }))
        ];

        const cats = {};
        ordered.forEach(ax => {
            const cat = (ax.category || 'unknown').toUpperCase().replace(/_/g, ' ');
            if (!cats[cat]) cats[cat] = [];
            cats[cat].push(ax);
        });

        const selCount = tiered.selected.length;
        const canCount = (tiered.candidate || []).length;
        const sbyCount = tiered.standby.length;
        const mode = tiered.electionMode || 'HIERARCHY';
        const gap = tiered.certaintygap != null ? tiered.certaintygap.toFixed(2) : '—';
        const bannerCol = selCount > 0 ? '#00C853' : canCount > 0 ? '#D4AF37' : '#555';
        const modeCol = mode === 'HIERARCHY' ? '#00C853' : '#D4AF37';
        const modeIcon = mode === 'HIERARCHY' ? '✓' : '⊕';

        /* Translated status string */
        const electedLbl = _t('tier.elected', 'ELECTED');
        const candidateLbl = _t('tier.candidate', 'CANDIDATE');
        const standbyLbl = _t('tier.standby', 'STANDBY');
        const statusTxt = selCount > 0
            ? `${selCount} ${electedLbl} · ${canCount} ${candidateLbl} · ${sbyCount} ${standbyLbl}`
            : canCount > 0
                ? `0 ${electedLbl} · ${canCount} ${candidateLbl} · ${sbyCount} ${standbyLbl}`
                : _t('tele.no_axioms', 'NO AXIOMS ELECTED — upload a richer document');

        const ocmElectionLbl = _t('tele.ocm_election', '⚡ OCM ELECTION:');
        const sectionPrefix = _t('tele.section_prefix', '>> ');

        let html = `
        <div style="font-family: Calibri, 微軟正黑體, sans-serif;font-size: 12px;color:${bannerCol};padding:5px 8px 4px;border-bottom:1px solid #222;letter-spacing:.5px">
            ${ocmElectionLbl} ${statusTxt} <span class="axiom-count-display" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none">${selCount}</span></div>
        <div style="font-family: Calibri, 微軟正黑體, sans-serif;font-size: 12px;padding:3px 8px 4px;border-bottom:1px solid #1a1a1a;display:flex;gap:12px">
            <span style="color:${modeCol}">${modeIcon} ${mode}</span>
            <span style="color:#444">gap=${gap}</span>
            ${tiered.primaryDomain ? `<span style="color:#555">primary: ${tiered.primaryDomain}</span>` : ''}
        </div>`;

        if (tiered.detectedDomains && tiered.detectedDomains.length) {
            html += `<div class="am-domain-badge">❖ ${_t('tele.domains', 'Detected Domains')}: ${tiered.detectedDomains.join(' · ')}</div>`;
        }

        let globalIdx = 0;
        for (const [cat, axioms] of Object.entries(cats)) {
            /* Translate category key: CAT.cat_lower → i18n lookup */
            const catKey = 'cat.' + cat.toLowerCase().replace(/ /g, '_');
            const catLabel = _t(catKey, cat);
            html += `<div class="am-section">${sectionPrefix}${catLabel}</div><ul class="am-list">`;
            axioms.forEach(ax => {
                const delay = animate ? `animation-delay:${globalIdx++ * 25}ms` : '';
                const animCls = (animate && ax._tier !== 'STANDBY') ? ' am-slide' : '';
                /* STYLING FIX: Remove verbose type tags [INVARIANT]/[CAUSAL]/[STOCHASTIC].
                 * Tier is communicated purely by colour and symbol — no text label spam. */
                let tagColor, tagSymbol, rowSize, rowWeight;
                if (ax._tier === 'ELECTED') {
                    tagColor  = '#00C853'; tagSymbol = '●';
                    rowSize   = '11px';    rowWeight  = '700';
                } else if (ax._tier === 'CANDIDATE') {
                    tagColor  = '#D4AF37'; tagSymbol = `${Math.round(ax.score * 100)}%`;
                    rowSize   = '10px';    rowWeight  = '600';
                } else if (ax._contradicted) {
                    tagColor  = '#553333'; tagSymbol = '✕';
                    rowSize   = '10px';    rowWeight  = '400';
                } else {
                    /* STANDBY — show a muted bullet, no type label */
                    tagColor  = '#555';    tagSymbol = '·';
                    rowSize   = '10px';    rowWeight  = '400';
                }
                const nameColor = ax._tier === 'ELECTED' ? '#00C853' : ax._tier === 'CANDIDATE' ? '#D4AF37' : ax._contradicted ? '#664444' : '#666';
                const badge = ax._tier === 'ELECTED'
                    ? ` <span style="color:#00C853;font-size:10px;letter-spacing:.3px">${_t('tele.badge_active', '▶ ACTIVE')}</span>`
                    : '';
                html += `<li class="am-ax am-item${animCls}" data-ax-id="${ax.id}" style="font-size:${rowSize};font-weight:${rowWeight};${delay}" title="${(ax.statement || '').replace(/"/g, "'")}">` ;
                html += `<span style="color:${tagColor};font-weight:700;min-width:18px;display:inline-block;text-align:center">${tagSymbol}</span> `;
                html += `<span style="color:${nameColor};font-weight:${rowWeight}">${ax.id}:</span> <span style="color:${nameColor}">${ax.name}</span>${badge}`;
                html += '</li>';
            });
            html += '</ul>';
        }

        panel.innerHTML = html;

        /* ── i18n: invalidate DeepScan cache so new text nodes are translated ── */
        if (window.SovereignI18n && typeof window.SovereignI18n.refresh === 'function') {
            setTimeout(() => window.SovereignI18n.refresh(), 0);
        }
        /* ── Bug Fix: Wire 500ms hover on telemetry rows → axiom reference card ── */
        let _rowTmr = null;
        panel.addEventListener('mouseover', function (e) {
            const row = e.target.closest('[data-ax-id]');
            if (!row) return;
            clearTimeout(_rowTmr);
            _rowTmr = setTimeout(function () {
                const id = row.getAttribute('data-ax-id');
                const ax = (window.SOVEREIGN_AXIOM_DB || []).find(a => a.id === id);
                if (ax && typeof window._sovereignShowAxiomCard === 'function') {
                    window._sovereignShowAxiomCard(ax);
                }
            }, 500);
        });
        panel.addEventListener('mouseleave', function () { clearTimeout(_rowTmr); });
    }

    /* ── Reset → all STANDBY ────────────────────────────────────────────── */
    function resetTelemetry(panelId) {
        const db = window.SOVEREIGN_AXIOM_DB || [];
        renderTelemetry(panelId, {
            detectedDomains: [], electionMode: null, certaintygap: null,
            selected: [], candidate: [], standby: db.map(a => ({ ...a, score: 0 }))
        }, false);
    }

    /* ── CSS injection ───────────────────────────────────────────────────── */
    (function injectCSS() {
        if (document.getElementById('am-css')) return;
        const s = document.createElement('style'); s.id = 'am-css';
        s.textContent = `
        @keyframes am-slide-up {
            from { transform:translateY(12px); opacity:0; }
            to   { transform:translateY(0);    opacity:1; }
        }
        @keyframes sovBreatheSel {
            0%,100% { background:rgba(0,200,83,.08); box-shadow:0 0 4px #00C85355; }
            50%     { background:rgba(0,200,83,.22); box-shadow:0 0 12px #00C853aa; }
        }
        @keyframes sovBreatheCan {
            0%,100% { background:rgba(212,175,55,.08); box-shadow:0 0 4px #D4AF3755; }
            50%     { background:rgba(212,175,55,.20); box-shadow:0 0 10px #D4AF37aa; }
        }
        .am-slide { animation: am-slide-up 0.30s cubic-bezier(.22,.68,0,1.2) both; }
        .sov-elected  { animation:sovBreatheSel 2s ease-in-out infinite; border-left:3px solid #00C853!important; color:#00C853!important; }
        .sov-candidate{ animation:sovBreatheCan 2.6s ease-in-out infinite; border-left:3px solid #D4AF37!important; color:#D4AF37!important; }
        .am-domain-badge {
            font-family: 'JetBrains Mono', 'Calibri', 微軟正黑體, sans-serif; font-size: 10px; font-weight:700;
            color:#00C853; padding:4px 8px 6px; border-bottom:1px solid #2a2a2a; margin-bottom:4px;
            letter-spacing: 0.5px;
        }
        .am-section {
            font-family: 'JetBrains Mono', 'Calibri', 微軟正黑體, sans-serif; font-size: 10px; font-weight:700;
            color:#D4AF37; padding:4px 6px 1px; letter-spacing:0.6px; text-transform:uppercase;
        }
        .am-list { list-style:none; font-family: 'Calibri', 微軟正黑體, sans-serif; font-size: 10px; line-height:1.65; padding:0 4px 0 8px; margin:0 0 2px 0; }
        .am-item { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:default; padding:1px 2px; }
        .am-item:hover { background:rgba(255,255,255,0.04); border-radius:2px; }
        `;
        document.head.appendChild(s);
    })();

    /* ── Public API ─────────────────────────────────────────────────────── */
    global.AxiomMatcher = {

        matchFromText(text, fileExt) { return tierAxioms(text, fileExt); },

        matchFromFile(file, cb) {
            readFileText(file, (text, ext) => cb(tierAxioms(text, ext)));
        },

        renderTelemetry(panelId, tiered, animate = true) { renderTelemetry(panelId, tiered, animate); },

        resetTelemetry(panelId) { resetTelemetry(panelId); },

        async processFile(file, panelId, onDone) {
            const panel = document.getElementById(panelId);
            console.log(`[OCM] processFile | file: ${file && file.name} | panel: ${panelId}`, panel ? 'FOUND' : 'MISSING');
            if (panel) panel.innerHTML = '<div style="padding:10px;color:#D4AF37;font-family: Calibri, 微軟正黑體, sans-serif;font-size: 12px">⟳ OCM Instructing Gemini Core Logic...</div>';

            if (window.SovereignBUS) {
                window.SovereignBUS.emit('DATA_EXTRACTED', {
                    sender: 'axiom_matcher',
                    message_type: 'DATA_EXTRACTED',
                    payload: { fileName: file && file.name, panelId }
                });
            }
            const _activeMode = (() => {
                try { return (sessionStorage.getItem('sovereign_mode') || 'induction').toUpperCase(); }
                catch (_) { return 'INDUCTION'; }
            })();
            /* ── ECP-SINGLE-CALL: Wait for ingest/fast result ───────────────────────
             * /api/upload makes a second concurrent L0Adapter→Gemini call that races
             * with the blocking ingest/fast call in handleFile(), causing 429 errors
             * and >20s latency. Instead, poll sessionStorage for the G3FP result that
             * ingest/fast already writes, converting 2 concurrent calls into 1.
             * ─────────────────────────────────────────────────────────────────────── */
            let data = null;
            try {
                data = await new Promise((resolve, reject) => {
                    const MAX_WAIT_MS = 25000;
                    const POLL_MS = 10;
                    const start = Date.now();

                    function _readCtx() {
                        try {
                            const raw = sessionStorage.getItem('sovereign_g3fp_context');
                            if (!raw) return null;
                            const ctx = JSON.parse(raw);
                            /* Accept context when domain is resolved (not bootstrap placeholder 'all') */
                            if (!ctx || !ctx.domain || ctx.domain === 'all') return null;
                            const hasAxioms   = (ctx.g3fp_elected_axioms || []).length > 0;
                            const hasMetrics  = (ctx.g3fp_metrics  || []).length > 0;
                            const hasEntities = (ctx.g3fp_entities || []).length > 0;
                            /* PARTIAL-CTX-FIX: Also accept when domain is resolved and non-GENERAL.
                             * JSON audit reports / compliance docs have domain signals but 0 biomarkers.
                             * Previously these timed out (25s) and resolved as {} → domain: GENERAL.
                             * Now: non-GENERAL domain alone is sufficient proof the server responded. */
                            const hasDomain = ctx.domain && ctx.domain.toUpperCase() !== 'GENERAL';
                            if (hasAxioms || hasMetrics || hasEntities || hasDomain) return ctx;
                            return null;
                        } catch (_) { return null; }
                    }

                    /* Check immediately — ingest/fast may have already resolved */
                    const _immediate = _readCtx();
                    if (_immediate) { resolve(_immediate); return; }

                    /* Subscribe to G3FP_CONTEXT_READY on SovereignBUS */
                    let _unsubscribed = false;
                    if (window.SovereignBUS) {
                        window.SovereignBUS.on('G3FP_CONTEXT_READY', function _onCtxReady(ev) {
                            if (_unsubscribed) return;
                            const ctx = (ev && ev.payload) ? ev.payload : _readCtx();
                            if (ctx) {
                                _unsubscribed = true;
                                resolve(ctx);
                            }
                        });
                    }

                    /* Polling fallback */
                    const iv = setInterval(function () {
                        if (_unsubscribed) { clearInterval(iv); return; }
                        const ctx = _readCtx();
                        if (ctx) {
                            _unsubscribed = true;
                            clearInterval(iv);
                            resolve(ctx);
                            return;
                        }
                        if (Date.now() - start > MAX_WAIT_MS) {
                            _unsubscribed = true;
                            clearInterval(iv);
                            /* Timeout: use whatever partial context exists */
                            try {
                                const raw = sessionStorage.getItem('sovereign_g3fp_context');
                                resolve(raw ? JSON.parse(raw) : {});
                            } catch (_) { resolve({}); }
                        }
                    }, POLL_MS);
                });
            } catch (pollErr) {
                console.warn('[OCM] processFile: G3FP context poll failed —', pollErr);
                data = {};
            }

            /* Normalize ingest/fast context → /api/upload-compatible shape */
            const _elected = data.g3fp_elected_axioms || data.elected_axioms || [];
            const _mappedAxioms = _elected.map(id => ({
                axiom_id: typeof id === 'string' ? id : (id.axiom_id || id.id || 'UNKNOWN'),
                name: typeof id === 'string' ? id : (id.name || id.axiom_id || id.id || 'Axiom'),
                confidence: typeof id === 'object' ? (id.confidence || 0.9) : 0.9,
                expression_latex: typeof id === 'object' ? (id.expression_latex || '') : '',
                domain: data.domain || 'GENERAL',
                status: 'ELECTED',
                source: 'g3fp_ingest',
            }));
            /* Fallback: if elected is empty but g3fp_metrics exist, surface them */
            const _fallbackAxioms = _mappedAxioms.length === 0
                ? (data.g3fp_metrics || []).slice(0, 20).map(m => ({
                    axiom_id: `L0_MET_${(m.name || 'MET').toUpperCase().replace(/\s/g,'_')}`,
                    name: m.name || 'metric',
                    confidence: 0.8,
                    expression_latex: String(m.value || ''),
                    domain: data.domain || 'GENERAL',
                    status: 'HYPOTHESIZED',
                    source: 'g3fp_metric',
                }))
                : _mappedAxioms;
            data = {
                success: true,
                axioms: _fallbackAxioms,
                axiom_count: _fallbackAxioms.length,
                domain: data.domain || 'GENERAL',
                engine: _activeMode,
                run_id: data.trace_id || data.run_id || '',
                diagnostic_summary: data.g3fp_doc_summary || 'G3FP extraction complete.',
                g3fp_entities: data.g3fp_entities || [],
                g3fp_metrics: data.g3fp_metrics || [],
                g3fp_biomarkers: data.g3fp_biomarkers || [],
                g3fp_compliance_areas: data.g3fp_compliance_areas || [],
                g3fp_patient_profile: data.g3fp_patient_profile || {},
                g3fp_clinical_narrative: data.g3fp_clinical_narrative || {},
                g3fp_axiom_evidence: data.g3fp_axiom_evidence || [],
                g3fp_elected_axioms: _elected,
                saa_threshold_results: data.saa_threshold_results || [],
                g3fp_derived_indices: data.g3fp_derived_indices || [],
                g3fp_doc_summary: data.g3fp_doc_summary || '',
            };

            try {
                if (data.success && data.axioms) {
                    let tiered;
                    if (data.saa_threshold_results && data.saa_threshold_results.length > 0) {
                        const selected = [];
                        const candidate = [];
                        const standby = [];
                        const db = window.SOVEREIGN_AXIOM_DB || [];
                        const evaluatedIds = new Set();

                        data.saa_threshold_results.forEach(res => {
                            const staticAxiom = db.find(a => a.id === res.axiom_id) || {};
                            const mapped = {
                                ...staticAxiom,
                                id: res.axiom_id,
                                name: staticAxiom.name || res.axiom_id,
                                score: res.status === 'ELECTED' ? 1.0 : res.status === 'COMPLIANT' ? 0.85 : 0.0,
                                confidence: res.status === 'ELECTED' ? 1.0 : res.status === 'COMPLIANT' ? 0.85 : 0.0,
                                expression_latex: staticAxiom.expression_latex || '',
                                statement: res.reason || staticAxiom.description || '',
                                breach_value: res.breach_value,
                                threshold: res.threshold,
                                status: res.status,
                                _tier: res.status === 'ELECTED' ? 'ELECTED' : res.status === 'COMPLIANT' ? 'CANDIDATE' : 'STANDBY'
                            };
                            evaluatedIds.add(res.axiom_id);

                            if (res.status === 'ELECTED') {
                                selected.push(mapped);
                            } else if (res.status === 'COMPLIANT') {
                                candidate.push(mapped);
                            } else {
                                standby.push(mapped);
                            }
                        });

                        db.forEach(a => {
                            if (!evaluatedIds.has(a.id)) {
                                standby.push({
                                    ...a,
                                    score: 0.0,
                                    confidence: 0.0,
                                    expression_latex: a.expression_latex || '',
                                    statement: a.description || '',
                                    status: 'STANDBY',
                                    _tier: 'STANDBY'
                                });
                            }
                        });

                        selected.sort((a, b) => b.score - a.score);
                        candidate.sort((a, b) => b.score - a.score);
                        standby.sort((a, b) => b.score - a.score);

                        tiered = {
                            electionMode: data.engine || _activeMode || 'INDUCTION',
                            primaryDomain: data.domain || 'GENERAL',
                            selected: selected,
                            elected: selected,
                            candidate: candidate,
                            standby: standby,
                            diagnostic_summary: data.diagnostic_summary || 'Diagnostic details not provided by extractor.'
                        };
                    } else {
                        const mappedAxioms = data.axioms.map(a => ({
                            id: a.axiom_id || 'UNKNOWN',
                            name: a.name || 'Extracted Axiom',
                            score: a.confidence || 0.9,
                            confidence: a.confidence || 0.9,
                            expression_latex: a.expression_latex || ''
                        }));

                        tiered = {
                            electionMode: data.engine || _activeMode || 'INDUCTION',
                            primaryDomain: data.domain || 'GENERAL',
                            selected: mappedAxioms,
                            elected: mappedAxioms, /* E2E and bridge compatibility */
                            candidate: [],
                            standby: [],
                            diagnostic_summary: data.diagnostic_summary || 'Diagnostic details not provided by extractor.'
                        };
                    }

                    console.log(`[OCM] Gemini extraction done | domain: ${tiered.primaryDomain} | selected: ${tiered.selected.length}`);

                    if (window.SovereignBUS) {
                        window.SovereignBUS.emit('ONTOLOGY_CLASSIFIED', {
                            sender: 'axiom_matcher',
                            message_type: 'ONTOLOGY_CLASSIFIED',
                            payload: {
                                fileName: file && file.name,
                                panelId,
                                electionMode: tiered.electionMode,
                                primaryDomain: tiered.primaryDomain,
                                selected: tiered.selected,
                                candidate: tiered.candidate,
                                standby: tiered.standby
                            }
                        });
                    }

                    try {
                        const _tieredJSON = JSON.stringify(tiered);
                        /* Bug-1 Fix: axiom_matcher writes ONLY to sovereign_tiered_results.
                         * sovereign_tiered is the EXCLUSIVE property of OP-01 (authoritative
                         * controller). Writing here caused OP-01's carefully constructed
                         * ID-only payload (with causalTopology) to be silently overwritten,
                         * producing the OP-01/OP-02 parity gap the user observed.         */
                        sessionStorage.setItem('sovereign_tiered_results', _tieredJSON);
                        sessionStorage.setItem('sovereign_pipeline_ran', 'true');

                        /* ── G3FP Full Semantic Context ────────────────────────────────────
                         * ECP-018 / Phase 2: Persist ALL G3FP rich metadata to a DEDICATED
                         * key so startOCMConversation() can ground OCM Beat 1–3 in the live
                         * extraction result without relying on sovereign_tiered_results which
                         * is overwritten by OP-01 on each election cycle.                  */
                        const g3fpCtx = {
                            // Document identity
                            filename: file && file.name,
                            run_id: data.run_id || '',
                            domain: data.domain || tiered.primaryDomain || 'GENERAL',
                            g3fp_doc_summary: data.g3fp_doc_summary || '',
                            extraction_time_ms: data.extraction_time_ms || 0,
                            // Semantic richness — full G3FP payload fields
                            g3fp_entities: data.g3fp_entities || [],
                            g3fp_metrics: data.g3fp_metrics || [],
                            g3fp_biomarkers: data.g3fp_biomarkers || [],
                            g3fp_compliance_areas: data.g3fp_compliance_areas || [],
                            g3fp_patient_profile: data.g3fp_patient_profile || {},
                            g3fp_clinical_narrative: data.g3fp_clinical_narrative || {},
                            g3fp_axiom_evidence: data.g3fp_axiom_evidence || [],
                            g3fp_elected_axioms: data.g3fp_elected_axioms || [],
                            saa_threshold_results: data.saa_threshold_results || [],
                            g3fp_derived_indices: data.g3fp_derived_indices || [],
                            // Axiom list (convenience copy for OCM)
                            axioms: tiered.selected,
                            diagnostic_summary: tiered.diagnostic_summary,
                            // Timestamp
                            cached_at: new Date().toISOString(),
                        };
                        /* ECP-G3FP-MERGE: Merge into existing context (set by _g3fpFirstIngest)
                         * instead of overwriting it. This preserves the early trace_id and any
                         * fields written by OP-01's non-blocking fast ingest, while enriching
                         * with the full processFile payload from /api/upload.             */
                        try {
                            const _existing = JSON.parse(sessionStorage.getItem('sovereign_g3fp_context') || '{}');
                            Object.assign(_existing, g3fpCtx);
                            sessionStorage.setItem('sovereign_g3fp_context', JSON.stringify(_existing));
                        } catch (_mergeErr) {
                            sessionStorage.setItem('sovereign_g3fp_context', JSON.stringify(g3fpCtx));
                        }
                        console.log(`[OCM] sovereign_g3fp_context MERGED | biomarkers:${g3fpCtx.g3fp_biomarkers.length} metrics:${g3fpCtx.g3fp_metrics.length} entities:${g3fpCtx.g3fp_entities.length}`);

                        /* ── Emit G3FP_CONTEXT_READY on SovereignBUS ──────────────────────
                         * hitl_modal.html and any other subscriber can react immediately
                         * without needing to poll sessionStorage.                          */
                        if (window.SovereignBUS) {
                            window.SovereignBUS.emit('G3FP_CONTEXT_READY', {
                                sender: 'axiom_matcher',
                                message_type: 'G3FP_CONTEXT_READY',
                                payload: g3fpCtx,
                                trace_id: data.run_id || '',
                            });
                        }

                        renderTelemetry(panelId, tiered, true);
                    } catch (e) { console.error('Render error:', e) }

                    if (onDone) onDone(tiered);

                } else {
                    console.error("[OCM] Backend extraction failed", data);
                    if (onDone) onDone({ selected: [], candidate: [] });
                }
            } catch (err) {
                console.error("[OCM] Network error during backend evaluation", err);
                if (onDone) onDone({ selected: [], candidate: [] });
            }
        },

        loadFromSession(panelId) {
            try {
                /* Priority order:
                 * 1. sovereign_tiered       — written by OP-01 (authoritative controller).
                 *    May be ID-only format {selectedIds, candidateIds, ...} or full-object.
                 * 2. sovereign_tiered_results — written by axiom_matcher.processFile().
                 *    Always full-object {selected, candidate, standby, ...}.
                 * 3. sovereign_axiom_match  — legacy key, fallback only.
                 * Reading sovereign_tiered_results FIRST (old behaviour) caused OP-02 to
                 * display stale axioms from a previous processFile run instead of the
                 * fresh OP-01 election, producing the parity gap the user observed. */
                let raw = sessionStorage.getItem('sovereign_tiered');
                let fromIdFormat = false;
                if (!raw) raw = sessionStorage.getItem('sovereign_tiered_results');
                if (!raw) raw = sessionStorage.getItem('sovereign_axiom_match');
                if (!raw) { resetTelemetry(panelId); return; }

                const data = JSON.parse(raw);
                const db = window.SOVEREIGN_AXIOM_DB || [];

                let tiered;
                if (data.selected && Array.isArray(data.selected)) {
                    // Full-object format — ensure standby is fully populated from DB
                    const selectedIds = (data.selected || []).map(a => a.id || a.axiom_id).filter(Boolean);
                    const candidateIds = (data.candidate || []).map(a => a.id || a.axiom_id).filter(Boolean);
                    const allIds = new Set([...selectedIds, ...candidateIds]);
                    tiered = {
                        ...data,
                        selected: (data.selected || []).map(a => ({ ...a, _tier: 'ELECTED' })),
                        candidate: (data.candidate || []).map(a => ({ ...a, _tier: 'CANDIDATE' })),
                        standby: db.filter(a => !allIds.has(a.id)).map(a => ({ ...a, score: 0, _tier: 'STANDBY' }))
                    };
                } else if (data.selectedIds) {
                    // ID-only format (OP-01 sovereign_tiered) — resolve to full objects
                    const { selectedIds, candidateIds, standbyIds, detectedDomains, electionMode, certaintygap, primaryDomain, causalTopology } = data;
                    const allIds = new Set([...(selectedIds || []), ...(candidateIds || [])]);
                    tiered = {
                        detectedDomains: detectedDomains || [],
                        electionMode: electionMode || 'HIERARCHY',
                        certaintygap: certaintygap != null ? certaintygap : null,
                        primaryDomain: primaryDomain || '',
                        causalTopology: causalTopology || [],
                        selected: db.filter(a => (selectedIds || []).includes(a.id)).map(a => ({ ...a, score: 0.90, _tier: 'ELECTED' })),
                        candidate: db.filter(a => (candidateIds || []).includes(a.id)).map(a => ({ ...a, score: 0.30, _tier: 'CANDIDATE' })),
                        standby: db.filter(a => !allIds.has(a.id)).map(a => ({ ...a, score: 0, _tier: 'STANDBY' }))
                    };
                    console.log(`[OCM] loadFromSession: resolved from ID format — elected:${tiered.selected.length} candidate:${tiered.candidate.length} standby:${tiered.standby.length}`);
                } else {
                    // Legacy format fallback
                    const { selectedIds, candidateIds, detectedDomains, electionMode, certaintygap, primaryDomain } = data;
                    tiered = {
                        detectedDomains: detectedDomains || [], electionMode, certaintygap, primaryDomain,
                        selected: db.filter(a => (selectedIds || []).includes(a.id)).map(a => ({ ...a, score: 0.90 })),
                        candidate: db.filter(a => (candidateIds || []).includes(a.id)).map(a => ({ ...a, score: 0.30 })),
                        standby: db.filter(a => !(selectedIds || []).includes(a.id) && !(candidateIds || []).includes(a.id)).map(a => ({ ...a, score: 0 }))
                    };
                }

                renderTelemetry(panelId, tiered, false);
                /* Rule 03: re-emit ONTOLOGY_CLASSIFIED so OP-02 visualizations can subscribe */
                if (window.SovereignBUS) {
                    window.SovereignBUS.emit('ONTOLOGY_CLASSIFIED', {
                        sender: 'axiom_matcher',
                        message_type: 'ONTOLOGY_CLASSIFIED',
                        payload: { ...tiered, panelId, fromSession: true }
                    });
                }
            } catch (e) {
                /* E003: Rule 04 — never silently swallow exceptions */
                console.error('E003: [OCM] loadFromSession failed:', e);
                resetTelemetry(panelId);
            }
        }
    };

    /* ── Bug-4 Fix: Clear axiom session on any page reload ────────────────
     * Ctrl+R / Ctrl+Shift+R sets navigation.type = 'reload'.
     * We must clear stored axiom state so the user always starts fresh.
     * Only fires on RELOAD — back/forward navigation preserves session.      */
    (function _clearOnReload() {
        try {
            const navEntry = performance.getEntriesByType('navigation')[0];
            if (navEntry && navEntry.type === 'reload') {
                sessionStorage.removeItem('sovereign_axiom_match');
                sessionStorage.removeItem('sovereign_hitl_context');
                sessionStorage.removeItem('sovereign_tiered_results');
                sessionStorage.removeItem('sovereign_tiered');
                sessionStorage.removeItem('sovereign_g3fp_context');  // ECP-018: wipe on reload
                console.log('[OCM] Page reload detected — axiom session cleared.');
            }
        } catch (e) {
            console.warn('E003: [OCM] _clearOnReload error:', e);
        }
    })();

    /* ── LANG_CHANGED → re-render telemetry in new language ───────────────
     * When the user switches language via the i18n pill, setLanguage() emits
     * LANG_CHANGED on SovereignBUS.  axiom_matcher must re-invoke renderTelemetry
     * with the cached tiered object so all dynamically-built HTML (OCM ELECTION
     * banner, section headers, ACTIVE / GUARD badges) updates immediately.
     * Without this hook, the panel stays locked in the original language until
     * the next processFile / loadFromSession call.                            */
    (function _subscribeLangChange() {
        function _rerenderAll() {
            try {
                /* Resolve fresh tiered from session (priority: sovereign_tiered first) */
                let raw = sessionStorage.getItem('sovereign_tiered')
                    || sessionStorage.getItem('sovereign_tiered_results')
                    || sessionStorage.getItem('sovereign_axiom_match');
                if (!raw) return;  // nothing to re-render (no file processed yet)
                const data = JSON.parse(raw);
                const db = window.SOVEREIGN_AXIOM_DB || [];
                let tiered;
                if (data.selected && Array.isArray(data.selected)) {
                    tiered = data;
                } else if (data.selectedIds) {
                    const { selectedIds, candidateIds, detectedDomains, electionMode, certaintygap, primaryDomain, causalTopology } = data;
                    const allIds = new Set([...(selectedIds || []), ...(candidateIds || [])]);
                    tiered = {
                        detectedDomains: detectedDomains || [], electionMode: electionMode || 'HIERARCHY',
                        certaintygap, primaryDomain: primaryDomain || '', causalTopology: causalTopology || [],
                        selected: db.filter(a => (selectedIds || []).includes(a.id)).map(a => ({ ...a, score: 0.90, _tier: 'ELECTED' })),
                        candidate: db.filter(a => (candidateIds || []).includes(a.id)).map(a => ({ ...a, score: 0.30, _tier: 'CANDIDATE' })),
                        standby: db.filter(a => !allIds.has(a.id)).map(a => ({ ...a, score: 0, _tier: 'STANDBY' }))
                    };
                } else {
                    return;
                }
                /* Re-render every telemetry panel found on the current page */
                document.querySelectorAll('[id^="tele-body"]').forEach(el => {
                    renderTelemetry(el.id, tiered, false);
                });
                /* Also try known static IDs used by OP-01, OP-02, OP-03 */
                ['tele-body-op01', 'tele-body-op02', 'tele-body-op03', 'am-panel'].forEach(id => {
                    if (document.getElementById(id)) renderTelemetry(id, tiered, false);
                });
            } catch (e) {
                console.warn('E003: [OCM] LANG_CHANGED re-render error:', e);
            }
        }

        /* Subscribe via BUS (preferred) */
        function _attach() {
            if (window.SovereignBUS && typeof window.SovereignBUS.on === 'function') {
                window.SovereignBUS.on('LANG_CHANGED', _rerenderAll);
                console.log('[OCM] LANG_CHANGED subscription active — telemetry will re-render on language switch.');
            } else {
                /* BUS not yet initialised — retry once after DOM is ready */
                document.addEventListener('DOMContentLoaded', function _retry() {
                    document.removeEventListener('DOMContentLoaded', _retry);
                    if (window.SovereignBUS && typeof window.SovereignBUS.on === 'function') {
                        window.SovereignBUS.on('LANG_CHANGED', _rerenderAll);
                    }
                }, { once: true });
            }
        }
        _attach();
        /* Fallback: also listen to the native CustomEvent in case BUS is bypassed */
        window.addEventListener('SOVEREIGN_LANG_CHANGED', _rerenderAll);
    })();

})(window);
