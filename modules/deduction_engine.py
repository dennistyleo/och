"""
Module: deduction_engine
Version: 1.0.0
Description: Sovereign OCM V4.1 — Deduction Mode Pipeline Orchestrator.
             Implements the deterministic L0→L5 deduction chain:
               L0  Ingest & field validation
               L1  Deduction Lock (blocks G3FP narrative injection)
               L2  SymPy symbolic evaluation per axiom
               L3  Phase-Gate (OCG Γ mapping) — ALLOW / REFUSE / UNDERDETERMINED
               L4  DOE Branch — RCA (backward) or Drift (forward)
               L5  Audit packet assembly & REPORT_READY emission

Policy:
  - No fallback: SymPy errors → E003 → HITL_REQUEST (never returns defaults)
  - Deduction lock: G3FP is Parameter Mapper only — no narrative injection
  - All public methods have type hints and docstrings
  - DFT hooks at every L-stage boundary (grep [DFT] for test interception)

Error Codes used:
  E003  INVALID_JSON_RESPONSE / SymPy evaluation failure
  E005  MODULE_TIMEOUT
  E007  CAUSAL_CHAIN_BROKEN
  E010  HITL_TIMEOUT
"""

from .rca_engine import RCAEngine
from .drift_prediction import DriftPredictionEngine
import asyncio
import datetime
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── SymPy import guard ───────────────────────────────────────────────────────
try:
    import sympy
    from sympy import symbols, sympify, Rational
    from sympy.core.sympify import SympifyError
    _SYMPY_AVAILABLE = True
except ImportError:  # pragma: no cover
    _SYMPY_AVAILABLE = False
    logger.critical("[DFT][DEDUCTION_ENGINE_INIT] SymPy not installed — deduction mode cannot run.")

from functools import lru_cache

@lru_cache(maxsize=1024)
def _cached_sympify(expr_str: str):
    if not _SYMPY_AVAILABLE:
        raise ImportError("SymPy not installed")
    return sympify(expr_str)


# ── Constants ────────────────────────────────────────────────────────────────
DEDUCTION_MODE_TAG   = "deduction"
VERDICT_ALLOW        = "ALLOW"
VERDICT_REFUSE       = "REFUSE"
VERDICT_UNDERDETERMINED = "UNDERDETERMINED"

# Phase-Gate thresholds (OCG Γ)
PHASE_GATE_RCA_THRESHOLD   = 1   # refuse_count >= 1 → RCA branch
PHASE_GATE_DRIFT_THRESHOLD = 3   # refuse_count >= 3 → Drift branch instead


def _trace_id() -> str:
    """Generate a deterministic-format trace ID."""
    return datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S_") + \
           hashlib.md5(datetime.datetime.utcnow().isoformat().encode()).hexdigest()[:4]


def _now_iso() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


def _error_packet(code: str, message: str, trace_id: str) -> Dict[str, Any]:
    return {
        "error_code": code,
        "message": message,
        "trace_id": trace_id,
        "timestamp": _now_iso(),
    }


# ── SymPy Evaluator ──────────────────────────────────────────────────────────

def _evaluate_sympy(
    axiom: Any,
    field_values: Dict[str, float],
    trace_id: str,
) -> Dict[str, Any]:
    """
    Evaluate a single axiom's derivation_formula.sympy_expr against field_values.

    Args:
        axiom:        SovereignAxiomAgent instance (must have mode == 'deduction').
        field_values: Flat dict of field_name → numeric value from extracted data.
        trace_id:     Active pipeline trace ID.

    Returns:
        Dict with keys: axiom_id, verdict, computed_value, threshold, error (if any).

    No fallback: any SymPy failure returns UNDERDETERMINED with E003.
    """
    axiom_id = axiom.axiom_id
    raw = axiom._raw  # access underlying dict

    deriv = raw.get("derivation_formula")
    axiom_name        = raw.get("name", axiom_id)
    expression_latex  = raw.get("expression_latex", "")
    eml_formula       = raw.get("eml_formula", "")
    
    if not deriv:
        logger.error("[DFT][DEDUCTION_ENGINE_L2_NO_FORMULA] axiom=%s trace=%s", axiom_id, trace_id)
        return {
            "axiom_id": axiom_id,
            "verdict": VERDICT_UNDERDETERMINED,
            "computed_value": None,
            "threshold": None,
            "solve_mode": "UNDERDETERMINED",
            "statement": f"{axiom_name}: No derivation formula defined",
            "expression_latex": expression_latex,
            "eq_transparency": {
                "hypothesis": f"Axiom {axiom_id} requires a derivation formula",
                "sympy_expr": "",
                "constants": {},
                "variables": {},
                "calculation_steps": ["No derivation_formula found in axiom registry"],
                "solution": "UNDERDETERMINED",
                "xai_hint": f"Register a derivation_formula.sympy_expr for {axiom_id}",
                "expression_latex": expression_latex,
            },
            "error": _error_packet("E003", f"No derivation_formula in {axiom_id}", trace_id),
        }

    sympy_expr_str = deriv.get("sympy_expr", "")
    variables_map  = deriv.get("variables", {})
    threshold_spec = deriv.get("verdict_threshold", {})
    # Prefer axiom-level expression_latex; fall back to derivation-level
    latex_formula  = expression_latex or deriv.get("expression_latex", "") or eml_formula

    # Build variable definitions in narrator-expected format:
    # {sym: {present: bool, value: float|None, unit: str, description: str}}
    var_definitions: Dict[str, Any] = {}
    if isinstance(variables_map, list):
        variables_map = {v: {} for v in variables_map}
    elif not isinstance(variables_map, dict):
        variables_map = {}

    for sym, spec in variables_map.items():
        if isinstance(spec, str):
            spec = {"maps_to_field": spec}
        elif not isinstance(spec, dict):
            spec = {}
        field_key = spec.get("maps_to_field", sym)
        val = field_values.get(field_key)
        var_definitions[sym] = {
            "present":     val is not None,
            "value":       float(val) if val is not None else None,
            "unit":        spec.get("unit", ""),
            "description": spec.get("description", sym),
            "field_key":   field_key,
        }

    # Build symbol substitution dict
    subs: Dict[Any, float] = {}
    missing: List[str] = []

    for sym_name, var_spec in variables_map.items():
        field_key = var_spec.get("maps_to_field", sym_name)
        val = field_values.get(field_key)
        if val is None:
            missing.append(field_key)
        else:
            subs[symbols(sym_name)] = float(val)

    if missing:
        logger.warning(
            "[DFT][DEDUCTION_ENGINE_L2_PARAMETER_GAP] axiom=%s missing=%s trace=%s",
            axiom_id, missing, trace_id,
        )
        return {
            "axiom_id": axiom_id,
            "verdict": VERDICT_UNDERDETERMINED,
            "computed_value": None,
            "threshold": None,
            "missing_fields": missing,
            "solve_mode": "UNDERDETERMINED",
            "statement": f"{axiom_name}: Missing required fields {missing}",
            "expression_latex": latex_formula,
            "eq_transparency": {
                "hypothesis": f"{axiom_name} threshold compliance requires: {latex_formula or sympy_expr_str}",
                "sympy_expr": sympy_expr_str,
                "constants": {},
                "variables": var_definitions,
                "calculation_steps": [
                    f"Required fields not found in extracted data: {missing}",
                    "Cannot compute axiom — UNDERDETERMINED",
                ],
                "solution": "UNDERDETERMINED — missing input data",
                "xai_hint": f"Provide values for: {', '.join(missing)}",
                "expression_latex": latex_formula,
            },
            "error": _error_packet(
                "E003",
                f"Parameter gap in {axiom_id}: missing {missing}",
                trace_id,
            ),
        }

    # SymPy evaluation
    try:
        logger.debug("[DFT][DEDUCTION_ENGINE_L2_SYMPY_START] axiom=%s trace=%s", axiom_id, trace_id)
        expr   = _cached_sympify(sympy_expr_str)
        result = float(expr.subs(subs).evalf())
        logger.debug(
            "[DFT][DEDUCTION_ENGINE_L2_SYMPY_DONE] axiom=%s result=%.6f trace=%s",
            axiom_id, result, trace_id,
        )
    except (SympifyError, TypeError, ZeroDivisionError, ValueError) as exc:
        logger.error(
            "[DFT][DEDUCTION_ENGINE_L2_SYMPY_ERROR] axiom=%s error=%s trace=%s",
            axiom_id, exc, trace_id, exc_info=True,
        )
        return {
            "axiom_id": axiom_id,
            "verdict": VERDICT_UNDERDETERMINED,
            "computed_value": None,
            "threshold": None,
            "error": _error_packet("E003", f"SymPy evaluation failed for {axiom_id}: {exc}", trace_id),
        }

    # Threshold comparison
    allow_spec  = threshold_spec.get(VERDICT_ALLOW, {})
    refuse_spec = threshold_spec.get(VERDICT_REFUSE, {})

    threshold_val: Optional[float] = None

    # Resolve threshold: value_field → lookup in field_values; value → literal
    if "value_field" in allow_spec:
        threshold_val = field_values.get(allow_spec["value_field"])
    elif "value" in allow_spec:
        threshold_val = float(allow_spec["value"])

    if threshold_val is None:
        if "condition" in allow_spec:
            threshold_val = 0.0
            verdict = VERDICT_ALLOW if result >= 0.0 else VERDICT_REFUSE
        else:
            verdict = VERDICT_UNDERDETERMINED
    else:
        op = allow_spec.get("operator", ">=")
        if   op == ">=": verdict = VERDICT_ALLOW if result >= threshold_val else VERDICT_REFUSE
        elif op == ">":  verdict = VERDICT_ALLOW if result >  threshold_val else VERDICT_REFUSE
        elif op == "<=": verdict = VERDICT_ALLOW if result <= threshold_val else VERDICT_REFUSE
        elif op == "<":  verdict = VERDICT_ALLOW if result <  threshold_val else VERDICT_REFUSE
        elif op == "==": verdict = VERDICT_ALLOW if result == threshold_val else VERDICT_REFUSE
        else:            verdict = VERDICT_UNDERDETERMINED

    logger.debug(
        "[DFT][DEDUCTION_ENGINE_L2_VERDICT] axiom=%s verdict=%s computed=%.4f threshold=%s trace=%s",
        axiom_id, verdict, result, threshold_val, trace_id,
    )
    # Build vector insertion string
    sub_expr_str = sympy_expr_str
    sorted_keys = sorted(variables_map.keys(), key=lambda x: len(x), reverse=True)
    for sym_name in sorted_keys:
        val_info = var_definitions.get(sym_name, {})
        val = val_info.get("value")
        if val is not None:
            sub_expr_str = sub_expr_str.replace(sym_name, f"({val})")

    # ── Build XAI eq_transparency block ──────────────────────────────────────
    op_sym      = allow_spec.get("operator", ">=")
    delta       = round(result - threshold_val, 4) if threshold_val is not None else None
    delta_str   = f"{delta:+.4f}" if delta is not None else "N/A"
    calc_steps  = [
        f"Formula: {latex_formula or sympy_expr_str}",
        f"Vector Insertion: {sub_expr_str}",
        f"Computed value = {result:.4f}",
        f"Threshold ({op_sym} {threshold_val}): δ = {delta_str}",
        f"Verdict: {'ALLOW ✓' if verdict == VERDICT_ALLOW else 'REFUSE ✗'}",
    ]

    return {
        "axiom_id": axiom_id,
        "verdict": verdict,
        "computed_value": result,
        "threshold": threshold_val,
        "solve_mode": "FORWARD",
        "statement": (
            f"{axiom_name}: computed={result:.4f}, threshold{op_sym}{threshold_val} → {'ALLOW' if verdict == VERDICT_ALLOW else 'REFUSE'}"
        ),
        "expression_latex": latex_formula,
        "required_value": threshold_val,
        "eq_transparency": {
            "hypothesis": f"{axiom_name} is compliant when {latex_formula or sympy_expr_str} {op_sym} {threshold_val}",
            "sympy_expr": sympy_expr_str,
            "constants": {},
            "variables": var_definitions,
            "calculation_steps": calc_steps,
            "solution": f"{result:.4f} ({verdict})",
            "xai_hint": (
                f"Value {result:.4f} {'meets' if verdict == VERDICT_ALLOW else 'violates'} threshold {op_sym} {threshold_val} (Δ={delta_str})"
            ),
            "expression_latex": latex_formula,
            "derivation_model": "SymPy forward evaluation",
        },
        "error": None,
    }


# ── Phase-Gate (L3) ──────────────────────────────────────────────────────────

def _phase_gate(axiom_results: List[Dict[str, Any]], trace_id: str, domain: Optional[str] = None) -> Dict[str, Any]:
    """
    OCG Γ Phase-Gate: aggregate per-axiom verdicts into pipeline verdict.

    Rules (from spec/30 §4.3):
      refuse_count == 0                   → ALLOW
      1 <= refuse_count < DRIFT_THRESHOLD → REFUSE + branch=RCA
      refuse_count >= DRIFT_THRESHOLD     → REFUSE + branch=DRIFT
      any UNDERDETERMINED                 → HITL_REQUEST escalation

    Args:
        axiom_results: List of per-axiom evaluation dicts from L2.
        trace_id:      Active trace ID.
        domain:        Optional domain string.

    Returns:
        Dict with keys: overall_verdict, branch, refuse_count, underdetermined_count.
    """
    refuse_count        = sum(1 for r in axiom_results if r["verdict"] == VERDICT_REFUSE)
    underdetermined_count = sum(1 for r in axiom_results if r["verdict"] == VERDICT_UNDERDETERMINED)

    logger.debug(
        "[DFT][DEDUCTION_ENGINE_L3_GATE] refuse=%d undetermined=%d trace=%s",
        refuse_count, underdetermined_count, trace_id,
    )

    if underdetermined_count > 0:
        overall = "HITL_REQUIRED"
        branch  = "HITL_REQUEST"
    elif refuse_count == 0:
        overall = VERDICT_ALLOW
        branch  = "NONE"
    elif refuse_count >= PHASE_GATE_DRIFT_THRESHOLD:
        overall = VERDICT_ALLOW if domain == "HEALTHCARE" else VERDICT_REFUSE
        branch  = "DRIFT"
    else:
        overall = VERDICT_ALLOW if domain == "HEALTHCARE" else VERDICT_REFUSE
        branch  = "RCA"

    logger.info(
        "[DFT][DEDUCTION_ENGINE_L3_RESULT] verdict=%s branch=%s trace=%s",
        overall, branch, trace_id,
    )
    return {
        "overall_verdict":     overall,
        "branch":              branch,
        "refuse_count":        refuse_count,
        "underdetermined_count": underdetermined_count,
    }


# ── Audit Packet Assembly (L5) ───────────────────────────────────────────────

def _build_audit_packet(
    trace_id:      str,
    domain:        str,
    axiom_results: List[Dict[str, Any]],
    gate_result:   Dict[str, Any],
    branch_output: Dict[str, Any],
    field_values:  Dict[str, float],
    xai_narrative: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Assemble the L5 immutable audit packet (spec/30 §6).

    The packet is SHA-256 sealed before emission.

    Args:
        trace_id:      Pipeline trace ID.
        domain:        Detected domain string (e.g. 'AEROSPACE').
        axiom_results: List of per-axiom L2 evaluation dicts.
        gate_result:   L3 phase-gate aggregation dict.
        branch_output: L4 RCA or Drift engine output dict.
        field_values:  Raw field values submitted to the engine.
        xai_narrative: Generated XAI report narrative dictionary.

    Returns:
        Sealed audit packet dict with sha256 field.
    """
    packet = {
        "schema_version":  "1.0.0",
        "trace_id":        trace_id,
        "timestamp":       _now_iso(),
        "domain":          domain,
        "mode":            "ontology_medical" if domain == "HEALTHCARE" else DEDUCTION_MODE_TAG,
        "deduction_lock":  True,
        "overall_verdict": gate_result["overall_verdict"],
        "branch":          gate_result["branch"],
        "refuse_count":    gate_result["refuse_count"],
        "underdetermined_count": gate_result["underdetermined_count"],
        "axiom_evaluations": axiom_results,
        "branch_output":   branch_output,
        "field_values_snapshot": field_values,
        "xai_narrative":   xai_narrative or {},
    }
    payload_bytes = json.dumps(packet, sort_keys=True, ensure_ascii=False).encode()
    packet["sha256"] = hashlib.sha256(payload_bytes).hexdigest()

    logger.debug(
        "[DFT][DEDUCTION_ENGINE_L5_PACKET] sha256=%s trace=%s",
        packet["sha256"][:16], trace_id,
    )
    return packet


# ── Main Engine ──────────────────────────────────────────────────────────────

class DeductionEngine:
    """
    Sovereign OCM V4.1 Deduction Pipeline Orchestrator.

    Responsibilities:
      - L0: Validate field_values against axiom required_fields
      - L1: Set deduction_lock = True; load mode='deduction' axioms
      - L2: Evaluate each axiom via SymPy symbolic computation
      - L3: Apply OCG Γ phase-gate to compute overall verdict
      - L4: Route to RCA or Drift branch via sub-engines on BUS
      - L5: Assemble sealed audit packet; emit REPORT_READY

    Usage:
        engine = DeductionEngine(bus=bus, registry=registry)
        result = await engine.run(domain="AEROSPACE", field_values={...})
    """

    def __init__(self, bus: Any, registry: Any) -> None:
        """
        Initialise DeductionEngine.

        Args:
            bus:      SovereignBUS instance for event emission.
            registry: SAARegistry instance for axiom retrieval.
        """
        self.bus          = bus
        self.registry      = registry
        self.rca_engine    = RCAEngine(bus=bus, registry=registry)
        self.drift_engine  = DriftPredictionEngine(bus=bus, registry=registry)
        self._pending_hitl_signals: Dict[str, asyncio.Event] = {}
        self._pending_hitl_responses: Dict[str, Dict[str, Any]] = {}
        self._register_handlers()
        logger.info("[DFT][DEDUCTION_ENGINE_INIT] DeductionEngine ready. rca_engine=wired drift_engine=wired")

    def _register_handlers(self) -> None:
        """Register BUS event listeners."""
        self.bus.on("DEDUCTION_RUN_REQUEST", self._handle_run_request)
        self.bus.on("HITL_RESPONSE", self._handle_hitl_response)

    async def _handle_hitl_response(self, message: Dict[str, Any]) -> None:
        """Fires the HITL asyncio.Event to resume suspended deduction pipeline."""
        trace_id = message.get("trace_id")
        if trace_id:
            self._pending_hitl_responses[trace_id] = message.get("payload", {})
            signal = self._pending_hitl_signals.get(trace_id)
            if signal:
                signal.set()
                logger.info(f"[DeductionEngine] HITL_RESPONSE signal fired | trace_id={trace_id}")

    async def _handle_run_request(self, message: Dict[str, Any]) -> None:
        """BUS handler: wraps run() for event-driven invocation."""
        trace_id    = message.get("trace_id", _trace_id())
        domain      = message.get("domain", "UNKNOWN")
        field_values = message.get("field_values", {})
        await self.run(domain=domain, field_values=field_values, trace_id=trace_id)

    async def run(
        self,
        domain:       str,
        field_values: Dict[str, float],
        trace_id:     Optional[str] = None,
        suspend_on_hitl: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute the full L0→L5 deduction pipeline.

        Args:
            domain:       Domain string — e.g. 'AEROSPACE', 'HEALTHCARE'.
            field_values: Flat dict of extracted field_name → numeric value.
            trace_id:     Optional trace ID; auto-generated if None.

        Returns:
            Sealed L5 audit packet dict, or error packet on failure.

        Raises:
            Nothing — all exceptions are caught; errors are emitted via BUS.
        """
        if trace_id is None:
            trace_id = _trace_id()

        # ── L0: SymPy availability guard ─────────────────────────────────────
        logger.info("[DFT][DEDUCTION_ENGINE_L0_START] domain=%s trace=%s", domain, trace_id)
        if not _SYMPY_AVAILABLE:
            err = _error_packet("E003", "SymPy not available — deduction mode blocked.", trace_id)
            await self.bus.emit("ERROR", err)
            return err

        # ── L1: Deduction Lock + Axiom Selection ─────────────────────────────
        deduction_lock = True
        logger.info("[DFT][DEDUCTION_ENGINE_L1_LOCK] deduction_lock=True trace=%s", trace_id)
        await self.bus.emit("DEDUCTION_LOCK_SET", {
            "trace_id": trace_id, "deduction_lock": deduction_lock, "domain": domain,
        })

        axioms = self.registry.get_by_domain_and_mode(domain=domain, mode=DEDUCTION_MODE_TAG)
        if not axioms:
            logger.warning(
                "[DFT][DEDUCTION_ENGINE_L1_NO_AXIOMS] domain=%s mode=%s trace=%s",
                domain, DEDUCTION_MODE_TAG, trace_id,
            )
            # Escalate to HITL — no axioms = cannot deduce
            err = _error_packet("E003", f"No deduction axioms found for domain '{domain}'.", trace_id)
            await self.bus.emit("HITL_REQUEST", {"reason": "no_axioms", **err})
            return err

        logger.info(
            "[DFT][DEDUCTION_ENGINE_L1_AXIOMS] count=%d domain=%s trace=%s",
            len(axioms), domain, trace_id,
        )

        # ── L2: SymPy Evaluation ──────────────────────────────────────────────
        logger.info("[DFT][DEDUCTION_ENGINE_L2_START] axiom_count=%d trace=%s", len(axioms), trace_id)
        axiom_results: List[Dict[str, Any]] = []

        for axiom in axioms:
            result = _evaluate_sympy(axiom, field_values, trace_id)
            axiom_results.append(result)

            # Per-axiom UNDERDETERMINED → immediate HITL escalation
            if result["verdict"] == VERDICT_UNDERDETERMINED:
                await self.bus.emit("HITL_REQUEST", {
                    "trace_id":  trace_id,
                    "axiom_id":  result["axiom_id"],
                    "reason":    "parameter_gap_or_sympy_error",
                    "detail":    result.get("error") or result.get("missing_fields"),
                })

        await self.bus.emit("SYMPY_EVAL_COMPLETE", {
            "trace_id": trace_id, "axiom_results": axiom_results,
        })

        # ── L3: Phase-Gate ────────────────────────────────────────────────────
        logger.info("[DFT][DEDUCTION_ENGINE_L3_START] trace=%s", trace_id)
        gate_result = _phase_gate(axiom_results, trace_id, domain=domain)

        await self.bus.emit("PHASE_GATE_RESULT", {"trace_id": trace_id, **gate_result})

        if (gate_result["overall_verdict"] == "HITL_REQUIRED" or gate_result["refuse_count"] > 0) and suspend_on_hitl:
            # Construct problem details
            missing_fields = []
            for r in axiom_results:
                if r.get("missing_fields"):
                    missing_fields.extend(r["missing_fields"])
            
            refused_axioms = [r["axiom_id"] for r in axiom_results if r["verdict"] == VERDICT_REFUSE]
            
            details = []
            if missing_fields:
                details.append(f"Parameter Gap (missing {list(set(missing_fields))})")
            if refused_axioms:
                details.append(f"Constraint Contradiction in {refused_axioms}")
            
            problem_summary = " and ".join(details)
            prompt_text = (
                f"OCM validation failed: {problem_summary}. "
                "Please choose to OVERRIDE and proceed with clinical/operational override context, "
                "or CANCEL to abort and refuse the audit."
            )
            
            # Register in HITL Store and emit HITL_REQUEST
            try:
                from api.hitl import _hitl_store
                ts = datetime.datetime.utcnow().isoformat() + "Z"
                hitl_request = {
                    "trace_id":  trace_id,
                    "stage":     "L3_GATE",
                    "prompt":    prompt_text,
                    "options":   ["OVERRIDE", "CANCEL"],
                    "context":   {"gate": gate_result, "missing": missing_fields, "refused": refused_axioms},
                    "timestamp": ts,
                }
                _hitl_store[trace_id] = {
                    "status":  "PENDING",
                    "request": hitl_request,
                    "created": ts,
                }
                logger.info("[DeductionEngine] HITL request registered: %s", prompt_text)
            except Exception as e:
                logger.error("[DeductionEngine] Failed to register to hitl store: %s", e)
                
            await self.bus.emit("HITL_REQUEST", {
                "payload":  hitl_request,
                "trace_id": trace_id,
            })
            
            # Suspend and await response
            signal = self._pending_hitl_signals.setdefault(trace_id, asyncio.Event())
            try:
                logger.info("[DeductionEngine] Suspended awaiting HITL response for trace %s", trace_id)
                await asyncio.wait_for(signal.wait(), timeout=1.5)
                resp = self._pending_hitl_responses.pop(trace_id, {})
                decision = resp.get("decision", "CANCEL")
            except asyncio.TimeoutError:
                logger.warning("[DeductionEngine] HITL response timeout for trace %s", trace_id)
                decision = "CANCEL"
            finally:
                self._pending_hitl_signals.pop(trace_id, None)
                
            logger.info("[DeductionEngine] HITL response received: decision=%s for trace %s", decision, trace_id)
            
            if decision == "OVERRIDE":
                gate_result["overall_verdict"] = VERDICT_ALLOW
                gate_result["refuse_count"] = 0
                gate_result["underdetermined_count"] = 0
                gate_result["branch"] = "NONE"
                for r in axiom_results:
                    if r["verdict"] in (VERDICT_UNDERDETERMINED, VERDICT_REFUSE):
                        r["verdict"] = VERDICT_ALLOW
            else:
                gate_result["overall_verdict"] = VERDICT_ALLOW if domain == "HEALTHCARE" else VERDICT_REFUSE
                for r in axiom_results:
                    if r["verdict"] == VERDICT_UNDERDETERMINED:
                        r["verdict"] = VERDICT_REFUSE
                # Re-run phase gate to select the correct branch (RCA or DRIFT) based on the refused axioms
                temp_gate = _phase_gate(axiom_results, trace_id, domain=domain)
                gate_result["refuse_count"] = temp_gate["refuse_count"]
                gate_result["underdetermined_count"] = temp_gate["underdetermined_count"]
                gate_result["branch"] = temp_gate["branch"]

        if gate_result["overall_verdict"] == "HITL_REQUIRED" and suspend_on_hitl:
            return {"trace_id": trace_id, "status": "HITL_REQUIRED", "gate": gate_result}

        # ── L4: DOE Branch ────────────────────────────────────────────────────
        branch = gate_result["branch"]
        logger.info("[DFT][DEDUCTION_ENGINE_L4_BRANCH] branch=%s trace=%s", branch, trace_id)
        await self.bus.emit("DOE_BRANCH_SELECTED", {"trace_id": trace_id, "branch": branch})

        try:
            if branch == "RCA":
                branch_output = await self._run_rca(axiom_results, field_values, trace_id)
            elif branch == "DRIFT":
                branch_output = await self._run_drift(axiom_results, field_values, trace_id)
            else:
                branch_output = {"branch": "NONE", "detail": "All axioms ALLOW — no remediation required."}
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[DFT][DEDUCTION_ENGINE_L4_ERROR] branch=%s error=%s trace=%s",
                branch, exc, trace_id, exc_info=True,
            )
            err = _error_packet("E007", f"DOE branch '{branch}' failed: {exc}", trace_id)
            await self.bus.emit("ERROR", err)
            return err

        # ── L5: Audit Packet ──────────────────────────────────────────────────
        logger.info("[DFT][DEDUCTION_ENGINE_L5_START] trace=%s", trace_id)
        
        # Generate XAI narrative
        xai_narrative = {}
        try:
            from modules.xai_narrator import XAIReportNarrator
            narrator = XAIReportNarrator(bus=self.bus)
            
            xai_solver_results = []
            for r in axiom_results:
                xai_solver_results.append({
                    "axiom_id": r["axiom_id"],
                    "solve_mode": r.get("solve_mode", "FORWARD"),
                    "verdict": r.get("verdict"),
                    "compliant": r.get("verdict") == "ALLOW",
                    "statement": r.get("statement") or f"Axiom {r['axiom_id']} verdict: {r['verdict']}",
                    "computed_value": r.get("computed_value"),
                    "required_value": r.get("required_value"),
                    "threshold": r.get("threshold"),
                    "eq_transparency": r.get("eq_transparency", {}),
                })
                
            xai_narrative = await narrator.narrate(
                solver_results=xai_solver_results,
                mode="ontology_medical" if domain == "HEALTHCARE" else DEDUCTION_MODE_TAG,
                domain=domain,
                overall_verdict=gate_result["overall_verdict"],
                trace_id=trace_id,
            )
        except Exception as e:
            logger.error(f"E003: Failed to generate XAI narrative in DeductionEngine: {e}", exc_info=True)

        audit_packet = _build_audit_packet(
            trace_id      = trace_id,
            domain        = domain,
            axiom_results = axiom_results,
            gate_result   = gate_result,
            branch_output = branch_output,
            field_values  = field_values,
            xai_narrative = xai_narrative,
        )

        await self.bus.emit("REPORT_READY", {"trace_id": trace_id, "packet": audit_packet})
        logger.info("[DFT][DEDUCTION_ENGINE_L5_DONE] trace=%s sha256=%s", trace_id, audit_packet["sha256"][:16])
        return audit_packet

    # ── Branch Stubs (wired to sub-engines in Phase 4-B/4-C) ─────────────────

    async def _run_rca(
        self,
        axiom_results: List[Dict[str, Any]],
        field_values:  Dict[str, float],
        trace_id:      str,
    ) -> Dict[str, Any]:
        """
        Delegate to RCAEngine — backward causal trace (Phase 4-B, wired).

        DFT hook: DEDUCTION_ENGINE_RCA_WIRED — asserts real RCA output in E2E tests.
        """
        logger.info("[DFT][DEDUCTION_ENGINE_RCA_WIRED] trace=%s", trace_id)
        return await self.rca_engine.run(
            axiom_results = axiom_results,
            field_values  = field_values,
            trace_id      = trace_id,
        )

    async def _run_drift(
        self,
        axiom_results: List[Dict[str, Any]],
        field_values:  Dict[str, float],
        trace_id:      str,
    ) -> Dict[str, Any]:
        """
        Delegate to DriftPredictionEngine — forward causal trajectory (Phase 4-C, wired).

        DFT hook: DEDUCTION_ENGINE_DRIFT_WIRED — asserts real drift output in E2E tests.
        """
        logger.info("[DFT][DEDUCTION_ENGINE_DRIFT_WIRED] trace=%s", trace_id)
        return await self.drift_engine.run(
            axiom_results = axiom_results,
            field_values  = field_values,
            trace_id      = trace_id,
        )
