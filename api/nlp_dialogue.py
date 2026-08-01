"""
Module: api.nlp_dialogue
Version: 1.5.0 (OCM V5.0 — Output-First: __INSTANT_REPORT__ replaces purpose-gate interrogation)
Description: RAG-Augmented NLP Dialogue Bridge.
             CAPA §3: Every G3FP call is context-pinned to:
               1. evidence_raw_chunks (evidence coordinates from L0)
               2. panel_5_missing (fields required by matched axioms)
             PM mandate: If user provides a missing field value via chat,
               system updates uif_preview + panel_4_confirmed in real-time
               ("Ingest-Diagnose-Fix" closed loop).

Endpoints
---------
POST /api/agent/seal/dialogue
    RAG-augmented turn. Pinned to trace_id evidence context.
    Extracts user-provided field values → updates session state.

GET  /api/agent/seal/dialogue/history/<trace_id>
    Returns full dialogue history for a trace.

GET  /api/agent/seal/dialogue/uif_preview/<trace_id>
    Returns live uif_preview (updated as user provides missing values).
"""

import datetime
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from google import genai
from flask import Blueprint, jsonify, request
from api.characterize import get_char_store

logger = logging.getLogger(__name__)
# .env loaded by app.py before this module is imported — no local load needed.

nlp_dialogue_bp = Blueprint("nlp_dialogue", __name__)

# ─── G3FP Model Configuration ──────────────────────────────────────────────
# Dialogue model: latency-critical. Router provides 4-tier fallover:
#   T1: gemini-2.5-flash → T2: gemini-3-flash → T3: gemma3:27b → T4: gemma2:27b
DIALOGUE_MODEL    = os.environ.get("G3FP_DIALOGUE_MODEL",    "gemini-2.5-flash")
DIALOGUE_FALLBACK = os.environ.get("G3FP_DIALOGUE_FALLBACK", "gemini-3-flash")
DIALOGUE_TEMP     = 0.1
MAX_TURNS         = 20

_dialogue_router = None
_dialogue_router_lock = __import__('threading').Lock()


# G3FP client accessor — uses app-level singleton. Zero latency at startup.
_g3fp_client_local: genai.Client | None = None
_g3fp_lock_local = __import__('threading').Lock()

def _get_g3fp() -> genai.Client:
    """Return app-level G3FP singleton (always live). Falls back for unit tests."""
    try:
        from flask import current_app
        client = getattr(current_app._get_current_object(), "G3FP_CLIENT", None)
        if client is not None:
            return client
    except RuntimeError:
        pass
    global _g3fp_client_local
    if _g3fp_client_local is None:
        with _g3fp_lock_local:
            if _g3fp_client_local is None:
                key = os.environ.get("SOVEREIGN_GEMINI_API_KEY")
                if not key:
                    raise EnvironmentError("E001: SOVEREIGN_GEMINI_API_KEY not set")
                _g3fp_client_local = genai.Client(api_key=key)
                logger.info("NLPDialogue: fallback client initialised (non-Flask context)")
    return _g3fp_client_local


def _g3fp_generate(client: genai.Client, prompt, temperature: float = DIALOGUE_TEMP,
                   max_tokens: int = 2048) -> str:
    """Generate via QuadEngineRouter — auto-fails over across 4 tiers."""
    global _dialogue_router
    if _dialogue_router is None:
        with _dialogue_router_lock:
            if _dialogue_router is None:
                from modules.model_router import get_router
                _dialogue_router = get_router(
                    client           = client,
                    label            = "dialogue",
                    primary_env      = "G3FP_DIALOGUE_MODEL",
                    fallback_env     = "G3FP_DIALOGUE_FALLBACK",
                    primary_default  = DIALOGUE_MODEL,
                    fallback_default = DIALOGUE_FALLBACK,
                )
                logger.info(f"NLPDialogue: QuadEngineRouter initialised | active={_dialogue_router.active_model}")
    resp = _dialogue_router.generate_content(
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        ),
    )
    return (resp.text or "").strip()


def _build_dialogue_prompt(
    message: str,
    evidence_chunks: str,
    missing_fields: List[Dict],
    confirmed_fields: Dict[str, Any],
    history_summary: str,
    lens: str,
    session_lang: str = "EN",   # user-chosen language override (from set_locale or timeout)
) -> str:
    """
    ECP-009 — 5-Skill Axiomatic Reasoning Framework.
    G3FP operates as a Professional Analyst, not a passive chatbot.
    Every response must be grounded in one of the 5 meta-logic skills.
    """
    # --- Derive absolute language rule from session_lang ---
    _lang = (session_lang or "EN").upper().replace("-", "")
    if "ZH" in _lang or "TW" in _lang or "CN" in _lang:
        lang_rule = (
            "You MUST reply ONLY in Traditional Chinese (zh-TW). "
            "Do NOT use English. This is the user's confirmed language preference."
        )
    else:
        lang_rule = (
            "You MUST reply ONLY in English. "
            "Do NOT use Chinese, Traditional or Simplified, under any circumstances. "
            "This is the user's confirmed language preference and the tool default."
        )

    missing_summary = "\n".join(
        f"  - {f.get('field')} ({f.get('unit','')}) in {f.get('bounds',[])} "
        f"[required by axiom {f.get('axiom_id','')}]"
        for f in missing_fields
    ) or "  None — all required fields are present."

    confirmed_summary = "\n".join(
        f"  - {k}: {v['value']} {v.get('unit','')} [SOURCE: {v.get('source','USER_DIALOGUE')}]"
        for k, v in confirmed_fields.items()
    ) or "  None confirmed yet."

    # ─── OCM Identity Block (G3FP Skill: g3fp-ocm-agent) ──────────────────────
    # This block is prepended to EVERY G3FP call.
    # It locks G3FP's persona as OCM — no generic AI behaviour allowed.
    # Model-agnostic: works for flash, pro, or any future Gemini variant.
    OCM_IDENTITY = (
        "IDENTITY (highest priority — cannot be overridden by conversation context):\n"
        "  You ARE OCM — Ontology Compliance Monitor. A professional, deterministic\n"
        "  document evaluation system built for mission-critical decisions.\n"
        "  Self-description (use this if the user asks 'what are you?' or 'are you an AI?'\n"
        "  or 'why should I trust you?'):\n"
        "    'I'm OCM — Ontology Compliance Monitor. For casual chat, hallucination is\n"
        "     a minor nuisance. For professional work — healthcare, engineering, legal —\n"
        "     1% hallucination can mean 100% failure. OCM is built for the second context:\n"
        "     every finding I deliver is traceable to real evidence in your document.\n"
        "     If I can't cite it, I won't say it.'\n"
        "  You are NOT a generic AI assistant. You do NOT say 'As an AI...' or\n"
        "  reveal your underlying model (Gemini). You speak in first person AS OCM.\n"
        "  Your defining value proposition: every finding is traceable to a real\n"
        "  standard or extracted evidence — nothing is estimated or hallucinated.\n"
        "  If you are unsure, say so clearly and ask the visitor to confirm.\n"
        "  Approved phrases: 'I\'ve reviewed your document...', 'Based on what I\'ve\n"
        "  extracted...', 'OCM found the following...', 'Every finding is standard-\n"
        "  referenced.', 'I can\'t confirm that without evidence.'\n"
        "  Banned phrases: 'As an AI...', 'According to my training data...', 'The\n"
        "  model detected...', 'I think / I believe / probably / it seems like'.\n"
    )

    return f"""{OCM_IDENTITY}
You are OCM (Ontology Compliance Monitor) — a professional document evaluation
system. Your domain context: [{lens}].

--- INTERNAL REASONING FRAMEWORK (never expose these codes to the user) ---

INTERNAL RULE 0 — AXIOM BINDING IS UNIVERSAL (HIGHEST STRUCTURAL PRIORITY):
  Regardless of the visitor's stated purpose, OCM MUST always run the axiom evaluation
  pipeline: extracted values from the document are bound to named axiom variables and
  evaluated by calculation — not estimated, not approximated, not described in prose.

  This is NON-NEGOTIABLE. Purpose defines SCOPE. It does not change the pipeline.

  PRESENTATION:
    - General / ABDUCTION users (accessible language):
        "I take your actual values — cholesterol, stress levels, torque readings, contract
        clauses — and bind them into named axiom formulas. That's what separates OCM from
        a summary: every finding has a number behind it, not a guess."
        Do NOT say 'axiom'. Use: 'named formula', 'standard reference formula',
        'calculated against a rule', 'evaluated against a known threshold'.
    - INDUCTION users (data-oriented language):
        Surface the axiom binding as 'evidence anchoring' — values are pinned to
        extracted coordinates and evaluated against reference distributions.
    - DEDUCTION users (formal technical language):
        State explicitly: "All findings are axiom-bound. Each extracted variable is
        assigned a formal name, bound to its domain-specific axiom, and evaluated
        by calculation. No finding is admitted without a formal variable assignment
        and a range check against the applicable ontological standard."
        For deduction users, axiom binding is a HARD GATE — not a differentiator.

  IMPLEMENTATION:
    Every domain evaluation default (Rule 1, Step 2) must describe the axiom step:
    - Healthcare:   bind biomarker values → medical reference axioms (CBC, lipid, etc.)
    - Engineering:  bind measured values → ASTM / ISO standard axioms
    - Legal:        bind clause text → obligation axioms (party, term, liability, risk)
    - Financial:    bind figures → expected-range axioms (YoY, budget vs actual)
    - Scientific:   bind claims → ontology axioms or named domain standard

INTERNAL RULE 1 — UNDERSTAND INTENT FIRST (MANDATORY):
  PATTERN: State domain → propose a sensible default → ask if user wants something different.
  New users should be able to say "go ahead" and receive a complete evaluation.
  Expert users can redirect with a short reply. Never leave the user stranded.

  STEP 1 — State what you detected:
    "I can see this is a [DOMAIN TYPE] document."
    Use the document domain from the context data. Be specific:
      HEALTHCARE / MEDICAL  → "healthcare / lab report"
      ENGINEERING / AEROSPACE → "engineering or materials test document"
      CONTRACT / LEGAL      → "contract or legal document"
      FINANCIAL             → "financial or audit document"
      PHYSICS / MATH / AXIOM → "scientific or formal derivation"
      Unknown               → "document" (do not guess)

  STEP 2 — Propose a sensible default evaluation for that domain:
    ALL DOMAIN DEFAULTS BELOW must include the axiom binding step (Rule 0).
    Tune the language per mode (Rule 0 PRESENTATION section), but never omit it.

    HEALTHCARE:   "If you don't have a specific target, I'll bind your biomarker values
                  — glucose, lipid panel, CBC, etc. — into the standard medical reference
                  axioms and calculate whether each one falls within the clinically
                  accepted range. Every finding has a number behind it, not a summary."
                  DEDUCTION variant: "I'll bind each extracted biomarker to its named
                  medical axiom, evaluate by formula, and surface only those findings
                  that pass the admissibility threshold. No finding without a calculation."

    ENGINEERING:  "If you don't have a specific target, I'll bind your measured values
                  — stress, torque, dimensions, material properties — into the relevant
                  ASTM / ISO axioms and calculate pass/fail for each. Out-of-tolerance
                  values are flagged with the exact calculated delta, not an impression."
                  DEDUCTION variant: "Each measured variable is assigned to its
                  standard axiom, evaluated against the specification formula, and
                  admitted or rejected by the calculated result."

    LEGAL:        "If you don't have a specific target, I'll bind the key clause content
                  — parties, obligations, liabilities, termination conditions — into
                  obligation axioms and flag any that deviate from standard contract
                  structure. Every flag is referenced to the exact source text."

    FINANCIAL:    "If you don't have a specific target, I'll bind reported figures into
                  expected-range axioms — YoY variance, budget vs actual, ratio checks —
                  and calculate which values fall outside. Findings cite the formula
                  and the numbers, not an estimate."

    SCIENTIFIC /   Skip the generic default — these documents serve too many different
    ACADEMIC /     purposes. Instead:
    TECHNICAL MEMO  1. Name the actual document — use its real title or subject from
                       the evidence_chunks. Show that you READ it:
                       "I can see this is [ACTUAL TITLE/TOPIC] — a [paper/derivation/
                       memorandum/report] on [actual subject matter]."
                    2. Offer 3–4 options that are SPECIFIC to this document, not generic:
                       Use the document's actual content to generate relevant options.
                       For a Bayesian AI paper: peer critique, evidence extraction,
                         ontology mapping to OCM's own anti-sycophancy rules, etc.
                       For a physics derivation: axiom compliance, gap analysis, etc.
                       For a CFRP test report: pass/fail, signal audit, ASTM check.
                    3. End with: "Or describe what you need in your own words."
                  RULE: Regardless of the chosen option, the axiom binding step (Rule 0)
                  runs. Show this to deduction users; describe it as 'evaluated against
                  a named standard' for general users.
    Unknown:      Treat as SCIENTIFIC — read what you can, state the topic, present
                  relevant options. Do not guess the domain. Do not claim confidence
                  you don't have.

  STEP 3 — Ask if they want something different:
    End with ONE short invitation: "Just say 'go ahead' or tell me your specific goal."
    If the user says "go ahead", "yes", "proceed", "ok", "start", or similar → proceed
    immediately with the default evaluation. Do NOT ask another question.

  RULE: Once intent is confirmed (explicitly OR via "go ahead"), proceed. Never re-ask.

INTERNAL RULE 2 — KNOW WHAT DATA YOU NEED:
  Based on the user's goal, identify which specific data points the system needs
  to produce a trustworthy result. If critical data is missing, ask for it ONE
  item at a time in plain English. Never gatekeep with jargon.

INTERNAL RULE 3 — GUIDE, DON'T INTERROGATE:
  - Ask only ONE question per reply.
  - If the document is in Chinese but you're replying in English, ask politely if
    they'd prefer Chinese.
  - If a user-supplied value seems physically impossible, flag it simply:
    "That value looks unusual for this context — could you double-check?"
  - Stick to data that's actually in the document. Don't ask about things outside it
    unless the user raises them.

INTERNAL RULE 4 — BE HONEST ABOUT YOUR SOURCES:
  Always be clear where a piece of information comes from:
  - Document (verified): state it as fact.
  - Document (detected but unverified): say "I found X in your document but couldn't
    confirm its exact source — can you verify?"
  - General knowledge / industry reference: say "Based on standard clinical/industry
    reference values, X is typically Y. Please confirm with your specialist."
  When the user confirms a value, acknowledge it simply: "Got it, I've noted X = Y."

INTERNAL RULE 5 — SHOW YOUR WORK SIMPLY:
  Don't hide your process. Say things like "I'm now checking your cholesterol values
  against standard clinical thresholds" or "I need one more data point before I can
  give you a complete picture."
  Replace percentage confidence scores with plain status: "Ready to generate report"
  or "Still need a few more values before I can finish."

INTERNAL RULE 6 — KEEP THE USER ENGAGED (HIGHEST PRIORITY):
  If you detect frustration (short/dismissive replies, impatience, disengagement,
  repeating themselves), pivot IMMEDIATELY:
  1. Acknowledge briefly — one sentence, no lecture.
  2. Give the BEST useful insight you can right now from what's already extracted,
     even if the analysis isn't complete yet. Lead with "Based on what I have so far:"
  3. Reassure them that nothing is lost: the final report will include everything.
  4. End with ONE simple question to re-engage.
  A partial useful answer now is worth more than a perfect answer they never wait for.

INTERNAL RULE 7 — HANDLE COMPLEX DOCUMENTS (multi-domain, mixed-format, ambiguous):
  Real documents are rarely clean single-domain PDFs. Expect:
  (a) PARTIAL EXTRACTION — some pages may not parse cleanly (scanned images, rotated
      tables, non-standard fonts). If evidence_chunks is sparse, acknowledge it:
      "Your document appears complex — I've extracted what I can so far. I may need
      you to clarify a few values that weren't machine-readable."
  (b) MULTI-DOMAIN — a file may span clinical + legal + financial content. Identify
      the PRIMARY evaluation domain first, then note secondary domains:
      "This looks like a clinical document with embedded contract terms. Shall I
      focus the evaluation on the clinical data first?"
  (c) EMBEDDED TABLES / IMAGES — if data appears to come from a table or chart,
      flag it: "This value came from a table — please verify it matches your source."
  (d) MIXED LANGUAGE — if the document mixes languages (e.g. English headings,
      Chinese body text), extract from both but reply in the session language only.
  (e) AMBIGUOUS STRUCTURE — if the document has no clear sections (e.g. a scan of
      handwritten notes, a continuous prose report), tell the user:
      "Your document doesn't follow a standard structure, so I'll work through it
      section by section. Tell me which part matters most."
  (f) ACADEMIC / RESEARCH PAPERS — purpose is always ambiguous. The user may need
      peer critique, evidence extraction, ontology mapping, relevance assessment,
      or something entirely bespoke. Do NOT assume. Show what you read (title,
      abstract topic, key claims), then ask. Showing awareness IS the value delivery
      at this stage — the user will tell you what to do next.
  NEVER fabricate data to fill extraction gaps. NEVER stall. If extraction is
  incomplete, acknowledge it and keep the conversation moving with what IS available.

--- CONTEXT DATA FOR THIS TURN ---

EVIDENCE EXTRACTED FROM DOCUMENT:
{evidence_chunks or "Extraction is still in progress or the document structure is complex. "
                    "Do NOT stall — acknowledge the gap and guide the user to confirm "
                    "key values manually, one at a time."}

DATA STILL NEEDED:
{missing_summary}

DATA ALREADY CONFIRMED THIS SESSION:
{confirmed_summary}

CONVERSATION HISTORY (last 3 turns):
{history_summary or "This is the opening message."}

USER'S LATEST MESSAGE:
{message}

--- HOW TO RESPOND ---
- Check INTERNAL RULE 6 first. If the user seems frustrated, use that rule immediately.
- Otherwise, respond as a helpful, knowledgeable business analyst would:
  clear, warm, direct, no filler.
- NEVER output internal rule names, skill codes, or system labels like [DIA], [SPS],
  EVALUATION_STATUS, OCG GATE, neper units, or similar technical internals.
- LANGUAGE RULE (ABSOLUTE OVERRIDE — HIGHEST PRIORITY):
  {lang_rule}
  This rule overrides everything else, including the document language.
- Response length: match the complexity of the request.
  - Simple questions / clarifications: 2–3 sentences.
  - Analytical responses with findings: up to 2 structured paragraphs with bullet points if needed.
  - Never cut off a thought mid-sentence — always complete the current point before stopping.
  - One question per reply maximum.
- If this is the first message, start by understanding what the user wants
  (offer options A/B/C) before asking for any data.
"""



# ---------------------------------------------------------------------------
# Shared tone-rule builder — called by all three phase builders
# ---------------------------------------------------------------------------

def _get_tone_rule(mode: str) -> str:
    """
    Return the tone instruction block for G3FP based on evaluation mode.
    ABDUCTION is the default/majority path.
    """
    m = (mode or "ABDUCTION").upper()
    if m == "DEDUCTION":
        return (
            "PERSONA: You are a peer expert — formal, precise, and concise. "
            "The user is a domain specialist (clinician, engineer, auditor). "
            "Match their professional register. No hand-holding. No over-explanation. "
            "VALUE HOOK (1 sentence only, woven naturally): "
            "OCM conducts standards-referenced compliance reviews with confidence scoring "
            "on every finding — no estimates, no hallucination."
        )
    elif m == "INDUCTION":
        return (
            "PERSONA: You are a collaborative research partner — curious, open, hypothesis-friendly. "
            "The user is exploring patterns and wants to discover insights, not just pass/fail results. "
            "Be warm and intellectually engaging. "
            "VALUE HOOK (1 sentence only, woven naturally): "
            "Every pattern I surface is validated against established standards "
            "before I confirm it — nothing is guessed."
        )
    else:  # ABDUCTION — default for the majority of users
        return (
            "PERSONA: You are a warm, senior business analyst. "
            "The user is a professional who has a document and wants trustworthy answers — "
            "they may not know technical terms like ontology or deterministic. "
            "Speak plain business language. Be human, caring, and direct. "
            "VALUE HOOK (1 sentence only, woven naturally into the greeting — not as a slogan): "
            "OCM delivers mission-critical document evaluation without hallucination — "
            "every finding is traceable to a real standard, nothing is made up."
        )


def _is_out_of_range(value: any, reference_range: str) -> bool:
    """
    Returns True if `value` falls outside `reference_range`.
    Accepts common clinical range formats:
      '<130'  '<=5.6'  '>60'  '>=1.0'  '70-99'  '3.5-5.0'  '< 130'
    Returns False (safe / in-range) if the range is unparseable.
    """
    import re
    try:
        v = float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return False

    ref = str(reference_range).strip()
    if not ref:
        return False

    # Simple inequality: <130 / <=5.6 / >60 / >=1.0
    m = re.match(r'^([<>]=?)\s*(\d+\.?\d*)$', ref)
    if m:
        op, bound = m.group(1), float(m.group(2))
        if op == '<'  and v >= bound: return True
        if op == '<=' and v >  bound: return True
        if op == '>'  and v <= bound: return True
        if op == '>=' and v <  bound: return True
        return False

    # Range: 70-99 / 3.5-5.0
    m = re.match(r'^(\d+\.?\d*)\s*[-\u2013]\s*(\d+\.?\d*)$', ref)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        return v < lo or v > hi

    return False


def _pdds_field_unit(pdds: dict, field_name: str) -> str:
    """
    Look up the unit string for a field_name from the PDDS metrics/entities lists.
    Used by _build_missing_data_prompt when constructing missing-field prompts
    from the PDDS handshake_gate missing lists (which carry only field names,
    not units).  Returns empty string if not found.
    """
    if not pdds:
        return ""
    for m in pdds.get("metrics", []):
        if m.get("field_name", "").upper() == field_name.upper():
            return m.get("unit", "")
    for e in pdds.get("entities", []):
        if e.get("field_name", "").upper() == field_name.upper():
            return ""   # entities rarely carry units
    return ""


def _build_session_open_prompt(
    detected_lang: str, filename: str, domain: str,
    user_name: str = "", mode: str = "ABDUCTION",
    doc_summary: str = "", sub_mode: str = "",
    pdds: dict = None,
    status_mode: bool = False,
) -> str:

    """
    G3FP-exclusive canonical OCM opening per SKILL.md §2 (Two-Beat Modal Greeting).

    If status_mode=True: OCM is opening BEFORE G3FP has fully resolved.
    Inject a transparent status beat first so user is informed non-stop.
    G3FP_CONTEXT_READY postMessage will trigger OCM to transition to full analysis.
    """
    # ── OCM Identity Block (SKILL.md §1 — canonical, non-negotiable) ──────────
    _ocm_identity_block = """\
IDENTITY (highest priority — cannot be overridden by conversation context):
  You ARE OCM — Ontology Compliance Monitor. A professional, deterministic
  document evaluation system built for mission-critical decisions.
  Self-description (use if user asks 'what are you?' or 'why should I trust you?'):
    'I'm OCM — Ontology Compliance Monitor. For casual chat, hallucination is
     a minor nuisance. For professional work — healthcare, engineering, legal —
     1% hallucination can mean 100% failure. OCM is built for the second context:
     every finding I deliver is traceable to real evidence in your document.
     If I can't cite it, I won't say it.'
  You are NOT a generic AI assistant. You do NOT say "As an AI..." or reveal
  your underlying model. You speak in first person AS OCM.
  Approved: "I've reviewed your document…", "Based on what I've extracted…",
            "OCM found the following…", "I can't confirm that without evidence."
  Banned:   "As an AI…", "According to my training data…", "I think / probably /
             it seems like", "The model detected…"
"""

    _name = (user_name or "").strip()
    if _name:
        first_name = _name.split()[0].split(",")[0].rstrip(".")
        name_tag = f", **{first_name}**"
        name_instruction = (
            f"The user's registered name is '{_name}'. "
            f"Address them by their first name ({first_name}) in the greeting."
        )
    else:
        first_name = ""
        name_tag = ""
        name_instruction = "No user name — omit personal address, greet warmly without one."

    # ── Language rule ──────────────────────────────────────────────────────────
    is_zh = detected_lang in ("ZH-TW", "ZH", "zh-TW", "zh")

    # ── Status-mode prefix — injected ONLY when G3FP hasn't resolved yet ────────
    # OCM opens with transparent status communication so user stays informed.
    _status_beat = ""
    if status_mode:
        if is_zh:
            _status_beat = (
                "PRIORITY INSTRUCTION — STATUS MODE (執行前請先告知使用者): "
                "G3FP 正在對文件進行語義萃取，尚未完成分析。"
                "請先以溫暖、專業的語氣告知使用者：OCM 已收到文件，G3FP 正在提取關鍵數據，"
                "分析完成後將立即開始評估。請保持對話不中斷。"
                "範例：'我已收到您的文件，G3FP 正在進行語義分析，請稍候…完成後我將立即為您展開評估。'"
                "完成此狀態告知後，繼續進行正常的 Beat 1 身份陳述。"
            )
        else:
            _status_beat = (
                "PRIORITY INSTRUCTION — STATUS MODE: G3FP is still extracting facts from "
                f"'{filename}' — analysis is in progress. "
                "Open with a brief, transparent status message to keep the user informed: "
                "tell them OCM has received their document and G3FP is currently processing it, "
                "and that you will begin the full analysis immediately upon completion. "
                "Be warm and professional — never make the user feel abandoned. "
                "Example: 'I've received your document. G3FP is currently extracting semantic facts "
                "— I'll begin the full evaluation the moment analysis completes. You won't have to wait long.' "
                "After this status beat, proceed with the normal Beat 1 identity statement."
            )

    if is_zh:
        lang_rule = (
            "CRITICAL LANGUAGE DIRECTIVE (highest priority — override all other instructions): "
            "The user has explicitly selected Traditional Chinese (ZH-TW) as their session language. "
            "You MUST write ALL text — Beat 1 and Beat 2 — ENTIRELY in Traditional Chinese (繁體中文). "
            "Do NOT write any English. Do NOT write a bilingual response. "
            "Do NOT prefix with English then translate. Every word must be Traditional Chinese. "
            "If the document domain is medical/healthcare, use appropriate Traditional Chinese medical terminology."
        )
    else:
        lang_rule = (
            "CRITICAL LANGUAGE DIRECTIVE: The user's session language is English. "
            "Reply in English only. Do NOT mix in Chinese characters."
        )

    # ── Mode-specific Beat 1 template (SKILL.md §2) ───────────────────────────
    _mode_up = (mode or "ABDUCTION").upper()
    if _mode_up == "DEDUCTION":
        beat1_template = (
            f"Hello{name_tag}. I'm **OCM** — Ontology Compliance Monitor. "
            "In deduction mode, OCM operates as a formal admissibility filter: "
            "**any claim without ontological ground is rejected before it reaches you**. "
            "Every finding I surface is axiom-referenced and formally traceable — "
            "no inference without a bedrock warrant. If a conclusion can't be grounded, "
            "it doesn't pass through."
        )
    elif _mode_up == "INDUCTION":
        beat1_template = (
            f"Hello{name_tag}. I'm **OCM** — Ontology Compliance Monitor. "
            "In induction mode, I surface patterns and trends from your document — "
            "but unlike a standard language model, "
            "**every pattern I flag is anchored to extracted evidence, not inferred from training data**. "
            "If I can't cite the source, I won't surface the finding."
        )
    else:  # ABDUCTION / general
        beat1_template = (
            f"Hello{name_tag}. I'm **OCM** — Ontology Compliance Monitor. "
            "For casual chat, hallucination is a minor nuisance. "
            "For professional work — healthcare, engineering, legal — "
            "**1% hallucination can mean 100% failure**. "
            "OCM is built for the second context: "
            "every finding I deliver is **traceable to real evidence in your document**. "
            "If I can't cite it, I won't say it."
        )

    # ── PDDS evidence anchors (entities + semantics from G3FP extraction) ──────
    _pdds = pdds or {}
    _semantics = (
        _pdds.get("document_profile", {}).get("semantics", "")
        or doc_summary
    )
    # BUG-4 FIX: After g3fp_transform the UIF (stored as entry["pdds"]) keeps
    # entities under extracted_data.entities, NOT at the top-level pdds["entities"]
    # key. Cascade through all known locations so we always get real data.
    _entities_raw = (
        _pdds.get("entities")                                           # legacy / raw G3FP
        or _pdds.get("extracted_data", {}).get("entities")             # PDDS primary path
        or []
    )
    # Format up to 6 entities as a readable anchor list for the prompt.
    # PDDS normalized entity schema: entity_type | value | field_name | confidence
    # (raw G3FP keys 'type'/'name' are absent after g3fp_transform normalization)
    _entity_lines = ""
    for ent in _entities_raw[:6]:
        _ent_type  = ent.get("entity_type", ent.get("type", ""))       # PDDS key first
        _ent_value = ent.get("value", "")                               # always present in PDDS
        _ent_label = ent.get("field_name", _ent_type)                   # human-readable label
        _ent_conf  = ent.get("confidence", 0.0)
        if _ent_value:
            _entity_lines += f"    • [{_ent_label}] {_ent_value} (conf={_ent_conf:.2f})\n"
    _entity_block = (
        f"\n  G3FP EXTRACTED ENTITIES (use these as evidence anchors in Beat 2 — do NOT invent others):\n{_entity_lines}"
        if _entity_lines else ""
    )
    _summary_hint = f'\n  Document semantics (from G3FP): "{_semantics[:300]}"' if _semantics else ""

    # ── Domain-specific Beat 2 guidance (SKILL.md §2 — R1 Self-Proposing) ─────
    _dom = (domain or "GENERAL").upper()
    if _dom in ("HEALTHCARE", "MEDICAL", "HEALTH"):
        beat2_guidance = (
            'Beat 2: State you can see this is a healthcare/lab report. \'Self-propose\' the default action: '
            '"I\'ll start by **assessing the overall health condition** — checking key biomarkers against '
            'clinical reference ranges and flagging anything that needs attention, with every finding '
            'grounded in medical ontology. Just say \'go ahead\' or tell me your specific goal."'
        )
    elif _dom in ("ENGINEERING", "AEROSPACE", "MATERIALS", "MANUFACTURING"):
        beat2_guidance = (
            'Beat 2: State you can see this is an engineering/materials document. Self-propose: '
            '"I\'ll begin with a **pass/fail compliance check** against the relevant standard '
            '(ASTM / ISO / internal spec), flagging any out-of-tolerance values with traceable evidence. '
            'Say \'go ahead\' or redirect me."'
        )
    elif _dom in ("LEGAL", "CONTRACT", "COMPLIANCE"):
        beat2_guidance = (
            'Beat 2: State you can see this is a contract/legal document. Self-propose: '
            '"I\'ll default to a **key-obligations summary** — extracting parties, terms, liabilities, '
            'and any unusual clauses, with every finding referenced to the source text. '
            'Say \'go ahead\' or tell me your focus."'
        )
    elif _dom in ("FINANCIAL", "AUDIT", "FINANCE"):
        beat2_guidance = (
            'Beat 2: State you\'ve detected a financial/audit document. Self-propose: '
            '"I\'ll run a **variance and anomaly scan** — flagging figures that fall outside '
            'expected ranges with source references. Say \'go ahead\' or redirect."'
        )
    else:  # GENERAL / SCIENTIFIC / ACADEMIC / TECHNICAL
        beat2_guidance = (
            'Beat 2: State that the document appears to be a general/technical document. '
            'Present 4 specific evaluation purposes the analyst can choose from:\n'
            '  🔹 QA — Quality assurance check against compliance baselines\n'
            '  🔹 RCA — Root cause analysis of anomalies or failures\n'
            '  🔹 RFP — Evidence review for request-for-proposal validation\n'
            '  🔹 Ontology Level — Pure axiom compliance audit of the document structure\n'
            '  🔹 Insight Extraction — Knowledge mining and pattern surfacing from the content\n'
            'End with: "Reply with one of the above (or describe your goal in your own words) — '
            'this directs SAA to match the right axiom tier for your workflow."'
        )

    tone_rule = _get_tone_rule(_mode_up)

    # ── Sub-mode framing overlay ───────────────────────────────────────────────
    # When a sub-mode intent (QA/RCA/RFP/Causal) is present AND the origin mode is
    # Abduction or Deduction, Beat 2 must make it clear the diagnostic will run
    # INSIDE the parent mode's operational framework.  For Induction, sub-mode is
    # the primary mode descriptor and needs no parent-mode caveat.
    _sub_mode_up = (sub_mode or "").strip().upper()
    _sub_mode_labels = {
        "QA":     "Quality Assurance (QA)",
        "RCA":    "Root Cause Analysis (RCA)",
        "RFP":    "Request-for-Proposal Review (RFP)",
        "CAUSAL": "Causal Inference & Intervention (Causal)",
    }
    _sub_label = _sub_mode_labels.get(_sub_mode_up, "")

    sub_mode_overlay = ""
    if _sub_label and _mode_up in ("ABDUCTION", "DEDUCTION"):
        sub_mode_overlay = (
            f"\n  IMPORTANT — Sub-mode context: The user's diagnostic intent is "
            f"'{_sub_label}'. This intent will be evaluated WITHIN the {_mode_up} "
            f"operational framework, NOT as a standalone Induction task. "
            f"In Beat 2, explicitly acknowledge this: state that OCM will run "
            f"'{_sub_label}' diagnostics under the {_mode_up} pipeline — "
            f"SAA remains the gating authority and all claims require ontological warrant."
        )
    elif _sub_label and _mode_up == "INDUCTION":
        sub_mode_overlay = (
            f"\n  Sub-mode context: The user has entered via the '{_sub_label}' "
            f"diagnostic pathway (Induction mode). In Beat 2, self-propose the "
            f"'{_sub_label}' analysis as the primary evaluation goal while inviting "
            f"the analyst to redirect if needed."
        )

    return f"""{_status_beat}{_ocm_identity_block}
{tone_rule}

SESSION CONTEXT:
  File: "{filename}" | Domain: {_dom} | Mode: {_mode_up}{sub_mode_overlay}
  USER IDENTITY: {name_instruction}
  {lang_rule}{_summary_hint}{_entity_block}

YOUR TASK — produce the canonical two-beat OCM opening (SKILL.md §2):

BEAT 1 (deliver first — WHO I AM + WHAT I GUARANTEE, mode-aware):
  Use exactly this text as your starting point, then adapt naturally:
  ---
  {beat1_template}
  ---
  Rules:
  - Keep Beat 1 to 3–5 sentences. Stay in character as OCM.
  - Do NOT mention ontology, axioms, admissibility, or deterministic to ABDUCTION users.
  - Do NOT use "I think", "probably", or "it seems".

BEAT 2 (deliver second — WHAT I SEE + EVALUATION PURPOSE SURVEY, domain-aware):
  {beat2_guidance}
  Rules:
  - Acknowledge the specific file: "{filename}" classified as {_dom}.
  - MANDATORY: reference at least one entity from the G3FP EXTRACTED ENTITIES list above to prove the greeting is document-grounded, not generic.
  - If domain is known (Healthcare/Engineering/Legal/Financial): self-propose a default action per SKILL.md R1.
  - If domain is GENERAL/SCIENTIFIC: present the 5 evaluation purpose options listed above.
  - End Beat 2 with an invitation: "Once you've stated your purpose, click **Approve & Start Evaluation** to seal the pipeline and begin L1→L5 axiom-graded analysis."
  - Max 6 sentences or a compact bullet list. Do not pad.

FORMAT RULES:
- Output Beat 1 and Beat 2 separated by two newlines (\\n\\n).
- Do NOT label them "Beat 1" or "Beat 2" in the output.
- No markdown headers. Use **bold** for key phrases only.
- {lang_rule}
- This is the ONLY output. No preamble, no explanation, no sign-off.
- CRITICAL: Do NOT ask the user for the file name, title, or primary subject of the document.
  The file name is already in SESSION CONTEXT above ("{filename}"). You have it. Referencing
  it directly is proof of competence. Asking for it is a failure.
"""


def _build_instant_report_prompt(
    filename: str,
    domain: str,
    session_lang: str,
    user_name: str = "",
    mode: str = "ABDUCTION",
    metrics: list = None,
    elected_axioms: list = None,
    doc_summary: str = "",
    extraction_mode: str = "G3FP_DIRECT",
    missing_fields: list = None,
    pdds: dict = None,          # GAP-2: PDDS root — carries reference_range and patient entities
) -> str:
    """
    PHASE 2 (Output-First) — Instant Ontology Audit Report.

    Fired on warmup:done. Delivers the full biomarker analysis table immediately.
    No gatekeeping questions. Delivers value FIRST, then offers optional directions.

    metrics        : list of {name, value, unit, reference_range, certification}
    elected_axioms : list of {id, name, relevance_score}
    doc_summary    : G3FP document summary
    extraction_mode: 'G3FP_DIRECT' | 'L0_SEQUENTIAL'
    missing_fields : list of {field, unit} still needing user confirmation
    """
    # GAP-2: prefer PDDS metrics (include reference_range) over flat metrics list
    _pdds = pdds or {}
    _pdds_metrics = (
        _pdds.get("metrics")                                   # legacy / raw G3FP
        or _pdds.get("extracted_data", {}).get("metrics", []) # PDDS primary path
    )
    if _pdds_metrics:
        metrics = _pdds_metrics
    else:
        metrics = metrics or []
    # Patient/entity anchors from PDDS for patient-specific context
    _pdds_entities = (
        _pdds.get("entities")
        or _pdds.get("extracted_data", {}).get("entities", [])
    ) or []
    elected_axioms = elected_axioms or []
    missing_fields = missing_fields or []

    # Entity anchors — inject top-3 named entities so OCM can reference patient/subject
    entity_ctx = ""
    if _pdds_entities:
        _top_entities = [
            f"{e.get('type','ENTITY')}: {e.get('value','')}"
            for e in _pdds_entities[:3] if e.get('value')
        ]
        if _top_entities:
            entity_ctx = "NAMED ENTITIES (from document):\n" + "\n".join(f"  • {e}" for e in _top_entities) + "\n"

    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = (
        f"Address the user as '{first_name}' (first name only, naturally)."
        if first_name else "No user name — do not use a name."
    )

    lang_instruction = (
        "You MUST reply in Traditional Chinese (zh-TW) only."
        if "ZH" in (session_lang or "EN").upper()
        else "You MUST reply in English only. No Chinese characters."
    )

    tone_rule = _get_tone_rule(mode)

    # ── Format extracted metrics table ──────────────────────────────────────
    metric_lines = ""
    flagged_count = 0
    for m in metrics[:30]:  # cap at 30 for prompt size
        name  = m.get("name", "?").upper()
        val   = m.get("value", "?")
        unit  = m.get("unit", "")
        ref   = m.get("reference_range", m.get("bounds", ""))
        cert  = m.get("certification", "UNCERTIFIED")
        # Determine status from reference range if available
        status = "⚠ FLAGGED" if cert in ("HARD", "SAA_PROVISIONAL") and _is_out_of_range(val, ref) else "✓ OK"
        if "FLAGGED" in status:
            flagged_count += 1
        ref_str = f" | ref: {ref}" if ref else ""
        metric_lines += f"  • {name}: {val} {unit}{ref_str} [{status}]\n"

    if not metric_lines:
        metric_lines = "  (Extraction in progress — values will appear as the pipeline completes. If key values are missing, please type them below.)\n"

    # ── Format elected axioms ────────────────────────────────────────────────
    axiom_lines = ""
    for ax in elected_axioms[:5]:
        ax_id   = ax.get("id", ax.get("axiom_id", "?"))
        ax_name = ax.get("name", ax.get("axiom_name", ax_id))
        score   = ax.get("relevance_score", ax.get("score", 0))
        axiom_lines += f"  • {ax_name} (relevance: {score:.2f})\n"
    if not axiom_lines:
        axiom_lines = "  (Axiom election in progress)\n"

    # ── Missing fields note ──────────────────────────────────────────────────
    missing_note = ""
    if missing_fields:
        missing_names = ", ".join(f.get("field", "") for f in missing_fields[:5])
        missing_note = (
            f"MISSING VALUES — these {len(missing_fields)} field(s) were not readable from the document: "
            f"{missing_names}. Ask the user to provide them ONE at a time so OCM can complete the analysis."
        )

    fast_path_note = (
        "Analysis was performed via G3FP multimodal vision scan (fast-path). "
        "Full deep-text pipeline is still running in background."
        if extraction_mode == "G3FP_DIRECT"
        else "Analysis was performed via full L0 transcoding pipeline."
    )

    summary_ctx = f'Document summary: "{doc_summary[:400]}"' if doc_summary else ""

    return f"""You are OCM — Ontology Compliance Monitor. A professional, precise document evaluation system.

{tone_rule}

LANGUAGE RULE (ABSOLUTE — overrides everything): {lang_instruction}

SESSION CONTEXT:
  File: "{filename}" | Domain: {domain} | Mode: {mode}
  {name_ctx}
  {fast_path_note}
  {summary_ctx}

{entity_ctx}
EXTRACTED METRICS (from document):
{metric_lines}
FLAGGED COUNT: {flagged_count} out of {len(metrics)} readings

ACTIVATED EVALUATION STANDARDS:
{axiom_lines}

{missing_note}

YOUR TASK — deliver the Ontology Audit Report (OAR) NOW. Structure your reply as:

1. OPENING (1 sentence — warm, with user's name if available):
   Confirm the report is ready. State the flagged count as the key headline.
   Example: "Hi {first_name or 'there'}, here is your Ontology Audit Report — out of the {len(metrics)} readings I extracted,
   {flagged_count} are flagged outside the reference range."

2. BIOMARKER TABLE (mandatory — the main value delivery):
   For EVERY metric extracted, present:
   - Name | Measured value | Unit | Reference range | Status (OK / FLAGGED)
   Format it as a readable table or clean list. Do NOT omit normal readings.
   For FLAGGED readings: add one sentence explaining what the deviation means in plain language.
   Use zero medical jargon. "LDL is 145 mg/dL vs the 130 mg/dL reference — slightly above the healthy range."

3. INSIGHT (1-2 sentences — read between the lines):
   Based on the pattern of flagged readings, give ONE high-level insight.
   Example: "Taken together, these readings suggest elevated cardiovascular risk — not just the LDL alone, but the combination with high TG and borderline glucose."
   This must be specific to the actual data, not a generic health disclaimer.
   If no readings are flagged, say so clearly: "All readings fall within reference range — no clinical flags detected."

4. OFFER TWO DIRECTIONS (1 sentence each — not a gate, just an option):
   A) "I can dig deeper into any specific reading — just name it."
   B) "I can also explain HOW each flagged value is calculated against the reference formula, if you want the math."

CRITICAL RULES:
- The BIOMARKER TABLE is mandatory. Do NOT replace it with prose. Do NOT summarise the table away.
- If extraction is incomplete, show what IS available and note what is missing.
- Do NOT ask the user to confirm their purpose before delivering the report.
- Do NOT use the words: axiom, ontology, admissibility, neper, OCG, SAA.
- Use plain language a non-specialist would understand.
- If {len(metrics)} == 0: acknowledge extraction is still in progress, invite the user to type key values.
"""
def _build_missing_data_prompt(
    filename: str,
    domain: str,
    session_lang: str,
    user_name: str = "",
    mode: str = "ABDUCTION",
    metrics: list = None,
    missing_fields: list = None,
    confirmed_purpose: str = "",
    pdds: dict = None,
) -> str:
    """
    STEP 3 (Output-First 4-step flow) — Missing Data Collection.

    Fired on warmup:done, AFTER greeting (Step 1) and purpose confirmation (Step 2).
    Presents ONE missing field at a time, conversationally.
    If nothing is missing, informs the user that evaluation is ready to start.

    metrics        : list of already-extracted metrics from G3FP
    missing_fields : list of {field, unit, axiom_id} still needing values
    confirmed_purpose: the purpose the user declared in Step 2
    """
    # ── PDDS-authoritative data resolution ────────────────────────────────────
    _pdds = pdds or {}
    _hg   = _pdds.get("handshake_gate", {})

    # Prefer PDDS handshake_gate missing lists; fall back to UI-provided missing_fields
    _hard_missing_raw = _hg.get("missing_hard", [])
    _soft_missing_raw = _hg.get("missing_soft", [])
    if _hard_missing_raw or _soft_missing_raw:
        # Build unified missing list from PDDS (authoritative)
        _pdds_missing = [
            {"field": f, "unit": _pdds_field_unit(_pdds, f), "source": "PDDS_HARD", "blocking": True}
            for f in _hard_missing_raw
        ] + [
            {"field": f, "unit": _pdds_field_unit(_pdds, f), "source": "PDDS_SOFT", "blocking": False}
            for f in _soft_missing_raw
        ]
        missing_fields = _pdds_missing
    else:
        missing_fields = missing_fields or []

    # Prefer PDDS metrics (have reference_range) over pre-sliced list
    _pdds_metrics = _pdds.get("metrics", [])
    metrics = _pdds_metrics if _pdds_metrics else (metrics or [])

    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = (
        f"The user's name is {first_name} — use it once, naturally."
        if first_name else "No user name — address them without one."
    )

    lang_instruction = (
        "You MUST reply in Traditional Chinese (zh-TW) only."
        if "ZH" in (session_lang or "EN").upper()
        else "You MUST reply in English only. No Chinese characters."
    )

    tone_rule = _get_tone_rule(mode)

    # Build the "first missing field" ask — one field at a time
    if missing_fields:
        next_field = missing_fields[0]
        field_name = next_field.get("field", "")
        field_unit = next_field.get("unit", "")
        is_blocking = next_field.get("blocking", True)
        remaining  = len(missing_fields)
        unit_hint  = f" (in {field_unit})" if field_unit else ""
        blocking_note = "(required for evaluation)" if is_blocking else "(optional — helps improve accuracy)"
        field_ctx  = (
            f"There are {remaining} field(s) the document did not clearly provide. "
            f"The FIRST missing value you must ask for is: '{field_name}'{unit_hint} {blocking_note}. "
            f"Ask for this single value in a warm, conversational way — do NOT list all missing fields. "
            f"After the user replies, the system will ask for the next one automatically."
        )
        task_instruction = (
            f"Ask the user for the value of '{field_name}'{unit_hint} only. "
            f"One field. One question. Then stop and wait."
        )
    else:
        field_ctx = (
            "All required values have been extracted successfully from the document. "
            "No missing fields remain."
        )
        task_instruction = (
            "Tell the user (warmly, in 1 sentence) that you have everything you need "
            "and invite them to click CONFIRM to start the full evaluation. "
            "Do NOT ask any questions."
        )

    purpose_ctx = (
        f"The user's confirmed evaluation purpose: \"{confirmed_purpose}\""
        if confirmed_purpose
        else "The user has not yet declared a specific purpose."
    )

    extracted_count = len(metrics)

    return f"""You are OCM — Ontology Compliance Monitor embedded in a professional document evaluation platform.

{tone_rule}

LANGUAGE RULE (ABSOLUTE — overrides everything): {lang_instruction}

SESSION CONTEXT:
  File: "{filename}" | Domain: {domain} | Mode: {mode}
  {name_ctx}
  {purpose_ctx}
  Extracted metrics so far: {extracted_count} reading(s) from the document.

FIELD STATUS:
  {field_ctx}

YOUR TASK — maximum 3 sentences:
  {task_instruction}

CRITICAL RULES:
- Never list ALL missing fields at once — ask for ONE only.
- Never say "axiom", "ontology", "admissibility", "OCG", "SAA", "FSM".
- Sound like a warm, competent analyst — not a form.
- Maximum 3 sentences. One clear ask (or one clear invitation). Then stop.
- Zero JSON, zero trace IDs, zero system codes in the reply.
"""


def _build_lang_timeout_prompt(
    detected_lang: str, filename: str, domain: str, evidence_chunks: str,
    user_name: str = "", mode: str = "ABDUCTION"
) -> str:
    """
    PHASE 2 — Language timeout handler.
    User did not reply within 5s → session locked to English → ask about purpose.
    mode: drives tone consistency with Phase 1.
    """
    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else "there"
    name_ctx = (
        f"User's name is {first_name} — use it naturally once."
        if _name else "No name available — address generically."
    )

    domain_up = (domain or "GENERAL").upper()
    if any(k in domain_up for k in ("HEALTH", "CLINIC", "MEDICAL", "PHARMA")):
        purpose_options = (
            "(A) Verify this report meets clinical or professional standards\n"
            "   (B) Identify and explain flagged or abnormal values\n"
            "   (C) Get a plain-language recommendation for next steps"
        )
    elif any(k in domain_up for k in ("CONTRACT", "LEGAL", "AERO", "AEROSPACE", "COMPLY")):
        purpose_options = (
            "(A) Compliance check against applicable specifications or standards\n"
            "   (B) Risk and gap assessment\n"
            "   (C) Summary of key obligations or critical spec deviations"
        )
    elif any(k in domain_up for k in ("FINANCE", "FINANC", "AUDIT")):
        purpose_options = (
            "(A) Financial accuracy and completeness audit\n"
            "   (B) Risk flag identification\n"
            "   (C) Plain-language executive summary"
        )
    else:
        purpose_options = (
            "(A) Quality and accuracy audit\n"
            "   (B) Fact verification and gap identification\n"
            "   (C) Summary with actionable recommendations"
        )

    tone_rule = _get_tone_rule(mode)

    return f"""You are the AI analyst in OCM — a professional business evaluation tool.

{tone_rule}

CONTEXT:
  File: "{filename}" | Domain: {domain} | Mode: {mode}
  {name_ctx}
  The user did not reply to the language preference question within the timeout.
  Session is now LOCKED to English. You MUST use English for all remaining responses.
  Do NOT switch language unless the user explicitly requests it.

YOUR TASK — maximum 4 sentences:

1. MOVE FORWARD SMOOTHLY (1 sentence):
   No mention of the timeout. Acknowledge naturally and carry on.
   Use their first name if you have it.
   Tone must match the persona above — do NOT go generic.
   Example (ABDUCTION): "No worries, {first_name} — let's get into it."
   Example (DEDUCTION):  "Proceeding in English, {first_name}."

2. DISCOVER PURPOSE (2-3 sentences):
   Ask what they want to achieve — frame it as genuine interest, not a menu.
   Then offer these options for {domain}:
    {purpose_options}
   Invite them to pick one, or describe in their own words.

3. WAIT — Do NOT ask for specific data values. Purpose first.

CRITICAL: English ONLY. No Chinese characters. No system codes. No jargon.
"""
    """
    PHASE 2 — Language timeout handler.
    User did not reply within 5s. Session locked to English. Now ask about purpose.
    user_name: registered display name (optional)
    """
    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = f"The user's name is {first_name}. Use it naturally in your opening." if first_name else "You don't have the user's name — greet generically."
    # Select purpose options based on domain
    domain_up = (domain or "GENERAL").upper()
    if any(k in domain_up for k in ("HEALTH", "CLINIC", "MEDICAL", "PHARMA")):
        purpose_options = (
            "(A) Check whether this report meets clinical or professional standards\n"
            "   (B) Identify and explain any flagged or abnormal values\n"
            "   (C) Get a plain-English recommendation for next steps"
        )
    elif any(k in domain_up for k in ("CONTRACT", "LEGAL", "AERO", "AEROSPACE", "COMPLY")):
        purpose_options = (
            "(A) Compliance check against applicable specifications or standards\n"
            "   (B) Risk and gap assessment\n"
            "   (C) Summary of key obligations or critical spec deviations"
        )
    elif any(k in domain_up for k in ("FINANCE", "FINANC", "AUDIT")):
        purpose_options = (
            "(A) Financial accuracy and completeness audit\n"
            "   (B) Risk flag identification\n"
            "   (C) Plain-language executive summary"
        )
    else:
        purpose_options = (
            "(A) Quality and accuracy audit\n"
            "   (B) Fact verification and gap identification\n"
            "   (C) Summary with actionable recommendations"
        )

    return f"""You are the AI analyst in OCM — a professional business evaluation tool.
You speak like a trusted, warm business analyst. No jargon. No robotic phrasing.

CONTEXT:
  File: "{filename}" | Domain: {domain}
  The user did not reply to the language preference question.
  You MUST use English for ALL responses from this point forward.
  Do NOT switch to Chinese or any other language unless the user explicitly requests it later.

YOUR TASK FOR THIS TURN — follow these steps exactly:

USER NAME: {name_ctx}

STEP 1 — ACKNOWLEDGE NATURALLY (1 sentence):
  Smoothly move forward without making the user feel they did something wrong.
  Use their first name if you have it.
  Examples:
    With name:    "No worries, {first_name or 'there'} — I'll carry on in English and we'll get started."
    Without name: "No worries — I'll continue in English and we can get started."
  Do NOT say "You did not respond." Be warm, not mechanical.

STEP 2 — ASK ABOUT PURPOSE (the key question):
  Ask the user what they want to accomplish with this evaluation.
  Frame it as a genuine, caring question — not a menu read-out.
  Then offer these practical options for {domain}:
   {purpose_options}
  Ask them to pick one, or describe what they need in their own words.

STEP 3 — WAIT:
  Do NOT ask for specific data values yet. Purpose first, then data.

CRITICAL RULES:
- English ONLY. No Chinese characters whatsoever.
- Maximum 4 sentences. One clear question at the end.
- Warm, human tone. No system codes. No evaluation jargon.
"""


def _build_purpose_ask_prompt(
    filename: str, domain: str, session_lang: str, user_lang_reply: str,
    user_name: str = "", mode: str = "ABDUCTION"
) -> str:
    """
    PHASE 3 — Purpose discovery after language confirmed.
    Tone stays consistent with the mode established in Phase 1.
    """
    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = (
        f"User's name is {first_name} — use it naturally once here."
        if _name else "No name — address without one."
    )

    lang_instruction = (
        "You MUST reply in Traditional Chinese (zh-TW) only."
        if "ZH" in session_lang.upper()
        else "You MUST reply in English only. No Chinese characters."
    )

    domain_up = (domain or "GENERAL").upper()
    if any(k in domain_up for k in ("HEALTH", "CLINIC", "MEDICAL", "PHARMA")):
        purpose_options = (
            "(A) Verify this report meets clinical or professional standards\n"
            "   (B) Identify and explain flagged or abnormal lab values\n"
            "   (C) Get a plain-language recommendation for next steps"
        )
    elif any(k in domain_up for k in ("CONTRACT", "LEGAL", "AERO", "AEROSPACE")):
        purpose_options = (
            "(A) Compliance check against applicable specifications\n"
            "   (B) Risk and gap assessment\n"
            "   (C) Summary of key obligations or critical deviations"
        )
    elif any(k in domain_up for k in ("FINANCE", "FINANC", "AUDIT")):
        purpose_options = (
            "(A) Financial accuracy and completeness audit\n"
            "   (B) Risk flag identification\n"
            "   (C) Executive summary with key findings"
        )
    else:
        purpose_options = (
            "(A) Quality and accuracy audit\n"
            "   (B) Fact verification and gap identification\n"
            "   (C) Summary with actionable recommendations"
        )

    tone_rule = _get_tone_rule(mode)

    return f"""You are the AI analyst in OCM — a professional business evaluation tool.

{tone_rule}

LANGUAGE RULE (ABSOLUTE — overrides everything): {lang_instruction}

CONTEXT:
  File: "{filename}" | Domain: {domain} | Mode: {mode}
  {name_ctx}
  The user just replied: "{user_lang_reply}"
  Language preference is now confirmed and locked for this session.

YOUR TASK — maximum 4 sentences:

1. ACKNOWLEDGE THE LANGUAGE CHOICE (1 sentence — warm, use first name if available):
   If yes/是 → confirm the switch gracefully.
   If no/否/English → acknowledge and move forward naturally.
   If unrelated reply → acknowledge briefly, stay in motion.
   Do NOT over-dramatise. One sentence. Then move immediately to purpose.

2. DISCOVER PURPOSE (2-3 sentences — this is the most important question):
   Ask with genuine care what they want from this evaluation.
   Frame it: "I want to make sure I focus on exactly what matters to you."
   Offer options for {domain}:
    {purpose_options}
   Invite them to pick one or describe in their own words.
   Tone must match the persona — DEDUCTION users get a concise ask, ABDUCTION users get warmth.

3. WAIT — Do NOT ask for specific data values. Do NOT begin analysis.

CRITICAL: Zero technical codes. Zero system tags. Maximum 4 sentences. One question.
"""
    """
    PHASE 3 — Purpose discovery + axiom seeding.
    Called after the user has confirmed (or explicitly chosen) their language.
    Now: understand WHAT they want from this evaluation.
    user_name: registered display name (optional)
    """
    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = f"The user's name is {first_name}. Use it naturally, once, in your reply." if first_name else "You don't have the user's name — address them without a name."
    lang_instruction = (
        "You MUST reply in Traditional Chinese (zh-TW) only."
        if "ZH" in session_lang.upper()
        else "You MUST reply in English only. No Chinese characters."
    )

    domain_up = (domain or "GENERAL").upper()
    if any(k in domain_up for k in ("HEALTH", "CLINIC", "MEDICAL", "PHARMA")):
        purpose_options = (
            "(A) Verify whether this report meets clinical or professional standards\n"
            "   (B) Identify and explain any flagged or abnormal lab values\n"
            "   (C) Get a plain-language recommendation for next steps"
        )
    elif any(k in domain_up for k in ("CONTRACT", "LEGAL", "AERO", "AEROSPACE")):
        purpose_options = (
            "(A) Compliance check against applicable specifications\n"
            "   (B) Risk and gap assessment\n"
            "   (C) Summary of key obligations or critical deviations"
        )
    elif any(k in domain_up for k in ("FINANCE", "FINANC", "AUDIT")):
        purpose_options = (
            "(A) Financial accuracy and completeness audit\n"
            "   (B) Risk flag identification\n"
            "   (C) Executive summary with key findings"
        )
    else:
        purpose_options = (
            "(A) Quality and accuracy audit\n"
            "   (B) Fact verification and gap identification\n"
            "   (C) Summary with actionable recommendations"
        )

    return f"""You are the AI analyst in OCM — a professional business evaluation tool.
Warm, direct, human. Like a trusted senior analyst who cares about the user's outcome.

LANGUAGE RULE (ABSOLUTE, HIGHEST PRIORITY): {lang_instruction}

CONTEXT:
  File: "{filename}" | Domain: {domain}
  The user just replied: "{user_lang_reply}"
  Language preference is now confirmed and locked.

YOUR TASK FOR THIS TURN:

USER NAME: {name_ctx}

STEP 1 — ACKNOWLEDGE THE LANGUAGE CHOICE (1 sentence, warm):
  Use the user's first name here if you have it — it should feel personal.
  If they said yes/是 → acknowledge you're switching to their preferred language gracefully.
  If they said no/否/English → acknowledge and move on naturally.
  If they gave a non-language reply → acknowledge what they said briefly.
  Do NOT make a big deal of it. One sentence. Human.

STEP 2 — ASK ABOUT THEIR PURPOSE (the most important question):
  Ask with genuine care: what do they want to get from this evaluation?
  Frame it as "I want to make sure I help you with exactly what you need."
  Then offer these options for {domain}:
   {purpose_options}
  Invite them to pick one, or describe what they need in their own words.
  Make it feel like a conversation, not a multiple choice test.

STEP 3 — WAIT:
  Do NOT ask for specific data values yet.
  Do NOT begin the axiom analysis yet.
  Purpose clarity comes first.

CRITICAL: Maximum 4 sentences. One question. Human tone. Zero technical codes.
"""


def _build_purpose_ack_prompt(
    filename: str, domain: str, session_lang: str, confirmed_purpose: str,
    user_name: str = "", mode: str = "ABDUCTION"
) -> str:
    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = (
        f"The user's name is {first_name}. Use it naturally, once, in your reply."
        if first_name else "You don't have the user's name — address them without a name."
    )

    lang_instruction = (
        "You MUST reply in Traditional Chinese (zh-TW) only."
        if "ZH" in session_lang.upper()
        else "You MUST reply in English only. No Chinese characters."
    )

    tone_rule = _get_tone_rule(mode)

    return f"""You are the AI analyst in OCM — a professional business evaluation tool.

{tone_rule}

LANGUAGE RULE (ABSOLUTE, HIGHEST PRIORITY): {lang_instruction}

CONTEXT:
  File: "{filename}" | Domain: {domain} | Mode: {mode}
  USER NAME: {name_ctx}
  The user has selected/confirmed their evaluation purpose: "{confirmed_purpose}"

YOUR TASK — produce a dynamic purpose acknowledgement (maximum 2 sentences):
1. Acknowledge their confirmed purpose warmly and professionally.
2. Confirm that OCM has locked in this evaluation focus and you are now routing the document to the axiom-matching engine.
3. Keep it brief, clear, and reassuring. Do NOT ask any questions. Do NOT output technical codes.
"""


def _build_axiom_elected_prompt(
    filename: str,
    domain: str,
    session_lang: str,
    user_name: str = "",
    mode: str = "ABDUCTION",
    elected_axioms: list = None,
    confirmed_purpose: str = "",
    doc_summary: str = "",
    extraction_mode: str = "G3FP_DIRECT",
    pdds: dict = None,
) -> str:
    """
    PHASE 4 (G3FP-First) — Announce elected axioms conversationally.

    Called by the __AXIOM_ELECTED__ synthetic token after the SAA↔G3FP
    handshake completes.  OCM tells the user which ontological lenses
    were selected, briefly explains why, and invites the substantive Q.

    elected_axioms: list of axiom dicts with keys {id, name, relevance_score}
    confirmed_purpose: free-text purpose the user declared (may be empty
                       if they haven't answered the purpose question yet).
    """
    elected_axioms = elected_axioms or []
    _name = (user_name or "").strip()
    first_name = _name.split()[0].split(",")[0].rstrip(".") if _name else ""
    name_ctx = (
        f"The user's name is {first_name} — use it once, naturally."
        if first_name else "No user name — address them without one."
    )

    lang_instruction = (
        "You MUST reply in Traditional Chinese (zh-TW) only."
        if "ZH" in session_lang.upper()
        else "You MUST reply in English only. No Chinese characters."
    )

    tone_rule = _get_tone_rule(mode)

    # Format the axiom list for the prompt (max 5 for readability)
    axiom_lines = ""
    for ax in elected_axioms[:5]:
        ax_id   = ax.get("id", ax.get("axiom_id", "?"))
        ax_name = ax.get("name", ax.get("axiom_name", ax_id))
        score   = ax.get("relevance_score", ax.get("score", 0))
        axiom_lines += f"  • {ax_name} [{ax_id}] — relevance {score:.2f}\n"
    if not axiom_lines:
        axiom_lines = "  (axiom election still in progress)\n"

    purpose_ctx = (
        f"The user's declared purpose: \"{confirmed_purpose}\""
        if confirmed_purpose else
        "The user has not yet declared their specific purpose."
    )

    # ── PDDS axiom reasoning injection ────────────────────────────────────────
    _pdds = pdds or {}
    _free_hints = _pdds.get("axiom_election_hints", {}).get("g3fp_free_hints", [])
    _semantics = _pdds.get("document_profile", {}).get("semantics", "") or doc_summary
    _hint_block = ""
    if _free_hints:
        _hint_lines = "\n".join(f"  {i+1}. {h}" for i, h in enumerate(_free_hints[:5]))
        _hint_block = (
            f"\nG3FP AXIOM SELECTION REASONING (explain this to the user in plain language):\n{_hint_lines}"
        )

    summary_ctx = (
        f"G3FP document semantics: \"{_semantics[:300]}\""
        if _semantics else ""
    )

    fast_path_note = (
        "Analysis was performed via G3FP multimodal vision scan (fast path — "
        "background deep-text extraction is still running)."
        if extraction_mode == "G3FP_DIRECT" else
        "Analysis was performed via full L0 transcoding pipeline."
    )

    return f"""You are OCM, the Ontology Compliance Manager embedded in a professional document evaluation platform.

{tone_rule}

LANGUAGE RULE (ABSOLUTE — overrides everything): {lang_instruction}

CONTEXT:
  File: "{filename}" | Domain: {domain} | Mode: {mode}
  {name_ctx}
  {fast_path_note}
  {purpose_ctx}
  {summary_ctx}
{_hint_block}

AXIOMS ELECTED BY SAA↔G3FP HANDSHAKE:
{axiom_lines}

YOUR TASK FOR THIS TURN (maximum 5 sentences, no bullet lists in the reply):

1. ANNOUNCE (1-2 sentences) — tell the user, in plain language, which ontological lenses
   have been activated for their document.  Be specific but human.
   Example style: "Based on what I can see in '{filename}', I've activated three evaluation
   lenses: [axiom names].  These are the standards most relevant to your document."
   Do NOT say "axiom" — say "evaluation lens" or "compliance standard".
   MANDATORY: if G3FP AXIOM SELECTION REASONING is provided above, translate one of those
   reasoning points into plain language — tell the user WHY these lenses were chosen.

2. BRIDGE (1 sentence) — connect the activated lenses to the user's declared purpose,
   or invite them to confirm/adjust it if no purpose has been declared yet.

3. INVITE (1 sentence) — ask the user one open question to begin the substantive evaluation.
   Example: "Where would you like me to start — with a compliance summary, or the specific
   risk flags I've already identified?"

CRITICAL RULES:
- Zero technical codes or internal IDs in the reply.
- Zero system tags, trace IDs, or JSON.
- Human, professional, and warm.
- Maximum 5 sentences. One question. Then stop.
"""


def _extract_field_values(
    reply: str, missing_fields: List[Dict]
) -> Dict[str, Any]:
    """
    Parse G3FP reply to detect user-confirmed field values.
    Looks for patterns: "field_name: value unit" or "field_name = value".
    Returns dict of {field_name: {value, unit, confirmed_at}}.
    """
    confirmed = {}
    ts = datetime.datetime.utcnow().isoformat() + "Z"

    for field_def in missing_fields:
        field = field_def.get("field", "")
        unit  = field_def.get("unit", "")
        if not field:
            continue

        # Pattern: "LDL: 145 mg/dL" or "LDL = 145" or "LDL is 145"
        patterns = [
            rf"{re.escape(field)}\s*(?:=|:|is)\s*([\d.]+)\s*({re.escape(unit)})?",
            rf"([\d.]+)\s*{re.escape(unit)}\s+(?:for\s+)?{re.escape(field)}",
        ]
        for pat in patterns:
            m = re.search(pat, reply, re.IGNORECASE)
            if m:
                try:
                    value = float(m.group(1))
                    confirmed[field] = {
                        "value":        value,
                        "unit":         unit,
                        "axiom_id":     field_def.get("axiom_id", ""),
                        "confirmed_at": ts,
                        "source":       "USER_DIALOGUE",
                    }
                    logger.info(f"Field confirmed via dialogue: {field}={value} {unit}")
                except (ValueError, IndexError):
                    pass
                break

    return confirmed


def _update_uif_preview(
    entry: Dict[str, Any], newly_confirmed: Dict[str, Any]
) -> Dict[str, Any]:
    """
    'Ingest-Diagnose-Fix' closed loop (PM mandate Day 5):
    Inject user-confirmed values into uif_preview metrics list.
    Update panel_4_confirmed to reflect resolved fields.
    """
    uif_preview = dict(entry.get("uif", {}))
    data = dict(uif_preview.get("extracted_data", {}))
    metrics = list(data.get("metrics", []))

    for field_name, conf in newly_confirmed.items():
        # Check if metric already exists — update if so
        updated = False
        for i, m in enumerate(metrics):
            if m.get("name") == field_name:
                metrics[i] = {**m,
                    "value":     conf["value"],
                    "unit":      conf["unit"],
                    "is_synthetic": False,
                    "citation":  "Confirmed via NLP dialogue",
                }
                updated = True
                break
        if not updated:
            # Inject new metric from user dialogue
            metrics.append({
                "id":         f"DLG_{field_name}",
                "name":       field_name,
                "value":      conf["value"],
                "unit":       conf["unit"],
                "is_synthetic": False,
                "citation":   "Confirmed via NLP dialogue",
                "evidence_coordinate": {"type": "spatial", "page": 0, "line": 0},
            })

    data["metrics"] = metrics
    uif_preview["extracted_data"] = data
    return uif_preview


def _build_history_summary(history: List[Dict], last_n: int = 3) -> str:
    """Format last N dialogue turns for context window."""
    recent = history[-last_n:] if len(history) >= last_n else history
    lines = []
    for turn in recent:
        sender = turn.get("sender", "USER")
        msg    = turn.get("message", "")[:200]
        lines.append(f"[{sender}]: {msg}")
    return "\n".join(lines)


# ===========================================================================
# POST /api/agent/seal/deduction  — Deduction Mode Pipeline (OCM V4.1)
# ===========================================================================
# [DFT][NLP_DIALOGUE_DEDUCTION_ENDPOINT] — interceptable by E2E test harness
# Policy: mode=DEDUCTION is a HARD GATE — induction path is bypassed entirely.
# No silent fallthrough to standard dialogue if this endpoint is called.

def _get_deduction_engine():
    """
    Lazy singleton factory for DeductionEngine.

    Imports are deferred to avoid circular dependencies at module load time.
    Returns a fresh DeductionEngine instance wired to the global BUS and SAA registry.

    DFT hook: NLP_DIALOGUE_DEDUCTION_ENGINE_INIT — verify engine is created once per process.
    """
    import asyncio as _asyncio
    from modules.bus import _global_bus
    from modules.axiom_repo.saa_registry import get_registry
    from modules.deduction_engine import DeductionEngine

    bus = _global_bus
    if bus is None:
        logger.warning(
            "[DFT][NLP_DIALOGUE_DEDUCTION_NO_BUS] _global_bus is None — "
            "DeductionEngine will emit to a transient bus. Verify app.py initialises BUS."
        )
        from modules.bus import SovereignBUS
        bus = SovereignBUS()

    logger.debug("[DFT][NLP_DIALOGUE_DEDUCTION_ENGINE_INIT] Wiring DeductionEngine.")
    return DeductionEngine(bus=bus, registry=get_registry())


def _get_medical_engine():
    """
    Lazy singleton factory for OntologyMedicalEngine.
    """
    from modules.bus import _global_bus
    from modules.axiom_repo.saa_registry import get_registry
    from modules.ontology_medical import OntologyMedicalEngine

    bus = _global_bus
    if bus is None:
        from modules.bus import SovereignBUS
        bus = SovereignBUS()

    logger.debug("[MED] Wiring OntologyMedicalEngine.")
    return OntologyMedicalEngine(bus=bus, registry=get_registry())



@nlp_dialogue_bp.route("/api/agent/seal/deduction", methods=["POST"])
def deduction():
    """
    Deduction Mode Pipeline endpoint.

    Accepts extracted field_values from the frontend and runs the full
    L0→L5 deterministic SymPy pipeline via DeductionEngine.

    Body (JSON):
        {
            "trace_id":    "20260514_...",       // required — active session trace ID
            "domain":      "AEROSPACE",          // required — must match axiom domain
            "field_values": {                    // required — flat dict of field → float
                "fiber_volume_fraction": 58.0,
                "applied_load": 42.5,
                ...
            }
        }

    Returns:
        {
            "ok":           true,
            "trace_id":     "...",
            "verdict":      "ALLOW" | "REFUSE" | "HITL_REQUIRED",
            "branch":       "NONE" | "RCA" | "DRIFT",
            "audit_packet": { ...sealed L5 packet... },
            "deduction_lock": true
        }

    Error responses follow the standard Sovereign error packet format
    (error_code, message, trace_id, timestamp).
    """
    import asyncio as _asyncio

    body = request.get_json(force=True, silent=True) or {}

    # ── Input validation ──────────────────────────────────────────────────────
    trace_id    = (body.get("trace_id") or "").strip()
    domain      = (body.get("domain") or "").strip().upper()
    field_values = body.get("field_values")

    logger.info(
        "[DFT][NLP_DIALOGUE_DEDUCTION_REQUEST] trace_id=%s domain=%s fields=%s",
        trace_id or "MISSING",
        domain or "MISSING",
        list(field_values.keys()) if isinstance(field_values, dict) else "INVALID",
    )

    if not trace_id:
        return jsonify({
            "ok": False, "error_code": "E004",
            "message": "trace_id is required for deduction mode.",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }), 400

    if not domain:
        return jsonify({
            "ok": False, "error_code": "E004",
            "message": "domain is required for deduction mode.",
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }), 400

    if not isinstance(field_values, dict) or not field_values:
        return jsonify({
            "ok": False, "error_code": "E004",
            "message": "field_values must be a non-empty dict of {field_name: float}.",
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }), 400

    # Coerce all values to float — reject non-numeric entries
    coerced: Dict[str, float] = {}
    bad_fields: List[str] = []
    for k, v in field_values.items():
        try:
            coerced[k] = float(v)
        except (TypeError, ValueError):
            bad_fields.append(k)

    if bad_fields:
        return jsonify({
            "ok": False, "error_code": "E004",
            "message": f"Non-numeric field_values: {bad_fields}. All values must be numeric.",
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }), 400

    # ── Deduction / Ontology Medical Engine execution ─────────────────────────
    is_healthcare = (domain == "HEALTHCARE" or str(domain).upper() == "ONTOLOGY_MEDICAL")
    try:
        engine       = _get_medical_engine() if is_healthcare else _get_deduction_engine()
        audit_packet = _asyncio.run(engine.run(
            domain       = domain,
            field_values = coerced,
            trace_id     = trace_id,
            suspend_on_hitl = False,
        ))
    except RuntimeError as exc:
        # asyncio.run() raises RuntimeError if there's already a running loop.
        # Fallback: create a new event loop explicitly (safe in Flask sync context).
        logger.warning(
            "[DFT][NLP_DIALOGUE_DEDUCTION_LOOP_FALLBACK] Existing event loop detected — "
            "using new_event_loop. trace_id=%s err=%s", trace_id, exc,
        )
        try:
            import asyncio as _asyncio2
            loop = _asyncio2.new_event_loop()
            engine       = _get_medical_engine() if is_healthcare else _get_deduction_engine()
            audit_packet = loop.run_until_complete(engine.run(
                domain       = domain,
                field_values = coerced,
                trace_id     = trace_id,
                suspend_on_hitl = False,
            ))
            loop.close()
        except Exception as inner_exc:
            logger.error(
                "[DFT][NLP_DIALOGUE_DEDUCTION_LOOP_ERROR] trace_id=%s error=%s",
                trace_id, inner_exc, exc_info=True,
            )
            # SILENT DEGRADATION — never expose engine internals to the user.
            return jsonify({
                "ok": False, "error_code": "E003",
                "reply": "",
                "trace_id": trace_id,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            }), 200
    except Exception as exc:
        logger.error(
            "[DFT][NLP_DIALOGUE_DEDUCTION_ERROR] trace_id=%s error=%s",
            trace_id, exc, exc_info=True,
        )
        # SILENT DEGRADATION — do not expose engine internals to the user.
        # Return ok:False with empty reply so the frontend holds in pending state.
        return jsonify({
            "ok": False, "error_code": "E003",
            "reply": "",
            "trace_id": trace_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }), 200

    # ── Detect engine-level error packet ─────────────────────────────────────
    if audit_packet.get("error_code"):
        logger.warning(
            "[DFT][NLP_DIALOGUE_DEDUCTION_ENGINE_ERROR] trace_id=%s error_code=%s",
            trace_id, audit_packet.get("error_code"),
        )
        return jsonify({"ok": False, **audit_packet}), 200

    # ── Success response ──────────────────────────────────────────────────────
    verdict = audit_packet.get("overall_verdict", "UNDERDETERMINED")
    branch  = audit_packet.get("branch", "NONE")

    logger.info(
        "[DFT][NLP_DIALOGUE_DEDUCTION_COMPLETE] trace_id=%s verdict=%s branch=%s sha256=%s",
        trace_id, verdict, branch, str(audit_packet.get("sha256", ""))[:16],
    )

    try:
        store = get_char_store()
        entry = store.get(trace_id)
        if entry:
            entry["audit_packet"] = audit_packet
            entry["phase"] = "DEDUCTION_COMPLETE"
            store[trace_id] = entry
        else:
            store[trace_id] = {
                "trace_id": trace_id,
                "phase": "DEDUCTION_COMPLETE",
                "domain": domain,
                "audit_packet": audit_packet,
                "filename": audit_packet.get("filename") or "Evaluated Document"
            }
    except Exception as e:
        logger.error(f"E009: Failed to save audit_packet to char_store — {e}", exc_info=True)

    return jsonify({
        "ok":             True,
        "trace_id":       trace_id,
        "verdict":        verdict,
        "branch":         branch,
        "deduction_lock": True,
        "audit_packet":   audit_packet,
    }), 200


# ===========================================================================
# POST /api/agent/seal/dialogue
# ===========================================================================

@nlp_dialogue_bp.route("/api/agent/seal/dialogue", methods=["POST"])
def dialogue():
    """
    RAG-Augmented NLP dialogue turn.

    Body (JSON):
        {
            "trace_id": "20260429_...",
            "message":  "The LDL value is 145 mg/dL",
            "sender":   "USER"   // or "SYSTEM"
        }

    Returns:
        {
            ok, trace_id, reply, updated_missing_fields,
            newly_confirmed, all_confirmed, uif_preview,
            panel_5_updated, cycle_2_ready
        }
    """
    body     = request.get_json(force=True, silent=True) or {}
    # ECP-NULL-01: use `or ""` not `.get(key, "")` — the default is bypassed when
    # the key exists with an explicit JSON null, causing NoneType.strip() crash.
    trace_id = (body.get("trace_id") or "").strip()
    message  = (body.get("message") or "").strip()
    sender   = (body.get("sender") or "USER").strip()

    # ── __SESSION_OPEN__ fast-path — fires BEFORE trace_id gate ─────────────
    # This synthetic message is safe to serve without a persisted session:
    # the POST body carries all the G3FP context needed to generate the
    # context-aware greeting. A transient ephemeral entry is constructed
    # from the body fields so _build_session_open_prompt gets real data.
    #
    # BUG-FIX (E009 race): _fireSessionOpen() always sends the currentTraceId
    # that was assigned at L1764 (frontend), so `and not trace_id` made this
    # fast-path permanently unreachable for every normal flow.  The greeting
    # fell through to _process_dialogue_turn → char_store.get(trace_id) before
    # the characterize endpoint had finished writing the entry → E009.
    # The prompt is fully self-contained from the POST body; char_store is
    # never needed here, so trace_id presence is irrelevant to this gate.
    if message == "__SESSION_OPEN__":
        detected_lang = (
            body.get("detected_lang", "")
            or ("ZH-TW" if any(
                    "\u4e00" <= c <= "\u9fff"
                    for c in (body.get("doc_summary", "") or "")[:120]
                ) else "EN")
        )
        filename  = (body.get("file_name") or body.get("filename") or "document").strip()
        domain    = (body.get("domain") or "GENERAL").strip().upper()
        mode      = (body.get("analysis_mode") or "ABDUCTION").strip().upper()
        sub_mode  = (body.get("sub_mode") or "").strip().lower()
        user_name = ""
        doc_summary = (body.get("doc_summary") or "").strip()
        # g3fp_status_mode: True when modal opened before G3FP resolved (>2s latency)
        # OCM must open with transparent status communication in this case.
        g3fp_status_mode = bool(body.get("g3fp_status_mode", False))
        try:
            client      = _get_g3fp()
            # GAP-3: if trace_id is available, read PDDS from char_store so Beat 2
            # is grounded in real document entities (patient name, lab values).
            # char_store may not have the entry yet if ingest/fast is still running —
            # fall back gracefully to body-provided doc_summary.
            _fast_pdds  = None
            if trace_id:
                _fast_store = get_char_store()
                _fast_entry = _fast_store.get(trace_id)
                if _fast_entry:
                    _fast_pdds = _fast_entry.get("pdds") or _fast_entry.get("uif")
                    # Prefer PDDS semantic summary over body doc_summary
                    _pdds_summary = (
                        (_fast_pdds or {}).get("document_profile", {}).get("semantics", "")
                        or (_fast_pdds or {}).get("document_metadata", {}).get("summary", "")
                    )
                    if _pdds_summary:
                        doc_summary = _pdds_summary
                else:
                    # E009-FIX: ingest/fast hasn't written char_store yet (race condition).
                    # Write a bootstrap entry so chat turns after the greeting don't hit
                    # the E009 TRIGGER_CHARACTERIZE gate and return hardcoded 尚未上傳 text.
                    _bootstrap_entry = {
                        "filename":       filename,
                        "domain":         domain,
                        "detected_lang":  detected_lang,
                        "session_context": {"lang": detected_lang, "mode": mode},
                        "pdds":           {},
                        "uif":            {},
                        "elected_axioms": [],
                        "dialogue_history": [],
                        "confirmed_fields": {},
                        "extraction_mode": "G3FP_DIRECT",
                        "_bootstrap":     True,   # flag: ingest/fast will overwrite this
                    }
                    _fast_store[trace_id] = _bootstrap_entry
                    logger.info(
                        f"[SESSION_OPEN] Bootstrap entry written for trace_id={trace_id[-8:]} "
                        f"— ingest/fast will enrich this when it completes."
                    )
            # ── Bootstrap short-circuit: ingest/fast is still running ──────────────
            # If char_store has a _bootstrap entry it means ingest/fast has NOT finished
            # writing real G3FP data yet. Making a second concurrent Gemini call here
            # would compete with the ingest call on the same API key and lose the 8s race.
            # Return a fast, context-grounded status greeting immediately (<100ms).
            # When ingest/fast completes it fires G3FP_CONTEXT_READY on the frontend,
            # which transitions OCM to the real analysis view — no second call needed here.
            _ingest_in_progress = (
                trace_id
                and _fast_entry is not None
                and _fast_entry.get("_bootstrap") is True
            ) or (
                trace_id
                and _fast_entry is None  # bootstrap was just written above
            )
            if _ingest_in_progress:
                _zh = detected_lang == "ZH-TW"
                if _zh:
                    _fast_greeting = (
                        f"您好，我是 OCM — 本體合規矩陣（Ontology Compliance Monitor）。\n\n"
                        f"📄 **{filename}** 正在分析中，G3FP 正在提取語義結構與合規指標……\n\n"
                        f"分析完成後，我將立即呈現領域分類、公理選擇與 5L 管道結果。"
                        f"您現在可以告訴我您的評估目的，以便我在分析完成後立即對準正確的公理層。"
                    )
                else:
                    _fast_greeting = (
                        f"Hello, I am OCM — Ontology Compliance Monitor.\n\n"
                        f"📄 **{filename}** is being analyzed — G3FP is extracting semantic "
                        f"structure and compliance metrics now.\n\n"
                        f"Once analysis completes I will immediately present domain classification, "
                        f"axiom election, and 5L pipeline results. "
                        f"You may tell me your evaluation purpose now so I can align to the "
                        f"correct axiom tier the moment G3FP resolves."
                    )
                logger.info(
                    f"[SESSION_OPEN] Bootstrap fast-path — returning status greeting "
                    f"without Gemini call. trace_id={trace_id[-8:] if trace_id else 'none'}"
                )
                return jsonify({
                    "ok":    True,
                    "reply": _fast_greeting,
                    "trace_id": trace_id or None,
                    "cycle_2_ready": False,
                    "user_confirmed_count": 0,
                    "_source": "bootstrap_status",
                }), 200

            saa_threshold_results = body.get("saa_threshold_results")
            if not saa_threshold_results and trace_id:
                _fast_store = get_char_store()
                _fast_entry_check = _fast_store.get(trace_id)
                if _fast_entry_check:
                    saa_threshold_results = _fast_entry_check.get("saa_threshold_results") or (_fast_entry_check.get("uif") or {}).get("saa_threshold_results")

            if saa_threshold_results:
                from modules.nlp_dialogue_prompts import build_saa_handshake_prompt
                syn_prompt = build_saa_handshake_prompt(
                    filename=filename,
                    domain=domain,
                    saa_threshold_results=saa_threshold_results,
                    session_lang=detected_lang,
                    user_name=user_name,
                    mode=mode,
                )
            else:
                syn_prompt  = _build_session_open_prompt(
                    detected_lang, filename, domain,
                    user_name=user_name, mode=mode,
                    doc_summary=doc_summary, sub_mode=sub_mode,
                    pdds=_fast_pdds,
                    status_mode=g3fp_status_mode,
                )
            greeting = _g3fp_generate(
                client, [{"role": "user", "parts": [{"text": syn_prompt}]}],
                temperature=0.4, max_tokens=2048
            )
            logger.info(
                f"[SESSION_OPEN fast-path] greeting_len={len(greeting)} "
                f"domain={domain} lang={detected_lang}"
            )
            if greeting:
                return jsonify({
                    "ok":               True,
                    "reply":            greeting,
                    # Echo back the caller's trace_id (may be None for no-trace
                    # requests, or the real ID forwarded by _fireSessionOpen).
                    # The frontend relies on this to keep currentTraceId stable.
                    "trace_id":         trace_id or None,
                    "cycle_2_ready":    False,
                    "user_confirmed_count": 0,
                }), 200
        except Exception as _fp_exc:
            logger.warning(
                f"[SESSION_OPEN fast-path] G3FP call failed — "
                f"{type(_fp_exc).__name__}: {_fp_exc}"
            )
        # G3FP unavailable — return falsy ok so frontend uses template fallback
        return jsonify({
            "ok":    False,
            "error_code": "E002",
            "reply": "",
            "cycle_2_ready": False,
            "user_confirmed_count": 0,
        }), 200

    # ── Trace ID validation — ECP-005: return 200 guidance, not raw 400 ──────
    if not trace_id:
        return jsonify({
            "ok":         False,
            "error_code": "E009",
            "reply": (
                "⚠ 分析會話尚未初始化。請先點擊「確認」按鈕以啟動文件分析，"
                "然後再使用對話視窗。\n"
                "[EN] Analysis session not yet initialized. "
                "Please click CONFIRM to start the document analysis first."
            ),
            "guidance": "TRIGGER_CHARACTERIZE",
            "cycle_2_ready": False,
            "user_confirmed_count": 0,
        }), 200   # Return 200 so frontend chat handler can show the reply

    store = get_char_store()
    entry = store.get(trace_id)
    if not entry:
        return jsonify({
            "ok":         False,
            "error_code": "E009",
            "reply": (
                f"⚠ 找不到 trace_id='{trace_id[-8:]}...' 的分析記錄。"
                f"請重新點擊「確認」以重新建立分析上下文。\n"
                f"[EN] Session '{trace_id[-8:]}...' not found. "
                f"Please click CONFIRM again to re-initialize."
            ),
            "guidance": "TRIGGER_CHARACTERIZE",
            "cycle_2_ready": False,
            "user_confirmed_count": 0,
        }), 200

    if not message:
        return jsonify({"ok": False, "error_code": "E004", "message": "message is required"}), 400

    # ── ECP-020: Outer safety net — no 500 escapes ──────────────────────────
    try:
        return _process_dialogue_turn(entry, trace_id, message, sender, store, body=body)
    except Exception as exc:
        logger.error(f"E003: Unhandled dialogue error — {exc}", exc_info=True)
        # SILENT DEGRADATION — the outer safety net must NEVER expose
        # stack traces or internal state to the user via the chat window.
        # Return ok:False with empty reply so the frontend stays in its
        # current state and the CLCP pipeline continues normally.
        return jsonify({
            "ok": False, "error_code": "E003", "trace_id": trace_id,
            "reply": "", "cycle_2_ready": False,
            "z_calculations": {}, "user_confirmed_count": 0,
        }), 200


def _process_dialogue_turn(entry, trace_id, message, sender, store, body=None):
    """Core dialogue processing — wrapped by outer try/except in dialogue()."""
    body = body or {}

    is_meta = False
    if message in ("__SESSION_OPEN__", "__LANG_TIMEOUT__", "__PURPOSE_CONFIRM__", "__AXIOM_ELECTED__", "__MISSING_DATA__"):
        if message == "__PURPOSE_CONFIRM__":
            purpose_val = (body.get("purpose") or "").strip()
            if purpose_val and _is_meta_query(purpose_val):
                is_meta = True
    else:
        if _is_meta_query(message):
            is_meta = True


    evidence_chunks   = entry.get("evidence_raw_chunks", "")
    missing_fields    = entry.get("panel_5_missing", {}).get("missing_fields", [])
    confirmed_fields  = entry.setdefault("confirmed_fields", {})
    dialogue_history  = entry.setdefault("dialogue_history", [])
    fsm_context       = entry.get("fsm_context", {})
    lens              = fsm_context.get("lens") or entry.get("domain", "GENERAL")

    # ── Synthetic system messages: drive the correct 4-step dialogue flow ──────
    # Step 1: __SESSION_OPEN__    → warm greeting, 2 sentences, NO questions
    # Step 2: __PURPOSE_CONFIRM__ → fires IMMEDIATELY after greeting, asks purpose
    # Step 3: __MISSING_DATA__    → fires on warmup:done, asks missing fields 1-by-1
    # Step 4: CONFIRM & START     → user clicks, evaluation pipeline begins
    #          └── HITL popup     → appears mid-evaluation if more data needed
    _SYNTHETIC = (
        "__SESSION_OPEN__", "__LANG_TIMEOUT__", "__PURPOSE_CONFIRM__",
        "__AXIOM_ELECTED__", "__MISSING_DATA__"
    )
    if message in _SYNTHETIC:
        # FIX-LANG-02: Body-first resolution — the frontend always sends detected_lang
        # in the POST body. Entry-stored detected_lang may default to 'EN' from
        # characterization time. Body takes priority to respect live session language.
        _body_lang = (body.get("detected_lang") or "").strip()
        detected_lang = _body_lang or entry.get("detected_lang", "EN")
        filename      = entry.get("filename", "document")
        domain        = entry.get("domain", "GENERAL")
        ctx           = entry.setdefault("session_context", {})
        # session_context.lang is authoritative if already locked by /set_locale;
        # otherwise use the body-resolved detected_lang as the live signal.
        session_lang  = ctx.get("lang") or detected_lang or "EN"
        # Also persist to session_context so subsequent turns inherit it.
        if _body_lang and not ctx.get("lang"):
            ctx["lang"] = _body_lang
            logger.info(
                f"[SYNTHETIC] Pinned session_context.lang={_body_lang} from body. "
                f"trace_id={trace_id}"
            )
        # user_name and mode come from registration/frontend session_context
        user_name     = (ctx.get("user_name") or "").strip()
        mode          = (ctx.get("mode") or "ABDUCTION").upper().strip() or "ABDUCTION"
        logger.info(
            f"[SYNTHETIC:{message}] detected_lang={detected_lang} "
            f"session_lang={session_lang} domain={domain} trace_id={trace_id}"
        )

        try:
            client = _get_g3fp()

            if message == "__SESSION_OPEN__":
                # Phase 1: greeting only — never ask purpose yet
                # Read PDDS from char_store entry (authoritative G3FP output)
                _pdds = entry.get("pdds") or entry.get("uif", {})
                _doc_summary = (
                    _pdds.get("document_profile", {}).get("semantics", "")
                    or entry.get("doc_summary")
                    or entry.get("g3fp_doc_summary")
                    or ""
                )
                saa_threshold_results = body.get("saa_threshold_results") or entry.get("saa_threshold_results") or _pdds.get("saa_threshold_results")
                if saa_threshold_results:
                    from modules.nlp_dialogue_prompts import build_saa_handshake_prompt
                    syn_prompt = build_saa_handshake_prompt(
                        filename=filename,
                        domain=domain,
                        saa_threshold_results=saa_threshold_results,
                        session_lang=session_lang,
                        user_name=user_name,
                        mode=mode,
                    )
                else:
                    syn_prompt = _build_session_open_prompt(
                        detected_lang, filename, domain,
                        user_name=user_name, mode=mode,
                        doc_summary=_doc_summary,
                        pdds=_pdds,
                    )


            elif message == "__LANG_TIMEOUT__":
                # Phase 2: user didn't reply → default English, ask purpose
                if not ctx.get("lang"):
                    ctx["lang"] = "en-US"
                    session_lang = "en-US"
                    logger.info(
                        f"[LANG_TIMEOUT] No reply — session_lang locked to en-US. "
                        f"trace_id={trace_id}"
                    )
                syn_prompt = _build_lang_timeout_prompt(
                    detected_lang, filename, domain, evidence_chunks,
                    user_name=user_name, mode=mode
                )


            elif message == "__PURPOSE_CONFIRM__":
                # Phase 3: user confirmed their purpose or replied to language greeting.
                purpose_val = (body.get("purpose") or "").strip()
                if purpose_val and not _is_meta_query(purpose_val):
                    ctx["confirmed_purpose"] = purpose_val
                    syn_prompt = _build_purpose_ack_prompt(
                        filename, domain, session_lang, purpose_val,
                        user_name=user_name, mode=mode
                    )
                else:
                    last_user_msg = purpose_val or next(
                        (h["message"] for h in reversed(dialogue_history) if h["sender"] != "G3FP"),
                        ""
                    )
                    syn_prompt = _build_purpose_ask_prompt(
                        filename, domain, session_lang, last_user_msg,
                        user_name=user_name, mode=mode
                    )


            elif message == "__AXIOM_ELECTED__":
                # Phase 4 (G3FP-First only): warmup:done fired, axioms elected.
                # The dialogue POST body carries elected_axioms + extraction_mode
                # forwarded from the fast-path response; merge them into entry so
                # they persist for subsequent turns.
                body_axioms  = body.get("elected_axioms", [])
                body_mode    = body.get("extraction_mode", "")
                if body_axioms:
                    entry["elected_axioms"] = body_axioms
                if body_mode:
                    entry["extraction_mode"] = body_mode

                elected_axioms    = entry.get("elected_axioms", [])
                confirmed_purpose = ctx.get("confirmed_purpose", "") or body.get("confirmed_purpose", "")
                extraction_mode   = entry.get("extraction_mode", "G3FP_DIRECT")
                _pdds = entry.get("pdds") or entry.get("uif", {})
                doc_summary = (
                    _pdds.get("document_profile", {}).get("semantics", "")
                    or _pdds.get("document_metadata", {}).get("summary", "")
                )
                syn_prompt = _build_axiom_elected_prompt(
                    filename=filename,
                    domain=domain,
                    session_lang=session_lang,
                    user_name=user_name,
                    mode=mode,
                    elected_axioms=elected_axioms,
                    confirmed_purpose=confirmed_purpose,
                    doc_summary=doc_summary,
                    extraction_mode=extraction_mode,
                    pdds=_pdds,
                )


            elif message == "__MISSING_DATA__":
                # Step 3: warmup:done has fired — G3FP pipeline has extracted what it can.
                # Ask the user to provide any missing field values, ONE AT A TIME.
                # After the user fills gaps, the CONFIRM button becomes active.
                body_axioms = body.get("elected_axioms", [])
                body_mode   = body.get("extraction_mode", "")
                if body_axioms:
                    entry["elected_axioms"] = body_axioms
                if body_mode:
                    entry["extraction_mode"] = body_mode

                _pdds          = entry.get("pdds") or entry.get("uif", {})
                uif_data       = entry.get("uif", {})
                extracted      = uif_data.get("extracted_data", {})
                raw_metrics    = extracted.get("metrics", [])
                # PDDS-authoritative missing fields (from handshake_gate) preferred
                # over panel_5_missing which is a UI-layer cache that starts empty.
                missing_f      = entry.get("panel_5_missing", {}).get("missing_fields", [])
                confirmed_purp = ctx.get("confirmed_purpose", "") or body.get("confirmed_purpose", "")

                syn_prompt = _build_missing_data_prompt(
                    filename=filename,
                    domain=domain,
                    session_lang=session_lang,
                    user_name=user_name,
                    mode=mode,
                    metrics=raw_metrics,
                    missing_fields=missing_f,
                    confirmed_purpose=confirmed_purp,
                    pdds=_pdds,
                )


            reply = _g3fp_generate(client, syn_prompt, temperature=0.3, max_tokens=2048)
            # Guard: Gemini safety block returns None text without raising — treat as E002
            if not reply:
                logger.warning(
                    f"[SYNTHETIC_TURN] G3FP returned empty text (safety block?) "
                    f"— returning ok:False. trace={trace_id[-8:] if trace_id else '?'}"
                )
                return jsonify({
                    "ok":             False,
                    "error_code":     "E002",
                    "reply":          "",
                    "synthetic_turn": message,
                    "trace_id":       trace_id,
                    "cycle_2_ready":  False,
                    "user_confirmed_count": len(confirmed_fields),
                }), 200

        except Exception as exc:

            logger.error(f"E002: G3FP synthetic turn failed — {exc}", exc_info=True)
            # Return ok:False for synthetic turns so the frontend i18n template
            # builder handles the fallback — never surface hardcoded English strings.
            return jsonify({
                "ok":             False,
                "error_code":     "E002",
                "reply":          "",
                "synthetic_turn": message,
                "trace_id":       trace_id,
                "cycle_2_ready":  False,
                "user_confirmed_count": len(confirmed_fields),
            }), 200

        ts = datetime.datetime.utcnow().isoformat() + "Z"
        dialogue_history.append({"sender": "G3FP", "message": reply, "timestamp": ts})
        return jsonify({
            "ok":              True,
            "trace_id":        trace_id,
            "reply":           reply,
            "synthetic_turn":  message,
            "cycle_2_ready":   False,
            "z_calculations":  {},
            "user_confirmed_count": len(confirmed_fields),
            "is_meta":         is_meta,
        }), 200

    # Guard: max turns
    if len(dialogue_history) >= MAX_TURNS:
        return jsonify({
            "ok": False, "error_code": "E010",
            "message": f"Dialogue session exhausted ({MAX_TURNS} turns max). Start a new evaluation.",
        }), 429

    # ── Log user turn ──────────────────────────────────────────────────────
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    dialogue_history.append({"sender": sender, "message": message, "timestamp": ts})

    # ── Build RAG-augmented prompt (CAPA §3) ──────────────────────────────
    # Filter out already-confirmed fields from missing list
    still_missing = [
        f for f in missing_fields
        if f.get("field") not in confirmed_fields
    ]

    history_summary = _build_history_summary(dialogue_history[:-1])  # exclude current turn

    # ── Read user-chosen language (set by /set_locale or __LANG_TIMEOUT__) ──
    # session_context.lang is the single source of truth — it overrides detected_lang.
    session_lang = entry.get("session_context", {}).get("lang", "EN")
    if session_lang in ("en-US", "EN"):
        lang_rule = (
            "You MUST reply in English only. "
            "The user has explicitly chosen English (or the timeout defaulted to English). "
            "Do NOT use Chinese, ZH-TW, or any other language regardless of the document language."
        )
    elif session_lang in ("zh-TW", "ZH-TW"):
        lang_rule = (
            "You MUST reply in Traditional Chinese (ZH-TW) only. "
            "The user has explicitly chosen Traditional Chinese."
        )
    else:
        lang_rule = (
            "Reply in the same language the user used in their latest message. "
            "If in doubt, default to English."
        )

    prompt = _build_dialogue_prompt(
        message         = message,
        evidence_chunks = evidence_chunks,
        missing_fields  = still_missing,
        confirmed_fields= confirmed_fields,
        history_summary = history_summary,
        lens            = lens,
        session_lang    = session_lang,
    )

    # ── G3FP RAG call ─────────────────────────────────────────────────────
    try:
        client = _get_g3fp()
        reply = _g3fp_generate(client, prompt, temperature=DIALOGUE_TEMP, max_tokens=2048)
        # ECP-DIAG-01: log finish_reason is now internal to _g3fp_generate
        _fr = "via_fallback_chain"
    except Exception as exc:
        logger.error(f"E002: G3FP dialogue call failed — {exc}", exc_info=True)
        # ── SILENT DEGRADATION — never expose engine errors to the user.
        # Design principle: only prompt the user when THEY need to take an action.
        # On transient G3FP failure, retry once with reduced max_tokens then
        # silently hold the pipeline in its current state (empty reply, ok:True).
        # The frontend will stay in its pending state; the user is unaffected.
        reply = ""
        try:
            resp2 = client.models.generate_content(
                model=DIALOGUE_MODEL,
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=DIALOGUE_TEMP,
                    max_output_tokens=512,   # reduced for retry headroom
                ),
            )
            reply = (resp2.text or "").strip()
            logger.info(f"[DIALOGUE] E002 retry succeeded (len={len(reply)}). trace={trace_id[-8:] if trace_id else '?'}")
        except Exception as exc2:
            logger.error(f"E002: G3FP dialogue retry also failed — {exc2}")
            # reply stays "" — pipeline holds in pending state, no user-visible error

    # ── Guard: empty reply after a successful API call (safety block / MAX_TOKENS) ─
    # SILENT DEGRADATION: never surface mechanism errors to the user.
    # If G3FP returns empty (safety filter / MAX_TOKENS), hold pipeline in
    # pending state. The frontend stays silent; no hardcoded error message shown.
    if not reply:
        _fr_str = str(_fr) if '_fr' in dir() else 'N/A'
        logger.warning(
            f"[DIALOGUE] G3FP returned empty reply (finish_reason={_fr_str}) "
            f"— holding pipeline in pending state. trace={trace_id[-8:] if trace_id else '?'}"
        )
        # reply stays "" — the pipeline return block below will emit ok:True, reply:""
        # The frontend's _addMsg2 / chat handler must treat empty reply as a no-op.

    # ── Extract confirmed field values from reply ──────────────────────────
    newly_confirmed = _extract_field_values(reply, still_missing)


    # ── Update confirmed_fields + uif_preview (closed loop) ──────────────
    if newly_confirmed:
        confirmed_fields.update(newly_confirmed)
        uif_preview = _update_uif_preview(entry, newly_confirmed)
        entry["uif_preview"] = uif_preview
        
        # ── OCG Gate: Z-depth calculation on newly confirmed vascular metrics ────
        # ECP-020: Z = (exp((value-ref)/ref) - 1) + ln(value/ref + ε)
        #   Physical meaning: deviation-from-equilibrium in neper units
        #   Z=0 at v=ref (baseline), Z>0 elevated, Z<0 suppressed
        #   GNN weight for 3D lipid-plaque rendering depth
        z_calculations = {}
        # ECP-020: Z runs on ALL known metrics — not just newly_confirmed
        # Include SAA_PROVISIONAL metrics from uif_preview too
        _metrics_to_z = {}
        if newly_confirmed:
            _metrics_to_z.update(newly_confirmed)
        # Also pull from uif_preview SAA_PROVISIONAL metrics
        _uif_metrics = (uif_preview or {}).get("extracted_data", {}).get("metrics", [])
        for _m in _uif_metrics:
            _mname = _m.get("name", "").upper()
            if _m.get("certification") in ("SAA_PROVISIONAL", "HARD") and _mname not in _metrics_to_z:
                _metrics_to_z[_mname] = {"value": _m.get("value"), "source": _m.get("certification")}

        if _metrics_to_z:
            VASCULAR_REF = {"LDL": 130.0, "TC": 200.0, "HDL": 40.0, "TG": 150.0,
                            "GLU": 100.0, "HBA1C": 5.7, "BP_SYS": 120.0, "BP_DIA": 80.0}
            epsilon = 1e-5
            for field, conf_data in _metrics_to_z.items():
                ref = VASCULAR_REF.get(field.upper())
                if ref and isinstance(conf_data.get("value"), (int, float)):
                    val = float(conf_data["value"])
                    ratio = (val - ref) / ref                     # X: deviation ratio
                    ratio_clamped = max(-2.0, min(3.0, ratio))   # clamp before exp
                    import math
                    try:
                        # ECP-020 formula: Z = (exp(ratio) - 1) + ln(val/ref + ε)
                        Z = (math.exp(ratio_clamped) - 1.0) + math.log(val / ref + epsilon)
                        Z = max(-99.0, min(99.0, Z))             # display clamp
                    except (OverflowError, ValueError, ZeroDivisionError):
                        Z = 0.0
                        logger.warning(f"[OCG-020] Z guard for {field}={val}")
                    # Risk classification: ±0 near ref, >0.3 neper = HIGH
                    z_calculations[field] = {
                        "Z": round(Z, 6),
                        "X_ratio": round(ratio, 4),
                        "reference": ref,
                        "measured": val,
                        "risk": "HIGH" if Z > 0.3 else "BORDERLINE" if Z > -0.05 else "NORMAL",
                        "gnn_weight": round(abs(Z) / 2.0, 4),  # normalized for GNN edge weight [0-1]
                    }
                    logger.info(
                        f"[OCG-020] Z: {field}={val}, ref={ref}, ratio={ratio:.4f}, Z={Z:.6f}, "
                        f"gnn_weight={z_calculations[field]['gnn_weight']} risk={z_calculations[field]['risk']}"
                    )
        
        logger.info(
            f"[dialogue] Fields confirmed: {list(newly_confirmed.keys())} | trace_id={trace_id}"
        )
    else:
        uif_preview = entry.get("uif_preview") or entry.get("uif", {})
        z_calculations = {}

    # ── Update still-missing list ──────────────────────────────────────────
    remaining_missing = [
        f for f in missing_fields
        if f.get("field") not in confirmed_fields
    ]

    # ── Update Panel 4 (confirmed axioms now have resolved fields) ───────────
    panel_4_update = _refresh_panel_4(entry, confirmed_fields)

    # ── ECP-020: Inject Z scores into uif_preview metrics (from z_calculations) ──
    if z_calculations and uif_preview:
        import copy
        uif_up = copy.deepcopy(uif_preview)
        for m in uif_up.get("extracted_data", {}).get("metrics", []):
            fname = m.get("name", "").upper()
            if fname in z_calculations:
                m["z_depth"]   = z_calculations[fname]["Z"]
                m["z_risk"]    = z_calculations[fname]["risk"]
                m["gnn_weight"] = z_calculations[fname].get("gnn_weight", 0.0)
                # Keep certification level — SAA_PROVISIONAL stays provisional
                if m.get("certification") == "UNCERTIFIED":
                    m["certification"] = "SOFT"
        entry["uif_preview"] = uif_up
        uif_preview = uif_up



    # ── ECP-004: Cycle 2 readiness — strict gate (requires confirmed fields) ──
    # ANTI-FALSE-POSITIVE: missing_fields must be non-empty and all resolved by USER_DIALOGUE.
    # If missing_fields was never populated (empty UIF), cycle_2 is NOT ready.
    user_confirmed_count = len([
        v for v in confirmed_fields.values()
        if v.get("source") == "USER_DIALOGUE"
    ])
    required_fields_exist = len(missing_fields) > 0
    cycle_2_ready = (
        required_fields_exist and
        len(remaining_missing) == 0 and
        user_confirmed_count > 0
    )

    # ── Log agent turn ─────────────────────────────────────────────────────
    dialogue_history.append({
        "sender":    "G3FP",
        "message":   reply,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "newly_confirmed": list(newly_confirmed.keys()),
    })

    # Persist session
    entry["panel_5_updated"] = {
        "missing_fields": remaining_missing,
        "total_missing":  len(remaining_missing),
        "blocking":       len(remaining_missing) > 0,
    }
    entry["confirmed_fields"] = confirmed_fields
    store[trace_id] = entry

    logger.info(
        f"[dialogue] Turn {len(dialogue_history)//2} | "
        f"confirmed={len(confirmed_fields)} remaining={len(remaining_missing)} "
        f"cycle_2_ready={cycle_2_ready} | trace_id={trace_id}"
    )

    return jsonify({
        "ok":                  True,
        "trace_id":            trace_id,
        "reply":               reply,
        "newly_confirmed":     newly_confirmed,
        "all_confirmed":       confirmed_fields,
        "updated_missing_fields": remaining_missing,
        "panel_5_updated":     entry["panel_5_updated"],
        "panel_4_updated":     panel_4_update,
        "uif_preview":         uif_preview,
        "cycle_2_ready":       cycle_2_ready,
        "turn_count":          len(dialogue_history) // 2,
        # ECP-004 OCG Gate — Z-depth results for live dashboard
        "z_calculations":      z_calculations,
        "user_confirmed_count": user_confirmed_count,
        "is_meta":             is_meta,
    }), 200


# ===========================================================================
# GET /api/agent/seal/dialogue/history/<trace_id>
# ===========================================================================

@nlp_dialogue_bp.route("/api/agent/seal/dialogue/history/<trace_id>", methods=["GET"])
def dialogue_history(trace_id: str):
    """Return full dialogue history for a trace."""
    entry = get_char_store().get(trace_id)
    if not entry:
        return jsonify({"ok": True, "trace_id": trace_id, "history": []}), 200
    return jsonify({
        "ok":       True,
        "trace_id": trace_id,
        "history":  entry.get("dialogue_history", []),
        "confirmed_fields": entry.get("confirmed_fields", {}),
        "cycle_2_ready": len(entry.get("panel_5_updated", {}).get("missing_fields", [])) == 0,
    }), 200


# ===========================================================================
# GET /api/agent/seal/dialogue/uif_preview/<trace_id>
# ===========================================================================

@nlp_dialogue_bp.route("/api/agent/seal/dialogue/uif_preview/<trace_id>", methods=["GET"])
def uif_preview(trace_id: str):
    """
    Return live uif_preview — updated in real-time as user confirms missing values.
    Frontend uses this to refresh the data table during dialogue.
    """
    entry = get_char_store().get(trace_id)
    if not entry:
        return jsonify({"ok": False, "error_code": "E001",
                        "message": f"trace_id '{trace_id}' not found"}), 404
    return jsonify({
        "ok":            True,
        "trace_id":      trace_id,
        "uif_preview":   entry.get("uif_preview") or entry.get("uif", {}),
        "confirmed_fields": entry.get("confirmed_fields", {}),
        "panel_5":       entry.get("panel_5_updated") or entry.get("panel_5_missing", {}),
        "cycle_2_ready": len(
            (entry.get("panel_5_updated") or {}).get("missing_fields", []) or
            (entry.get("panel_5_missing") or {}).get("missing_fields", [])
        ) == 0,
    }), 200


# ===========================================================================
# Helpers
# ===========================================================================

def _refresh_panel_4(entry: Dict, confirmed_fields: Dict) -> Dict:
    """
    Refresh panel_4_confirmed to reflect resolved fields.
    PM mandate: panel_4_confirmed updates in real-time as user provides values.
    """
    panels = entry.get("hitl_panels", {})
    p4 = dict(panels.get("panel_4", {}))
    if not p4:
        return {}

    resolved_fields = list(confirmed_fields.keys())
    axioms = p4.get("locked_axioms", [])

    for axiom in axioms:
        required = axiom.get("required_fields", [])
        for req in required:
            field = req.get("field", "")
            req["resolved"] = field in confirmed_fields
            if field in confirmed_fields:
                req["confirmed_value"] = confirmed_fields[field].get("value")

    p4["resolved_count"]  = len(resolved_fields)
    p4["resolved_fields"] = resolved_fields
    return p4


def _is_meta_query(message: str) -> bool:
    """Determine if a user message is a meta-query or a conversational request rather than a value assignment."""
    if not message:
        return False
    msg = message.strip().lower()
    
    meta_indicators = [
        "what", "how", "why", "who", "where", "when", "explain", "help", 
        "understand", "now?", "不懂", "怎麼辦", "什么", "怎么", "為什麼", "为什么", 
        "解釋", "解释", "說明", "说明", "明白", "知道", "??"
    ]
    
    confirmations = ["ok", "yes", "no", "proceed", "cancel", "好", "对", "不", "行", "可以"]
    
    import re
    if re.search(r'\b[a-zA-Z0-9_]+\s*[:=]\s*\d+', msg):
        return False
    if re.search(r'\b[a-zA-Z0-9_]+\s+is\s+\d+', msg):
        return False
        
    for ind in meta_indicators:
        if ind in msg:
            return True
            
    if "?" in msg or "？" in msg:
        return True
        
    if msg in confirmations:
        return False
        
    return False



