"""
Module: drift_prediction
Version: 1.0.0
Description: Sovereign OCM V4.1 — Causal Drift Prediction Engine.
             Implements forward causal trajectory projection for Deduction Mode
             DOE branch when refuse_count >= DRIFT_THRESHOLD (3).

Pipeline position: L4-B (called by DeductionEngine when branch == 'DRIFT')

Algorithm (spec/30 §5.2 — Forward Projection):
  1. For each REFUSE axiom, compute current deviation delta_0
  2. Estimate per-cycle drift rate from field bounds violation gradient
  3. Project N steps forward using linear compounding model
  4. At each step, classify axiom status against threshold
  5. Detect cascade: secondary axioms breached by projected field drift
  6. Assign risk horizon (steps until CRITICAL breach)
  7. Classify trajectory: ESCALATING / STABLE / SELF_CORRECTING

Policy:
  - No fallback: incomplete trajectory → E007 → HITL_REQUEST
  - Deduction lock enforced: no G3FP narrative injection
  - Linear model only — no stochastic extrapolation (deterministic guarantee)
  - DFT hooks at every stage (grep [DFT][DRIFT_ENGINE_*])

Error Codes:
  E007  CAUSAL_CHAIN_BROKEN — cannot project trajectory for a refused axiom
"""

import datetime
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
VERDICT_REFUSE          = "REFUSE"
VERDICT_ALLOW           = "ALLOW"
VERDICT_UNDERDETERMINED = "UNDERDETERMINED"

TREND_ESCALATING       = "ESCALATING"
TREND_STABLE           = "STABLE"
TREND_SELF_CORRECTING  = "SELF_CORRECTING"

RISK_CRITICAL  = "CRITICAL"   # Breach within 2 steps
RISK_HIGH      = "HIGH"       # Breach within 3–4 steps
RISK_MODERATE  = "MODERATE"   # Breach within 5+ steps
RISK_LOW       = "LOW"        # No breach projected

DEFAULT_PROJECTION_STEPS = 5
DEFAULT_DRIFT_RATE       = 0.05   # 5% compounding deviation per cycle (conservative)
CRITICAL_DEVIATION_PCT   = 25.0   # Threshold triggering CRITICAL risk label


def _now_iso() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


def _error_packet(code: str, message: str, trace_id: str) -> Dict[str, Any]:
    return {
        "error_code": code,
        "message":    message,
        "trace_id":   trace_id,
        "timestamp":  _now_iso(),
    }


def _risk_label(steps_to_critical: Optional[int]) -> str:
    """Map steps-to-critical to a risk tier label."""
    if steps_to_critical is None:
        return RISK_LOW
    if steps_to_critical <= 2:
        return RISK_CRITICAL
    if steps_to_critical <= 4:
        return RISK_HIGH
    return RISK_MODERATE


def _trend_label(delta_0: float, delta_n: float) -> str:
    """Classify trajectory direction from step-0 to step-N deviation."""
    if delta_n > delta_0 * 1.05:
        return TREND_ESCALATING
    if delta_n < delta_0 * 0.95:
        return TREND_SELF_CORRECTING
    return TREND_STABLE


# ── Per-Axiom Trajectory Projector ───────────────────────────────────────────

def _project_axiom_trajectory(
    axiom_result:    Dict[str, Any],
    axiom_raw:       Dict[str, Any],
    field_values:    Dict[str, float],
    projection_steps: int,
    drift_rate:      float,
    trace_id:        str,
) -> Optional[Dict[str, Any]]:
    """
    Project forward deviation trajectory for a single REFUSE axiom.

    Linear compounding model:
        delta_{t+1} = delta_t * (1 + drift_rate)
        projected_value_{t} = computed_value_0 - (deviation compounding)

    Args:
        axiom_result:     L2 evaluation dict (axiom_id, computed_value, threshold).
        axiom_raw:        Raw axiom JSON dict (contains derivation_formula).
        field_values:     Extracted field dict (field_name → float).
        projection_steps: Number of forward steps to project.
        drift_rate:       Per-step compounding drift rate (e.g. 0.05 = 5%).
        trace_id:         Active trace ID.

    Returns:
        Trajectory dict or None if projection cannot be built.
    """
    axiom_id       = axiom_result["axiom_id"]
    computed_value = axiom_result.get("computed_value")
    threshold      = axiom_result.get("threshold")

    logger.debug(
        "[DFT][DRIFT_ENGINE_PROJECT_START] axiom=%s computed=%.4f threshold=%s trace=%s",
        axiom_id, computed_value or 0.0, threshold, trace_id,
    )

    if computed_value is None or threshold is None:
        logger.error(
            "[DFT][DRIFT_ENGINE_PROJECT_BROKEN] axiom=%s reason=missing_values trace=%s",
            axiom_id, trace_id,
        )
        return None

    # Initial deviation (positive = actual below threshold = under-performing)
    delta_0 = threshold - computed_value  # positive → deficit

    # Build step-by-step trajectory
    steps: List[Dict[str, Any]] = []
    steps_to_critical: Optional[int] = None

    current_value   = computed_value
    current_delta   = delta_0

    for step in range(projection_steps + 1):
        # Compute deviation percentage relative to threshold
        dev_pct = (current_delta / abs(threshold) * 100.0) if threshold != 0 else 0.0

        # Determine step verdict
        step_verdict = VERDICT_ALLOW if current_value >= threshold else VERDICT_REFUSE

        # Classify severity at this step
        if abs(dev_pct) >= CRITICAL_DEVIATION_PCT and steps_to_critical is None:
            steps_to_critical = step

        steps.append({
            "step":          step,
            "projected_value": round(current_value, 6),
            "delta":          round(current_delta, 6),
            "deviation_pct":  round(dev_pct, 4),
            "verdict":        step_verdict,
            "is_critical":    abs(dev_pct) >= CRITICAL_DEVIATION_PCT,
        })

        # Compound drift for next step (deviation grows by drift_rate each cycle)
        current_delta *= (1.0 + drift_rate)
        current_value  = threshold - current_delta

    delta_n  = steps[-1]["delta"]
    trend    = _trend_label(delta_0, delta_n)
    risk     = _risk_label(steps_to_critical)

    # Per-field drift contributions (which fields drive the axiom deviation)
    variables_map       = axiom_raw.get("derivation_formula", {}).get("variables", {})
    field_drift_factors = _compute_field_drift_factors(
        variables_map, field_values, drift_rate, trace_id,
    )

    trajectory = {
        "axiom_id":           axiom_id,
        "axiom_name":         axiom_raw.get("name", ""),
        "subdomain":          axiom_raw.get("subdomain", ""),
        "expression_latex":   axiom_raw.get("expression_latex", ""),
        "initial_value":      round(computed_value, 6),
        "threshold":          round(threshold, 6),
        "initial_deviation":  round(delta_0, 6),
        "drift_rate":         drift_rate,
        "projection_steps":   projection_steps,
        "trajectory_points":  steps,
        "trend":              trend,
        "risk":               risk,
        "steps_to_critical":  steps_to_critical,
        "field_drift_factors": field_drift_factors,
    }

    logger.debug(
        "[DFT][DRIFT_ENGINE_PROJECT_DONE] axiom=%s trend=%s risk=%s steps_to_critical=%s trace=%s",
        axiom_id, trend, risk, steps_to_critical, trace_id,
    )
    return trajectory


def _compute_field_drift_factors(
    variables_map: Dict[str, Any],
    field_values:  Dict[str, float],
    drift_rate:    float,
    trace_id:      str,
) -> List[Dict[str, Any]]:
    """
    Estimate per-field drift contribution to axiom trajectory.

    For each field outside its bounds, computes how many steps until
    the field breaches its own CRITICAL threshold (2× drift from bound).

    Args:
        variables_map: Axiom variables dict from derivation_formula.
        field_values:  Extracted field dict.
        drift_rate:    Per-step compounding drift rate.
        trace_id:      Active trace ID.

    Returns:
        List of field drift factor dicts, sorted by risk severity.
    """
    factors: List[Dict[str, Any]] = []

    for sym_name, var_spec in variables_map.items():
        field_key = var_spec.get("maps_to_field", sym_name)
        bounds    = var_spec.get("bounds", [None, None])
        unit      = var_spec.get("unit", "")
        val       = field_values.get(field_key)

        if val is None:
            factors.append({
                "field":  field_key,
                "symbol": sym_name,
                "unit":   unit,
                "value":  None,
                "status": "MISSING",
                "drift_risk": RISK_CRITICAL,
                "steps_to_cascade": 0,
            })
            continue

        lo, hi = bounds[0], bounds[1]

        # Compute current distance from nearest bound
        if hi is not None and val > hi:
            dist_from_bound = val - hi
            direction = "OVER_UPPER"
        elif lo is not None and val < lo:
            dist_from_bound = lo - val
            direction = "UNDER_LOWER"
        else:
            dist_from_bound = 0.0
            direction = "IN_BOUNDS"

        # Estimate steps until cascade (field reaches 2× current bound violation)
        if dist_from_bound > 0 and drift_rate > 0:
            # Compounding: dist * (1+r)^n >= 2 * dist → n = log(2) / log(1+r)
            import math
            steps_to_cascade = int(math.ceil(math.log(2) / math.log(1 + drift_rate)))
        else:
            steps_to_cascade = None

        factors.append({
            "field":             field_key,
            "symbol":            sym_name,
            "unit":              unit,
            "value":             val,
            "bounds":            bounds,
            "direction":         direction,
            "dist_from_bound":   round(dist_from_bound, 6),
            "drift_risk":        _risk_label(steps_to_cascade),
            "steps_to_cascade":  steps_to_cascade,
        })

    factors.sort(key=lambda f: f.get("steps_to_cascade") or 9999)
    return factors


# ── Cascade Detector ─────────────────────────────────────────────────────────

def _detect_cascades(
    trajectories: List[Dict[str, Any]],
    trace_id:     str,
) -> List[Dict[str, Any]]:
    """
    Identify cascade risk pairs: axioms whose projected drift will cross each
    other's thresholds within the projection window.

    Args:
        trajectories: List of per-axiom trajectory dicts.
        trace_id:     Active trace ID.

    Returns:
        List of cascade event dicts (may be empty).
    """
    cascades: List[Dict[str, Any]] = []

    for i, traj_a in enumerate(trajectories):
        for traj_b in trajectories[i + 1:]:
            # If both ESCALATING and both CRITICAL within window → cascade risk
            if (
                traj_a["trend"] == TREND_ESCALATING
                and traj_b["trend"] == TREND_ESCALATING
                and traj_a["risk"] in (RISK_CRITICAL, RISK_HIGH)
                and traj_b["risk"] in (RISK_CRITICAL, RISK_HIGH)
            ):
                cascade = {
                    "axiom_a":        traj_a["axiom_id"],
                    "axiom_b":        traj_b["axiom_id"],
                    "risk":           RISK_CRITICAL,
                    "description":    (
                        f"Simultaneous ESCALATING drift in '{traj_a['axiom_id']}' "
                        f"and '{traj_b['axiom_id']}' — compounding failure risk."
                    ),
                }
                cascades.append(cascade)
                logger.warning(
                    "[DFT][DRIFT_ENGINE_CASCADE] axiom_a=%s axiom_b=%s trace=%s",
                    traj_a["axiom_id"], traj_b["axiom_id"], trace_id,
                )

    return cascades


# ── Drift Prediction Engine ───────────────────────────────────────────────────

class DriftPredictionEngine:
    """
    Causal Drift Prediction Engine for Sovereign OCM V4.1 Deduction Mode.

    Projects forward deviation trajectories for all REFUSE axioms, detects
    cascade risk pairs, ranks by risk horizon, and emits DRIFT_COMPLETE.

    Wired to DeductionEngine._run_drift() via direct call in Phase 4-C.
    DFT hooks: grep [DFT][DRIFT_ENGINE_*]
    """

    def __init__(
        self,
        bus:              Any,
        registry:         Any,
        projection_steps: int   = DEFAULT_PROJECTION_STEPS,
        drift_rate:       float = DEFAULT_DRIFT_RATE,
    ) -> None:
        """
        Initialise DriftPredictionEngine.

        Args:
            bus:              SovereignBUS instance for event emission.
            registry:         SAARegistry instance for axiom raw data lookup.
            projection_steps: Number of forward steps per trajectory (default 5).
            drift_rate:       Per-step compounding drift rate (default 0.05 = 5%).
        """
        self.bus              = bus
        self.registry         = registry
        self.projection_steps = projection_steps
        self.drift_rate       = drift_rate
        self._register_handlers()
        logger.info(
            "[DFT][DRIFT_ENGINE_INIT] DriftPredictionEngine ready. steps=%d rate=%.2f",
            projection_steps, drift_rate,
        )

    def _register_handlers(self) -> None:
        """Register BUS event listeners."""
        self.bus.on("DRIFT_RUN_REQUEST", self._handle_run_request)

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
        Execute forward causal drift prediction for all REFUSE axioms.

        Args:
            axiom_results: L2 evaluation list from DeductionEngine.
            field_values:  Extracted field dict (field_name → float).
            trace_id:      Active pipeline trace ID.

        Returns:
            Drift prediction output dict with drift_trajectory, cascades, summary.
            On failure: error packet with E007.
        """
        logger.info(
            "[DFT][DRIFT_ENGINE_START] total_axioms=%d trace=%s",
            len(axiom_results), trace_id,
        )

        refused = [r for r in axiom_results if r["verdict"] == VERDICT_REFUSE]

        if not refused:
            logger.info("[DFT][DRIFT_ENGINE_NO_REFUSE] trace=%s", trace_id)
            result = {
                "branch":            "DRIFT",
                "drift_trajectory":  [],
                "cascades":          [],
                "overall_risk":      RISK_LOW,
                "summary":           "No refused axioms — drift prediction not required.",
                "trace_id":          trace_id,
                "timestamp":         _now_iso(),
            }
            await self.bus.emit("DRIFT_COMPLETE", result)
            return result

        # Project trajectory per refused axiom
        trajectories:   List[Dict[str, Any]] = []
        broken_axioms:  List[str]            = []

        for axiom_result in refused:
            axiom_id = axiom_result["axiom_id"]
            saa      = self.registry.get(axiom_id)

            if saa is None:
                logger.warning(
                    "[DFT][DRIFT_ENGINE_SAA_NOT_FOUND] axiom=%s trace=%s",
                    axiom_id, trace_id,
                )
                broken_axioms.append(axiom_id)
                continue

            traj = _project_axiom_trajectory(
                axiom_result     = axiom_result,
                axiom_raw        = saa._raw,
                field_values     = field_values,
                projection_steps = self.projection_steps,
                drift_rate       = self.drift_rate,
                trace_id         = trace_id,
            )
            if traj is None:
                broken_axioms.append(axiom_id)
            else:
                trajectories.append(traj)

        # Broken projections → E007 + HITL escalation
        if broken_axioms:
            logger.error(
                "[DFT][DRIFT_ENGINE_BROKEN] broken=%s trace=%s",
                broken_axioms, trace_id,
            )
            err = _error_packet(
                "E007",
                f"Drift projection broken for axioms: {broken_axioms}",
                trace_id,
            )
            await self.bus.emit("HITL_REQUEST", {"reason": "drift_projection_broken", **err})
            await self.bus.emit("ERROR", err)
            return err

        # Cascade detection
        cascades = _detect_cascades(trajectories, trace_id)

        # Overall risk: worst risk across all trajectories
        risk_order = {RISK_CRITICAL: 4, RISK_HIGH: 3, RISK_MODERATE: 2, RISK_LOW: 1}
        overall_risk = max(
            (t["risk"] for t in trajectories),
            key=lambda r: risk_order.get(r, 0),
            default=RISK_LOW,
        )
        if cascades:
            overall_risk = RISK_CRITICAL  # Any cascade → CRITICAL

        # Sort trajectories: worst risk first
        trajectories.sort(key=lambda t: risk_order.get(t["risk"], 0), reverse=True)

        # Build summary (deterministic — no G3FP injection)
        escalating = [t for t in trajectories if t["trend"] == TREND_ESCALATING]
        summary = (
            f"Drift prediction complete: {len(trajectories)} axiom(s) projected over "
            f"{self.projection_steps} cycle(s). "
            f"{len(escalating)} ESCALATING trajectory(ies). "
            f"Cascade risk pairs: {len(cascades)}. "
            f"Overall risk: {overall_risk}."
        )

        result: Dict[str, Any] = {
            "branch":           "DRIFT",
            "drift_trajectory": trajectories,
            "cascades":         cascades,
            "overall_risk":     overall_risk,
            "refused_axioms":   [r["axiom_id"] for r in refused],
            "broken_axioms":    [],
            "projection_steps": self.projection_steps,
            "drift_rate":       self.drift_rate,
            "summary":          summary,
            "trace_id":         trace_id,
            "timestamp":        _now_iso(),
        }

        # SHA-256 seal
        payload_bytes  = json.dumps(result, sort_keys=True, ensure_ascii=False).encode()
        result["sha256"] = hashlib.sha256(payload_bytes).hexdigest()

        logger.info(
            "[DFT][DRIFT_ENGINE_COMPLETE] trajectories=%d cascades=%d overall_risk=%s sha256=%s trace=%s",
            len(trajectories), len(cascades), overall_risk, result["sha256"][:16], trace_id,
        )
        await self.bus.emit("DRIFT_COMPLETE", result)
        return result
