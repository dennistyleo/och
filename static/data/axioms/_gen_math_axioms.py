"""Generates math_foundation_genomics.json with SAA/G3FP hooks."""
import json

CTX = "https://sovereign-matrix.org/axiom-repo/v4.1"

def ax(id_, name, desc, subdomain, mode, paradigm, lat, sympy, vars_, thresh, g3fp, xai, cascade=None, opt=None, req=None):
    return {
        "@context": CTX, "@type": "SovereignAxiom",
        "axiom_id": id_, "version": "1.0.0",
        "mode": mode, "paradigm": paradigm,
        "domain": "MATH_FOUNDATION", "subdomain": subdomain,
        "name": name, "description": desc,
        "status": "CANONICAL", "confidence_floor": 0.95,
        "hallucination_lock": True, "spatial_tension": "HIGH",
        "semantic_fingerprint": xai,
        "entity_keywords": name.lower().split() + subdomain.split("_"),
        "required_fields": req or [],
        "optional_fields": opt or [],
        "expression_latex": lat,
        "saa_hook": {
            "enabled": True, "solver_direction": "FORWARD",
            "sympy_expr": sympy, "variables": vars_,
            "verdict_threshold": thresh
        },
        "derivation_formula": {
            "name": id_ + "_FORMULA", "sympy_expr": sympy,
            "variables": vars_, "verdict_threshold": thresh
        },
        "g3fp_intent_map": g3fp,
        "xai_narrator_hint": xai,
        "contradiction_axioms": [],
        "cascade_to": cascade or []
    }

ALLOW_GTE = lambda v: {"ALLOW":{"operator":">=","value":v},"REFUSE":{"operator":"<","value":v},"UNDERDETERMINED":{"condition":"variable is null"}}
ALLOW_LTE = lambda v: {"ALLOW":{"operator":"<=","value":v},"REFUSE":{"operator":">","value":v},"UNDERDETERMINED":{"condition":"variable is null"}}
ALLOW_RANGE = lambda lo,hi: {"ALLOW":{"operator":"between","low":lo,"high":hi},"REFUSE":{"operator":"outside","low":lo,"high":hi},"UNDERDETERMINED":{"condition":"variable is null"}}

axioms = [
    ax(
        "MATH_GEN_001",
        "Hardy-Weinberg Equilibrium (HWE) Deviation Gate",
        "Tests whether observed genotype frequencies deviate from HWE expectations using chi-square. p<0.05 flags population stratification, selection, or genotyping error — mandatory QC before GWAS.",
        "population_genetics",
        "deduction", "deduction",
        "p^2 + 2pq + q^2 = 1;\\quad \\chi^2 = \\sum\\frac{(O-E)^2}{E}",
        "hwe_chi2 - 3.841",  # chi2 critical at df=1, p=0.05
        {"hwe_chi2":{"maps_to_field":"hwe_chi2_stat","unit":"chi2","bounds":[0,1000]}},
        ALLOW_LTE(3.841),
        {"DEDUCTION":"hwe_compliance_gate","ABD_RCA":"population_stratification_rca","ABD_QA":"gwas_qc_hypothesis","INDUCTION":"allele_frequency_pattern"},
        "HWE chi2>3.841 (p<0.05) signals genotype frequency deviation — check for population stratification, inbreeding, or batch effects before GWAS.",
        ["MATH_GEN_002"],
        req=[{"field":"hwe_chi2_stat","unit":"chi2","bounds":[0,1000],"alert_max":3.841}]
    ),
    ax(
        "MATH_GEN_002",
        "Shannon Genetic Diversity Index (H')",
        "Shannon entropy H' = -Σ(p_i * ln(p_i)) quantifies allelic diversity at a locus. H'<0.5 indicates low diversity (bottleneck risk); H'>2.0 indicates high polymorphism.",
        "information_theory",
        "deduction", "deduction",
        "H' = -\\sum_{i} p_i \\ln p_i",
        "shannon_h - 0.5",
        {"shannon_h":{"maps_to_field":"shannon_diversity_index","unit":"bits","bounds":[0,10]}},
        ALLOW_GTE(0.5),
        {"DEDUCTION":"genetic_diversity_gate","ABD_RCA":"bottleneck_diversity_loss_rca","INDUCTION":"diversity_population_pattern","ABD_QA":"allelic_richness_hypothesis"},
        "Shannon H'<0.5 flags low genetic diversity — assess founder effect, genetic drift, or selective sweep in study population.",
        req=[{"field":"shannon_diversity_index","unit":"bits","bounds":[0,10],"alert_min":0.5}]
    ),
    ax(
        "MATH_GEN_003",
        "Gibbs Free Energy — DNA/RNA Folding Stability (ΔG)",
        "ΔG = ΔH - T·ΔS determines thermodynamic stability of nucleic acid secondary structures. ΔG < -30 kcal/mol indicates strong stable hairpin/stem-loop; critical for siRNA and CRISPR guide design.",
        "thermodynamics",
        "deduction", "deduction",
        "\\Delta G = \\Delta H - T \\cdot \\Delta S",
        "delta_G - (-30)",  # pass if ΔG <= -30 (very stable)
        {"delta_G":{"maps_to_field":"dna_folding_dG_kcal_mol","unit":"kcal/mol","bounds":[-200,50]}},
        ALLOW_LTE(-1.0),
        {"DEDUCTION":"nucleic_acid_stability_gate","ABD_QA":"crispr_guide_stability_hypothesis","ABD_RCA":"misfolding_rca","INDUCTION":"secondary_structure_pattern"},
        "ΔG>-1 kcal/mol suggests thermodynamically unstable guide/siRNA — redesign sequence or adjust salt/temperature conditions.",
        req=[{"field":"dna_folding_dG_kcal_mol","unit":"kcal/mol","bounds":[-200,50],"alert_max":-1.0}]
    ),
    ax(
        "MATH_GEN_004",
        "Michaelis-Menten Enzyme Kinetics (DNA Polymerase Efficiency)",
        "v = Vmax * [S] / (Km + [S]). Catalytic efficiency kcat/Km ≥ 10⁵ M⁻¹s⁻¹ is the standard threshold for biologically competent DNA polymerases and restriction enzymes.",
        "enzyme_kinetics",
        "deduction", "deduction",
        "v = \\frac{V_{max} \\cdot [S]}{K_m + [S]};\\quad \\eta = k_{cat}/K_m",
        "kcat_over_Km - 1e5",
        {"kcat_over_Km":{"maps_to_field":"enzyme_catalytic_efficiency","unit":"M-1s-1","bounds":[0,1e12]}},
        ALLOW_GTE(1e5),
        {"DEDUCTION":"enzyme_efficiency_gate","ABD_RCA":"polymerase_fidelity_rca","ABD_QA":"pcr_efficiency_hypothesis","INDUCTION":"kinetics_optimisation_pattern"},
        "kcat/Km <1e5 M⁻¹s⁻¹ indicates suboptimal enzyme — verify dNTP concentration, pH, Mg²⁺ and reaction temperature.",
        req=[{"field":"enzyme_catalytic_efficiency","unit":"M-1s-1","bounds":[0,1e12],"alert_min":1e5}]
    ),
    ax(
        "MATH_GEN_005",
        "Gompertz Tumour Growth Model (Doubling Time Gate)",
        "N(t) = N0 * exp(a/b * (1 - exp(-b*t))). Tumour doubling time Td = ln(2)/b. Td < 30 days (b > 0.023/day) classifies rapid-growth tumour requiring immediate intervention.",
        "tumour_dynamics",
        "deduction", "deduction",
        "N_t = N0 * exp((a/b) * (1 - exp(-b * t)))",
        "tumour_doubling_time_days - 30",
        {"tumour_doubling_time_days":{"maps_to_field":"tumour_doubling_time_days","unit":"days","bounds":[1,3650]}},
        ALLOW_GTE(30),
        {"DEDUCTION":"tumour_growth_rate_gate","ABD_RCA":"rapid_growth_rca","ABD_QA":"treatment_urgency_hypothesis","INDUCTION":"growth_kinetics_pattern"},
        "Tumour Td<30 days indicates aggressive growth — escalate treatment; validate with serial imaging using RECIST 1.1.",
        req=[{"field":"tumour_doubling_time_days","unit":"days","bounds":[1,3650],"alert_min":30}]
    ),
    ax(
        "MATH_GEN_006",
        "Boltzmann Population Distribution — Mutation Energy Landscape",
        "P(state_i) = exp(-E_i/kT) / Z quantifies the probability of a genomic state under thermal fluctuation. Used in protein folding and mutation fitness landscape modelling.",
        "statistical_mechanics",
        "abduction", "ABD_QA",
        "P_i = \\frac{e^{-E_i/k_BT}}{Z};\\quad Z = \\sum_j e^{-E_j/k_BT}",
        "boltzmann_fitness_score - 0.5",
        {"boltzmann_fitness_score":{"maps_to_field":"mutation_fitness_probability","unit":"probability","bounds":[0,1]}},
        ALLOW_GTE(0.5),
        {"ABD_QA":"mutation_fitness_landscape_hypothesis","DEDUCTION":"thermodynamic_mutation_gate","ABD_RCA":"deleterious_mutation_rca","INDUCTION":"energy_landscape_pattern"},
        "Boltzmann fitness P<0.5 suggests energetically unfavourable mutation state — correlate with ΔΔG protein stability predictions and population frequency.",
        req=[{"field":"mutation_fitness_probability","unit":"probability","bounds":[0,1],"alert_min":0.5}]
    ),
    ax(
        "MATH_GEN_007",
        "Wright-Fisher Genetic Drift Index (Effective Population Size Ne)",
        "Var(Δp) = p(1-p)/(2Ne). Ne < 50 triggers critical drift risk with allele fixation probability > 50% per generation — extinction/bottleneck threshold.",
        "population_genetics",
        "deduction", "deduction",
        "\\text{Var}(\\Delta p) = \\frac{p(1-p)}{2N_e}",
        "effective_population_size - 50",
        {"effective_population_size":{"maps_to_field":"Ne","unit":"individuals","bounds":[1,1e9]}},
        ALLOW_GTE(50),
        {"DEDUCTION":"genetic_drift_gate","ABD_RCA":"population_bottleneck_rca","INDUCTION":"drift_fixation_pattern","ABD_QA":"conservation_genetics_hypothesis"},
        "Ne<50 triggers critical drift threshold — allele fixation/loss highly probable; flag for evolutionary rescue or diversity supplementation.",
        req=[{"field":"Ne","unit":"individuals","bounds":[1,1e9],"alert_min":50}]
    ),
    ax(
        "MATH_GEN_008",
        "Log-Rank Survival Difference (Kaplan-Meier Hazard Ratio Gate)",
        "HR = λ_treatment / λ_control from Cox proportional hazards. HR < 0.7 with 95% CI upper bound < 1.0 defines statistically significant survival benefit for immunotherapy/gene therapy endpoints.",
        "survival_analysis",
        "deduction", "deduction",
        "\\text{HR} = \\frac{\\lambda_{trt}}{\\lambda_{ctrl}} < 0.7",
        "1.0 - hazard_ratio",
        {"hazard_ratio":{"maps_to_field":"cox_hr","unit":"ratio","bounds":[0,10]}},
        ALLOW_LTE(0.7),
        {"DEDUCTION":"survival_benefit_gate","ABD_RCA":"treatment_failure_survival_rca","ABD_QA":"os_pfs_hypothesis","INDUCTION":"survival_curve_pattern"},
        "HR<0.7 with CI upper<1.0 confirms significant survival benefit — validate with KM curves, log-rank p<0.05, and median OS/PFS.",
        req=[{"field":"cox_hr","unit":"ratio","bounds":[0,10],"alert_max":0.7},
             {"field":"hr_ci_upper","unit":"ratio","bounds":[0,10],"alert_max":1.0}]
    ),
    ax(
        "MATH_GEN_009",
        "Hill Equation — Receptor-Drug Binding Cooperativity (EC50 Gate)",
        "E = Emax * C^n / (EC50^n + C^n). Hill coefficient n>1 = positive cooperativity; EC50 is the half-maximal effective concentration. Used for CAR-T antigen density and checkpoint inhibitor binding.",
        "pharmacodynamics",
        "deduction", "deduction",
        "E = \\frac{E_{max} \\cdot C^n}{EC_{50}^n + C^n}",
        "drug_concentration_nM - ec50_nM",
        {"drug_concentration_nM":{"maps_to_field":"drug_conc_nM","unit":"nM","bounds":[0,1e6]},"ec50_nM":{"maps_to_field":"ec50_nM","unit":"nM","bounds":[0,1e6]}},
        {"ALLOW":{"operator":">=","value":0},"REFUSE":{"operator":"<","value":0},"UNDERDETERMINED":{"condition":"any variable is null"}},
        {"DEDUCTION":"drug_binding_efficacy_gate","ABD_QA":"pd_response_hypothesis","ABD_RCA":"resistance_rca","INDUCTION":"dose_response_pattern"},
        "Drug C/EC50 ratio <1 means sub-therapeutic — increase dose or investigate receptor downregulation/resistance; Hill n<0.5 suggests negative cooperativity.",
        req=[{"field":"drug_conc_nM","unit":"nM"},{"field":"ec50_nM","unit":"nM"},{"field":"hill_n","unit":"dimensionless","bounds":[0.1,5]}]
    ),
    ax(
        "MATH_GEN_010",
        "CRISPR On-Target Efficiency Score (Doench Rule Gate)",
        "On-target score S ≥ 0.6 (Doench 2016 Rule Set 2) and off-target specificity ratio ≥ 10:1 are mandatory before clinical CRISPR gene editing. Below threshold requires redesign.",
        "genomic_editing",
        "deduction", "deduction",
        "S_{on} \\geq 0.6;\\quad \\frac{S_{on}}{S_{off}} \\geq 10",
        "crispr_on_target_score - 0.6",
        {"crispr_on_target_score":{"maps_to_field":"crispr_doench_score","unit":"score","bounds":[0,1]}},
        ALLOW_GTE(0.6),
        {"DEDUCTION":"crispr_guide_qc_gate","ABD_RCA":"off_target_editing_rca","ABD_QA":"guide_design_hypothesis","INDUCTION":"guide_efficiency_pattern"},
        "Doench score<0.6 or specificity<10:1 mandates guide RNA redesign — use Cas-OFFinder to enumerate off-target sites before IND filing.",
        req=[{"field":"crispr_doench_score","unit":"score","bounds":[0,1],"alert_min":0.6},
             {"field":"crispr_off_target_ratio","unit":"ratio","bounds":[0,1000],"alert_min":10}]
    ),
]

out = "static/data/axioms/math_foundation_genomics.json"
with open(out,"w") as f:
    json.dump(axioms, f, indent=2, ensure_ascii=False)
print(f"Written {len(axioms)} axioms to {out}")
