/**
 * Module: aerospace_axioms.js
 * Version: 1.0.0
 * Description: Sovereign Axiom Agent (SAA) dataset for Aerospace & Composite domain (OP-04).
 * Axiom IDs: COMP_ILSS_001, SCM_LEAD_001, STRUCT_STRESS_001, THERM_CURE_001
 */

const AEROSPACE_AXIOM_DB = [
    {
        id: "COMP_ILSS_001",
        type: "INVARIANT",
        layer: "L2 · Engineering",
        saa: "Composite Integrity SAA",
        title: "Griffith Fracture Criterion",
        formula: "Gc = (2γs·E)/(1−ν²)",
        desc: "Critical energy release rate for delamination onset. LLM extracts E, γs, ν from UIF. SAA computes Gc threshold.",
        params: ["E: Young's Modulus", "γs: Surface Energy", "ν: Poisson's Ratio"],
        verdict: "PASS",
        threshold: "Gc ≥ 350 J/m²"
    },
    {
        id: "SCM_LEAD_001",
        type: "STOCHASTIC",
        layer: "L1 · Scout",
        saa: "SCM Efficiency SAA",
        title: "Supply Chain Lead Time",
        formula: "Lead_Time < Threshold_days",
        desc: "Flags PASS for project lead-time reduction from faster curing prepreg. Conflicts with STRUCT_STRESS_001 when resin chemistry is non-validated.",
        params: ["Lead_Time: Days from PO to delivery", "Threshold_days: 28 days std"],
        verdict: "REFUSE",
        threshold: "Lead_Time < 28 days"
    },
    {
        id: "STRUCT_STRESS_001",
        type: "INVARIANT",
        layer: "L2 · Engineering",
        saa: "Structural Mechanics SAA",
        title: "Axial Stress Interaction",
        formula: "σ = E · ε  →  Interaction: E·ε across Z-axis",
        desc: "Detects FAIL when faster cure cycle causes entropy elevation and micro-cracking. Triggers negotiate_contradiction in OCG Gateway.",
        params: ["E: Modulus field (asymmetric)", "ε: Strain tensor (AFP log)", "Z-axis: Compliance depth"],
        verdict: "WARNING",
        threshold: "σ_asymmetric < 0.05 σ_nominal"
    },
    {
        id: "THERM_CURE_001",
        type: "CAUSAL",
        layer: "L3 · Entropy",
        saa: "Cure Cycle SAA",
        title: "Thermal Entropy Evaluation",
        formula: "ΔS = ΔP / T  ·  Δt_cure",
        desc: "Evaluates curing cycle entropy from AFP production log. Ambient humidity (confounder X) modulates ILSS (outcome Y) through viscosity drift.",
        params: ["ΔP: Pressure deviation", "T: Curing temperature", "Δt_cure: Duration offset", "μ: Resin Viscosity"],
        verdict: "PASS",
        threshold: "ΔS < 0.12 kJ/mol"
    }
];

// Expose for OP-04
if (typeof module !== 'undefined') module.exports = { AEROSPACE_AXIOM_DB };
