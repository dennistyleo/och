"""
Module: api.ocm_dialogue_logic
Version: 1.0.0
Description: Bridge module to map modularized NLP logic to the API naming conventions.
"""

import logging
from typing import Dict, Any, List, Optional

# Import core logic from modularized files
from modules.nlp_dialogue_logic import (
    calculate_readiness,
    extract_field_values,
    update_uif_preview,
    refresh_panel_4,
    calculate_metric_z_depths,
    build_history_summary
)

# Import prompt builders from modularized files
from modules.nlp_dialogue_prompts import (
    get_tone_rule,
    is_out_of_range,
    build_dialogue_prompt,
    build_session_open_prompt,
    build_instant_report_prompt,
    build_missing_data_prompt,
    build_lang_timeout_prompt,
    build_purpose_ask_prompt,
    build_axiom_elected_prompt
)

logger = logging.getLogger(__name__)

# Re-export with underscores as expected by nlp_dialogue.py
_get_tone_rule = get_tone_rule
_is_out_of_range = is_out_of_range
_build_dialogue_prompt = build_dialogue_prompt
_build_session_open_prompt = build_session_open_prompt
_build_instant_report_prompt = build_instant_report_prompt
_build_missing_data_prompt = build_missing_data_prompt
_build_lang_timeout_prompt = build_lang_timeout_prompt
_build_purpose_ask_prompt = build_purpose_ask_prompt
_build_axiom_elected_prompt = build_axiom_elected_prompt

# Logic re-exports
_extract_field_values = extract_field_values
_update_uif_preview = update_uif_preview
_refresh_panel_4 = refresh_panel_4
_calculate_metric_z_depths = calculate_metric_z_depths
_build_history_summary = build_history_summary

# calculate_readiness is used without underscore in nlp_dialogue.py
# (It's already available as calculate_readiness)
