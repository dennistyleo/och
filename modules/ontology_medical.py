"""
Module: ontology_medical.py
Version: 1.0.0
Description: Backward compatibility adapter for OCH (Ontology Compliance Healthcare).
             Wraps OCHEngine from modules.och.
"""

import logging
from typing import Any
from modules.och import OCHEngine

logger = logging.getLogger(__name__)


class OntologyMedicalEngine(OCHEngine):
    """
    Backward-compatibility alias for OCHEngine (Ontology Compliance Healthcare).
    """

    def __init__(self, bus: Any, registry: Any) -> None:
        super().__init__(bus=bus, registry=registry)
        logger.info("[MED] OntologyMedicalEngine compatibility wrapper ready -> delegating to OCHEngine.")
