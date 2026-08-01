"""
Module: api.hitl
Version: 2.0.0 (OCM V4.1 — IM-01 Day 4)
Description: Stage-agnostic HITL HTTP bridge + Phase B FSM context injection.
             Allows any L1–L5 pipeline node to surface a prompt window in the
             HITL modal and receive the operator's response — not just on file
             upload, but at *any* stage of an active trace.

Endpoints
---------
POST /api/hitl/prompt
    Emits a HITL_REQUEST onto SovereignBUS for the given trace_id.
    The frontend HITL modal subscribes to this event and opens a dialogue.

POST /api/hitl/respond
    Receives the operator's decision (ACCEPT_AI / OVERRIDE / REQUEST_TEST …)
    and emits HITL_RESPONSE so the suspended FSM node can resume.

GET  /api/hitl/status/<trace_id>
    Returns the current HITL state for a given trace (PENDING / RESOLVED / NONE).
"""

import datetime
import logging
from typing import Dict, Any

from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

hitl_bp = Blueprint("hitl", __name__)

# ── In-process HITL state store ─────────────────────────────────────────────
# Keyed by trace_id.  A real deployment would back this with Redis.
_hitl_store: Dict[str, Dict[str, Any]] = {}


# ── Lazy bus import (avoids circular imports at module load) ─────────────────
def _get_bus():
    """Return the application-level SovereignBUS singleton."""
    from app import sse_clients  # noqa: F401  (ensures app context is loaded)
    try:
        from modules.bus import _global_bus  # singleton registered in bus.py
        return _global_bus
    except ImportError:
        return None


# ── POST /api/hitl/prompt ────────────────────────────────────────────────────

@hitl_bp.route("/api/hitl/prompt", methods=["POST"])
def hitl_prompt():
    """
    POST /api/hitl/prompt
    Body (JSON):
        {
            "trace_id":  "20260427_...",
            "stage":     "L3_SEMANTIC_GRAPH",     // pipeline stage emitting the request
            "prompt":    "Causal path ambiguous …",
            "options":   ["ACCEPT_AI", "OVERRIDE_CLINICAL", "REQUEST_TEST"],
            "context":   { … }                    // optional domain payload
        }

    Emits HITL_REQUEST on SovereignBUS and stores state for /api/hitl/status.
    Returns 200 on success, 400 on missing required fields.
    """
    body: Dict[str, Any] = request.get_json(force=True, silent=True) or {}

    trace_id = body.get("trace_id", "").strip()
    stage    = body.get("stage",    "").strip()
    prompt   = body.get("prompt",   "").strip()
    options  = body.get("options",  ["ACCEPT", "OVERRIDE"])

    if not trace_id or not prompt:
        return jsonify({
            "ok":         False,
            "error_code": "E004",
            "message":    "trace_id and prompt are required",
        }), 400

    ts = datetime.datetime.utcnow().isoformat() + "Z"

    hitl_request = {
        "trace_id":  trace_id,
        "stage":     stage,
        "prompt":    prompt,
        "options":   options,
        "context":   body.get("context", {}),
        "timestamp": ts,
    }

    # Persist state
    _hitl_store[trace_id] = {
        "status":  "PENDING",
        "request": hitl_request,
        "created": ts,
    }

    # Emit to SovereignBUS — the OCGGateway HITL handler and the frontend SSE
    # stream both listen for this event.
    bus = _get_bus()
    if bus:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(bus.emit("HITL_REQUEST", {
                    "payload":  hitl_request,
                    "trace_id": trace_id,
                }))
            else:
                loop.run_until_complete(bus.emit("HITL_REQUEST", {
                    "payload":  hitl_request,
                    "trace_id": trace_id,
                }))
        except Exception as exc:
            logger.warning(f"[hitl/prompt] BUS emit failed (non-fatal): {exc}")

    logger.info(f"[hitl/prompt] HITL_REQUEST emitted | stage={stage} | trace_id={trace_id}")

    return jsonify({
        "ok":       True,
        "trace_id": trace_id,
        "stage":    stage,
        "message":  "HITL_REQUEST emitted. Awaiting operator response.",
    }), 200


# ── POST /api/hitl/respond ───────────────────────────────────────────────────

@hitl_bp.route("/api/hitl/respond", methods=["POST"])
def hitl_respond():
    """
    POST /api/hitl/respond
    Body (JSON):
        {
            "trace_id":  "20260427_...",
            "decision":  "ACCEPT_AI",             // one of the options offered
            "override":  { … }                    // optional — operator corrections
        }

    Emits HITL_RESPONSE on SovereignBUS, resuming any suspended FSM node.
    """
    body: Dict[str, Any] = request.get_json(force=True, silent=True) or {}

    trace_id = body.get("trace_id", "").strip()
    decision = body.get("decision", "").strip()

    if not trace_id or not decision:
        return jsonify({
            "ok":         False,
            "error_code": "E004",
            "message":    "trace_id and decision are required",
        }), 400

    ts = datetime.datetime.utcnow().isoformat() + "Z"

    # Pull FSM context from characterize session store (Phase B awareness)
    fsm_context = {}
    try:
        from api.characterize import get_char_store
        char_entry = get_char_store().get(trace_id, {})
        fsm_context = char_entry.get("fsm_context", {})
        if fsm_context:
            logger.info(
                f"[hitl/respond] FSM context found | lens={fsm_context.get('lens')} "
                f"axioms={fsm_context.get('locked_axioms')} | trace_id={trace_id}"
            )
    except Exception as exc:
        logger.debug(f"[hitl/respond] No char_store context: {exc}")

    # Update state store
    if trace_id in _hitl_store:
        _hitl_store[trace_id].update({
            "status":      "RESOLVED",
            "decision":    decision,
            "override":    body.get("override", {}),
            "fsm_context": fsm_context,
            "resolved":    ts,
        })
    else:
        logger.warning(f"[hitl/respond] trace_id not in store — may have expired | trace_id={trace_id}")

    hitl_response = {
        "trace_id":   trace_id,
        "decision":   decision,
        "override":   body.get("override", {}),
        "fsm_context": fsm_context,   # Cycle 2 seed: lens + locked_axioms
        "timestamp":  ts,
    }

    bus = _get_bus()
    if bus:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(bus.emit("HITL_RESPONSE", {
                    "payload":  hitl_response,
                    "trace_id": trace_id,
                }))
            else:
                loop.run_until_complete(bus.emit("HITL_RESPONSE", {
                    "payload":  hitl_response,
                    "trace_id": trace_id,
                }))
        except Exception as exc:
            logger.warning(f"[hitl/respond] BUS emit failed (non-fatal): {exc}")

    logger.info(
        f"[hitl/respond] HITL_RESPONSE emitted | decision={decision} | trace_id={trace_id}"
    )

    return jsonify({
        "ok":       True,
        "trace_id": trace_id,
        "decision": decision,
        "message":  "HITL_RESPONSE emitted. FSM node will resume.",
    }), 200


# ── GET /api/hitl/status/<trace_id> ─────────────────────────────────────────

@hitl_bp.route("/api/hitl/status/<trace_id>", methods=["GET"])
def hitl_status(trace_id: str):
    """
    GET /api/hitl/status/<trace_id>
    Returns the current HITL state for a trace:
        { ok, trace_id, status, request, decision }
    status is one of: PENDING | RESOLVED | NONE
    """
    entry = _hitl_store.get(trace_id)
    if not entry:
        return jsonify({
            "ok":       True,
            "trace_id": trace_id,
            "status":   "NONE",
        }), 200

    return jsonify({
        "ok":       True,
        "trace_id": trace_id,
        "status":   entry.get("status"),
        "request":  entry.get("request"),
        "decision": entry.get("decision"),
    }), 200
