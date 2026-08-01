"""
Module: surgical_audit
Version: 1.1.0
Description: Pre-Surgery Audit Intelligence for OCM v4.4.
             Evaluates whether a hospital's surgical proposal is evidence-based
             (ontology-grounded via ACC/AHA clinical axioms) or probabilistic.
             Now includes Surgical Motivation Classification (SMC) — 4 flags
             detecting non-therapeutic motivations (case study, RCA, trial&error,
             political) and a Patient Rights panel for pre-consent family use.

             Outputs:
               - surgery_domain:        detected surgical category
               - evidence_verdict:      EVIDENCE-GROUNDED / PARTIALLY / INSUFFICIENT / INCOMPLETE
               - aha_class:             Class I / IIa / IIb / III + Level A/B/C
               - asa_status:            ASA I–V with rationale
               - criteria_ledger:       axiom-by-axiom MET / UNMET / MISSING breakdown
               - alternatives:          non-surgical Class I treatments not yet exhausted
               - surgeon_questions:     5 targeted questions for the surgical team
               - family_summary:        one-paragraph plain-language verdict
               - disclaimer:            standard medical disclaimer
"""

import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    from modules.surgical_intent import classify_surgical_intent
    _HAS_INTENT = True
except ImportError:
    _HAS_INTENT = False
    logger.warning("[SURG_AUDIT] surgical_intent not available — SMC flags disabled")

# ── ACC/AHA Class of Recommendation definitions ────────────────────────────────
COR = {
    "I":    {"label": "Class I",    "color": "green",  "meaning": "STRONGLY RECOMMENDED — Benefit far outweighs risk. Surgery is indicated.",       "icon": "✅"},
    "IIa":  {"label": "Class IIa",  "color": "blue",   "meaning": "REASONABLE — Benefit outweighs risk. Surgery is a valid option.",                 "icon": "🔵"},
    "IIb":  {"label": "Class IIb",  "color": "yellow", "meaning": "MAY BE CONSIDERED — Benefit ≥ risk, but alternative approaches exist.",          "icon": "🟡"},
    "III":  {"label": "Class III",  "color": "orange", "meaning": "NOT INDICATED — No benefit from surgery based on current data.",                   "icon": "⚠️"},
    "HARM": {"label": "Class III (Harm)", "color": "red", "meaning": "POTENTIALLY HARMFUL — Surgery should not be performed without stronger evidence.", "icon": "🔴"},
}
LOE = {
    "A":    "Level A — Multiple high-quality RCTs support this recommendation",
    "B-R":  "Level B-R — At least one moderate-quality RCT supports this",
    "B-NR": "Level B-NR — Observational studies and registries support this",
    "C-LD": "Level C-LD — Limited data; mechanistic studies only",
    "C-EO": "Level C-EO — Expert opinion only (no controlled trials)",
}

# ── Surgery Domain Detection Rules ────────────────────────────────────────────
# Each domain defines: trigger_biomarkers (must be present in field_values),
# thresholds (which values make surgery *potentially* indicated), and metadata.

SURGERY_DOMAINS = {
    "CARDIOVASCULAR": {
        "name":         "Cardiovascular Surgery (CABG / PCI / Valve)",
        "trigger_keys": ["LDL", "HDL", "TG", "BP_SYS", "BP_DIA", "CRP"],
        "min_triggers": 2,
        "criteria": [
            {"key": "LDL",    "op": "gt", "threshold": 130,  "label": "LDL Cholesterol > 130 mg/dL",      "aha_ref": "ACC/AHA 2019 §7.3",  "met_weight": 2},
            {"key": "LDL",    "op": "gt", "threshold": 190,  "label": "LDL > 190 mg/dL (severe hypercholesterolaemia)", "aha_ref": "ACC/AHA 2019 §7.1", "met_weight": 3},
            {"key": "HDL",    "op": "lt", "threshold": 40,   "label": "HDL < 40 mg/dL (low protective cholesterol)",    "aha_ref": "ACC/AHA 2019 §7.4",  "met_weight": 1},
            {"key": "BP_SYS", "op": "gt", "threshold": 140,  "label": "Systolic BP > 140 mmHg (Stage 2 Hypertension)",  "aha_ref": "ACC/AHA 2017 §7",    "met_weight": 2},
            {"key": "BP_SYS", "op": "gt", "threshold": 160,  "label": "Systolic BP > 160 mmHg (Severe Hypertension)",   "aha_ref": "ACC/AHA 2017 §7",    "met_weight": 3},
            {"key": "TG",     "op": "gt", "threshold": 200,  "label": "Triglycerides > 200 mg/dL (High)",               "aha_ref": "ACC/AHA 2019 §7.5",  "met_weight": 1},
            {"key": "CRP",    "op": "gt", "threshold": 3.0,  "label": "CRP > 3.0 mg/L (High cardiovascular inflammation)", "aha_ref": "ACC/AHA 2019 §4",  "met_weight": 2},
        ],
        "class_thresholds": {"I": 7, "IIa": 4, "IIb": 2},   # total met_weight required
        "loe":              "B-NR",
        "alternatives": [
            {"treatment": "High-intensity statin therapy (Atorvastatin 40–80 mg/day)",   "evidence": "Class I, Level A", "expected": "~50% LDL reduction in 6–8 weeks", "guideline": "ACC/AHA 2019"},
            {"treatment": "ACE inhibitor (Ramipril 5–10 mg/day) or ARB for BP control",  "evidence": "Class I, Level A", "expected": "SBP reduction 15–20 mmHg in 4–6 weeks", "guideline": "ACC/AHA 2017"},
            {"treatment": "Supervised lifestyle modification (diet + exercise, ≥3 months)", "evidence": "Class I, Level B-NR", "expected": "LDL –10–20%, SBP –5–10 mmHg", "guideline": "ACC/AHA 2019"},
            {"treatment": "PCSK9 inhibitor (Evolocumab/Alirocumab) if statin-intolerant", "evidence": "Class I, Level A", "expected": "LDL reduction 50–60%", "guideline": "ACC/AHA 2022"},
        ],
        "surgeon_questions": [
            "What angiographic or imaging evidence (e.g. coronary angiogram, SYNTAX score) was used to recommend surgery rather than PCI or medical therapy?",
            "Has maximal medical therapy (high-intensity statin + ACE inhibitor + lifestyle) been trialled for at least 3 months before recommending surgery?",
            "What is the estimated surgical mortality risk (EuroSCORE II or STS score) for this patient?",
            "Is a less invasive alternative (e.g. PCI, TAVI, stenting) feasible and has it been ruled out?",
            "What is the expected improvement in quality of life or survival from surgery versus continued optimised medical therapy?",
        ],
    },
    "METABOLIC": {
        "name":         "Metabolic / Bariatric Surgery",
        "trigger_keys": ["HBA1C", "GLU", "TG"],
        "min_triggers": 2,
        "criteria": [
            {"key": "HBA1C", "op": "gt", "threshold": 8.0,  "label": "HbA1c > 8.0% (Poor glycaemic control)",         "aha_ref": "ADA 2024 §9",   "met_weight": 3},
            {"key": "HBA1C", "op": "gt", "threshold": 10.0, "label": "HbA1c > 10.0% (Severe uncontrolled diabetes)",  "aha_ref": "ADA 2024 §9",   "met_weight": 5},
            {"key": "GLU",   "op": "gt", "threshold": 250,  "label": "Fasting glucose > 250 mg/dL (Severe hyperglycaemia)", "aha_ref": "ADA 2024", "met_weight": 3},
            {"key": "TG",    "op": "gt", "threshold": 500,  "label": "Triglycerides > 500 mg/dL (Pancreatitis risk)", "aha_ref": "AHA 2021",      "met_weight": 5},
        ],
        "class_thresholds": {"I": 8, "IIa": 4, "IIb": 2},
        "loe":              "B-NR",
        "alternatives": [
            {"treatment": "GLP-1 receptor agonist (Semaglutide 2.4 mg/week)",     "evidence": "Class I, Level A",    "expected": "HbA1c –1.5–2.0%, weight –15% in 68 weeks", "guideline": "ADA 2024"},
            {"treatment": "Intensive insulin therapy for acute glycaemic control", "evidence": "Class I, Level B-R",  "expected": "Glucose < 180 mg/dL within 24–48h",         "guideline": "ADA 2024"},
            {"treatment": "Fibrate therapy (Fenofibrate) for severe hypertriglyceridaemia", "evidence": "Class IIa, Level B-NR", "expected": "TG reduction 30–50%",          "guideline": "AHA 2021"},
        ],
        "surgeon_questions": [
            "Has intensive medical management (GLP-1 agonist + insulin optimisation) been tried for ≥3–6 months?",
            "What specific surgical procedure is proposed and why is it preferred over medical management at this time?",
            "What is the patient's current BMI and does it meet clinical criteria for bariatric surgery?",
            "What is the perioperative glucose management plan given the severely uncontrolled diabetes?",
            "What are the expected long-term outcomes vs. continued medical therapy for this specific patient profile?",
        ],
    },
    "RENAL": {
        "name":         "Renal Surgery (Access / Transplant Preparation)",
        "trigger_keys": ["CREAT", "BUN"],
        "min_triggers": 1,
        "criteria": [
            {"key": "CREAT", "op": "gt", "threshold": 1.5,  "label": "Creatinine > 1.5 mg/dL (Reduced kidney function)", "aha_ref": "KDIGO 2022 §1", "met_weight": 2},
            {"key": "CREAT", "op": "gt", "threshold": 3.0,  "label": "Creatinine > 3.0 mg/dL (Severely reduced GFR)",   "aha_ref": "KDIGO 2022 §3", "met_weight": 4},
            {"key": "BUN",   "op": "gt", "threshold": 30,   "label": "BUN > 30 mg/dL (Uraemia risk)",                   "aha_ref": "KDIGO 2022 §2", "met_weight": 2},
            {"key": "BUN",   "op": "gt", "threshold": 60,   "label": "BUN > 60 mg/dL (Acute uraemic urgency)",          "aha_ref": "KDIGO 2022 §4", "met_weight": 4},
        ],
        "class_thresholds": {"I": 6, "IIa": 3, "IIb": 1},
        "loe":              "B-NR",
        "alternatives": [
            {"treatment": "ACE inhibitor/ARB for renoprotection",             "evidence": "Class I, Level A",    "expected": "Slows GFR decline 30–40%",         "guideline": "KDIGO 2022"},
            {"treatment": "Dietary protein restriction + phosphate binders",  "evidence": "Class IIa, Level B-NR", "expected": "Reduces uraemic symptom burden",  "guideline": "KDIGO 2022"},
            {"treatment": "Optimised blood pressure control (target <130/80)", "evidence": "Class I, Level A",   "expected": "Reduces progression to ESRD",      "guideline": "KDIGO 2022"},
        ],
        "surgeon_questions": [
            "What is the current eGFR and CKD stage, and does it meet the KDIGO threshold for intervention?",
            "Has the patient been referred to nephrology for optimised medical management before surgery?",
            "What type of surgical procedure is proposed (fistula, transplant prep, other) and what is the urgency?",
            "What is the current trajectory — stable, slowly declining, or acutely worsening renal function?",
            "Has dialysis been considered as a bridge or alternative to surgery at this stage?",
        ],
    },
}

# ── ASA Physical Status Calculator ────────────────────────────────────────────

def _calculate_asa(field_values: Dict[str, float], is_emergency: bool = False) -> Dict[str, Any]:
    """
    Estimate ASA Physical Status (I–V) from biomarker values.
    Returns: asa_class, rationale, periop_risk, modifier.
    """
    score   = 0
    reasons = []
    fv      = {k.upper(): float(v) for k, v in field_values.items() if isinstance(v, (int, float))}

    # BP
    bp_sys = fv.get("BP_SYS", 0)
    if bp_sys >= 180:
        score = max(score, 3); reasons.append(f"Severe uncontrolled hypertension (SBP {bp_sys:.0f} mmHg)")
    elif bp_sys >= 140:
        score = max(score, 2); reasons.append(f"Stage 2 hypertension (SBP {bp_sys:.0f} mmHg)")
    elif bp_sys >= 130:
        score = max(score, 1); reasons.append(f"Elevated blood pressure (SBP {bp_sys:.0f} mmHg)")

    # LDL
    ldl = fv.get("LDL", 0)
    if ldl >= 190:
        score = max(score, 3); reasons.append(f"Severely elevated LDL ({ldl:.0f} mg/dL — familial hypercholesterolaemia range)")
    elif ldl >= 130:
        score = max(score, 2); reasons.append(f"High LDL ({ldl:.0f} mg/dL — uncontrolled hypercholesterolaemia)")

    # HbA1c
    hba1c = fv.get("HBA1C", 0)
    if hba1c >= 10.0:
        score = max(score, 3); reasons.append(f"Severely uncontrolled diabetes (HbA1c {hba1c:.1f}%)")
    elif hba1c >= 8.0:
        score = max(score, 2); reasons.append(f"Poorly controlled diabetes (HbA1c {hba1c:.1f}%)")
    elif hba1c >= 6.5:
        score = max(score, 1); reasons.append(f"Diabetes mellitus (HbA1c {hba1c:.1f}%)")

    # TG
    tg = fv.get("TG", 0)
    if tg >= 500:
        score = max(score, 3); reasons.append(f"Severe hypertriglyceridaemia ({tg:.0f} mg/dL — acute pancreatitis risk)")
    elif tg >= 200:
        score = max(score, 2); reasons.append(f"High triglycerides ({tg:.0f} mg/dL)")

    # Creatinine
    creat = fv.get("CREAT", 0)
    if creat >= 3.0:
        score = max(score, 3); reasons.append(f"Severely reduced kidney function (Creatinine {creat:.1f} mg/dL)")
    elif creat >= 1.5:
        score = max(score, 2); reasons.append(f"Reduced kidney function (Creatinine {creat:.1f} mg/dL)")

    # CRP
    crp = fv.get("CRP", 0)
    if crp >= 10.0:
        score = max(score, 3); reasons.append(f"High systemic inflammation (CRP {crp:.1f} mg/L — possible acute event)")
    elif crp >= 3.0:
        score = max(score, 2); reasons.append(f"Elevated CRP {crp:.1f} mg/L — systemic inflammation")

    # ASA class map
    asa_map = {
        0: ("ASA I",   "Normal healthy patient",                          "Low (< 0.1% 30-day mortality)"),
        1: ("ASA II",  "Mild systemic disease",                           "Low (0.1–0.5% 30-day mortality)"),
        2: ("ASA III", "Severe systemic disease",                         "Moderate (1–5% 30-day mortality)"),
        3: ("ASA IV",  "Severe systemic disease — constant threat to life","High (> 5% 30-day mortality)"),
        4: ("ASA V",   "Moribund — not expected to survive without surgery","Very High (> 10% 30-day mortality)"),
    }
    capped       = min(score, 4)
    asa_class, definition, periop_risk = asa_map[capped]
    modifier     = "E (Emergency)" if is_emergency else ""

    return {
        "asa_class":    asa_class + (f" {modifier}" if modifier else ""),
        "asa_score":    capped + 1,
        "definition":   definition,
        "periop_risk":  periop_risk,
        "rationale":    reasons if reasons else ["All measured biomarkers within normal range"],
        "is_emergency": is_emergency,
    }


# ── Surgery Domain Detection ───────────────────────────────────────────────────

def _detect_domain(field_values: Dict[str, float]) -> Optional[str]:
    """Return the most likely surgical domain from submitted biomarker keys."""
    fv_keys = {k.upper() for k in field_values}
    best_domain, best_count = None, 0
    for domain_key, domain in SURGERY_DOMAINS.items():
        hits = sum(1 for k in domain["trigger_keys"] if k in fv_keys)
        if hits >= domain["min_triggers"] and hits > best_count:
            best_count  = hits
            best_domain = domain_key
    return best_domain


# ── Evidence Class Calculator ──────────────────────────────────────────────────

def _evaluate_criteria(
    domain: Dict[str, Any],
    field_values: Dict[str, float],
) -> Tuple[List[Dict], int]:
    """
    Evaluate each clinical criterion for the domain.
    Returns (criteria_ledger, total_weight).
    """
    fv      = {k.upper(): float(v) for k, v in field_values.items() if isinstance(v, (int, float))}
    ledger  = []
    total_w = 0

    for criterion in domain["criteria"]:
        key       = criterion["key"]
        threshold = criterion["threshold"]
        op        = criterion["op"]
        value     = fv.get(key)

        if value is None:
            ledger.append({**criterion, "status": "MISSING", "value": None,
                           "status_label": "⚫ Data not provided",
                           "status_color": "gray"})
            continue

        if op == "gt":
            met = value > threshold
        elif op == "lt":
            met = value < threshold
        elif op == "gte":
            met = value >= threshold
        else:
            met = False

        weight  = criterion["met_weight"] if met else 0
        total_w += weight

        ledger.append({
            **criterion,
            "status":       "MET" if met else "NOT_MET",
            "status_label": f"{'✅ MET' if met else '❌ NOT MET'} — {criterion['label']} (value: {value})",
            "status_color": "green" if met else "red",
            "value":        value,
            "weight_earned": weight,
        })

    return ledger, total_w


def _compute_aha_class(domain: Dict[str, Any], total_weight: int, missing_count: int, criteria_count: int) -> Dict[str, Any]:
    """Determine ACC/AHA Class of Recommendation from evidence weight."""
    thresholds = domain["class_thresholds"]
    loe_code   = domain.get("loe", "B-NR")
    missing_pct = (missing_count / max(criteria_count, 1)) * 100

    if missing_pct > 50:
        cor_key  = "III"
        verdict  = "INCOMPLETE"
        note     = "More than 50% of standard clinical criteria are absent from the uploaded report. The surgical decision cannot be fully audited."
    elif total_weight >= thresholds.get("I", 999):
        cor_key  = "I"
        verdict  = "EVIDENCE-GROUNDED"
        note     = "Lab data strongly meets clinical criteria for surgical consideration per ACC/AHA guidelines."
    elif total_weight >= thresholds.get("IIa", 999):
        cor_key  = "IIa"
        verdict  = "PARTIALLY-GROUNDED"
        note     = "Lab data partially meets criteria. Surgery is a reasonable option, but non-surgical alternatives should first be documented as exhausted."
    elif total_weight >= thresholds.get("IIb", 999):
        cor_key  = "IIb"
        verdict  = "WEAK-EVIDENCE"
        note     = "Lab data shows some risk factors, but does not strongly indicate surgery. Alternative treatments should be trialled first."
    else:
        cor_key  = "III"
        verdict  = "INSUFFICIENT"
        note     = "Based on the submitted lab values alone, clinical criteria for surgery are not met. A stronger evidence base is required."

    return {
        "cor_key":       cor_key,
        "cor":           COR[cor_key],
        "loe_code":      loe_code,
        "loe":           LOE.get(loe_code, ""),
        "verdict":       verdict,
        "verdict_note":  note,
        "total_weight":  total_weight,
        "missing_pct":   round(missing_pct, 1),
    }


# ── Family Summary Generator ───────────────────────────────────────────────────

def _build_family_summary(
    domain_name: str,
    aha_result: Dict[str, Any],
    asa: Dict[str, Any],
    alternatives: List[Dict],
    ledger: List[Dict],
) -> str:
    """Generate a plain-language paragraph for the family."""
    verdict   = aha_result["verdict"]
    cor       = aha_result["cor"]
    met_count = sum(1 for c in ledger if c.get("status") == "MET")
    fail_count= sum(1 for c in ledger if c.get("status") == "NOT_MET")
    miss_count= sum(1 for c in ledger if c.get("status") == "MISSING")

    if verdict == "EVIDENCE-GROUNDED":
        opening = (
            f"Based on the laboratory values in the uploaded report, the clinical data "
            f"meets established international criteria (ACC/AHA {cor['label']}) for considering "
            f"{domain_name}. This means the hospital's recommendation is supported by quantifiable, "
            f"guideline-based evidence — not a subjective judgment."
        )
    elif verdict in ("PARTIALLY-GROUNDED", "WEAK-EVIDENCE"):
        opening = (
            f"The laboratory values provide some support for considering {domain_name}, "
            f"but do not fully meet the strongest clinical criteria (ACC/AHA {cor['label']}). "
            f"This means the recommendation is partially evidence-based, but also relies on clinical "
            f"judgment that goes beyond what the lab data alone can confirm."
        )
    elif verdict == "INCOMPLETE":
        opening = (
            f"The uploaded report is missing more than half of the standard clinical markers "
            f"used to evaluate {domain_name}. OCM cannot fully verify the hospital's surgical "
            f"proposal with the available data. This does not mean the surgery is wrong — it means "
            f"additional diagnostic information (such as imaging or specialist assessments) was "
            f"likely used in making this decision."
        )
    else:
        opening = (
            f"Based on the laboratory values alone, the clinical data does not clearly meet "
            f"international guidelines for recommending {domain_name} at this stage (ACC/AHA {cor['label']}). "
            f"This raises an important question: has the surgical team documented why non-surgical "
            f"treatments were ruled out first?"
        )

    criteria_summary = (
        f"Of the {len(ledger)} standard clinical criteria evaluated: "
        f"{met_count} are met by the lab data, {fail_count} are not met, and {miss_count} were not included in the report."
    )

    anesthesia_note = (
        f"Based on the lab values, the estimated anaesthesia risk class is "
        f"{asa['asa_class']} — {asa['definition']} ({asa['periop_risk']})."
    )

    if alternatives:
        alt_names = "; ".join(a["treatment"].split("(")[0].strip() for a in alternatives[:2])
        alt_note  = (
            f"Internationally recognised non-surgical treatments for this condition include: "
            f"{alt_names}. If the hospital has not documented trialling these first, "
            f"this is an important question to ask."
        )
    else:
        alt_note = ""

    parts = [opening, criteria_summary, anesthesia_note]
    if alt_note:
        parts.append(alt_note)

    return " ".join(parts)


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

def run_surgical_audit(
    field_values:  Dict[str, float],
    is_emergency:  bool = False,
    surgery_type:  Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main entry point for the surgical audit engine.

    Args:
        field_values:  biomarker dict (same format as deduction engine field_values)
        is_emergency:  True if surgery is described as emergent (adds ASA 'E' modifier)
        surgery_type:  Optional override for surgery domain (CARDIOVASCULAR / METABOLIC / RENAL)

    Returns:
        Full surgical audit dict ready to attach to audit_packet.
    """
    logger.info("[SURG] Starting surgical audit for %d biomarkers (emergency=%s)", len(field_values), is_emergency)

    # 1. Detect domain
    domain_key  = surgery_type or _detect_domain(field_values)
    if not domain_key or domain_key not in SURGERY_DOMAINS:
        # No surgical domain detectable — return informative incomplete result
        return {
            "surgery_domain":    "UNKNOWN",
            "surgery_domain_name": "Undetected (insufficient biomarker overlap)",
            "evidence_verdict":  "INCOMPLETE",
            "aha_class":         COR["III"],
            "aha_loe":           LOE["C-EO"],
            "asa_status":        _calculate_asa(field_values, is_emergency),
            "criteria_ledger":   [],
            "alternatives":      [],
            "surgeon_questions": [
                "What clinical criteria were used to determine that surgery is necessary?",
                "What imaging or specialist assessments support the surgical recommendation?",
                "What non-surgical alternatives were considered and ruled out?",
                "What is the urgency classification for this surgery and why?",
                "What is the expected outcome of surgery versus continued medical management?",
            ],
            "family_summary": (
                "The uploaded lab report does not contain enough standard clinical markers "
                "for OCM to evaluate the surgical proposal against ACC/AHA guidelines. "
                "This is common when the report contains imaging results, specialist notes, "
                "or non-standard tests. Please ask the surgical team for a clear explanation "
                "of which specific clinical criteria justify the proposed surgery."
            ),
            "disclaimer":     _DISCLAIMER,
            "is_emergency":   is_emergency,
        }

    domain = SURGERY_DOMAINS[domain_key]

    # 2. Evaluate criteria ledger
    criteria_ledger, total_weight = _evaluate_criteria(domain, field_values)
    missing_count  = sum(1 for c in criteria_ledger if c.get("status") == "MISSING")
    criteria_count = len(criteria_ledger)

    # 3. Compute AHA class
    aha_result = _compute_aha_class(domain, total_weight, missing_count, criteria_count)

    # 4. Compute ASA
    asa = _calculate_asa(field_values, is_emergency)

    # 5. Build family summary
    family_summary = _build_family_summary(
        domain_name  = domain["name"],
        aha_result   = aha_result,
        asa          = asa,
        alternatives = domain["alternatives"],
        ledger       = criteria_ledger,
    )

    # 6. Counts summary
    met_count  = sum(1 for c in criteria_ledger if c.get("status") == "MET")
    fail_count = sum(1 for c in criteria_ledger if c.get("status") == "NOT_MET")

    logger.info(
        "[SURG] Audit complete: domain=%s verdict=%s aha=%s asa=%s met=%d/%d missing=%d",
        domain_key, aha_result["verdict"], aha_result["cor_key"],
        asa["asa_class"], met_count, criteria_count, missing_count,
    )

    result = {
        "surgery_domain":       domain_key,
        "surgery_domain_name":  domain["name"],
        "evidence_verdict":     aha_result["verdict"],
        "aha_class":            aha_result["cor"],
        "aha_class_key":        aha_result["cor_key"],
        "aha_loe_code":         aha_result["loe_code"],
        "aha_loe":              aha_result["loe"],
        "aha_verdict_note":     aha_result["verdict_note"],
        "total_evidence_weight":aha_result["total_weight"],
        "criteria_met":         met_count,
        "criteria_not_met":     fail_count,
        "criteria_missing":     missing_count,
        "criteria_total":       criteria_count,
        "criteria_ledger":      criteria_ledger,
        "asa_status":           asa,
        "alternatives":         domain["alternatives"],
        "surgeon_questions":    domain["surgeon_questions"],
        "family_summary":       family_summary,
        "disclaimer":           _DISCLAIMER,
        "is_emergency":         is_emergency,
        "guideline_sources": [
            "ACC/AHA 2019 Cardiovascular Risk Guidelines",
            "ACC/AHA 2017 Hypertension Guidelines",
            "ADA 2024 Standards of Medical Care in Diabetes",
            "KDIGO 2022 CKD Guidelines",
            "ASA Physical Status Classification System 2020",
        ],
    }

    # ── Surgical Motivation Classification (v4.4) ──────────────────────────
    if _HAS_INTENT:
        try:
            intent = classify_surgical_intent(
                surgical_audit = result,
                field_values   = field_values,
            )
            result["intent_flags"]       = intent["flags"]
            result["intent_summary"]     = intent["summary"]
            result["intent_highest"]     = intent["highest_level"]
            result["intent_highest_meta"]= intent["highest_meta"]
            result["patient_rights"]     = intent["patient_rights"]
            result["consent_checklist"]  = intent["consent_checklist"]
            result["intent_disclaimer"]  = intent["disclaimer"]
            logger.info(
                "[SURG_AUDIT][SMC] Flags: %s",
                {f['motivation']: f['level'] for f in intent['flags']}
            )
        except Exception as smc_err:
            logger.warning("[SURG_AUDIT][SMC] Non-fatal: %s", smc_err)

    return result

_DISCLAIMER = (
    "⚠️ IMPORTANT MEDICAL DISCLAIMER: This surgical audit is generated by OCM "
    "(Ontology Compliance Monitor) based solely on the laboratory values contained in the "
    "uploaded report. It evaluates whether those values meet published international clinical "
    "criteria (ACC/AHA, ADA, KDIGO). It does NOT replace a surgeon's clinical examination, "
    "imaging findings (CT, MRI, angiography), or specialist assessment. OCM does not diagnose "
    "conditions or recommend or advise against any specific medical procedure. All surgical "
    "decisions must be made by qualified medical professionals. Use this report only as a tool "
    "to facilitate informed questions with the surgical team."
)
