"""
Module: api.research
Version: 1.0.0
Description: Endpoints to trigger academic search and axiom discovery.
"""

import os
import logging
import uuid
from flask import Blueprint, jsonify, request
from modules.research_agent import SovereignResearchAgent

logger = logging.getLogger(__name__)

research_bp = Blueprint("research_bp", __name__)

@research_bp.route("/api/research/trigger", methods=["POST"])
def trigger_research():
    """
    POST endpoint to trigger collaborative academic research & axiom discovery.
    """
    data = request.get_json() or {}
    domain = data.get("domain")
    missing_metric = data.get("missing_metric")
    intent_context = data.get("intent_context", "General compliance research")

    if not domain or not missing_metric:
        return jsonify({
            "status": "error",
            "error_code": "E004",
            "message": "Missing required fields: 'domain' and 'missing_metric'."
        }), 400

    trace_id = data.get("trace_id") or f"research_{uuid.uuid4().hex[:8]}"
    
    # Instantiate the agent
    api_key = os.environ.get("SOVEREIGN_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    agent = SovereignResearchAgent(gemini_api_key=api_key)
    
    try:
        result = agent.run_collaborative_research(
            domain=domain,
            missing_metric=missing_metric,
            intent_context=intent_context,
            trace_id=trace_id
        )
        if result.get("success"):
            return jsonify({
                "status": "success",
                "data": {
                    "axiom": result.get("axiom"),
                    "paper": result.get("paper"),
                    "xai_report": result.get("xai_report")
                },
                "trace_id": trace_id
            }), 200
        else:
            return jsonify({
                "status": "error",
                "error_code": result.get("error_code", "E003"),
                "message": result.get("message", "Axiom formulation failed.")
            }), 500
            
    except Exception as e:
        logger.error(f"E003: Research trigger execution failed - {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "error_code": "E003",
            "message": f"Unexpected error in pipeline: {e}"
        }), 500
