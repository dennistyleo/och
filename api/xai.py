"""
Module: api.xai
Version: 1.0.0
Description: XAI Tutor API — Sovereign Matrix Explainability Layer.
             POST /api/xai/explain — LLM-backed explanation of GNN node anomalies.
             POST /api/xai/audit_narrative — Full evaluation narrative for audit report.
             Uses G3FP (Gemini 3 Flash Preview) singleton for generation.
"""

import logging
import os
import datetime
from typing import Any, Dict, List, Optional

from google import genai
from flask import Blueprint, jsonify, request, Response, stream_with_context

logger = logging.getLogger(__name__)

xai_bp = Blueprint("xai_bp", __name__)

# ─── G3FP Model Configuration ──────────────────────────────────────────────
XAI_MODEL = os.environ.get("G3FP_MODEL_NAME", "gemini-3-flash-preview")
XAI_TEMP  = 0.3


def _get_g3fp() -> genai.Client:
    """Return app-level G3FP singleton (zero latency). Falls back for tests."""
    try:
        from flask import current_app
        client = getattr(current_app._get_current_object(), "G3FP_CLIENT", None)
        if client is not None:
            return client
    except RuntimeError:
        pass
    key = os.environ.get("SOVEREIGN_GEMINI_API_KEY")
    if not key:
        raise EnvironmentError("E001: SOVEREIGN_GEMINI_API_KEY not set")
    return genai.Client(api_key=key)


def _build_xai_explain_prompt(
    question: str,
    context: Dict[str, Any],
    history: List[Dict[str, str]],
) -> str:
    """
    Build the XAI tutor prompt grounded in the node's axiom data.
    The tutor explains what a GNN node anomaly means in clinical/domain terms.
    """
    node_id         = context.get("node_id", "Unknown")
    label           = context.get("label") or node_id
    disposition     = context.get("saa_disposition", "PASS")
    xai_explanation = context.get("xai_explanation", "")
    delta_pct       = context.get("delta_pct", 0)
    extracted_val   = context.get("extracted_value", "—")
    recomputed_val  = context.get("recomputed_value", "—")
    formula         = context.get("formula", "—")
    snippet         = context.get("snippet", "")
    evidence_tag    = context.get("evidence_tag", "")

    # Build disposition severity explanation
    disp_map = {
        "FLAG_TAMPER":    "🔴 CRITICAL — data integrity violation detected",
        "AUTO_OVERWRITE": "🟠 HIGH — automatic correction applied due to threshold breach",
        "HITL_ESCALATE":  "🟣 ESCALATED — requires human-in-the-loop review",
        "PASS":           "🟢 PASS — within acceptable axiom bounds",
    }
    disp_desc = disp_map.get(disposition, disposition)

    history_lines = ""
    if history:
        history_lines = "\n".join(
            f"  [{h.get('role','?').upper()}]: {h.get('text','')}"
            for h in history[-6:]
        )

    return f"""You are the XAI Tutor for the Sovereign OCM system — Ontology Compliance Monitor.
You explain GNN (Graph Neural Network) node anomalies and axiom evaluation results to medical/domain professionals.
You MUST reply ONLY in English. Do NOT use Chinese under any circumstances.
You are precise, clinical, and grounded in the evidence. No generic AI disclaimers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NODE BEING ANALYSED:
  Node ID / Label: {label} ({node_id})
  SAA Disposition: {disp_desc}
  Delta (deviation): {delta_pct:.2f}% from expected
  Extracted value:  {extracted_val}
  Recomputed value: {recomputed_val}
  Axiom formula:    {formula}
  XAI Explanation:  {xai_explanation}
  Evidence snippet: {snippet or '(none provided)'}
  Evidence tag:     {evidence_tag or '(none)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONVERSATION HISTORY:
{history_lines or '  (none — first turn)'}

USER'S QUESTION:
{question}

YOUR TASK:
1. Answer the user's question directly using the node data above.
2. Explain what the disposition ({disposition}) means for this specific biomarker/parameter.
3. If the delta > 5%, explain the clinical/domain significance of this deviation.
4. Reference the axiom formula if relevant to the question.
5. Keep response focused (3-5 sentences max unless a detailed breakdown is asked).
6. Do NOT say "As an AI" or similar disclaimers.
7. Do NOT use Chinese or mix languages.

Respond now as the XAI Tutor:"""




def _build_audit_narrative_prompt(
    filename: str,
    domain: str,
    elected: list,
    candidates: list,
    standby: list,
    mode: str,
    saa_results: Optional[list],
    g3fp_summary: Optional[str],
) -> str:
    """
    Build a sophisticated doctor-lens XAI narrative for the audit report.
    Each elected axiom gets its own clinical finding paragraph.
    """
    elected_count   = len(elected)
    candidate_count = len(candidates)
    standby_count   = len(standby)
    total           = elected_count + candidate_count + standby_count
    ts              = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # Build per-axiom detail blocks for the prompt
    axiom_detail_lines = ""
    for i, ax in enumerate(elected[:12], 1):
        ax_id     = ax.get("id") or ax.get("axiom_id") or f"AX-{i}"
        ax_name   = ax.get("name") or ax.get("description") or "Unknown axiom"
        ax_score  = ax.get("score") or ax.get("relevance_score") or ax.get("confidence") or "—"
        ax_cat    = ax.get("category") or ax.get("domain") or domain
        ax_form   = ax.get("formula") or ax.get("expression") or ""
        ax_comp   = ax.get("computed") or ax.get("computed_value") or ""
        ax_thr    = ax.get("threshold") or ax.get("threshold_value") or ""
        ax_disp   = ax.get("disposition") or "PASS"
        ax_sev    = ax.get("severity") or "MEDIUM"
        axiom_detail_lines += (
            f"  AXIOM {i}: [{ax_id}] {ax_name}\n"
            f"    Category: {ax_cat} | Severity: {ax_sev}\n"
            f"    Formula/Reference: {ax_form or 'N/A'}\n"
            f"    Computed Value: {ax_comp or 'extracted from document'}\n"
            f"    Threshold: {ax_thr or 'per clinical guideline'}\n"
            f"    SAA Disposition: {ax_disp} | Score: {ax_score}\n\n"
        )

    # Build SAA results detail
    saa_detail = ""
    pass_count = flag_count = hitl_count = overwrite_count = 0
    flagged_axioms = []
    if saa_results:
        pass_count      = sum(1 for r in saa_results if r.get("disposition") == "PASS")
        flag_count      = sum(1 for r in saa_results if r.get("disposition") == "FLAG_TAMPER")
        hitl_count      = sum(1 for r in saa_results if r.get("disposition") == "HITL_ESCALATE")
        overwrite_count = sum(1 for r in saa_results if r.get("disposition") == "AUTO_OVERWRITE")
        flagged_axioms  = [
            r.get("axiom_id") or r.get("id") or "?"
            for r in saa_results
            if r.get("disposition") in ("FLAG_TAMPER", "HITL_ESCALATE")
        ]
        saa_detail = (
            f"  PASS: {pass_count} | FLAG_TAMPER: {flag_count} | "
            f"AUTO_OVERWRITE: {overwrite_count} | HITL_ESCALATE: {hitl_count}\n"
            + (f"  Flagged axioms: {', '.join(flagged_axioms)}\n" if flagged_axioms else "")
        )

    return f"""You are OCM — Ontology Compliance Monitor, acting as a senior clinical data scientist and physician-auditor.
Language: English ONLY. No Chinese. No AI disclaimers. No filler phrases like "certainly" or "of course".
Write with the authority and precision of a board-certified physician reviewing a laboratory report.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVALUATION RECORD:
  Document    : {filename}
  Domain      : {domain}
  Audit Mode  : {mode.upper()}
  Generated   : {ts}
  Ontology    : Sovereign OCM v4.1 (Gemini 3 Flash Preview)

AXIOM ELECTION RESULTS:
  Total in Registry : {total}
  ✅ Elected (active axioms applied to this document) : {elected_count}
  🔶 Candidate (partial match, reviewed but not binding): {candidate_count}
  ⬛ Standby (not applicable to this document)         : {standby_count}

ELECTED AXIOM DETAIL:
{axiom_detail_lines or '  (No axioms elected — document may be outside registered domains)'}
SAA THRESHOLD VERIFICATION:
{saa_detail or '  (No SAA threshold data — deterministic check not run)'}

G3FP DOCUMENT INTELLIGENCE SUMMARY:
{g3fp_summary or '  (G3FP summary not available for this evaluation)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR TASK — Write a complete, structured clinical audit narrative. Each section must be substantive and specific.
DO NOT write generic placeholders. Use the actual axiom IDs, names, and values above.

━━━ SECTION 1: EXECUTIVE SUMMARY (4-5 sentences) ━━━
Identify: what this document is (type, domain, patient context if inferrable).
State: how many axioms were activated and what domains they cover.
State: the overall compliance posture (COMPLIANT / CONDITIONALLY COMPLIANT / NON-COMPLIANT) and confidence level.
Be specific — name the domain: e.g. "This is a HEALTHCARE domain document covering metabolic panel and cardiovascular risk markers."

━━━ SECTION 2: ONTOLOGY EVALUATION FINDINGS — AXIOM BY AXIOM ━━━
For EACH elected axiom (use the list above), write one clinical finding paragraph:
  - State: "Axiom [{ax_id}] — {ax_name} — was applied to this evaluation."
  - Explain what this axiom measures in clinical terms (e.g. "This axiom governs the Friedewald LDL calculation, ensuring that LDL-cholesterol is computed from Total Cholesterol, HDL, and Triglycerides according to the formula LDL = TC − HDL − TG/5.")
  - State the disposition (PASS / FLAG) and what it means: e.g. "The computed value fell within the guideline threshold of < 100 mg/dL for high-risk patients, confirming no LDL tampering or data fabrication."
  - If FLAGGED: explain WHY it is clinically concerning and what the deviation implies.
  - Write minimum 2 sentences per axiom. Be specific, not generic.

━━━ SECTION 3: ONTOLOGY COMPLIANCE VERDICT ━━━
State formally (like a pathology report sign-out):
"This document has been evaluated by the Sovereign OCM under {mode.upper()} mode against {elected_count} active ontological axioms from the {domain} registry."
Then state: which axioms PASSED, which (if any) were flagged, and what the aggregate verdict means.
Conclude with one sentence on whether the data integrity is confirmed or suspect.

━━━ SECTION 4: CLINICAL HEALTH INFERENCE ━━━
Based on the elected axioms and their domains, infer what the patient's health status looks like:
- What risks are indicated by the data evaluated (cardiovascular, metabolic, renal, etc.)?
- Are there any borderline or concerning patterns that a physician should note?
- This should read like a clinical impression paragraph, NOT a generic disclaimer.
Example: "The metabolic panel data indicates the patient presents with controlled T2DM (HbA1c within target) but elevated LDL-C requiring pharmacological review. Renal function markers are within normal range. 10-year cardiovascular risk warrants statin therapy initiation per ACC/AHA 2019 guidelines."

━━━ SECTION 5: RECOMMENDED CLINICAL & AUDIT ACTIONS ━━━
Provide 3-5 specific, actionable bullet points:
- Clinical actions (e.g. "Refer to cardiologist for LDL management if statin not currently prescribed")
- Audit actions (e.g. "Re-run evaluation with complete lipid panel for full Friedewald verification")
- Data quality flags if any fields were missing or estimated

Write the complete narrative now. Minimum 400 words. Be thorough and specific:"""


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/xai/explain
# XAI Tutor — node-click driven Q&A
# ─────────────────────────────────────────────────────────────────────────────
@xai_bp.route("/api/xai/explain", methods=["POST"])
def xai_explain():
    """
    POST /api/xai/explain
    Body: { question, context, history }
    Returns: { answer }
    """
    body = request.get_json(force=True, silent=True) or {}
    question = (body.get("question") or "").strip()
    context  = body.get("context") or {}
    history  = body.get("history") or []

    if not question:
        return jsonify({"error_code": "E004", "message": "question is required"}), 400

    try:
        client = _get_g3fp()
        prompt = _build_xai_explain_prompt(question, context, history)
        resp = client.models.generate_content(
            model=XAI_MODEL,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                temperature=XAI_TEMP,
                max_output_tokens=1024,
            ),
        )
        answer = (resp.text or "").strip()
        if not answer:
            answer = (
                "The XAI engine returned an empty response. "
                "Please rephrase your question or check that a node is selected."
            )
        logger.info(
            f"[XAI] explain — node={context.get('node_id','?')} "
            f"answer_len={len(answer)}"
        )
        return jsonify({"answer": answer}), 200

    except EnvironmentError as e:
        logger.error(f"E001: XAI explain — API key missing: {e}")
        return jsonify({
            "error_code": "E001",
            "answer": "XAI service unavailable — API key not configured.",
        }), 503

    except Exception as e:
        logger.error(f"E003: XAI explain failed — {e}", exc_info=True)
        return jsonify({
            "error_code": "E003",
            "answer": (
                f"XAI Tutor encountered an error: {str(e)[:120]}. "
                "Please try again or check the server logs."
            ),
        }), 500


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/xai/audit_narrative
# Generates full XAI audit narrative for the report popup
# ─────────────────────────────────────────────────────────────────────────────
@xai_bp.route("/api/xai/audit_narrative", methods=["POST"])
def xai_audit_narrative():
    """
    POST /api/xai/audit_narrative
    Body: { filename, domain, elected, candidates, standby, mode, saa_results, g3fp_summary }
    Returns: { narrative }
    """
    body = request.get_json(force=True, silent=True) or {}

    filename     = (body.get("filename") or body.get("file_name") or "document").strip()
    domain       = (body.get("domain") or "GENERAL").strip().upper()
    elected      = body.get("elected") or []
    candidates   = body.get("candidates") or body.get("candidate") or []
    standby      = body.get("standby") or []
    mode         = (body.get("mode") or "ABDUCTION").strip()
    saa_results  = body.get("saa_results") or body.get("saa_threshold_results") or []
    g3fp_summary = (body.get("g3fp_summary") or body.get("executive_summary") or "").strip()

    try:
        client = _get_g3fp()
        prompt = _build_audit_narrative_prompt(
            filename, domain, elected, candidates, standby,
            mode, saa_results, g3fp_summary,
        )
        resp = client.models.generate_content(
            model=XAI_MODEL,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=2048,
            ),
        )
        narrative = (resp.text or "").strip()
        if not narrative:
            narrative = (
                "XAI narrative generation returned empty output. "
                "Please ensure the API key is configured and retry."
            )
        logger.info(
            f"[XAI] audit_narrative — domain={domain} "
            f"elected={len(elected)} narrative_len={len(narrative)}"
        )
        return jsonify({"narrative": narrative}), 200

    except EnvironmentError as e:
        logger.error(f"E001: XAI audit_narrative — API key missing: {e}")
        return jsonify({
            "error_code": "E001",
            "narrative": "XAI narrative unavailable — API key not configured.",
        }), 503

    except Exception as e:
        logger.error(f"E003: XAI audit_narrative failed — {e}", exc_info=True)
        return jsonify({
            "error_code": "E003",
            "narrative": f"Error generating narrative: {str(e)[:120]}",
        }), 500


# ────────────────────────────────────────────────────────────────────────────
# INTERACTIONS API — Google Agent Tools for OCM Escalation
# When OCM encounters problems needing extra support, these endpoints allow
# the system to leverage the Gemma+G3FP collaborative research pipeline.
# ────────────────────────────────────────────────────────────────────────────

@xai_bp.route("/api/interactions/status", methods=["GET"])
def interactions_status():
    """
    GET /api/interactions/status
    Health check for both legs of the Interactions pipeline:
      1. G3FP (Gemini 3 Flash Preview) — cloud LLM for deep analysis
      2. Gemma (local Ollama) — local reasoning/filtering model
    Returns a JSON status report for dashboard display.
    """
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    result: Dict[str, Any] = {"timestamp": ts, "components": {}}

    # ── 1. G3FP health ─────────────────────────────────────────────────────
    g3fp_ok = False
    g3fp_error = None
    try:
        client = _get_g3fp()
        # Lightweight ping — send a minimal prompt
        _ping = client.models.generate_content(
            model=XAI_MODEL,
            contents="ping",
            config=genai.types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=4,
            ),
        )
        g3fp_ok = bool(_ping.text)
    except EnvironmentError as e:
        g3fp_error = f"E001: {e}"
    except Exception as e:
        g3fp_error = f"E003: {str(e)[:80]}"

    result["components"]["g3fp"] = {
        "name": "G3FP — Gemini 3 Flash Preview",
        "model": XAI_MODEL,
        "ok": g3fp_ok,
        "error": g3fp_error,
    }

    # ── 2. Gemma health ─────────────────────────────────────────────────────
    try:
        from modules.gemma_client import health_check as gemma_health
        gemma_status = gemma_health(timeout=3)
    except Exception as e:
        gemma_status = {"ok": False, "error": f"E003: {e}"}

    result["components"]["gemma"] = {
        "name": "Gemma (local Ollama)",
        "model": gemma_status.get("model", "gemma2"),
        "host": gemma_status.get("host", "localhost:11434"),
        "ok": gemma_status.get("ok", False),
        "model_loaded": gemma_status.get("model_loaded", False),
        "available_models": gemma_status.get("available_models", []),
        "error": gemma_status.get("error"),
    }

    # ── Overall status ──────────────────────────────────────────────────────
    # G3FP is required; Gemma is optional (research degrades gracefully)
    result["ok"]     = g3fp_ok   # system is "ok" as long as G3FP works
    result["status"] = "READY" if g3fp_ok else "DEGRADED"
    result["note"] = (
        "Gemma (Ollama) is optional — research pipeline uses G3FP if Gemma is unavailable."
        if not gemma_status.get("ok") else
        "All interaction components are online."
    )

    http_code = 200 if g3fp_ok else 503
    return jsonify(result), http_code



@xai_bp.route("/api/interactions/research", methods=["POST"])
def interactions_research():
    """
    POST /api/interactions/research
    Dual-action Interactions endpoint for OCM escalation.

    Action 1 (default / action='research'):
      Trigger the full 8-phase Gemma + G3FP research pipeline.
      Body: { domain, missing_metric, intent_context, trace_id, extraction_payload? }
      Returns: { axiom, paper, xai_report, math_validation?, hitl_flagged, powered_by }

    Action 2 (action='math_validate'):
      Cross-validate a batch of SAA formula results using Gemma as an
      independent math solver. If Gemma and SAA disagree by > 5%, the
      disposition is escalated to FLAG_TAMPER + HITL.
      Body: { formula_results: [...], extraction_payload: {...}, trace_id? }
      Returns: { overall_verdict, hitl_required, reports, counts, summary_narrative }
    """
    data = request.get_json(force=True) or {}
    action         = (data.get("action") or "research").lower().strip()
    trace_id       = (
        data.get("trace_id")
        or f"intr_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    )

    # ── Action: math_validate ─────────────────────────────────────────────
    if action == "math_validate":
        formula_results     = data.get("formula_results") or []
        extraction_payload  = data.get("extraction_payload") or {}

        if not formula_results:
            return jsonify({
                "ok": False,
                "error_code": "E004",
                "message": "'formula_results' is required for action=math_validate.",
            }), 400

        logger.info(
            f"[INTERACTIONS] math_validate — formulas={len(formula_results)} trace={trace_id}"
        )
        try:
            api_key = os.environ.get("SOVEREIGN_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
            from modules.research_agent import SovereignResearchAgent
            agent  = SovereignResearchAgent(gemini_api_key=api_key)
            result = agent.math_cross_validate(
                formula_results=formula_results,
                extraction_payload=extraction_payload,
                trace_id=trace_id,
            )
            return jsonify({"ok": True, "trace_id": trace_id, **result}), 200
        except Exception as e:
            logger.error(f"E003: math_validate failed — {e}", exc_info=True)
            return jsonify({
                "ok": False, "error_code": "E003", "trace_id": trace_id,
                "message": f"Math validation error: {str(e)[:120]}",
            }), 500

    # ── Action: research (default 8-phase pipeline) ───────────────────────
    domain             = (data.get("domain") or "GENERAL").upper()
    missing_metric     = data.get("missing_metric") or ""
    intent_context     = data.get("intent_context") or f"OCM escalation: {missing_metric}"
    extraction_payload = data.get("extraction_payload") or {}

    if not missing_metric:
        return jsonify({
            "ok": False,
            "error_code": "E004",
            "message": "Missing required field: 'missing_metric'. Describe what OCM could not resolve.",
        }), 400

    logger.info(
        f"[INTERACTIONS] Research pipeline — domain={domain} "
        f"metric='{missing_metric[:60]}' trace={trace_id}"
    )

    try:
        api_key = os.environ.get("SOVEREIGN_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
        from modules.research_agent import SovereignResearchAgent
        agent = SovereignResearchAgent(gemini_api_key=api_key)

        result = agent.run_collaborative_research(
            domain=domain,
            missing_metric=missing_metric,
            intent_context=intent_context,
            trace_id=trace_id,
            extraction_payload=extraction_payload or None,
        )

        if result.get("success"):
            logger.info(f"[INTERACTIONS] Research succeeded trace={trace_id}")
            return jsonify({
                "ok":             True,
                "trace_id":       trace_id,
                "axiom":          result.get("axiom"),
                "paper":          result.get("paper"),
                "xai_report":     result.get("xai_report"),
                "math_validation": result.get("math_validation"),
                "hitl_flagged":   result.get("hitl_flagged", False),
                "powered_by":     result.get("powered_by", "Gemma + G3FP"),
            }), 200
        else:
            return jsonify({
                "ok":         False,
                "trace_id":   trace_id,
                "error_code": result.get("error_code", "E003"),
                "message":    result.get("message", "Research pipeline failed."),
            }), 500

    except Exception as e:
        logger.error(f"E003: Interactions research failed — {e}", exc_info=True)
        return jsonify({
            "ok":         False,
            "error_code": "E003",
            "trace_id":   trace_id,
            "message":    f"Unexpected error: {str(e)[:120]}",
        }), 500
