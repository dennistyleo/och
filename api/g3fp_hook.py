"""
Module: api.g3fp_hook
Version: 1.0.0
Description: G3FP Embedded Transformation Hook.
             Atomic API bridge: raw G3FP vision dict → validated PDDS v1.0 dict.
             Dependency-free from the main ingestion loop.
             Called by _g3fp_direct_scan() BEFORE the UIF is stored.
"""

import json
import logging
import math
import os
import pathlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

try:
    import jsonschema
    _JSONSCHEMA_AVAILABLE = True
except ImportError:
    _JSONSCHEMA_AVAILABLE = False

logger = logging.getLogger(__name__)

# SAA Registry import — optional (graceful if missing during unit tests)
try:
    from modules.axiom_repo.saa_registry import get_registry as _get_saa_registry
    _SAA_AVAILABLE = True
except Exception:
    _SAA_AVAILABLE = False
    logger.warning("[G3FP-Hook] SAA registry unavailable — elect_by_facts skipped")


# ---------------------------------------------------------------------------
# Schema loader (lazy, cached)
# ---------------------------------------------------------------------------
_SCHEMA_DIR = pathlib.Path(__file__).parent.parent / "schemas"
_PDDS_SCHEMA: Optional[Dict] = None
_DOMAIN_SPECS: Dict[str, Dict] = {}


def _load_pdds_schema() -> Dict:
    global _PDDS_SCHEMA
    if _PDDS_SCHEMA is None:
        path = _SCHEMA_DIR / "pdds_v1.json"
        with open(path, "r", encoding="utf-8") as f:
            _PDDS_SCHEMA = json.load(f)
    return _PDDS_SCHEMA


def _load_domain_spec(domain: str) -> Optional[Dict]:
    if domain not in _DOMAIN_SPECS:
        name_map = {
            "HEALTHCARE": "pdds_healthcare.json",
            "ENGINEERING": "pdds_engineering.json",
        }
        fname = name_map.get(domain.upper())
        if not fname:
            return None
        path = _SCHEMA_DIR / "domain_schemas" / fname
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            _DOMAIN_SPECS[domain] = json.load(f)
    return _DOMAIN_SPECS.get(domain)


# ---------------------------------------------------------------------------
# Certification helpers
# ---------------------------------------------------------------------------
def _certify(value: Any, source: str) -> str:
    """Assign certification tier based on extraction source."""
    if source in ("L0_VERIFIED", "HARD"):
        return "HARD"
    if source in ("G3FP_VISION", "USER_CONFIRMED", "SOFT"):
        return "SOFT"
    return "UNCERTIFIED"


def _compute_aip(tg: Optional[float], hdl: Optional[float]) -> Optional[float]:
    """AIP = log10(TG / HDL). Returns None if inputs are invalid."""
    try:
        if tg and hdl and hdl > 0:
            return round(math.log10(tg / hdl), 4)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Core entity extraction
# ---------------------------------------------------------------------------
def _extract_entities(
    raw_entities: List[Dict],
    raw_metrics: List[Dict],
    domain_spec: Optional[Dict],
) -> List[Dict]:
    """
    Normalize raw G3FP entities into PDDS typed entity array.
    Domain spec required_entities are checked for presence.
    """
    result: List[Dict] = []
    seen_fields: set = set()

    for e in raw_entities:
        val = e.get("value", "")
        if not val:
            continue
        etype = e.get("type", "UNKNOWN").upper()
        field_name = etype.lower().replace(" ", "_")
        seen_fields.add(field_name)
        result.append({
            "field_name": field_name,
            "entity_type": etype,
            "value": str(val),
            "certification": _certify(val, "G3FP_VISION"),
            "source": "G3FP_VISION",
            "confidence": float(e.get("confidence", 0.5)),
        })

    # Fill mandatory entity slots from domain spec
    if domain_spec:
        for req in domain_spec.get("required_entities", []):
            fn = req["field_name"]
            if fn not in seen_fields:
                result.append({
                    "field_name": fn,
                    "entity_type": req.get("entity_type", "UNKNOWN"),
                    "value": None,
                    "certification": "UNCERTIFIED",
                    "source": "MISSING",
                    "confidence": 0.0,
                    "mandatory_cycle1": req.get("mandatory_cycle1", False),
                    "mandatory_cycle2": req.get("mandatory_cycle2", False),
                })

    return result


# ---------------------------------------------------------------------------
# Core metric extraction
# ---------------------------------------------------------------------------
def _extract_metrics(
    raw_metrics: List[Dict],
    domain: str,
    domain_spec: Optional[Dict],
) -> List[Dict]:
    """
    Normalize raw G3FP metrics into PDDS typed metric array.
    Attaches axiom_binding from domain spec where available.
    """
    result: List[Dict] = []
    spec_map: Dict[str, Dict] = {}

    if domain_spec:
        for rm in domain_spec.get("required_metrics", []):
            spec_map[rm["field_name"].upper()] = rm
            # Also index by display name fragments for fuzzy match
            dn = rm.get("display_name", "").upper()
            for tok in dn.split("("):
                key = tok.strip().rstrip(")")
                if key:
                    spec_map[key] = rm

    seen_fields: set = set()

    for m in raw_metrics:
        raw_name = (m.get("name") or "").strip()
        raw_val = m.get("value")
        if raw_val is None:
            continue

        try:
            value = float(raw_val)
        except (TypeError, ValueError):
            continue

        # Match against domain spec
        matched_spec: Optional[Dict] = None
        name_upper = raw_name.upper()
        for key, spec in spec_map.items():
            if key in name_upper or name_upper in key:
                matched_spec = spec
                break

        field_name = matched_spec["field_name"] if matched_spec else raw_name.lower().replace(" ", "_")
        seen_fields.add(field_name.upper())

        # Bounds check
        flagged = m.get("flagged", False)
        if matched_spec:
            lo, hi = matched_spec.get("bounds", [None, None])
            if lo is not None and value < lo:
                flagged = True
            if hi is not None and value > hi:
                flagged = True

        entry: Dict[str, Any] = {
            "field_name": field_name,
            "display_name": matched_spec["display_name"] if matched_spec else raw_name,
            "value": value,
            "unit": m.get("unit", matched_spec["unit"] if matched_spec else ""),
            "reference_range": m.get("reference_range", matched_spec.get("reference_range", "") if matched_spec else ""),
            "flagged": flagged,
            "certification": _certify(value, "G3FP_VISION"),
            "source": "G3FP_VISION",
            "axiom_variable_name": matched_spec.get("axiom_variable_name") if matched_spec else None,
            "axiom_binding": matched_spec.get("axiom_binding") if matched_spec else None,
            "pm_critical": matched_spec.get("pm_critical", False) if matched_spec else False,
        }
        result.append(entry)

    # Inject AIP for HEALTHCARE if TG + HDL present
    if domain == "HEALTHCARE":
        vals = {e["field_name"]: e["value"] for e in result}
        aip = _compute_aip(vals.get("TG"), vals.get("HDL"))
        if aip is not None:
            result.append({
                "field_name": "AIP",
                "display_name": "Atherogenic Index of Plasma",
                "value": aip,
                "unit": "log10(TG/HDL)",
                "reference_range": "<0.11",
                "flagged": aip > 0.11,
                "certification": "SOFT",
                "source": "COMPUTED",
                "axiom_variable_name": "AIP_score",
                "axiom_binding": {"axiom_id": "VASCULAR_AIP_001", "formula": "log10(TG/HDL)"},
                "pm_critical": True,
            })

    # Fill mandatory metric slots from domain spec (mark UNCERTIFIED if missing)
    if domain_spec:
        for rm in domain_spec.get("required_metrics", []):
            if rm["field_name"].upper() not in seen_fields and rm.get("mandatory_cycle1"):
                result.append({
                    "field_name": rm["field_name"],
                    "display_name": rm["display_name"],
                    "value": None,
                    "unit": rm.get("unit", ""),
                    "reference_range": rm.get("reference_range", ""),
                    "flagged": False,
                    "certification": "UNCERTIFIED",
                    "source": "MISSING",
                    "axiom_variable_name": rm.get("axiom_variable_name"),
                    "axiom_binding": rm.get("axiom_binding"),
                    "pm_critical": rm.get("pm_critical", False),
                })

    return result


# ---------------------------------------------------------------------------
# Handshake gate evaluation
# ---------------------------------------------------------------------------
def _evaluate_handshake_gate(
    entities: List[Dict],
    metrics: List[Dict],
    domain_spec: Optional[Dict],
) -> Dict[str, Any]:
    """
    Evaluates cycle_1 / cycle_2 readiness against domain spec gate criteria.
    Returns handshake_gate block for PDDS.
    """
    if not domain_spec:
        return {
            "cycle_1_open": True,
            "cycle_2_eligible": False,
            "missing_hard": [],
            "missing_soft": [],
            "blocking_reasons": [],
        }

    gate_criteria = domain_spec.get("handshake_gate_criteria", {})
    c1_hard = gate_criteria.get("cycle_1_hard_close", {})
    c2_gate = gate_criteria.get("cycle_2_gate", {})

    all_fields = {
        e["field_name"]: e for e in entities
    }
    all_fields.update({
        m["field_name"]: m for m in metrics
    })

    def _has_field(field_name: str, min_cert: str) -> bool:
        entry = all_fields.get(field_name)
        if not entry:
            return False
        val = entry.get("value")
        if val is None:
            return False
        cert = entry.get("certification", "UNCERTIFIED")
        tiers = ["UNCERTIFIED", "SOFT", "HARD"]
        return tiers.index(cert) >= tiers.index(min_cert)

    c1_required = c1_hard.get("required_fields", [])
    c1_min_cert = c1_hard.get("min_certification", "SOFT")
    c1_missing = [f for f in c1_required if not _has_field(f, c1_min_cert)]
    c1_open = len(c1_missing) == 0

    c2_required = c2_gate.get("required_fields", [])
    c2_min_cert = c2_gate.get("min_certification", "SOFT")
    c2_missing = [f for f in c2_required if not _has_field(f, c2_min_cert)]
    c2_eligible = len(c2_missing) == 0

    return {
        "cycle_1_open": c1_open,
        "cycle_2_eligible": c2_eligible,
        "missing_hard": c1_missing,
        "missing_soft": c2_missing,
        "blocking_reasons": (
            [f"Missing Cycle-2 field: {f}" for f in c2_missing]
            if not c2_eligible else []
        ),
    }


# ---------------------------------------------------------------------------
# SAA Fact-Set Builder — spec/23_axiom_schema.md Part 6 Semantic Contract
# ---------------------------------------------------------------------------
# Canonical field alias map: maps display variants Gemini might output
# despite instructions, to the authoritative canonical field name that
# the SAA field_index is keyed on.
_FIELD_ALIAS: Dict[str, str] = {
    # LDL variants
    "ldl cholesterol": "LDL", "low-density lipoprotein": "LDL",
    "low density lipoprotein": "LDL", "ldl-c": "LDL",
    # HDL variants
    "hdl cholesterol": "HDL", "high-density lipoprotein": "HDL",
    "high density lipoprotein": "HDL", "hdl-c": "HDL",
    # Triglycerides
    "triglycerides": "TG", "triglyceride": "TG",
    "triacylglycerol": "TG", "triacylglycerols": "TG",
    # Total cholesterol
    "total cholesterol": "T-CHO", "cholesterol": "T-CHO", "tc": "T-CHO",
    # Glucose
    "fasting glucose": "Glu", "blood glucose": "Glu", "blood sugar": "Glu",
    "glucose": "Glu",
    # Haemoglobin
    "hemoglobin": "Hb", "haemoglobin": "Hb",
    # HbA1c
    "glycated haemoglobin": "HbA1c", "glycated hemoglobin": "HbA1c",
    "a1c": "HbA1c", "haemoglobin a1c": "HbA1c",
    # Blood pressure
    "systolic blood pressure": "SBP", "systolic": "SBP",
    "diastolic blood pressure": "DBP", "diastolic": "DBP",
    # Liver
    "alanine aminotransferase": "ALT", "alanine transaminase": "ALT",
    "aspartate aminotransferase": "AST", "aspartate transaminase": "AST",
    # Kidney
    "creatinine": "Cr", "serum creatinine": "Cr",
    "estimated glomerular filtration rate": "eGFR", "glomerular filtration rate": "eGFR",
    # CBC
    "white blood cell": "WBC", "white blood cells": "WBC",
    "red blood cell": "RBC", "red blood cells": "RBC",
    "platelet": "PLT", "platelets": "PLT",
    # Others
    "uric acid": "UA", "sodium": "Na", "potassium": "K",
    "calcium": "Ca", "magnesium": "Mg",
    "thyroid stimulating hormone": "TSH", "thyroid-stimulating hormone": "TSH",
    "free thyroxine": "T4_free", "oxygen saturation": "SpO2", "spo2": "SpO2",
    "heart rate": "HR", "pulse": "HR",
    "body temperature": "Temp", "temperature": "Temp",
    "body mass index": "BMI",
    "prostate specific antigen": "PSA", "prostate-specific antigen": "PSA",
    "international normalised ratio": "INR", "inr": "INR",
    "qtc interval": "QTc", "qt interval": "QTc",
}


def _canonicalize_field_name(raw_name: str) -> str:
    """
    Normalise a G3FP metric name to its canonical SAA field name.
    Returns the canonical name if found, else the original (stripped + title-cased
    if it looks like a known abbreviation).
    """
    stripped = raw_name.strip()
    # First: exact match
    if stripped in _FIELD_ALIAS:
        return _FIELD_ALIAS[stripped]
    # Second: case-insensitive lookup
    lower = stripped.lower()
    if lower in _FIELD_ALIAS:
        return _FIELD_ALIAS[lower]
    # Third: prefix match (handles "LDL Cholesterol (低密度脂蛋白)")
    for alias, canon in _FIELD_ALIAS.items():
        if lower.startswith(alias) or lower.endswith(alias):
            return canon
    # Fourth: already canonical (short abbreviation)
    return stripped


def _build_saa_elected_axioms(
    raw_g3fp: Dict[str, Any],
    domain: str,
    metrics: List[Dict],
) -> tuple:
    """
    Deterministic SAA axiom election from G3FP output.
    Returns (elected_axiom_ids: List[str], saa_fact_set: Dict[str, float]).

    Two-pass election:
      Pass 1 — G3FP explicitly elected axiom IDs (already evaluated by the LLM)
      Pass 2 — elect_by_facts() from SAA registry using the canonical fact_set
    
    Both passes are merged and deduplicated. The fact_set is the primary key
    for all downstream SAA derivation_formula evaluation (spec Part 7).
    """
    # ── Build canonical fact_set ────────────────────────────────────────────
    # G3FP v2 outputs saa_fact_set directly; fall back to metrics array
    raw_fact_set: Dict = raw_g3fp.get("saa_fact_set", {}) or {}
    fact_set: Dict[str, float] = {}

    # Consume G3FP's saa_fact_set (canonical field names keyed)
    for field_name, value in raw_fact_set.items():
        try:
            fact_set[field_name] = float(value)
        except (TypeError, ValueError):
            pass

    # Supplement from metrics array (normalised field_names from _extract_metrics)
    for m in metrics:
        fn = m.get("field_name", "")
        val = m.get("value")
        if fn and val is not None and fn not in fact_set:
            try:
                fact_set[fn] = float(val)
            except (TypeError, ValueError):
                pass

    # ── Pass 1: G3FP-elected axiom IDs ─────────────────────────────────────
    g3fp_ids: Set[str] = set(raw_g3fp.get("g3fp_elected_axiom_ids", []) or [])

    # ── Pass 2: SAA registry deterministic election ─────────────────────────
    registry_ids: Set[str] = set()
    if _SAA_AVAILABLE and fact_set:
        try:
            registry = _get_saa_registry()
            if not hasattr(registry, "_domain_index"):
                registry._build_inverted_indexes()
            # SAA.elect_by_facts expects lowercased field names
            metric_names_lower = {k.lower() for k in fact_set}
            entity_types_lower = {
                e.get("entity_type", "").lower()
                for e in raw_g3fp.get("key_entities", [])
            }
            elected_list = registry.elect_by_facts(
                domain=domain,
                metric_names=metric_names_lower,
                entity_types=entity_types_lower,
            )
            registry_ids.update(elected_list)
        except Exception as exc:
            logger.warning(f"[G3FP-Hook] elect_by_facts failed: {exc}")

    # Merge: G3FP proposals + SAA verification
    all_elected = sorted(g3fp_ids | registry_ids)
    logger.info(
        f"[G3FP-Hook] SAA election | domain={domain} "
        f"fact_fields={list(fact_set.keys())} "
        f"g3fp_ids={sorted(g3fp_ids)} registry_ids={sorted(registry_ids)} "
        f"elected={all_elected}"
    )
    return all_elected, fact_set


# ---------------------------------------------------------------------------
# Axiom election hints (legacy — kept for backward compat)
# ---------------------------------------------------------------------------
def _build_axiom_election_hints(
    domain: str,
    domain_spec: Optional[Dict],
    g3fp_hints: List[str],
    metrics: List[Dict],
) -> Dict[str, Any]:
    """
    Pre-computes SAA signals to bypass noisy vector search.
    Returns axiom_election_hints block for PDDS.
    """
    candidate_ids = domain_spec.get("candidate_axiom_ids", []) if domain_spec else []
    negative_hints = domain_spec.get("negative_hints", []) if domain_spec else []

    # Collect axiom IDs referenced in metric bindings
    binding_ids = [
        m["axiom_binding"]["axiom_id"]
        for m in metrics
        if m.get("axiom_binding") and m["value"] is not None
    ]

    # PM-critical fields with values present
    pm_take2 = [
        m["field_name"]
        for m in metrics
        if m.get("pm_critical") and m.get("value") is not None
    ]

    return {
        "domain_family": domain_spec.get("axiom_family", domain) if domain_spec else domain,
        "candidate_axiom_ids": list(dict.fromkeys(binding_ids + candidate_ids)),
        "negative_domain_hints": negative_hints,
        "g3fp_free_hints": g3fp_hints,
        "pm_take2_targets": pm_take2,
        "pre_elected_by_binding": list(dict.fromkeys(binding_ids)),
    }


def _normalize_snapshot_fact_set(raw_set: Dict[str, Any]) -> Dict[str, float]:
    """Normalize a raw fact set dictionary to canonical field names and float values."""
    fact_set = {}
    for k, v in raw_set.items():
        try:
            canon_key = _canonicalize_field_name(k)
            fact_set[canon_key] = float(v)
        except (TypeError, ValueError):
            pass
    return fact_set


# ---------------------------------------------------------------------------
# Public transform function
# ---------------------------------------------------------------------------
def g3fp_transform(
    raw_g3fp: Dict[str, Any],
    filename: str,
    trace_id: str,
    domain_hint: str = "GENERAL",
) -> Dict[str, Any]:
    """
    Transform raw G3FP vision output → validated PDDS v1.0.

    Parameters
    ----------
    raw_g3fp : dict
        Direct output from Gemini vision call (parsed JSON).
    filename : str
        Original uploaded filename.
    trace_id : str
        Pipeline trace ID.
    domain_hint : str
        Domain hint from frontend (may be overridden by G3FP detection).

    Returns
    -------
    dict
        PDDS v1.0 compliant document. Always returns a valid dict —
        never raises. Failures are recorded in pdds_meta.transform_errors.
    """
    transform_errors: List[str] = []
    ts = datetime.now(timezone.utc).isoformat()

    # Resolve domain
    domain = raw_g3fp.get("domain", domain_hint).upper().strip() or domain_hint.upper()
    doc_type = raw_g3fp.get("document_type", "Unknown")
    language = raw_g3fp.get("language_detected", "EN")
    g3fp_confidence = float(raw_g3fp.get("confidence", 0.5))
    summary = raw_g3fp.get("summary", "")

    # Load domain spec (graceful if missing)
    try:
        domain_spec = _load_domain_spec(domain)
    except Exception as exc:
        domain_spec = None
        transform_errors.append(f"domain_spec_load_failed: {exc}")

    # Extract entities and metrics
    try:
        entities = _extract_entities(
            raw_g3fp.get("key_entities", []),
            raw_g3fp.get("metrics", []),
            domain_spec,
        )
    except Exception as exc:
        entities = []
        transform_errors.append(f"entity_extraction_failed: {exc}")

    try:
        metrics = _extract_metrics(
            raw_g3fp.get("metrics", []),
            domain,
            domain_spec,
        )
    except Exception as exc:
        metrics = []
        transform_errors.append(f"metric_extraction_failed: {exc}")

    # Handshake gate
    try:
        handshake_gate = _evaluate_handshake_gate(entities, metrics, domain_spec)
    except Exception as exc:
        handshake_gate = {"cycle_1_open": True, "cycle_2_eligible": False}
        transform_errors.append(f"handshake_gate_failed: {exc}")

    # Axiom election hints (legacy)
    try:
        axiom_hints = _build_axiom_election_hints(
            domain,
            domain_spec,
            raw_g3fp.get("axiom_hints", []),
            metrics,
        )
    except Exception as exc:
        axiom_hints = {"candidate_axiom_ids": [], "negative_domain_hints": []}
        transform_errors.append(f"axiom_hints_failed: {exc}")

    # ── SAA Semantic Contract Election (spec/23_axiom_schema.md Part 6) ────────
    # Normalise metric field_names BEFORE election so SAA field_index sees canonical keys.
    for m in metrics:
        raw_fn = m.get("field_name", "")
        canonical = _canonicalize_field_name(raw_fn)
        if canonical != raw_fn:
            logger.debug(f"[G3FP-Hook] field_name canonicalized: {raw_fn!r} → {canonical!r}")
            m["field_name"] = canonical

    try:
        elected_axioms, saa_fact_set = _build_saa_elected_axioms(raw_g3fp, domain, metrics)
    except Exception as exc:
        elected_axioms, saa_fact_set = [], {}
        transform_errors.append(f"saa_election_failed: {exc}")
        logger.error(f"[G3FP-Hook] E009: SAA election error: {exc}", exc_info=True)


    # ── Parse and normalize time series history ─────────────────────────────
    saa_fact_set_history = []
    raw_history = raw_g3fp.get("time_series_snapshots") or raw_g3fp.get("saa_fact_set_history")

    if isinstance(raw_history, list):
        for snap in raw_history:
            if isinstance(snap, dict):
                normalized_snap = _normalize_snapshot_fact_set(snap.get("saa_fact_set") or snap)
                if normalized_snap:
                    saa_fact_set_history.append(normalized_snap)
            elif isinstance(snap, list):
                snap_dict = {m.get("name"): m.get("value") for m in snap if isinstance(m, dict) and m.get("name")}
                normalized_snap = _normalize_snapshot_fact_set(snap_dict)
                if normalized_snap:
                    saa_fact_set_history.append(normalized_snap)

    if not saa_fact_set_history and saa_fact_set:
        saa_fact_set_history = [saa_fact_set]

    # Actionable refusals — escalate flagged metrics missing mandatory fields
    missing_mandatory = [
        e["field_name"] for e in entities
        if e.get("source") == "MISSING" and e.get("mandatory_cycle1")
    ] + [
        m["field_name"] for m in metrics
        if m.get("source") == "MISSING" and m.get("pm_critical")
    ]

    actionable_refusals: Dict[str, List] = {
        "modal": [
            {"code": "MANDATORY_MISSING", "field": f,
             "message": f"Mandatory field '{f}' could not be extracted."}
            for f in missing_mandatory
        ],
        "amber": [
            {"code": "LOW_CONFIDENCE", "field": m["field_name"],
             "message": f"Low confidence on {m['display_name']}: {m['value']}"}
            for m in metrics
            if m.get("value") is not None and float(m.get("certification") == "UNCERTIFIED")
        ],
    }

    # Assemble PDDS
    pdds: Dict[str, Any] = {
        "$schema": "https://sovereign-matrix.org/schemas/pdds/v1.0",
        "@type": "PDDS",
        "pdds_version": "1.0.0",
        # ── Top-level domain alias: consumed by g3fp_ingest detected_domain
        # and _saa_rule_elect. document_profile.domain is the canonical location
        # but callers use uif.get('domain') — both must agree.
        "domain": domain,
        "pdds_meta": {
            "trace_id": trace_id,
            "filename": filename,
            "created_at": ts,
            "extraction_mode": "G3FP_DIRECT",
            "transform_version": "g3fp_hook@1.0.0",
            "transform_errors": transform_errors,
            "schema_valid": False,  # updated below
        },
        "document_profile": {
            "domain": domain,
            "document_type": doc_type,
            "language_detected": language,
            "g3fp_confidence": g3fp_confidence,
            "summary": summary,
            "semantics": raw_g3fp.get("semantics", ""),
        },
        "entities": entities,
        "metrics": metrics,
        "handshake_gate": handshake_gate,
        "axiom_election_hints": axiom_hints,
        "actionable_refusals": actionable_refusals,
        # ── Semantic Contract output (spec/23_axiom_schema.md Part 6) ──
        "g3fp_elected_axioms": elected_axioms,  # List[str] — canonical axiom_ids
        "saa_fact_set": saa_fact_set,           # Dict[canonical_field, float]
        "saa_fact_set_history": saa_fact_set_history,  # List[Dict[canonical_field, float]]
    }

    # Runtime JSON Schema validation
    if _JSONSCHEMA_AVAILABLE:
        try:
            schema = _load_pdds_schema()
            jsonschema.validate(instance=pdds, schema=schema)
            pdds["pdds_meta"]["schema_valid"] = True
        except jsonschema.ValidationError as exc:
            transform_errors.append(f"schema_validation_failed: {exc.message}")
            pdds["pdds_meta"]["transform_errors"] = transform_errors
            logger.warning(f"[G3FP-Hook] PDDS schema validation failed: {exc.message}")
        except Exception as exc:
            transform_errors.append(f"schema_load_error: {exc}")
    else:
        pdds["pdds_meta"]["schema_valid"] = None  # jsonschema not installed
        logger.warning("[G3FP-Hook] jsonschema not available — skipping validation")

    cert_count = sum(1 for m in metrics if m.get("value") is not None)
    logger.info(
        f"[G3FP-Hook] PDDS built — domain={domain} "
        f"entities={len(entities)} metrics={cert_count} "
        f"cycle1={handshake_gate.get('cycle_1_open')} "
        f"cycle2={handshake_gate.get('cycle_2_eligible')} "
        f"errors={len(transform_errors)} trace={trace_id}"
    )
    return pdds
