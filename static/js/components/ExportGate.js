/**
 * Module: ExportGate.js
 * Version: 1.0.0
 * Description: Tier-aware export controller. Checks membership level before
 *              allowing 3D file downloads, rotation, or advanced purpose access.
 *              Fires SovUpgradeModal when gated.
 */

'use strict';

const TIER_RANK = { free: 0, premium: 1, sso: 2, pro: 3 };

/**
 * Returns the current user's membership tier.
 * Falls back to 'free'. Replace with real session/JWT check.
 * @returns {'free'|'premium'|'sso'|'pro'}
 */
function _getCurrentTier() {
  try {
    const stored = sessionStorage.getItem('sovereign_membership_tier');
    if (stored && TIER_RANK[stored] !== undefined) return stored;
  } catch (_) {}
  return 'free';
}

/**
 * Check if current tier meets the required tier.
 * @param {'free'|'premium'|'sso'|'pro'} required
 * @returns {boolean}
 */
function _hasAccess(required) {
  return TIER_RANK[_getCurrentTier()] >= TIER_RANK[required];
}

/**
 * Attempt to enable in-browser 3D rotation (OrbitControls).
 * Free tier → fires upgrade modal.
 * @param {string} containerId - The 3D canvas container ID
 */
function gateRotation(containerId) {
  if (_hasAccess('premium')) return true;
  if (window.SovUpgradeModal) window.SovUpgradeModal.show('premium');
  return false;
}

/**
 * Attempt to download a 3D export file.
 * SSO tier (add-on) or Pro required → fires modal otherwise.
 * @param {'glb'|'usdz'|'html'|'mp4'} format
 */
function gateExport(format) {
  const required = (format === 'html') ? 'premium' : 'pro';
  if (_hasAccess(required)) return true;
  if (window.SovUpgradeModal) window.SovUpgradeModal.show('pro');
  return false;
}

/**
 * Attempt to use a G3FP purpose beyond P1.
 * Purposes 2-6 require Premium+.
 * @param {number} purposeIndex - 1-based purpose index
 */
function gatePurpose(purposeIndex) {
  if (purposeIndex <= 1) return true;
  if (_hasAccess('premium')) return true;
  if (window.SovUpgradeModal) window.SovUpgradeModal.show('premium');
  return false;
}

/**
 * Attempt to use branded export (custom logo, no watermark, audit seal).
 * SSO Enterprise+ required.
 */
function gateBranding() {
  if (_hasAccess('sso')) return true;
  if (window.SovUpgradeModal) window.SovUpgradeModal.show('sso');
  return false;
}

/**
 * Returns remaining AI credits for display in CreditMeter.
 * Replace with real API call.
 * @returns {{ used: number, limit: number, tier: string }}
 */
function getCreditStatus() {
  const tier = _getCurrentTier();
  const limits = { free: 0, premium: 500, sso: 1500, pro: 5000 };
  const limit = limits[tier] || 0;
  try {
    const used = parseInt(sessionStorage.getItem('sovereign_credits_used') || '0', 10);
    return { used, limit, tier, pct: limit > 0 ? Math.min(100, (used/limit)*100) : 100 };
  } catch(_) {
    return { used: 0, limit, tier, pct: 0 };
  }
}

// Expose globally
window.ExportGate = { gateRotation, gateExport, gatePurpose, gateBranding, getCreditStatus, getCurrentTier: _getCurrentTier };
