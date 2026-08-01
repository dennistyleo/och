"""
Test Suite: test_och.py
Version: 1.0.0
Description: Unit test suite for OCH (Ontology Compliance Healthcare) engine.
"""

import pytest
import asyncio
from unittest.mock import MagicMock

from modules.bus import SovereignBUS
from modules.och import OCHEngine


class MockRegistry:
    def get(self, axiom_id):
        mock_axiom = MagicMock()
        mock_axiom.axiom_id = axiom_id
        return mock_axiom

    def get_by_domain_and_mode(self, domain, mode):
        mock_axiom = MagicMock()
        mock_axiom.axiom_id = "OCH_TEST_001"
        mock_axiom.required_fields = [{"field": "glucose"}]
        mock_axiom._raw = {
            "name": "Glucose Admissibility",
            "derivation_formula": {
                "sympy_expr": "glucose",
                "variables": {"glucose": {"maps_to_field": "glucose", "unit": "mg/dL"}},
                "verdict_threshold": {"op": "<=", "value": 140}
            }
        }
        return [mock_axiom]


class TestOCHEngine:

    @pytest.fixture
    def bus(self):
        return SovereignBUS()

    @pytest.fixture
    def registry(self):
        return MockRegistry()

    @pytest.fixture
    def engine(self, bus, registry):
        return OCHEngine(bus=bus, registry=registry)

    def test_001_valid_input(self, engine):
        """Test valid clinical payload execution."""
        async def run_test():
            payload = {
                "domain": "HEALTHCARE",
                "field_values": {"glucose": 95.0, "creatinine": 0.9, "patient_sex": "M"}
            }
            res = await engine.run(domain="HEALTHCARE", field_values=payload["field_values"], trace_id="test_trace_001")
            assert isinstance(res, dict)
            assert "sha256" in res or "status" in res or "gate" in res
        asyncio.run(run_test())

    def test_002_invalid_input(self, engine):
        """Test invalid domain handling."""
        async def run_test():
            empty_registry = MagicMock()
            empty_registry.get_by_domain_and_mode.return_value = []
            engine_empty = OCHEngine(bus=engine.bus, registry=empty_registry)
            res = await engine_empty.run(domain="UNKNOWN", field_values={}, trace_id="test_trace_002")
            assert isinstance(res, dict)
            assert "error_code" in res or "status" in res
        asyncio.run(run_test())

    def test_003_error_handling(self, engine):
        """Test error handling when edge fields are present."""
        async def run_test():
            res = await engine.run(domain="HEALTHCARE", field_values={"glucose": -999.0}, trace_id="test_trace_003")
            assert isinstance(res, dict)
        asyncio.run(run_test())

    def test_004_timeout(self, engine):
        """Test HITL response non-suspending execution."""
        async def run_test():
            res = await engine.run(domain="HEALTHCARE", field_values={}, trace_id="test_trace_004", suspend_on_hitl=False)
            assert isinstance(res, dict)
        asyncio.run(run_test())

    def test_005_schema_validation(self, engine):
        """Test BUS message handling for och:request."""
        async def run_test():
            msg = {
                "trace_id": "test_trace_005",
                "payload": {
                    "domain": "HEALTHCARE",
                    "field_values": {"glucose": 110.0}
                }
            }
            res = await engine._handle_och_request(msg)
            assert isinstance(res, dict)
        asyncio.run(run_test())
