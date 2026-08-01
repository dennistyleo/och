"""
Module: api.antigravity_agent
Version: 1.0.0
Description: Interactive API Blueprint utilizing the Google Antigravity SDK to streamline the use of G3FP and other SAA tools.
"""

import os
import logging
import asyncio
from typing import Dict, Any, List, Optional
from flask import Blueprint, request, jsonify

# Ensure GEMINI_API_KEY is mapped from SOVEREIGN_GEMINI_API_KEY
if "GEMINI_API_KEY" not in os.environ and "SOVEREIGN_GEMINI_API_KEY" in os.environ:
    os.environ["GEMINI_API_KEY"] = os.environ["SOVEREIGN_GEMINI_API_KEY"]

try:
    from google.antigravity import Agent, LocalAgentConfig
    from google.antigravity.hooks import policy
    ANTIGRAVITY_AVAILABLE = True
except ImportError as e:
    logging.getLogger(__name__).error(f"E001: google-antigravity not importable: {e}")
    ANTIGRAVITY_AVAILABLE = False

logger = logging.getLogger(__name__)
antigravity_agent_bp = Blueprint("antigravity_agent", __name__)

SAVE_DIR = "/Users/leodennis/.gemini/antigravity-ide/antigravity_agent_saves"
os.makedirs(SAVE_DIR, exist_ok=True)

# ── Custom Tools for Antigravity Agent ───────────────────────────────────────

def get_document_analysis(trace_id: str) -> str:
    """Retrieves the extracted metrics, entities, and elected axioms from a document analysis session.

    Args:
        trace_id: The trace identifier representing the document upload session.
    """
    try:
        from api.characterize import _char_store
        entry = _char_store.get(trace_id)
        if not entry:
            return f"Error: No document analysis session found for trace ID {trace_id}."
        
        uif = entry.get("uif", {})
        filename = entry.get("filename", "unknown")
        domain = entry.get("domain", "GENERAL")
        metrics = uif.get("extracted_data", {}).get("metrics", [])
        entities = uif.get("extracted_data", {}).get("entities", [])
        elected_axioms = entry.get("elected_axioms", [])
        
        metrics_summary = "\n".join([f"  - {m.get('name') or m.get('field_name')}: {m.get('value')} {m.get('unit','')}" for m in metrics])
        entities_summary = "\n".join([f"  - {e.get('type') or e.get('entity_type')}: {e.get('value')}" for e in entities])
        axioms_summary = ", ".join(elected_axioms) or "None"
        
        return (
            f"Document Analysis Session: {trace_id}\n"
            f"File Name: {filename}\n"
            f"Domain: {domain}\n"
            f"Elected Axioms: {axioms_summary}\n"
            f"Extracted Metrics:\n{metrics_summary or '  None'}\n"
            f"Extracted Entities:\n{entities_summary or '  None'}"
        )
    except Exception as e:
        logger.error(f"E003: Error in get_document_analysis tool: {e}", exc_info=True)
        return f"Error retrieving document analysis: {e}"


def query_saa_registry(query_text: str) -> str:
    """Queries the SAA (Sovereign Axiom Agent) registry to find axioms matching a query.

    Args:
        query_text: The search query text (e.g. 'cardiovascular', 'oxygen utility').
    """
    try:
        from modules.axiom_repo.saa_registry import get_registry
        registry = get_registry()
        candidates = registry.vector_match(query_text, top_k=5)
        if not candidates:
            return f"No axioms found matching query '{query_text}'."
        
        lines = []
        for c in candidates:
            lines.append(
                f"- [{c['axiom_id']}] {c.get('name', 'Unnamed')} (similarity: {c['similarity_score']:.3f})\n"
                f"  Description: {c.get('description', '')[:200]}\n"
                f"  Domain: {c.get('domain', 'GENERAL')}"
            )
        return "\n\n".join(lines)
    except Exception as e:
        logger.error(f"E008: Error in query_saa_registry tool: {e}", exc_info=True)
        return f"Error querying SAA registry: {e}"


def calculate_z_depth(x: float, y: float, epsilon: float = 1e-6) -> str:
    """Computes the deterministic Z-Depth calculation using exact SymPy-based logic.
    Formula: Z = e^X - ln(|Y| + epsilon)

    Args:
        x: The X coordinate value (e.g., biomarker value deviation).
        y: The Y coordinate value (e.g., reference limit).
        epsilon: The small precision offset (default is 1e-6).
    """
    try:
        from modules.sovereign_axiom_agent import SovereignAxiomAgent
        from modules.bus import SovereignBUS
        bus = SovereignBUS()
        agent = SovereignAxiomAgent(bus=bus)
        result = agent.apply_eml_logic(x, y, epsilon)
        return f"Z-Depth Calculation Result: Z = {result:.6f} (using X={x}, Y={y}, epsilon={epsilon})"
    except Exception as e:
        logger.error(f"E003: Error in calculate_z_depth tool: {e}", exc_info=True)
        return f"Error executing Z-depth calculation: {e}"


def get_health_status() -> str:
    """Retrieves the health and status information of the Sovereign Matrix system."""
    try:
        from modules.axiom_repo.saa_registry import get_registry
        reg = get_registry()
        axiom_count = reg.count()
    except Exception:
        axiom_count = -1
    return f"Sovereign Matrix Health: healthy, version: 2.3.0, axioms_indexed: {axiom_count}"


def _run_async(coro):
    """Run an async coroutine from a sync Flask route."""
    try:
        loop = asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result(timeout=120)
    except RuntimeError:
        return asyncio.run(coro)


async def _chat_with_agent(
    message: str,
    conversation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Asynchronously instantiates the Agent and sends the user message."""
    if not ANTIGRAVITY_AVAILABLE:
        return {
            "ok": False,
            "error_code": "E001",
            "message": "google-antigravity SDK is not installed or available.",
        }

    # Set up system instructions dynamically based on domain context if trace_id is present
    system_instructions = (
        "You are OCM (Ontology Compliance Monitor) Agent powered by Google Antigravity.\n"
        "You are a professional auditor and analyst for the Sovereign Matrix system.\n"
        "You have access to custom tools to query the SAA registry, analyze documents, and calculate Z-depth.\n"
        "Reply professionally, directly, and do not make up facts. Always verify using your tools."
    )
    if trace_id:
        system_instructions += f"\nActive Session Trace ID: {trace_id}."

    # Config options
    model_name = os.environ.get("G3FP_MODEL_NAME", "gemini-3-flash-preview")
    
    policies = [
        policy.deny_all(),
        policy.allow("get_document_analysis"),
        policy.allow("query_saa_registry"),
        policy.allow("calculate_z_depth"),
        policy.allow("get_health_status"),
    ]

    config = LocalAgentConfig(
        model=model_name,
        system_instructions=system_instructions,
        tools=[get_document_analysis, query_saa_registry, calculate_z_depth, get_health_status],
        policies=policies,
        save_dir=SAVE_DIR,
        conversation_id=conversation_id,
    )

    async with Agent(config=config) as agent:
        response = await agent.chat(message)
        response_text = await response.text()
        
        # Extract thoughts
        thoughts = []
        try:
            async for thought in response.thoughts:
                thoughts.append(thought)
        except Exception as te:
            logger.warning(f"Failed to extract thoughts from response: {te}")

        return {
            "ok": True,
            "conversation_id": agent.conversation_id,
            "text": response_text,
            "thoughts": "".join(thoughts),
        }

# ── Routes ───────────────────────────────────────────────────────────────────

@antigravity_agent_bp.route("/api/agent/antigravity/chat", methods=["POST"])
def chat():
    """
    POST /api/agent/antigravity/chat
    Interacts with the Google Antigravity Agent.
    """
    body = request.get_json(force=True, silent=True) or {}
    message = body.get("message", "").strip()
    conversation_id = body.get("conversation_id", "").strip() or None
    trace_id = body.get("trace_id", "").strip() or None

    if not message:
        return jsonify({
            "ok": False,
            "error_code": "E004",
            "message": "Field 'message' is required and cannot be empty.",
        }), 400

    try:
        result = _run_async(_chat_with_agent(message, conversation_id, trace_id))
        if not result.get("ok", True):
            return jsonify(result), 500
        return jsonify(result), 200

    except Exception as exc:
        logger.error(f"E003: Unhandled exception in Antigravity Agent chat API: {exc}", exc_info=True)
        return jsonify({
            "ok": False,
            "error_code": "E003",
            "message": f"Unexpected error in Antigravity Agent: {exc}",
        }), 500
