"""
Module: extract
Version: 1.0.0
Description: Lightweight PDF/text extractor using ONLY Python built-ins.
             No PyPDF2, no Gemini, no external deps needed.
             Endpoint: POST /api/extract-text  (multipart form, field 'file')
             Returns:  { ok, text, chars, pages, file_name, method }
"""

import os
import re
import zlib
import logging
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

extract_bp = Blueprint("extract", __name__)


def _extract_pdf_text(data: bytes) -> tuple[str, int]:
    """
    Extract readable text from a PDF byte stream using only built-in modules.
    Works for PDFs with embedded (not scanned) text.

    Returns:
        (text, page_count)
    """
    parts: list[str] = []

    # ── Count pages ────────────────────────────────────────────────────────
    page_count = len(re.findall(rb"/Type\s*/Page[^s]", data))

    # ── Extract all stream blocks ───────────────────────────────────────────
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.DOTALL):
        raw = m.group(1)

        # Look at the object preamble (up to 400 bytes before stream keyword)
        preamble = data[max(0, m.start() - 400) : m.start()]
        use_zlib = b"FlateDecode" in preamble or b"/Fl " in preamble

        try:
            if use_zlib:
                try:
                    dc = zlib.decompress(raw)
                except Exception:
                    try:
                        dc = zlib.decompress(raw, -15)  # raw deflate (no header)
                    except Exception:
                        dc = raw
            else:
                dc = raw

            # ── Extract text between BT (Begin Text) … ET (End Text) blocks ──
            for bt_et in re.finditer(rb"BT\s(.*?)\sET", dc, re.DOTALL):
                block = bt_et.group(1)

                # Literal strings:  (text) Tj  and  [(text) …] TJ
                for s in re.findall(rb"\(([^)]*)\)\s*Tj", block):
                    t = s.replace(b"\r", b" ").replace(b"\n", b" ").decode(
                        "latin-1", errors="replace"
                    )
                    if t.strip():
                        parts.append(t)

                for s in re.findall(rb"\(([^)]*)\)", block):
                    t = s.decode("latin-1", errors="replace")
                    if t.strip() and not t.startswith("%"):
                        parts.append(t)

        except Exception as exc:
            logger.debug(f"stream decode error: {exc}")

    text = " ".join(parts)
    # Collapse whitespace
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text, page_count


def _extract_pdf_metadata(data: bytes) -> str:
    """Extract PDF metadata fields (Title, Subject, Keywords, Author) from raw bytes."""
    parts = []
    for field in [b'/Title', b'/Subject', b'/Keywords', b'/Author', b'/Creator']:
        # Look for /Field (value) patterns in the first 64KB
        header = data[:65536]
        for m in re.finditer(field + rb'\s*\(([^)]{1,500})\)', header):
            val = m.group(1).decode('latin-1', errors='replace').strip()
            if val:
                parts.append(val)
        # Also hex strings  /Field <hex>
        for m in re.finditer(field + rb'\s*<([0-9a-fA-F]+)>', header):
            try:
                val = bytes.fromhex(m.group(1).decode()).decode('utf-16-be', errors='replace').strip()
                if val:
                    parts.append(val)
            except Exception:
                pass
    return ' '.join(parts)


def _extract_pdf_via_subprocess(tmp_path: str) -> str:
    """
    Try macOS-native text extraction tools available without any install:
    1. textutil (built into macOS - can convert PDF to plain text)
    2. pdftotext (if Homebrew poppler is installed)
    3. mdimport + spotlight (reads Spotlight index)
    """
    import subprocess, tempfile, os

    # 1. pdftotext (Homebrew poppler)
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', tmp_path, '-'],
            capture_output=True, timeout=15
        )
        if result.returncode == 0 and result.stdout:
            text = result.stdout.decode('utf-8', errors='replace').strip()
            if len(text) > 100:
                logger.info(f"[extract] pdftotext: {len(text)} chars")
                return text
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # 2. textutil (macOS built-in — works on .docx, .rtf but not all PDFs)
    try:
        out_txt = tmp_path + '.txt'
        result = subprocess.run(
            ['textutil', '-convert', 'txt', '-output', out_txt, tmp_path],
            capture_output=True, timeout=15
        )
        if result.returncode == 0 and os.path.exists(out_txt):
            with open(out_txt, 'r', errors='replace') as fh:
                text = fh.read().strip()
            os.unlink(out_txt)
            if len(text) > 100:
                logger.info(f"[extract] textutil: {len(text)} chars")
                return text
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass

    # 3. strings command — finds ALL printable sequences in binary (works on any PDF)
    try:
        result = subprocess.run(
            ['strings', '-a', '-n', '5', tmp_path],
            capture_output=True, timeout=10
        )
        if result.returncode == 0 and result.stdout:
            raw = result.stdout.decode('utf-8', errors='replace')
            # Filter out pure PDF syntax lines (keep human-readable content)
            import re as _re
            lines = raw.splitlines()
            kept = []
            skip_patterns = _re.compile(
                r'^(\d+\s+\d+\s+obj|endobj|endstream|stream|xref|trailer'
                r'|startxref|<<|>>|BT|ET|Tf|Tm|TD|Td|cm|Do|q|Q|w|W|n|m|l|c|h|f\*?|S|s|b|re'
                r'|setgstate|GS\d+|F\d+|PDF|Font|MediaBox|XObject|Image|Page|Catalog|Info'
                r'|Type\s*/|Length\s+\d|FlateDecode|ASCII|flate|stream)\b',
                _re.I
            )
            for ln in lines:
                clean = ln.strip()
                if len(clean) < 5:
                    continue
                if skip_patterns.match(clean):
                    continue
                if _re.match(r'^[\d\s.]+$', clean):  # pure numbers
                    continue
                if _re.match(r'^[^a-zA-Z]*$', clean):  # no letters
                    continue
                kept.append(clean)
            text = ' '.join(kept)
            if len(text) > 50:
                logger.info(f"[extract] strings: {len(text)} chars from {len(kept)} lines")
                return text[:32768]
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception) as e:
        logger.debug(f"[extract] strings fallback failed: {e}")

    # 4. pypdf (if installed in env)
    try:
        import pypdf
        from io import BytesIO
        with open(tmp_path, 'rb') as fh:
            reader = pypdf.PdfReader(fh, strict=False)
            pages_text = []
            for page in reader.pages:
                try:
                    pages_text.append(page.extract_text() or '')
                except Exception:
                    pass
            text = ' '.join(pages_text).strip()
            if len(text) > 50:
                logger.info(f"[extract] pypdf: {len(text)} chars, {len(reader.pages)} pages")
                return text[:32768]
    except ImportError:
        pass
    except Exception as e:
        logger.debug(f"[extract] pypdf error: {e}")

    return ''



def _extract_text_from_bytes(data: bytes, filename: str) -> dict:
    """Dispatch to the right extractor based on file extension."""
    import tempfile, os
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        text = ''
        method = 'unknown'
        pages = len(re.findall(rb"/Type\s*/Page[^s]", data))

        # Write to temp file for subprocess methods
        tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        try:
            tmp.write(data)
            tmp.close()

            # 1st: try pdftotext / textutil (subprocess, macOS native)
            text = _extract_pdf_via_subprocess(tmp.name)
            if text:
                method = 'macos_native'

        finally:
            try:
                os.unlink(tmp.name)
            except Exception:
                pass

        # 2nd: builtin zlib/BT-ET
        if not text or len(text) < 100:
            builtin_text, pages = _extract_pdf_text(data)
            if len(builtin_text) > len(text):
                text = builtin_text
                method = 'pdf_builtin'

        # 3rd: PDF metadata (Title/Keywords/Subject) — useful for scanned docs
        meta = _extract_pdf_metadata(data)
        if meta:
            text = (meta + ' ' + text).strip()

        if not text:
            method = 'none'

    else:
        # Plain text / code file
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:
            text = data.decode("latin-1", errors="replace")
        pages = 1
        method = "text_direct"

    return {
        "ok": True,
        "text": text[:32768],
        "chars": len(text),
        "pages": pages if 'pages' in dir() else 1,
        "file_name": filename,
        "method": method,
    }



@extract_bp.route("/api/extract-text", methods=["POST"])
def extract_text():
    """
    POST /api/extract-text
    Multipart form with field 'file'.

    Returns JSON:
      { ok, text, chars, pages, file_name, method }
    or on error:
      { ok: false, error_code, message }
    """
    if "file" not in request.files:
        return jsonify({"ok": False, "error_code": "E001", "message": "No file field in request"}), 400

    f = request.files["file"]
    if not f or f.filename == "":
        return jsonify({"ok": False, "error_code": "E001", "message": "Empty filename"}), 400

    try:
        data = f.read()
        result = _extract_text_from_bytes(data, f.filename)
        logger.info(
            f"[extract] {f.filename} → {result['chars']} chars, "
            f"{result['pages']} pages, method={result['method']}"
        )
        return jsonify(result)
    except Exception as exc:
        logger.error(f"[extract] E003: {exc}", exc_info=True)
        return jsonify({"ok": False, "error_code": "E003", "message": str(exc)}), 500

@extract_bp.route("/api/chat", methods=["POST"])
def agent_chat():
    """
    POST /api/chat
    Responds to the AI Pre-Flight Diagnostic Dialogue using Gemini.
    """
    query = request.form.get("query", "").strip()
    file_name = request.form.get("file_name", "unknown_file")
    
    if not query:
        return jsonify({"ok": False, "reply": "Empty query received."})

    try:
        from modules.rag_extractor import _get_model
        model = _get_model()
        if not model:
            # Raise dynamic anomaly if Gemini configuration is absent
            api_state = os.environ.get("SOVEREIGN_GEMINI_API_KEY", "MISSING")
            return jsonify({"ok": False, "reply": f"[SYSTEM ANOMALY] LLM Engine offline. API Key State: {api_state}"}), 200
            
        sys_prompt = f"You are the Sovereign Matrix Pre-Flight AI. Assess this user query regarding file: {file_name}. Keep responses sharp, highly technical, and strictly under 40 words. Query: {query}"
        
        file_obj = request.files.get("file")
        payload = []
        if file_obj:
            try:
                file_bytes = file_obj.read()
                mime_type = "application/pdf" if file_name.lower().endswith(".pdf") else "text/plain"
                sys_prompt = f"You are the Sovereign Matrix Diagnostics Agent.\n\nThe user natively attached the document: '{file_name}'. \n\nUse your robust vision/document analysis capabilities to parse its internal structure and answer the User Query below.\n\nUser Query: {query}"
                payload.append(sys_prompt)
                payload.append({"mime_type": mime_type, "data": file_bytes})
            except Exception as read_err:
                logger.warning(f"Could not read chat file context: {read_err}")
                payload.append(sys_prompt)
        else:
            payload.append(sys_prompt)
        
        resp = model.generate_content(payload)
        return jsonify({"ok": True, "reply": resp.text.strip()})
    except Exception as e:
        logger.error(f"[chat] E003: {e}", exc_info=True)
        return jsonify({"ok": False, "reply": f"[E003 EXCEPTION] {str(e)}"}), 200
