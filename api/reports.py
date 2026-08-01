"""
Module: api.reports
Version: 1.0.0
Description: Endpoints to serve generated L5 reports
"""

import os
import logging
from flask import Blueprint, send_from_directory, jsonify, abort, request

logger = logging.getLogger(__name__)

reports_bp = Blueprint("reports_bp", __name__)
REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")

@reports_bp.route("/api/pipeline/trigger", methods=["POST", "GET"])
def trigger_pipeline():
    """
    HTTP POST/GET endpoint to manually trigger the daily spatiotemporal matrix 
    report generation pipeline (compatible with GCP Cloud Scheduler).
    Runs the pipeline job in a background thread to avoid HTTP gateway timeout.
    """
    token_required = os.environ.get("SOVEREIGN_SCHEDULER_TOKEN")
    if token_required:
        # Check header or query parameter
        token = request.headers.get("X-Scheduler-Token") or request.args.get("token")
        if token != token_required:
            logger.warning("Unauthorized trigger attempt detected - invalid token.")
            return jsonify({"status": "error", "message": "Unauthorized"}), 401
            
    import threading
    from odats.data.report_trigger import run_pipeline_job
    
    # Run the report generation in a background thread
    t = threading.Thread(target=run_pipeline_job)
    t.daemon = True
    t.start()
    
    logger.info("Pipeline trigger received. Daily report generation job started in background.")
    return jsonify({
        "status": "success", 
        "message": "Spatiotemporal matrix data pipeline and report generation triggered successfully."
    }), 200

@reports_bp.route("/api/reports/<trace_id>/export.<fmt>", methods=["GET"])
def get_report(trace_id: str, fmt: str):
    """
    Serve generated L5 reports.
    Formats supported: json, html, csv
    """
    if fmt not in ["json", "html", "csv"]:
        return jsonify({"status": "error", "message": "Unsupported format"}), 400

    trace_dir = os.path.join(REPORTS_DIR, trace_id)
    filename = f"report.{fmt}"
    file_path = os.path.join(trace_dir, filename)

    if not os.path.exists(file_path):
        return jsonify({"status": "error", "message": "Report not found"}), 404

    # Use caching headers based on app conventions
    response = send_from_directory(trace_dir, filename)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    if fmt == "html":
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
    elif fmt == "json":
        response.headers['Content-Type'] = 'application/json'
    elif fmt == "csv":
        response.headers['Content-Type'] = 'text/csv'
        # Optional: prompt download
        # response.headers['Content-Disposition'] = f'attachment; filename="report_{trace_id}.csv"'

    return response
