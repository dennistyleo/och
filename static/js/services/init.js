/* ══════════════════════════════════════════════════════════
   Module: init.js
   Version: 1.0.0
   Description: Centralized service and registry initialization.
                Follows Rule 02 and 06.
   ══════════════════════════════════════════════════════════ */

import { bus } from '../bus.js';
import { ComponentRegistry } from '../core/ComponentRegistry.js';
import { TubeService } from './TubeService.js';

// Initialize Registry
export const registry = new ComponentRegistry(bus);

// Initialize Services
export const tubeService = new TubeService(registry);

console.log('[INIT] Sovereign Matrix Services Initialized');
