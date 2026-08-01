"""
Module: bus
Version: 1.0.0
Description: SovereignBUS for internal event-driven communication.
"""

import logging
import asyncio
from typing import Dict, Any, Callable, List, Optional

logger = logging.getLogger(__name__)

# Module-level singleton — initialised once; importable by api.hitl without
# circular dependency (api.hitl imports lazily inside a function).
_global_bus: Optional['SovereignBUS'] = None

class SovereignBUS:
    def __init__(self, register_as_global: bool = False):
        global _global_bus
        self._subscribers: Dict[str, List[Callable]] = {}
        self._cache: Dict[str, List[Any]] = {}
        if register_as_global:
            _global_bus = self
            logger.info("SovereignBUS: registered as _global_bus singleton.")

    def on(self, event_type: str, callback: Callable):
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(callback)

    async def emit(self, event_type: str, message: Dict[str, Any]):
        if event_type not in self._cache:
            self._cache[event_type] = []
        self._cache[event_type].append(message)
        
        if event_type in self._subscribers:
            for callback in self._subscribers[event_type]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(message)
                    else:
                        callback(message)
                except Exception as e:
                    logger.error(f"E009: BUS_ROUTING_FAILED - Error calling subscriber for {event_type}: {e}", exc_info=True)

    def get_cached(self, event_type: str) -> Optional[Any]:
        if event_type in self._cache and self._cache[event_type]:
            return self._cache[event_type][-1]
        return None

    def cache(self, event_type: str, message: Any) -> None:
        """Synchronously store a message in the bus cache without firing subscribers.
        
        Use this when a module receives data out-of-band (e.g. from another module's
        callback) and wants to make it available via get_cached() without re-emitting
        the event (which would cause infinite loops or duplicate deliveries).
        """
        if event_type not in self._cache:
            self._cache[event_type] = []
        # Replace latest entry so get_cached() returns the most-recent value
        self._cache[event_type] = [message]
        logger.debug(f"SovereignBUS: cached {event_type} directly (no subscribers notified).")

    def get_cached_all(self, event_type: str) -> List[Any]:
        return self._cache.get(event_type, [])
