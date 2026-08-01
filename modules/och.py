"""
Module: och.py
Version: 1.0.0
Description: Dedicated clinical pipeline orchestrator for OCH (Ontology Compliance Healthcare).
             Decouples healthcare calculations, clinical API enrichments (LOINC),
             AlphaFold protein structure mapping, and surgical decision audits
             into an independent, modular SovereignBUS event-driven pipeline.
"""

import logging
import asyncio
import datetime
import json
import hashlib
from typing import Dict, Any, Optional, List

from modules.bus import SovereignBUS
from modules.rca_engine import RCAEngine
from modules.drift_prediction import DriftPredictionEngine
from modules.deduction_engine import (
    _evaluate_sympy,
    _phase_gate,
    _build_audit_packet,
    _error_packet,
    VERDICT_ALLOW,
    VERDICT_REFUSE,
    VERDICT_UNDERDETERMINED,
    DEDUCTION_MODE_TAG,
    _SYMPY_AVAILABLE,
    _trace_id,
)

logger = logging.getLogger(__name__)


class OCHEngine:
    """
    OCH (Ontology Compliance Healthcare) Pipeline Orchestrator.
    Dedicated class for processing healthcare & clinical audit packets, LOINC reference
    range checks, clinical drug interactions/enrichment APIs, and surgical decision audits.
    """

    def __init__(self, bus: SovereignBUS, registry: Any) -> None:
        """Initialise the OCH engine."""
        self.bus          = bus
        self.registry      = registry
        self.rca_engine    = RCAEngine(bus=bus, registry=registry)
        self.drift_engine  = DriftPredictionEngine(bus=bus, registry=registry)
        self._pending_hitl_signals: Dict[str, asyncio.Event] = {}
        self._pending_hitl_responses: Dict[str, Dict[str, Any]] = {}
        self._register_handlers()
        logger.info("[OCH] OCHEngine initialized. Clinical APIs, LOINC & AF_BRIDGE ready.")

    def _register_handlers(self) -> None:
        """Register SovereignBUS event listeners."""
        self.bus.on("och:request", self._handle_och_request)
        self.bus.on("ontology_medical:request", self._handle_och_request)
        self.bus.on("HITL_RESPONSE", self._handle_hitl_response)

    async def _handle_hitl_response(self, message: Dict[str, Any]) -> None:
        """Fires the HITL asyncio.Event to resume suspended pipeline."""
        trace_id = message.get("trace_id")
        if trace_id:
            self._pending_hitl_responses[trace_id] = message.get("payload", {})
            signal = self._pending_hitl_signals.get(trace_id)
            if signal:
                signal.set()
                logger.info(f"[OCHEngine] HITL_RESPONSE signal fired | trace_id={trace_id}")

    async def _handle_och_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """SovereignBUS handler for och:request and ontology_medical:request."""
        trace_id = message.get("trace_id") or _trace_id()
        payload  = message.get("payload", {})
        domain   = payload.get("domain", "HEALTHCARE")
        field_values = payload.get("field_values", {})
        return await self.run(domain=domain, field_values=field_values, trace_id=trace_id)

    async def run(
        self,
        domain:       str,
        field_values: Dict[str, float],
        trace_id:     Optional[str] = None,
        suspend_on_hitl: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute the full L0→L5 OCH compliance pipeline.
        """
        if trace_id is None:
            trace_id = _trace_id()

        # ── L0: SymPy availability guard ─────────────────────────────────────
        logger.info("[OCH][L0_START] domain=%s trace=%s", domain, trace_id)
        if not _SYMPY_AVAILABLE:
            err = _error_packet("E003", "SymPy not available — deduction mode blocked.", trace_id)
            await self.bus.emit("ERROR", err)
            return err

        # ── L1: Lock + Axiom Selection ─────────────────────────────────────
        logger.info("[OCH][L1_LOCK] trace=%s", trace_id)
        await self.bus.emit("DEDUCTION_LOCK_SET", {
            "trace_id": trace_id, "deduction_lock": True, "domain": domain,
        })

        axioms = self.registry.get_by_domain_and_mode(domain=domain, mode=DEDUCTION_MODE_TAG)
        if not axioms:
            logger.warning("[OCH][L1_NO_AXIOMS] domain=%s trace=%s", domain, trace_id)
            err = _error_packet("E003", f"No deduction axioms found for domain '{domain}'.", trace_id)
            await self.bus.emit("HITL_REQUEST", {"reason": "no_axioms", **err})
            return err

        elected_axioms = []
        for axiom in axioms:
            req_vars = [req.get("field").upper() for req in axiom.required_fields if req.get("field")]
            deriv = axiom._raw.get("derivation_formula", {})
            if isinstance(deriv, dict):
                for var in deriv.get("variables", []):
                    req_vars.append(var.upper())
            req_vars = list(set(req_vars))
            if not req_vars:
                elected_axioms.append(axiom)
                continue
            field_keys = {k.upper() for k in field_values.keys()}
            if any(var in field_keys for var in req_vars):
                elected_axioms.append(axiom)
            else:
                logger.info("[OCH][AXIOM_ELECT_SKIP] Skipping axiom %s", axiom.axiom_id)
        axioms = elected_axioms

        logger.info("[OCH][L1_AXIOMS] count=%d domain=%s trace=%s", len(axioms), domain, trace_id)

        # ── L2: SymPy Evaluation ──────────────────────────────────────────────
        logger.info("[OCH][L2_START] axiom_count=%d trace=%s", len(axioms), trace_id)
        axiom_results: List[Dict[str, Any]] = []

        for axiom in axioms:
            result = _evaluate_sympy(axiom, field_values, trace_id)
            axiom_results.append(result)

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
        logger.info("[OCH][L3_START] trace=%s", trace_id)
        gate_result = _phase_gate(axiom_results, trace_id, domain="HEALTHCARE")
        await self.bus.emit("PHASE_GATE_RESULT", {"trace_id": trace_id, **gate_result})

        if gate_result["overall_verdict"] == "HITL_REQUIRED" and suspend_on_hitl:
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
                f"OCH validation failed: {problem_summary}. "
                "Please choose to OVERRIDE and proceed with clinical override context, "
                "or CANCEL to abort and refuse the audit."
            )
            
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
            except Exception as e:
                logger.error("[OCHEngine] Failed to register to hitl store: %s", e)
                
            await self.bus.emit("HITL_REQUEST", {
                "payload":  hitl_request,
                "trace_id": trace_id,
            })
            
            signal = self._pending_hitl_signals.setdefault(trace_id, asyncio.Event())
            try:
                await asyncio.wait_for(signal.wait(), timeout=1.5)
                resp = self._pending_hitl_responses.pop(trace_id, {})
                decision = resp.get("decision", "CANCEL")
            except asyncio.TimeoutError:
                decision = "CANCEL"
            finally:
                self._pending_hitl_signals.pop(trace_id, None)
                
            if decision == "OVERRIDE":
                gate_result["overall_verdict"] = VERDICT_ALLOW
                gate_result["refuse_count"] = 0
                gate_result["underdetermined_count"] = 0
                gate_result["branch"] = "NONE"
                for r in axiom_results:
                    if r["verdict"] in (VERDICT_UNDERDETERMINED, VERDICT_REFUSE):
                        r["verdict"] = VERDICT_ALLOW
            else:
                gate_result["overall_verdict"] = VERDICT_ALLOW
                for r in axiom_results:
                    if r["verdict"] == VERDICT_UNDERDETERMINED:
                        r["verdict"] = VERDICT_REFUSE
                temp_gate = _phase_gate(axiom_results, trace_id, domain="HEALTHCARE")
                gate_result["refuse_count"] = temp_gate["refuse_count"]
                gate_result["underdetermined_count"] = temp_gate["underdetermined_count"]
                gate_result["branch"] = temp_gate["branch"]

        if gate_result["overall_verdict"] == "HITL_REQUIRED" and suspend_on_hitl:
            return {"trace_id": trace_id, "status": "HITL_REQUIRED", "gate": gate_result}

        # ── L4: DOE Branch ────────────────────────────────────────────────────
        branch = gate_result["branch"]
        logger.info("[OCH][L4_BRANCH] branch=%s trace=%s", branch, trace_id)
        await self.bus.emit("DOE_BRANCH_SELECTED", {"trace_id": trace_id, "branch": branch})

        try:
            if branch == "RCA":
                branch_output = await self.rca_engine.run(
                    axiom_results = axiom_results,
                    field_values  = field_values,
                    trace_id      = trace_id,
                )
            elif branch == "DRIFT":
                branch_output = await self.drift_engine.run(
                    axiom_results = axiom_results,
                    field_values  = field_values,
                    trace_id      = trace_id,
                )
            else:
                branch_output = {"branch": "NONE", "detail": "All axioms ALLOW — no remediation required."}
        except Exception as exc:
            logger.error("[OCH][L4_ERROR] branch=%s error=%s trace=%s", branch, exc, trace_id, exc_info=True)
            err = _error_packet("E007", f"DOE branch '{branch}' failed: {exc}", trace_id)
            await self.bus.emit("ERROR", err)
            return err

        # ── L5: Audit Packet ──────────────────────────────────────────────────
        logger.info("[OCH][L5_START] trace=%s", trace_id)
        
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
                    "inputs": r.get("inputs", {}),
                })
                
            xai_narrative = await narrator.narrate(
                solver_results=xai_solver_results,
                mode="och",
                domain=domain,
                overall_verdict=gate_result["overall_verdict"],
                trace_id=trace_id,
            )
        except Exception as e:
            logger.error(f"E003: Failed to generate XAI narrative in OCHEngine: {e}", exc_info=True)

        # ── L5b: AlphaFold Protein Structure + Clinical API Enrichment ────────
        protein_structure_data = []
        clinical_enrichment    = {}
        if field_values:
            try:
                from modules.clinical_apis import enrich_audit_with_clinical_apis, classify_biomarker
                from modules.alphafold_bridge import BIOMARKER_PROTEIN_MAP

                _SENTINEL_KEYS = {"patient_sex", "is_emergency", "surgery_type"}
                _biomarker_fv  = {k: v for k, v in field_values.items() if k not in _SENTINEL_KEYS}

                anomalous_bms = []
                for bm_key, bm_val in _biomarker_fv.items():
                    try:
                        cl = classify_biomarker(bm_key, float(bm_val))
                        if cl.get("status") not in ("normal", "unknown", None):
                            anomalous_bms.append(bm_key)
                    except Exception:
                        pass
                bm_source = anomalous_bms or [k for k in _biomarker_fv if k in BIOMARKER_PROTEIN_MAP]

                try:
                    from modules.alphafold_bridge import build_protein_structure_data
                    if bm_source:
                        protein_structure_data = build_protein_structure_data(bm_source)
                except Exception as af_err:
                    logger.warning("[OCH][AF_BRIDGE] Non-fatal AF: %s", af_err)

                patient_sex = str(field_values.get("patient_sex", "M")).upper()[:1] or "M"
                clinical_enrichment = enrich_audit_with_clinical_apis(
                    field_values           = _biomarker_fv,
                    protein_structure_data = protein_structure_data,
                    sex                    = patient_sex,
                )
                
                if xai_narrative:
                    xai_narrative["loinc_classifications"] = clinical_enrichment.get("biomarker_classifications", {})
                    xai_narrative["api_sources"]           = clinical_enrichment.get("api_sources", [])
                    xai_narrative["drug_interactions"]     = clinical_enrichment.get("drug_interactions", [])
                    xai_narrative["drug_enrichments"]      = clinical_enrichment.get("drug_enrichments", [])

            except Exception as e:
                logger.error("[OCH][E001] ClinicalAPI enrichment failed: %s", e, exc_info=True)

        # ── L5c: Surgical Decision Audit ───────────────────────────────────────
        surgical_audit = {}
        if field_values:
            try:
                from modules.surgical_audit import run_surgical_audit
                is_emergency = bool(field_values.get("is_emergency", False))
                surgery_type = field_values.get("surgery_type") or None
                clean_fv     = {k: v for k, v in field_values.items()
                                if k not in ("is_emergency", "surgery_type", "patient_sex")}
                surgical_audit = run_surgical_audit(
                    field_values  = clean_fv,
                    is_emergency  = is_emergency,
                    surgery_type  = str(surgery_type).upper() if surgery_type else None,
                )
                if xai_narrative:
                    xai_narrative["surgical_audit"] = surgical_audit
            except Exception as e:
                logger.error("[OCH][E001] Surgical audit failed: %s", e, exc_info=True)

        # Assemble and seal L5 audit packet
        audit_packet = _build_audit_packet(
            trace_id      = trace_id,
            domain        = domain,
            axiom_results = axiom_results,
            gate_result   = gate_result,
            branch_output = branch_output,
            field_values  = field_values,
            xai_narrative = xai_narrative,
        )
        audit_packet["protein_structure_data"] = protein_structure_data
        audit_packet["clinical_enrichment"]    = clinical_enrichment
        audit_packet["surgical_audit"]         = surgical_audit
        audit_packet["mode"]                   = "och"

        await self.bus.emit("REPORT_READY", {"trace_id": trace_id, "packet": audit_packet})
        logger.info("[OCH][L5_DONE] trace=%s sha256=%s", trace_id, audit_packet["sha256"][:16])
        return audit_packet
