"""
Module: api.characterize
Version: 1.0.0 (OCM V4.1 — IM-01 Day 4)
Description: The "Grand Conductor" — orchestrates the full Cycle 1 pipeline.
             Phase A: L0 Adapter → Scout Combine → ScoutReportCards (Phase A UI payload)
             Phase B: Scout confirmation → 5-Panel HITL state handoff (Cycle 2 ready)

Endpoints
---------
POST /api/agent/seal/characterize
    Accepts raw file upload. Runs L0 + ScoutCombine. Returns Phase A payload.

POST /api/agent/seal/characterize/confirm
    Accepts confirmed scout_id / coalition decision. Writes Phase B HITL state.
    trace_id MUST match the one returned from /characterize (PM mandate — no fragmentation).

GET  /api/agent/seal/characterize/status/<trace_id>
    Returns the full Characterization state for a given trace_id.

PM mandate (2026-04-29): trace_id is the single key that links:
  /characterize → /confirm → /dialogue (NLP, Day 5) → Cycle 2 FSM
  ANY break in trace_id chain triggers a SESSION_FRAGMENTATION error.
"""

import asyncio
import datetime
import json
import logging
import math
import os
import uuid
from typing import Dict, Any, List, Optional
from collections.abc import MutableMapping

from flask import Blueprint, request, jsonify

from modules.l0_adapter import L0Adapter
from modules.scout_combine import get_scout_combine

logger = logging.getLogger(__name__)

characterize_bp = Blueprint("characterize", __name__)

class DiskSyncedDict(dict):
    def __init__(self, filepath, *args, **kwargs):
        self.filepath = filepath
        super().__init__(*args, **kwargs)
        
    def _save(self):
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save synced dict to {self.filepath}: {e}")

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self._save()

    def __delitem__(self, key):
        super().__delitem__(key)
        self._save()

    def update(self, *args, **kwargs):
        super().update(*args, **kwargs)
        self._save()

    def setdefault(self, key, default=None):
        res = super().setdefault(key, default)
        self._save()
        return res

    def clear(self):
        super().clear()
        self._save()


class DiskSyncedStore(MutableMapping):
    def __init__(self, prefix, directory="/tmp/axiom_uploads"):
        self.prefix = prefix
        self.directory = directory
        self.in_memory = {}
        try:
            os.makedirs(directory, exist_ok=True)
        except Exception:
            pass

    def _get_path(self, key):
        safe_key = "".join(c for c in str(key) if c.isalnum() or c in ("-", "_"))
        return os.path.join(self.directory, f"{self.prefix}_{safe_key}.json")

    def _load_from_disk(self, key):
        path = self._get_path(key)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return DiskSyncedDict(path, data)
                    return data
            except Exception as e:
                # Silently fail if file is currently being written or locked
                pass
        return None

    def _save_to_disk(self, key, value):
        path = self._get_path(key)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(value, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save synced store {key}: {e}")

    def __getitem__(self, key):
        val = self._load_from_disk(key)
        if val is not None:
            return val
        if key in self.in_memory:
            return self.in_memory[key]
        raise KeyError(key)

    def __setitem__(self, key, value):
        self.in_memory[key] = value
        self._save_to_disk(key, value)

    def __delitem__(self, key):
        if key in self.in_memory:
            del self.in_memory[key]
        path = self._get_path(key)
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass

    def __iter__(self):
        keys = set(self.in_memory.keys())
        try:
            for f in os.listdir(self.directory):
                if f.startswith(f"{self.prefix}_") and f.endswith(".json"):
                    key = f[len(self.prefix)+1:-5]
                    keys.add(key)
        except Exception:
            pass
        return iter(keys)

    def __len__(self):
        return len(list(self.__iter__()))

    def get(self, key, default=None):
        val = self._load_from_disk(key)
        if val is not None:
            return val
        return self.in_memory.get(key, default)

    def setdefault(self, key, default=None):
        val = self._load_from_disk(key)
        if val is not None:
            return val
        if key not in self.in_memory:
            self.in_memory[key] = default
            self._save_to_disk(key, default)
        val = self.in_memory[key]
        if isinstance(val, dict):
            return DiskSyncedDict(self._get_path(key), val)
        return val

# ---------------------------------------------------------------------------
# Server-side session store — keyed by trace_id (synchronized across workers)
# ---------------------------------------------------------------------------
_char_store = DiskSyncedStore("char")
_locale_store = DiskSyncedStore("locale")
_thinking_store = DiskSyncedStore("thinking")

def _log_thinking(req_id: str, agent: str, msg: str) -> None:
    """Write a real-time processing step visible to the frontend poll endpoint."""
    if not req_id:
        return
    _thinking_store.setdefault(req_id, []).append({
        "agent": agent,
        "msg":   msg,
        "ts":    datetime.datetime.utcnow().isoformat() + "Z",
    })

_l0 = L0Adapter()


def _gen_trace_id() -> str:
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    short = uuid.uuid4().hex[:6].upper()
    return f"{ts}_{short}"


def _run_async(coro):
    """Run an async coroutine from a sync Flask route."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result(timeout=120)
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


# ===========================================================================
# POST /api/agent/seal/characterize  — Phase A
# ===========================================================================

@characterize_bp.route("/api/agent/seal/characterize", methods=["POST"])
def characterize():
    """
    Phase A — Cycle 1 Reconnaissance.
    ECP-024: Outer try/except prevents 500 death-spiral — always returns 200.
    """
    trace_id = (request.form.get("trace_id") or "").strip()
    if not trace_id:
        trace_id = _gen_trace_id()  # hoisted so it exists in the except block
    req_id   = (request.form.get("request_id") or "").strip()

    # ── trace_link fast-path ───────────────────────────────────────────────────
    # hitl_modal.html calls /characterize with mode='trace_link' (no file) as a
    # last-resort to obtain a fresh trace_id when none was passed via postMessage.
    # Return 200 so Chrome/WebKit don't log the response as a console.error.
    # (Previously returned 400 → broke BROAD-01 in Chrome + WebKit.)
    body_json   = request.get_json(force=True, silent=True) or {}
    _mode_hint  = (request.form.get("mode") or body_json.get("mode") or "").upper()
    _source_hint = (request.form.get("source") or body_json.get("source") or "").lower()
    if _mode_hint == "TRACE_LINK" or _source_hint == "hitl_modal":
        logger.info(f"[characterize] trace_link fast-path | trace_id={trace_id}")
        file_name = (body_json.get("file_name") or request.form.get("file_name") or "unknown.pdf").strip()
        domain = (body_json.get("domain") or request.form.get("domain") or "GENERAL").strip().upper()
        
        # Initialize a bootstrap entry in the store so subsequent chat calls find it
        _char_store[trace_id] = {
            "filename":       file_name,
            "domain":         domain,
            "detected_lang":  "EN",
            "session_context": {"lang": "EN", "mode": "DEDUCTION"},
            "pdds":           {},
            "uif":            {},
            "elected_axioms": [],
            "dialogue_history": [],
            "confirmed_fields": {},
            "extraction_mode": "G3FP_DIRECT",
            "_bootstrap":     True,
        }
        
        return jsonify({
            "ok":       True,
            "phase":    "TRACE_LINK",
            "trace_id": trace_id,
        }), 200


    try:
        # ── 1. File ingestion ──────────────────────────────────────────────────
        if "file" not in request.files:
            return jsonify({
                "ok": False, "error_code": "E001",
                "message": "No file uploaded. Multipart field 'file' is required.",
            }), 400

        uploaded = request.files["file"]
        filename  = uploaded.filename or "unknown.bin"
        # BUG-1 FIX: domain from form is an UNTRUSTED HINT.
        # L0Adapter._infer_domain_from_content() will ALWAYS override this from extracted data.
        # This field must NEVER be derived from the filename on the frontend.
        domain    = (request.form.get("domain") or "GENERAL").upper().strip()
        # Mode (ABDUCTION/INDUCTION/DEDUCTION) and user_name injected by frontend at upload
        # These seed session_context so all dialogue turns are mode-aware from the first greeting.
        eval_mode = (request.form.get("mode") or "ABDUCTION").upper().strip() or "ABDUCTION"
        user_name = (request.form.get("user_name") or "").strip()
        logger.info(f"[characterize] START | file={filename} domain={domain} mode={eval_mode} trace_id={trace_id}")

        try:
            file_bytes = uploaded.read()
        except Exception as exc:
            logger.error(f"E001: File read failed — {exc}")
            return jsonify({"ok": False, "error_code": "E001", "message": str(exc)}), 400

        _log_thinking(req_id, "L0", f"📄 File received: '{filename}' ({len(file_bytes)//1024}KB) — trace_id assigned")

        # ── 2. L0 Multimodal Transcoder (G3FP leads, L0 coordinates are background) ──
        _l0_degraded = False
        try:
            _log_thinking(req_id, "L0", "🔍 Launching Multimodal Transcoder — G3FP vision scanning pages at 144 DPI...")
            uif = _l0.process_document(
                file_bytes=file_bytes,
                filename=filename,
                domain=domain,
                trace_id=trace_id,
            )
            _log_thinking(req_id, "L0", f"✅ Transcoder complete — inferred domain: {uif.get('domain', 'PENDING')}")
        except Exception as exc:
            # ECP-023: L0 failure is NOT fatal. G3FP may have already read the file
            # before the exception propagated (e.g. PyCryptodome only affects PDF text
            # layer decryption, not G3FP image rendering). Continue with a skeleton UIF
            # so SAA can still process any G3FP-extracted metrics and the Modal opens.
            _l0_degraded = True
            _log_thinking(req_id, "L0", f"⚠ L0 degraded: {exc} — G3FP vision data used as primary source")
            logger.warning(f"[ECP-023] L0 partial failure — continuing with degraded UIF. Error: {exc}")
            uif = {
                "domain": domain,
                "filename": filename,
                "trace_id": trace_id,
                "l0_degraded": True,
                "l0_error": str(exc),
                "extracted_data": {"metrics": [], "entities": []},
                "actionable_refusals": {"modal": [], "amber": [
                    {"code": "L0_DEGRADED", "message": f"L0 transcoder error: {exc}. G3FP vision is the primary data source."}
                ]},
            }

        # ── 3. Check for blocking Modal Interrupt from L0 ─────────────────────

        modal_refusals = uif.get("actionable_refusals", {}).get("modal", [])
        amber_refusals = uif.get("actionable_refusals", {}).get("amber", [])

        # ── ECP-002: Proactive Shoot & Language Handshake ─────────────────────
        # ECP-018: SAA_PROVISIONAL now counts as certified (G3FP-read + physiologically plausible)
        extracted = uif.get("extracted_data", {})
        uncert_metrics = [
            m for m in extracted.get("metrics", [])
            if m.get("certification", "UNCERTIFIED") == "UNCERTIFIED"
        ]
        # ECP-018: HARD + SAA_PROVISIONAL both count as sovereign evidence
        certified_metrics = [
            m for m in extracted.get("metrics", [])
            if m.get("certification") in ("HARD", "SAA_PROVISIONAL")
        ]
        saa_provisional_metrics = [
            m for m in extracted.get("metrics", [])
            if m.get("certification") == "SAA_PROVISIONAL"
        ]
        all_metrics = extracted.get("metrics", [])
        entity_count_actual = len(extracted.get("entities", []))

        # ECP-010: Log real extraction results to thinking stream
        _log_thinking(req_id, "L0",
            f"📊 Extracted {entity_count_actual} certified entities, "
            f"{len(all_metrics)} metrics ({len(uncert_metrics)} uncertified, "
            f"{len(saa_provisional_metrics)} SAA-provisional, "
            f"{len([m for m in certified_metrics if m.get('certification')=='HARD'])} hard-certified)")
        if all_metrics:
            top3 = ", ".join(f"{m['name']}={m['value']}{m.get('unit','')}" for m in all_metrics[:3])
            _log_thinking(req_id, "SAA", f"🤝 Detected markers: {top3} — matching against axiom registry...")
            # ECP-018: surface SAA_PROVISIONAL immediately
            if saa_provisional_metrics:
                prov_strs = ", ".join(
                    f"[SAA_PROVISIONAL: {m['name']}={m['value']}{m.get('unit','mg/dL')}]"
                    for m in saa_provisional_metrics[:4]
                )
                _log_thinking(req_id, "SAA",
                    f"✅ SAA Gate PASSED — {prov_strs} — "
                    f"EVALUATION_STATUS → LOCKED ✅")
        else:
            _log_thinking(req_id, "SAA", "⚠ No numeric markers found in certified coordinates — engaging RAG fallback...")

        # Language detection: scan entity values for Chinese characters
        all_values = " ".join(
            str(e.get("value", "")) for e in extracted.get("entities", [])
        )
        import re as _re_char
        lang_handshake = bool(_re_char.search(r'[\u4e00-\u9fff]', all_values))

        # Build proactive shoot message if we have UNCERTIFIED values but NO SAA_PROVISIONAL
        proactive_shoot = None
        if uncert_metrics and not saa_provisional_metrics and entity_count_actual < 2:
            marker_strs = [f"{m['name']}={m['value']}{m.get('unit','')}" for m in uncert_metrics[:4]]
            markers_en = ", ".join(marker_strs)
            markers_zh = "、".join(marker_strs)
            count = len(uncert_metrics)
            proactive_shoot = {
                "en": (
                    f"Detected high-risk cardiovascular markers ({markers_en}), "
                    f"but coordinate certification failed. "
                    f"Please confirm these {count} value(s) to proceed."
                ),
                "zh": (
                    f"已偵測到高風險心血管指標（{markers_zh}），"
                    f"但座標認證失敗。"
                    f"請確認以下 {count} 項數值後繼續。"
                ),
                "markers": marker_strs,
                "count": count,
                "certification": "UNCERTIFIED",
            }
            logger.info(
                f"[ECP-002 proactive_shoot] {count} UNCERTIFIED metrics found. "
                f"Proactive shoot engaged. trace_id={trace_id}"
            )

        if modal_refusals:
            refusal = modal_refusals[0]
            waiting_state = refusal.get("waiting_state", "QUARANTINED")
            nlp_prompt    = refusal.get("nlp_prompt", "")
            stage         = refusal.get("stage", "L0")
            # ECP-020: G3FP SOVEREIGNTY — if SAA already certified data, L0 cannot veto.
            # SAA_PROVISIONAL metrics = G3FP read them + physiologically plausible.
            # L0 coordinate failure is downgraded to AMBER, not a MODAL block.
            if saa_provisional_metrics:
                logger.info(
                    f"[ECP-020 G3FP Sovereignty] SAA_PROVISIONAL metrics exist — "
                    f"L0 modal_refusals DOWNGRADED to amber. G3FP data proceeds. trace_id={trace_id}"
                )
                amber_refusals = modal_refusals + amber_refusals  # demote to amber
                modal_refusals = []  # clear blocking gate
            elif proactive_shoot and waiting_state == "WAITING_FOR_USER_INPUT":
                waiting_state = "PROACTIVE_SHOOT"
                nlp_prompt = proactive_shoot.get("zh", nlp_prompt)

        # ECP-024: 422 gate REMOVED. Any remaining modal_refusals at this point
        # are demoted to amber warnings. The file uploaded successfully — that
        # is the ONLY condition required to open the HITL Modal.
        # G3FP vision + user HITL are the authority on data completeness.
        if modal_refusals:
            refusal = modal_refusals[0]
            logger.warning(
                f"[ECP-024 no-gate] {refusal.get('stage','L0')} refusal DEMOTED to amber — "
                f"Modal proceeds. waiting_state={refusal.get('waiting_state','AMBER')} | trace_id={trace_id}"
            )
            amber_refusals = modal_refusals + amber_refusals
            modal_refusals = []   # Gate abolished — proceed to Scout Combine

        # ── 4. Scout Combine — Cycle 1 Plasticity ────────────────────────────
        try:
            _log_thinking(req_id, "SAA", "🔄 Launching 8-Scout Combine in parallel — competitive axiom matching in progress...")
            combine = get_scout_combine()
            scout_result = _run_async(combine.run(uif, trace_id=trace_id))
            matched_ids = ", ".join({
                a["axiom_id"]
                for c in scout_result.top_scouts
                for a in c.matched_axioms
            } - {""}) or "none"
            _log_thinking(req_id, "SAA", f"✅ Scout Combine done — recommended: {scout_result.recommended} | axioms: {matched_ids}")
            _log_thinking(req_id, "OCG", "🛡️ Axiom gate ARMED — Z-Depth formula on standby (awaiting intent confirmation + MVD lock)")
        except Exception as exc:
            # ECP-024: ScoutCombine failure is NOT fatal — degrade gracefully so Modal opens.
            _log_thinking(req_id, "SAA", f"⚠ ScoutCombine offline: {exc} — engaging Sovereign Manual Mode")
            logger.error(f"[ECP-024] ScoutCombine failed — continuing in degraded mode: {exc}", exc_info=True)
            scout_result = None

        # ── 5. Build 3-Panel Phase A payload (guard for degraded scout_result) ──
        top_scouts = [c.model_dump() for c in scout_result.top_scouts] if scout_result else []
        all_axiom_ids = ({
            a["axiom_id"]
            for c in scout_result.top_scouts
            for a in c.matched_axioms
        } if scout_result else set())

        panel_1_summary = _build_panel_1(uif, scout_result) if scout_result else {}
        panel_2_axioms  = _build_panel_2(scout_result) if scout_result else []
        panel_3_missing = _build_panel_3(scout_result) if scout_result else []

        # ── 6. Persist to session store (trace_id is the key) ─────────────────
        entry = _build_store_entry(
            trace_id, filename, domain, uif, scout_result,
            "PHASE_A_COMPLETE", modal_refusals, amber_refusals,
        )
        # Store raw chunks for NLP Context Pinning (Day 5 CAPA §3)
        entry["evidence_raw_chunks"] = _extract_evidence_chunks(uif)
        entry["panel_5_missing"] = panel_3_missing  # aliased for dialogue endpoint
        # Seed session_context with mode + user_name so all dialogue phases are mode-aware
        entry.setdefault("session_context", {})["mode"]      = eval_mode
        entry.setdefault("session_context", {})["user_name"] = user_name
        _char_store[trace_id] = entry

        logger.info(
            f"[characterize] PHASE_A_COMPLETE | trace_id={trace_id} "
            f"scouts={len(top_scouts)} recommended={scout_result.recommended}"
        )

        return jsonify({
            "ok":            True,
            "phase":         "A_COMPLETE",
            "trace_id":      trace_id,
            "recommended":   scout_result.recommended if scout_result else domain,
            "uif_signal":    scout_result.uif_signal if scout_result else "G3FP_DEGRADED",
            "panel_1_summary":  panel_1_summary,
            "panel_2_axioms":   panel_2_axioms,
            "panel_3_missing":  panel_3_missing,
            "top_scouts":       top_scouts,
            "coalition":        scout_result.coalition.model_dump() if (scout_result and scout_result.coalition) else None,
            "amber_refusals":   amber_refusals,
            "uif":              uif,
            # ECP-018/ECP-024: SAA Gate result — frontend reads this to flip EVALUATION_STATUS
            "saa_evaluation_status": "LOCKED" if (saa_provisional_metrics or certified_metrics or scout_result) else "UNLOCKED",
            "saa_provisional_markers": [
                {
                    "name":  m.get("name"),
                    "value": m.get("value"),
                    "unit":  m.get("unit", "mg/dL"),
                    "certification": m.get("certification"),
                }
                for m in saa_provisional_metrics[:8]
            ],
        }), 200

    except Exception as exc:
        # ECP-024: Death-spiral prevention — NEVER return 500 to the frontend.
        # Any unhandled exception is wrapped as A_DEGRADED so the Modal still opens.
        logger.critical(f"[ECP-024 DEATH SPIRAL PREVENTION] {exc}", exc_info=True)
        return jsonify({
            "ok":    True,
            "phase": "A_DEGRADED",
            "trace_id": trace_id,
            "amber_refusals": [{"code": "CRITICAL_RECOVERY", "message": str(exc)}],
            "saa_evaluation_status": "UNLOCKED",
        }), 200



# ===========================================================================
# POST /api/agent/seal/characterize/confirm  — Phase B handoff
# ===========================================================================

@characterize_bp.route("/api/agent/seal/characterize/confirm", methods=["POST"])
def characterize_confirm():
    """
    Phase B — Scout confirmation → HITL 5-Panel state handoff.

    Accepts (JSON):
        {
          "trace_id":    "20260429_...",   // MUST match Phase A trace_id
          "decision":    "scout:l1_scout" | "coalition",
          "confirmed_lens": "HEALTHCARE"  // domain lens to lock for Cycle 2
        }

    Returns:
        {
          ok, phase, trace_id, hitl_panels (1-5), cycle_2_ready
        }

    PM mandate: trace_id fragmentation check enforced here.
    Confirmed lens is injected into the LangGraph FSM context for Cycle 2.
    """
    body = request.get_json(force=True, silent=True) or {}

    trace_id      = body.get("trace_id", "").strip()
    decision      = body.get("decision", "").strip()
    confirmed_lens = body.get("confirmed_lens", "").strip().upper()

    # ── Trace ID integrity check ───────────────────────────────────────────
    if not trace_id:
        return jsonify({
            "ok": False, "error_code": "E009",
            "message": "trace_id is required. SESSION_FRAGMENTATION prevented.",
        }), 400

    entry = _char_store.get(trace_id)
    if not entry:
        logger.error(f"SESSION_FRAGMENTATION: trace_id={trace_id} not in store")
        return jsonify({
            "ok": False, "error_code": "E009",
            "message": f"SESSION_FRAGMENTATION: trace_id '{trace_id}' unknown. "
                       f"Call /characterize first.",
        }), 404

    if entry.get("phase") not in ("PHASE_A_COMPLETE",):
        return jsonify({
            "ok": False, "error_code": "E009",
            "message": f"Cannot confirm — current phase is '{entry.get('phase')}'. "
                       f"Expected PHASE_A_COMPLETE.",
        }), 409

    if not decision:
        return jsonify({
            "ok": False, "error_code": "E004",
            "message": "decision is required (e.g. 'scout:l1_scout' or 'coalition').",
        }), 400

    logger.info(
        f"[confirm] Phase B handoff | trace_id={trace_id} "
        f"decision={decision} lens={confirmed_lens}"
    )

    # ── Build all 5 HITL Panels ────────────────────────────────────────────
    uif          = entry.get("uif", {})
    scout_result = entry.get("scout_result")

    panels = _build_all_hitl_panels(
        uif, scout_result, decision, confirmed_lens, trace_id
    )

    # ── Inject confirmed lens into LangGraph FSM context ──────────────────
    fsm_context = _build_fsm_context(
        trace_id, confirmed_lens, decision, uif, scout_result
    )

    # ── Update session store ───────────────────────────────────────────────
    entry.update({
        "phase":          "PHASE_B_HITL_READY",
        "decision":       decision,
        "confirmed_lens": confirmed_lens,
        "hitl_panels":    panels,
        "fsm_context":    fsm_context,
        "confirmed_at":   datetime.datetime.utcnow().isoformat() + "Z",
    })
    _char_store[trace_id] = entry

    # ── Emit HITL_REQUEST on BUS (triggers 5-Panel modal on frontend) ──────
    _emit_hitl_request(trace_id, panels, confirmed_lens)

    return jsonify({
        "ok":            True,
        "phase":         "B_HITL_READY",
        "trace_id":      trace_id,
        "confirmed_lens": confirmed_lens,
        "decision":      decision,
        "hitl_panels":   panels,
        "cycle_2_ready": True,
        "fsm_seed": {
            "lens":    confirmed_lens,
            "axioms":  fsm_context.get("locked_axioms", []),
            "trace_id": trace_id,
        },
    }), 200


# ===========================================================================
# GET /api/agent/seal/characterize/status/<trace_id>
# ===========================================================================

@characterize_bp.route("/api/agent/seal/characterize/status/<trace_id>", methods=["GET"])
def characterize_status(trace_id: str):
    """
    GET /api/agent/seal/characterize/status/<trace_id>
    PGA-01 Auditor-grade snapshot. Returns full state including:
      - uif_preview (with topology hash and entity coords for evidence pinning audit)
      - z_depth_reference (for PGA-01 math axiom audit)
      - scout_combine summary
    """
    import math
    entry = _char_store.get(trace_id)
    if not entry:
        return jsonify({"ok": True, "trace_id": trace_id, "phase": "NONE"}), 200

    uif          = entry.get("uif_preview") or entry.get("uif", {})
    scout_result = entry.get("scout_result")
    topo         = uif.get("topology") or {}

    # ── ECP-024: Z-depth per-metric (dynamic from actual UIF data) ───────────
    # Z = (exp(X) - 1) + ln(value/ref + ε)  where X = (value - ref) / ref
    # Reference defaults from clinical guidelines; overridden by doc ref range if present
    _VREF = {"LDL": 130.0, "TC": 200.0, "HDL": 40.0, "TG": 150.0,
             "GLU": 100.0, "HBA1C": 5.7, "BP_SYS": 120.0, "BP_DIA": 80.0}
    _epsilon = 1e-5
    z_depth_reference: Dict[str, float] = {}
    for _m in uif.get("extracted_data", {}).get("metrics", []):
        _name = (_m.get("name") or "").upper()
        _val  = _m.get("value")
        _ref  = _VREF.get(_name)
        if _ref and isinstance(_val, (int, float)):
            try:
                _x = (_val - _ref) / _ref
                z_depth_reference[_name] = round(
                    (math.exp(_x) - 1) + math.log(_val / _ref + _epsilon), 6
                )
            except (ValueError, OverflowError, ZeroDivisionError):
                z_depth_reference[_name] = 0.0

    # ── Scout combine summary for auditor ──────────────────────────────────
    scout_summary = {}
    if scout_result:
        top = scout_result.top_scouts[0] if scout_result.top_scouts else None
        scout_summary = {
            "recommended":    scout_result.recommended,
            "top_scout_id":   top.scout_id if top else None,
            "winning_score":  top.winning_score if top else None,
            "z_depth_reference": z_depth_reference,
            "uif_signal":     scout_result.uif_signal,
        }

    # ── uif_preview flattened for auditor topology/entity checks ───────────
    data = uif.get("extracted_data", {})
    uif_preview_flat = {
        "mesh_integrity_hash": topo.get("mesh_integrity_hash"),
        "entities": [
            {
                "id":                e.get("id"),
                "type":              e.get("entity_type") or e.get("type"),
                "entity_type":       e.get("entity_type") or e.get("type"),
                "value":             e.get("value"),
                "confidence":        e.get("confidence"),
                "evidence_coordinate": e.get("evidence_coordinate", {}),
            }
            for e in data.get("entities", [])
        ],
        "metrics": [
            {
                "name":              m.get("field_name") or m.get("name"),
                "field_name":        m.get("field_name") or m.get("name"),
                "value":             m.get("value"),
                "unit":              m.get("unit"),
                "evidence_coordinate": m.get("evidence_coordinate", {}),
            }
            for m in data.get("metrics", [])
        ],
        "spatial_clusters":  topo.get("spatial_clusters", []),
        "geometric_density": topo.get("geometric_density"),
    }

    return jsonify({
        "ok":              True,
        "trace_id":        trace_id,
        "phase":           entry.get("phase"),
        "filename":        entry.get("filename"),
        "domain":          entry.get("domain"),
        "confirmed_lens":  entry.get("confirmed_lens"),
        "decision":        entry.get("decision"),
        "created":         entry.get("created"),
        # PGA-01 auditor fields:
        "uif_preview":     uif_preview_flat,
        "scout_combine":   scout_summary,
        "cors_port":       8080,
        "extraction_mode": (uif.get("document_metadata") or {}).get("extraction_mode"),
        "circuit_breaker": entry.get("uif", {}).get("l3_circuit_breaker", {}),
        "audit_packet":    entry.get("audit_packet"),
    }), 200



# ===========================================================================
# Panel builders
# ===========================================================================

def _build_panel_1(uif: Dict, scout_result) -> Dict:
    """Panel 1 — File Summary (name, type, domain, extraction mode, confidence)."""
    meta  = uif.get("document_metadata", {})
    cb    = uif.get("l3_circuit_breaker", {})
    topo  = uif.get("topology") or {}
    return {
        "title":           "Document Intelligence Summary",
        "file_name":       meta.get("file_name"),
        "mime_type":       meta.get("mime_type"),
        "domain_detected": meta.get("domain"),
        "extraction_mode": meta.get("extraction_mode"),
        "entity_count":    len(uif.get("extracted_data", {}).get("entities", [])),
        "metric_count":    len(uif.get("extracted_data", {}).get("metrics", [])),
        "circuit_breaker": cb,
        "topology_hash":   topo.get("mesh_integrity_hash", "")[:16] + "..." if topo.get("mesh_integrity_hash") else None,
        "uif_signal":      scout_result.uif_signal if scout_result else "",
    }


def _build_panel_2(scout_result) -> Dict:
    """Panel 2 — Axiom Election candidates with similarity scores."""
    if not scout_result:
        return {"title": "Axiom Election", "candidates": []}

    candidates = []
    for card in scout_result.top_scouts:
        for axiom in card.matched_axioms[:3]:
            candidates.append({
                "axiom_id":         axiom["axiom_id"],
                "domain":           axiom["domain"],
                "name":             axiom["name"],
                "similarity_score": axiom["similarity_score"],
                "confidence_floor": axiom["confidence_floor"],
                "spatial_tension":  axiom["spatial_tension"],
                "elected_by":       card.scout_id,
                "abduction_logic":  card.abduction_logic[:200],
            })

    # Deduplicate and sort by similarity_score
    seen = set()
    unique = []
    for c in sorted(candidates, key=lambda x: x["similarity_score"], reverse=True):
        if c["axiom_id"] not in seen:
            seen.add(c["axiom_id"])
            unique.append(c)

    coalition = scout_result.coalition
    return {
        "title":          "Axiom Election",
        "candidates":     unique[:8],
        "coalition":      coalition.model_dump() if coalition else None,
        "recommended":    scout_result.recommended,
    }


def _build_panel_3(scout_result) -> Dict:
    """Panel 3 — Missing data fields (feeds HITL Panel 5 and NLP dialogue)."""
    if not scout_result:
        return {"title": "Missing Data Audit", "missing_fields": []}

    all_missing = []
    for card in scout_result.top_scouts:
        all_missing.extend(card.missing_fields)

    # Deduplicate by field name
    seen_fields = set()
    unique_missing = []
    for f in all_missing:
        key = f.get("field", "")
        if key and key not in seen_fields:
            seen_fields.add(key)
            unique_missing.append(f)

    return {
        "title":          "Missing Data Audit",
        "missing_fields": unique_missing,
        "total_missing":  len(unique_missing),
        "blocking":       len(unique_missing) > 0,
    }


def _build_all_hitl_panels(
    uif: Dict, scout_result, decision: str, confirmed_lens: str, trace_id: str
) -> Dict:
    """Construct all 5 HITL panels for Phase B."""
    from modules.axiom_repo.saa_registry import get_registry
    registry = get_registry()

    # Resolve confirmed axiom IDs from decision
    locked_axioms = []
    if scout_result:
        for card in scout_result.top_scouts:
            if decision == "coalition" or card.scout_id in decision:
                locked_axioms = [a["axiom_id"] for a in card.matched_axioms[:5]]
                break
        if not locked_axioms and scout_result.coalition:
            locked_axioms = scout_result.coalition.combined_axioms[:5]

    p1 = _build_panel_1(uif, scout_result)
    p2 = _build_panel_2(scout_result)
    p3 = _build_panel_3(scout_result)

    # Panel 4 — Confirmed axioms with full detail
    confirmed_axioms = []
    for aid in locked_axioms:
        saa = registry.get(aid)
        if saa:
            confirmed_axioms.append(saa.to_dict())

    panel_4 = {
        "title":           "Confirmed Axiom Set",
        "confirmed_lens":  confirmed_lens,
        "decision":        decision,
        "locked_axioms":   confirmed_axioms,
        "axiom_ids":       locked_axioms,
        "contradiction_pairs": [
            (a, b)
            for a in locked_axioms
            for b in (registry.get(a).contradiction_axioms if registry.get(a) else [])
            if b in locked_axioms
        ],
    }

    # Panel 5 — Missing data + NLP dialogue seed
    missing_with_axioms = []
    for aid in locked_axioms:
        saa = registry.get(aid)
        if saa:
            result = saa.check_required_fields(
                uif.get("extracted_data", {}).get("metrics", [])
            )
            missing_with_axioms.extend(result.get("missing", []))

    panel_5 = {
        "title":          "Data Completeness & NLP Dialogue",
        "missing_fields": missing_with_axioms,
        "total_missing":  len(missing_with_axioms),
        "nlp_seed": (
            f"The following required fields were not found in the uploaded document: "
            + ", ".join(m.get("field", "") for m in missing_with_axioms[:5])
            + ". Can you provide these values?"
        ) if missing_with_axioms else "All required fields are present.",
        "dialogue_endpoint": f"/api/agent/seal/dialogue?trace_id={trace_id}",
        "evidence_chunks_available": True,
    }

    return {
        "panel_1": p1,
        "panel_2": p2,
        "panel_3": p3,
        "panel_4": panel_4,
        "panel_5": panel_5,
    }


def _build_fsm_context(
    trace_id: str, confirmed_lens: str, decision: str,
    uif: Dict, scout_result
) -> Dict:
    """
    Context injected into LangGraph FSM for Cycle 2.
    IM01_011: confirmed lens locks system prompt — other domain axioms excluded.
    """
    locked_axioms = []
    if scout_result:
        for card in scout_result.top_scouts:
            if decision == "coalition" or (card.scout_id in decision):
                locked_axioms = [a["axiom_id"] for a in card.matched_axioms[:5]]
                break
        if not locked_axioms and scout_result.coalition:
            locked_axioms = scout_result.coalition.combined_axioms[:5]

    return {
        "trace_id":       trace_id,
        "lens":           confirmed_lens,      # IM01_011: locks system prompt
        "locked_axioms":  locked_axioms,
        "uif_metadata":   uif.get("document_metadata", {}),
        "topology_hash":  (uif.get("topology") or {}).get("mesh_integrity_hash"),
        "cycle":          2,
        "started_at":     datetime.datetime.utcnow().isoformat() + "Z",
    }


def _extract_evidence_chunks(uif: Dict) -> str:
    """
    CAPA §3: Extract raw text evidence chunks for NLP Context Pinning.
    Combines entity values + metric citations + coordinate references.
    """
    parts = []
    data = uif.get("extracted_data", {})
    for e in data.get("entities", [])[:5]:
        coord = e.get("evidence_coordinate", {})
        parts.append(
            f"Entity[{e.get('entity_type') or e.get('type')}] '{e.get('value')}' "
            f"(coord: {coord}) conf={e.get('confidence', 0):.2f}"
        )
    for m in data.get("metrics", [])[:8]:
        coord = m.get("evidence_coordinate", {})
        parts.append(
            f"Metric[{m.get('field_name') or m.get('name')}]={m.get('value')} {m.get('unit')} "
            f"(coord: {coord})"
        )
    return "\n".join(parts) or "No structured evidence extracted."


def _build_store_entry(
    trace_id, filename, domain, uif, scout_result,
    phase, modal_refusals, amber_refusals,
) -> Dict:
    existing = _char_store.get(trace_id) if trace_id in _char_store else {}
    return {
        "trace_id":       trace_id,
        "filename":       filename,
        "domain":         domain,
        "uif":            uif,
        "scout_result":   scout_result,
        "phase":          phase,
        "modal_refusals": modal_refusals,
        "amber_refusals": amber_refusals,
        "dialogue_history": existing.get("dialogue_history", []),
        "confirmed_fields": existing.get("confirmed_fields", {}),
        "confirmed_purpose": existing.get("confirmed_purpose", ""),
        "created":        datetime.datetime.utcnow().isoformat() + "Z",
    }


def _emit_hitl_request(trace_id: str, panels: Dict, lens: str) -> None:
    """Emit HITL_REQUEST on BUS to trigger 5-Panel modal on frontend."""
    try:
        from modules.bus import _global_bus
        if _global_bus:
            payload = {
                "trace_id": trace_id,
                "panels":   panels,
                "lens":     lens,
                "stage":    "PHASE_B_HITL",
            }
            _run_async(_global_bus.emit("HITL_REQUEST", {"payload": payload, "trace_id": trace_id}))
    except Exception as exc:
        logger.warning(f"[confirm] BUS emit non-fatal: {exc}")


# Expose session store for Day 5 NLP dialogue (CAPA §3 Context Pinning)
def get_char_store() -> Dict[str, Dict]:
    return _char_store


# ===========================================================================
# GET /api/agent/seal/thinking/<request_id>  — ECP-010 Real-time stream poll
# ===========================================================================

@characterize_bp.route("/api/agent/seal/thinking/<request_id>", methods=["GET"])
def get_thinking(request_id: str):
    """
    ECP-010: Frontend polls this endpoint during warmup to receive
    real-time thinking steps logged by the characterize pipeline.

    Query params:
        since (int): offset — return only steps after this index
    """
    since = int(request.args.get("since", 0))
    steps = _thinking_store.get(request_id, [])
    new_steps = steps[since:]
    return jsonify({
        "ok":    True,
        "steps": new_steps,
        "total": len(steps),
        "done":  request_id in _thinking_store and len(steps) > 0,
    })


# ── ECP-016: POST /api/agent/seal/set_locale ─────────────────────────────────
# Atomically overrides the language for all subsequent G3FP responses on this
# trace_id session.  Frontend calls this immediately when user says "是" / "yes".
# ---------------------------------------------------------------------------
@characterize_bp.route("/api/agent/seal/set_locale", methods=["POST"])
def set_locale() -> Any:
    """
    Atomically set the language locale for a session.

    Request JSON:
        {
            "trace_id": "20260429_..._ABCDEF",
            "locale":   "zh-TW"   # or "en-US"
        }

    Response JSON:
        { "ok": true, "trace_id": "...", "locale": "zh-TW" }
    """
    try:
        body     = request.get_json(force=True) or {}
        trace_id = (body.get("trace_id") or "").strip()
        locale   = (body.get("locale")   or "zh-TW").strip()

        if not trace_id:
            return jsonify({"error": "trace_id required", "error_code": "E001"}), 400

        if locale not in ("zh-TW", "en-US", "zh-CN"):
            locale = "zh-TW"  # safe default

        # Write to locale store
        _locale_store[trace_id] = locale

        # Also patch the char_store session context if it exists
        if trace_id in _char_store:
            _char_store[trace_id].setdefault("session_context", {})["lang"] = locale

        logger.info(
            "[set_locale] trace_id=%s locale=%s",
            trace_id, locale
        )
        return jsonify({"ok": True, "trace_id": trace_id, "locale": locale})

    except Exception as exc:
        logger.error("[set_locale] E003: %s", exc, exc_info=True)
        return jsonify({"error_code": "E003", "message": str(exc)}), 500
