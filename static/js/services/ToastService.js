/* ══════════════════════════════════════════════════════════
   Module: ToastService.js
   Version: 1.0.0
   Description: Isolated floating toast notification service.
                Extracted from UIManager per SRP.
   Standards: ISO/IEC 25010 (Usability, Maintainability)
   ══════════════════════════════════════════════════════════ */

const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);
const TOAST_DURATION_MS = 4000;

export class ToastService {
    constructor() {
        this._container = null;
    }

    /**
     * Lazily bind to the toast container element.
     * @private
     */
    _getContainer() {
        if (!this._container) {
            this._container = document.getElementById('toast-container');
            if (!this._container) {
                console.warn('[TOAST_SERVICE] #toast-container not found in DOM');
            }
        }
        return this._container;
    }

    /**
     * Display a floating toast notification.
     * @param {string} message - The notification text
     * @param {string} [type='success'] - Toast type: success | error | warning | info
     */
    show(message, type = 'success') {
        if (!TOAST_TYPES.has(type)) {
            console.error(`E003: INVALID_TOAST_TYPE — "${type}"`);
            type = 'info';
        }
        const container = this._getContainer();
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, TOAST_DURATION_MS);
    }
}
