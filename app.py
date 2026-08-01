"""
Module: app.py
Version: 1.0.0
Description: Standalone OCH (Ontology Compliance Healthcare) Production Web Server.
             Dedicated single-purposed service for clinical biomarker admissibility,
             LOINC verification, AlphaFold 3D target mapping, and pre-surgery intelligence.
"""

import os
import logging
from flask import Flask, send_from_directory, jsonify, request, make_response
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("OCHApp")

app = Flask(__name__, static_folder="static")
CORS(app)

# Initialize SovereignBUS and OCH Engine
from modules.bus import SovereignBUS
from modules.och import OCHEngine

bus = SovereignBUS()

class SimpleRegistry:
    """Fallback registry for standalone OCH deployment."""
    def get(self, axiom_id):
        return None
    def get_by_domain_and_mode(self, domain, mode):
        return []

och_engine = OCHEngine(bus=bus, registry=SimpleRegistry())

@app.route("/")
def index():
    """Serve dedicated single-purposed OCH portal."""
    return send_from_directory("static", "index.html")

@app.route("/api/health")
def health():
    """Health check endpoint for GCP Cloud Run and load balancers."""
    return jsonify({
        "service": "OCH (Ontology Compliance Healthcare)",
        "status": "healthy",
        "mode": "och",
        "fpga_module": "och.v",
        "registers": "0x7000-0x70FF"
    }), 200

@app.route("/api/och/run", methods=["POST"])
def run_och_audit():
    """Execute OCH L0->L5 clinical audit pipeline."""
    try:
        data = request.get_json(force=True) or {}
        domain = data.get("domain", "HEALTHCARE")
        field_values = data.get("field_values", {})
        trace_id = data.get("trace_id")
        
        import asyncio
        result = asyncio.run(och_engine.run(domain=domain, field_values=field_values, trace_id=trace_id))
        return jsonify(result), 200
    except Exception as e:
        logger.error("OCH audit run error: %s", e, exc_info=True)
        return jsonify({"error_code": "E003", "message": str(e)}), 500

@app.route("/<path:path>")
def static_files(path):
    """Serve static files or fall back to index.html."""
    full_path = os.path.join(app.static_folder, path)
    if os.path.isfile(full_path):
        resp = make_response(send_from_directory("static", path))
        resp.headers["Cache-Control"] = "no-cache"
        return resp
    return send_from_directory("static", "index.html")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    logger.info("OCH Server running on port %d", port)
    app.run(host="0.0.0.0", port=port)
