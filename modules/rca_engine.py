"""
Module: rca_engine
Version: 1.0.0
Description: Sovereign OCM V4.1 — Root Cause Analysis (RCA) Engine.
             Implements backward causal trace for Deduction Mode DOE branch.

Pipeline position: L4-A (called by DeductionEngine when branch == 'RCA')

Algorithm (spec/30 §5.1):
  1. For each REFUSE axiom, extract violated constraint(s)
  2. Compute per-field deviation: delta = (actual - threshold) / threshold * 100
  3. Build causal chain nodes from violated axioms → contributing fields
  4. Rank root causes by deviation magnitude
  5. Emit RCA_COMPLETE with sealed root_cause_set R

Policy:
  - No fallback: incomplete chain → E007 (CAUSAL_CHAIN_BROKEN) → HITL_REQUEST
  - Deduction lock enforced: no G3FP narrative injection
  - DFT hooks at every stage (grep [DFT][RCA_ENGINE_*] for test interception)

Error Codes:
  E007  CAUSAL_CHAIN_BROKEN — unable to trace causal path for a refused axiom
"""

import datetime
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
VERDICT_REFUSE          = "REFUSE"
VERDICT_UNDERDETERMINED = "UNDERDETERMINED"
SEVERITY_CRITICAL       = "CRITICAL"   # deviation > 20%
SEVERITY_MAJOR          = "MAJOR"      # deviation 5–20%
SEVERITY_MINOR          = "MINOR"      # deviation < 5%


def _now_iso() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


def _error_packet(code: str, message: str, trace_id: str) -> Dict[str, Any]:
    return {
        "error_code": code,
        "message":    message,
        "trace_id":   trace_id,
        "timestamp":  _now_iso(),
    }


def _severity(deviation_pct: float) -> str:
    """Classify deviation magnitude into severity tier."""
    abs_dev = abs(deviation_pct)
    if abs_dev > 20.0:
        return SEVERITY_CRITICAL
    if abs_dev >= 5.0:
        return SEVERITY_MAJOR
    return SEVERITY_MINOR


# ── Per-Axiom Causal Node Builder ────────────────────────────────────────────

def _build_causal_node(
    axiom_result:  Dict[str, Any],
    axiom_raw:     Dict[str, Any],
    field_values:  Dict[str, float],
    trace_id:      str,
) -> Optional[Dict[str, Any]]:
    """
    Build a single causal chain node for a REFUSE axiom.

    Args:
        axiom_result: L2 evaluation dict (axiom_id, verdict, computed_value, threshold).
        axiom_raw:    Raw axiom JSON dict (contains derivation_formula.variables).
        field_values: Flat dict of field_name → numeric value.
        trace_id:     Active trace ID.

    Returns:
        Causal node dict or None if chain cannot be built (triggers E007).
    """
    axiom_id       = axiom_result["axiom_id"]
    computed_value = axiom_result.get("computed_value")
    threshold      = axiom_result.get("threshold")

    logger.debug(
        "[DFT][RCA_ENGINE_NODE_START] axiom=%s computed=%.4f threshold=%s trace=%s",
        axiom_id, computed_value or 0.0, threshold, trace_id,
    )

    if computed_value is None or threshold is None:
        logger.error(
            "[DFT][RCA_ENGINE_NODE_BROKEN] axiom=%s reason=missing_values trace=%s",
            axiom_id, trace_id,
        )
        return None

    # Overall axiom deviation
    if threshold != 0:
        axiom_deviation_pct = (computed_value - threshold) / abs(threshold) * 100.0
    else:
        axiom_deviation_pct = float("inf") if computed_value != 0 else 0.0

    # Per-field contributing analysis
    variables_map = axiom_raw.get("derivation_formula", {}).get("variables", {})
    bounds_map    = {}
    field_contributions: List[Dict[str, Any]] = []

    for sym_name, var_spec in variables_map.items():
        field_key = var_spec.get("maps_to_field", sym_name)
        bounds    = var_spec.get("bounds", [None, None])
        unit      = var_spec.get("unit", "")
        val       = field_values.get(field_key)

        if val is None:
            field_contributions.append({
                "field":     field_key,
                "symbol":    sym_name,
                "value":     None,
                "unit":      unit,
                "bounds":    bounds,
                "status":    "MISSING",
                "deviation_pct": None,
                "severity":  SEVERITY_CRITICAL,
            })
            continue

        lo, hi = bounds[0], bounds[1]
        in_bounds = (lo is None or val >= lo) and (hi is None or val <= hi)

        # Compute field-level deviation relative to nearest bound
        if not in_bounds:
            if hi is not None and val > hi:
                dev = (val - hi) / hi * 100.0 if hi != 0 else float("inf")
            elif lo is not None and val < lo:
                dev = (lo - val) / lo * 100.0 if lo != 0 else float("inf")
            else:
                dev = 0.0
        else:
            dev = 0.0

        field_contributions.append({
            "field":         field_key,
            "symbol":        sym_name,
            "value":         val,
            "unit":          unit,
            "bounds":        bounds,
            "in_bounds":     in_bounds,
            "deviation_pct": round(dev, 4),
            "severity":      _severity(dev) if not in_bounds else "OK",
            "status":        "OK" if in_bounds else "OUT_OF_BOUNDS",
        })

    # Sort contributions: worst deviation first
    field_contributions.sort(
        key=lambda c: abs(c["deviation_pct"] or 0.0),
        reverse=True,
    )

    node = {
        "axiom_id":            axiom_id,
        "axiom_name":          axiom_raw.get("name", ""),
        "subdomain":           axiom_raw.get("subdomain", ""),
        "expression_latex":    axiom_raw.get("expression_latex", ""),
        "computed_value":      round(computed_value, 6),
        "threshold":           round(threshold, 6),
        "axiom_deviation_pct": round(axiom_deviation_pct, 4),
        "axiom_severity":      _severity(axiom_deviation_pct),
        "field_contributions": field_contributions,
        "primary_cause":       field_contributions[0] if field_contributions else None,
    }

    logger.debug(
        "[DFT][RCA_ENGINE_NODE_DONE] axiom=%s severity=%s primary_field=%s trace=%s",
        axiom_id,
        node["axiom_severity"],
        node["primary_cause"]["field"] if node["primary_cause"] else "N/A",
        trace_id,
    )
    return node


# ── Root Cause Set Builder ────────────────────────────────────────────────────

def _build_root_cause_set(
    causal_nodes: List[Dict[str, Any]],
    trace_id:     str,
) -> List[Dict[str, Any]]:
    """
    Aggregate per-axiom causal nodes into deduplicated root cause set R.

    Fields appearing in multiple REFUSE axioms are merged; their
    deviation scores are averaged to produce a composite severity rank.

    Args:
        causal_nodes: List of causal node dicts from _build_causal_node().
        trace_id:     Active trace ID.

    Returns:
        Ranked list of root cause entries (highest composite deviation first).
    """
    field_accumulator: Dict[str, Dict[str, Any]] = {}

    for node in causal_nodes:
        for contrib in node.get("field_contributions", []):
            field = contrib["field"]
            dev   = abs(contrib.get("deviation_pct") or 0.0)

            if field not in field_accumulator:
                field_accumulator[field] = {
                    "field":        field,
                    "unit":         contrib.get("unit", ""),
                    "value":        contrib.get("value"),
                    "bounds":       contrib.get("bounds"),
                    "appearances":  0,
                    "total_dev":    0.0,
                    "worst_dev":    0.0,
                    "status":       contrib.get("status", "OK"),
                    "axioms_failed": [],
                }

            acc = field_accumulator[field]
            acc["appearances"]  += 1
            acc["total_dev"]    += dev
            acc["worst_dev"]     = max(acc["worst_dev"], dev)
            acc["axioms_failed"].append(node["axiom_id"])
            if contrib.get("status") != "OK":
                acc["status"] = contrib.get("status", acc["status"])

    root_causes = []
    for field, acc in field_accumulator.items():
        composite_dev = acc["total_dev"] / acc["appearances"] if acc["appearances"] else 0.0
        root_causes.append({
            "field":           field,
            "unit":            acc["unit"],
            "value":           acc["value"],
            "bounds":          acc["bounds"],
            "composite_deviation_pct": round(composite_dev, 4),
            "worst_deviation_pct":     round(acc["worst_dev"], 4),
            "appearances_in_refusals": acc["appearances"],
            "axioms_failed":   acc["axioms_failed"],
            "severity":        _severity(acc["worst_dev"]),
            "status":          acc["status"],
        })

    root_causes.sort(key=lambda rc: rc["composite_deviation_pct"], reverse=True)

    logger.info(
        "[DFT][RCA_ENGINE_ROOT_CAUSE_SET] count=%d trace=%s",
        len(root_causes), trace_id,
    )
    return root_causes


# ── RCA Engine ───────────────────────────────────────────────────────────────

class RCAEngine:
    """
    Root Cause Analysis Engine for Sovereign OCM V4.1 Deduction Mode.

    Performs backward causal trace from REFUSE verdicts to field-level
    root causes. Outputs a ranked root_cause_set R and causal chain map.

    Wired to DeductionEngine._run_rca() via BUS in Phase 4-B integration.
    DFT hooks: grep [DFT][RCA_ENGINE_*]
    """

    def __init__(self, bus: Any, registry: Any) -> None:
        """
        Initialise RCAEngine.

        Args:
            bus:      SovereignBUS instance for event emission.
            registry: SAARegistry instance for axiom raw data lookup.
        """
        self.bus      = bus
        self.registry = registry
        self._register_handlers()
        logger.info("[DFT][RCA_ENGINE_INIT] RCAEngine ready.")

    def _register_handlers(self) -> None:
        """Register BUS event listeners."""
        self.bus.on("RCA_RUN_REQUEST", self._handle_run_request)

    async def _handle_run_request(self, message: Dict[str, Any]) -> None:
        """BUS handler: wraps run() for event-driven invocation."""
        await self.run(
            axiom_results = message.get("axiom_results", []),
            field_values  = message.get("field_values", {}),
            trace_id      = message.get("trace_id", ""),
        )

    async def run(
        self,
        axiom_results: List[Dict[str, Any]],
        field_values:  Dict[str, float],
        trace_id:      str,
    ) -> Dict[str, Any]:
        """
        Execute backward causal trace for all REFUSE axioms.

        Args:
            axiom_results: L2 evaluation list from DeductionEngine.
            field_values:  Extracted field dict (field_name → float).
            trace_id:      Active pipeline trace ID.

        Returns:
            RCA output dict with root_cause_set R, causal_chain, and summary.
            On failure: error packet with E007.
        """
        logger.info(
            "[DFT][RCA_ENGINE_START] total_axioms=%d trace=%s",
            len(axiom_results), trace_id,
        )

        refused = [r for r in axiom_results if r["verdict"] == VERDICT_REFUSE]

        if not refused:
            logger.info("[DFT][RCA_ENGINE_NO_REFUSE] trace=%s", trace_id)
            result = {
                "branch":          "RCA",
                "root_cause_set":  [],
                "causal_chain":    [],
                "summary":         "No refused axioms — RCA not required.",
                "trace_id":        trace_id,
                "timestamp":       _now_iso(),
            }
            await self.bus.emit("RCA_COMPLETE", result)
            return result

        # Build causal nodes
        causal_nodes: List[Dict[str, Any]] = []
        broken_chains: List[str]           = []

        for axiom_result in refused:
            axiom_id = axiom_result["axiom_id"]
            saa      = self.registry.get(axiom_id)
            if saa is None:
                logger.warning(
                    "[DFT][RCA_ENGINE_SAA_NOT_FOUND] axiom=%s trace=%s",
                    axiom_id, trace_id,
                )
                broken_chains.append(axiom_id)
                continue

            node = _build_causal_node(
                axiom_result = axiom_result,
                axiom_raw    = saa._raw,
                field_values = field_values,
                trace_id     = trace_id,
            )
            if node is None:
                broken_chains.append(axiom_id)
            else:
                causal_nodes.append(node)

        # Any broken chains → E007 escalation
        if broken_chains:
            logger.error(
                "[DFT][RCA_ENGINE_BROKEN_CHAINS] broken=%s trace=%s",
                broken_chains, trace_id,
            )
            err = _error_packet(
                "E007",
                f"Causal chain broken for axioms: {broken_chains}",
                trace_id,
            )
            await self.bus.emit("HITL_REQUEST", {"reason": "causal_chain_broken", **err})
            await self.bus.emit("ERROR", err)
            return err

        # Build root cause set R
        root_cause_set = _build_root_cause_set(causal_nodes, trace_id)

        # Derive recommendation text (deterministic — no G3FP injection)
        recommendations = _generate_recommendations(root_cause_set, trace_id)

        result: Dict[str, Any] = {
            "branch":           "RCA",
            "root_cause_set":   root_cause_set,
            "causal_chain":     causal_nodes,
            "refused_axioms":   [r["axiom_id"] for r in refused],
            "broken_chains":    [],
            "recommendations":  recommendations,
            "summary": (
                f"RCA identified {len(root_cause_set)} root cause(s) "
                f"across {len(refused)} refused axiom(s). "
                f"Primary cause: {root_cause_set[0]['field'] if root_cause_set else 'N/A'}."
            ),
            "trace_id":  trace_id,
            "timestamp": _now_iso(),
        }

        # Seal with hash
        payload_bytes  = json.dumps(result, sort_keys=True, ensure_ascii=False).encode()
        result["sha256"] = hashlib.sha256(payload_bytes).hexdigest()

        logger.info(
            "[DFT][RCA_ENGINE_COMPLETE] root_causes=%d refused=%d sha256=%s trace=%s",
            len(root_cause_set), len(refused), result["sha256"][:16], trace_id,
        )
        await self.bus.emit("RCA_COMPLETE", result)
        return result


# ── Recommendation Generator ──────────────────────────────────────────────────

def _generate_recommendations(
    root_cause_set: List[Dict[str, Any]],
    trace_id:       str,
) -> List[Dict[str, Any]]:
    """
    Generate deterministic, template-based corrective recommendations.

    No G3FP narrative injection — all text is derived from structured data.
    Templates are keyed on severity tier and field status.

    Args:
        root_cause_set: Ranked list of root cause dicts from _build_root_cause_set().
        trace_id:       Active trace ID.

    Returns:
        List of recommendation dicts ordered by severity.
    """
    recommendations: List[Dict[str, Any]] = []

    for rc in root_cause_set:
        field    = rc["field"]
        severity = rc["severity"]
        status   = rc["status"]
        val      = rc.get("value")
        bounds   = rc.get("bounds", [None, None])
        dev      = rc.get("worst_deviation_pct", 0.0)
        lo, hi   = bounds[0], bounds[1]

        if status == "MISSING":
            action = (
                f"Provide measured value for '{field}'. "
                "Field is required for axiom evaluation — absence triggers UNDERDETERMINED."
            )
        elif status == "OUT_OF_BOUNDS":
            direction = "above upper bound" if (hi is not None and val is not None and val > hi) else "below lower bound"
            action = (
                f"Field '{field}' is {direction} by {abs(dev):.1f}%. "
                f"Acceptable range: [{lo}, {hi}] {rc.get('unit', '')}. "
                "Investigate process control deviation and re-sample."
            )
        else:
            action = f"Field '{field}' contributed to axiom refusal. Re-verify measurement accuracy."

        recommendations.append({
            "field":       field,
            "severity":    severity,
            "deviation":   dev,
            "action":      action,
            "axioms_affected": rc["axioms_failed"],
        })

        logger.debug(
            "[DFT][RCA_ENGINE_RECOMMENDATION] field=%s severity=%s trace=%s",
            field, severity, trace_id,
        )

    return recommendations
