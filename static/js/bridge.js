/**
 * Module: bridge.js
 * Version: 1.1.0
 * Description: Sovereign Rolling Navigation Bridge.
 * Centralizes scroll-based navigation between OP pages.
 *
 * CAPA §2I: On every fresh page load and bfcache restoration, any stale
 * #sov-bridge-transition overlay from the outgoing page is immediately removed.
 * The overlay only belongs to the outgoing page's DOM; the incoming page must
 * never show it — this guard makes that invariant testable and deterministic.
 */

(function () {
    /* ── BFCache / Fresh-load Stale Overlay Cleanup ────────────────────────
     * The #sov-bridge-transition div is created dynamically on the OUTGOING
     * page during navigate() and must never appear on a newly loaded page.
     * Two scenarios where it could persist:
     *   1. BFCache: browser restores the outgoing page's DOM snapshot.
     *   2. Race:    Playwright resolves waitForURL(load) before the old DOM
     *              is fully torn down.
     * Fix: Eagerly remove the overlay on both DOMContentLoaded and pageshow.
     */
    function _clearTransitionOverlay() {
        const stale = document.getElementById('sov-bridge-transition');
        if (stale) { stale.remove(); }
    }
    document.addEventListener('DOMContentLoaded', _clearTransitionOverlay);
    window.addEventListener('pageshow', _clearTransitionOverlay);
    const SEQUENCE = [
        'index.html',
        'op_01.html',
        'op_02.html',
        'op_03.html',
        'op_04.html'
    ];

    let rolling = false;
    let accum = 0;
    let timer = null;
    let navTimer = null;   // the 300ms navigation setTimeout — must be cancelled on unload
    const SENSITIVITY = 60; // Slightly higher than 50 for stability

    /**
     * Checks if an element is scrollable (Y-axis).
     */
    function isScrollable(el) {
        if (!el || el === document.body || el === document.documentElement) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const isScrollableStyle = overflowY === 'auto' || overflowY === 'scroll';
        return isScrollableStyle && el.scrollHeight > el.clientHeight;
    }

    /**
     * Checks if the target is inside any scrollable container (to prevent accidental navigation).
     */
    function isInsideScrollable(el) {
        while (el && el !== document.body && el !== document.documentElement) {
            if (isScrollable(el)) return true;
            el = el.parentElement;
        }
        return false;
    }

    /**
     * Gets the current page name from the URL.
     */
    function getCurrentPage() {
        const path = window.location.pathname;
        const file = path.substring(path.lastIndexOf('/') + 1);
        return file || 'index.html';
    }

    /**
     * Navigation Logic
     */
    function navigate(direction) {
        const current = getCurrentPage();
        const index = SEQUENCE.indexOf(current);
        if (index === -1) return;

        let target = null;
        if (direction > 0) { // Down
            if (index < SEQUENCE.length - 1) {
                target = SEQUENCE[index + 1];
            } else {
                // End of Sequence behavior
                showEndNotice();
                return;
            }
        } else { // Up
            if (index > 0) {
                target = SEQUENCE[index - 1];
            } else {
                // Start of Sequence (Home) - already at index 0
                return;
            }
        }

        if (target) {
            rolling = true;
            // Fade-out overlay then navigate.  navTimer is tracked so that the
            // beforeunload handler can cancel it if the browser unloads this
            // page before the 300ms fires (prevents pageerror in teardown).
            const overlay = document.createElement('div');
            overlay.id = 'sov-bridge-transition';
            overlay.style.cssText = 'position:fixed;inset:0;background:black;z-index:100000;opacity:0;transition:opacity 0.3s;pointer-events:none;';
            document.body.appendChild(overlay);
            setTimeout(() => { overlay.style.opacity = '1'; }, 10);

            navTimer = setTimeout(() => {
                navTimer = null;
                window.location.href = target;
            }, 300);
        }
    }

    function showToast(title, msg, color) {
        color = color || '#00ff88';
        const t = document.createElement('div');
        t.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid ${color};
            border-radius: 8px;
            padding: 15px 20px;
            min-width: 280px;
            z-index: 1000000;
            font-family: Calibri, 'Microsoft JhengHei', sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 10px ${color}44;
            transform: translateX(400px);
            transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
        `;
        t.setAttribute('data-test-id', 'sovereign-toast');
        t.innerHTML = `
            <div data-test-id="toast-title" style="color:${color}; font-weight:900; font-size:14px; letter-spacing:1px; margin-bottom:5px; text-transform:uppercase;">${title}</div>
            <div style="color:#ccc; font-size:12px; line-height:1.5;">${msg}</div>
            <div style="position:absolute; top:5px; right:8px; color:#444; cursor:pointer; font-size:16px;" onclick="this.parentElement.remove()">×</div>
        `;
        document.body.appendChild(t);
        requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; });
        setTimeout(() => {
            t.style.transform = 'translateX(400px)';
            setTimeout(() => t.remove(), 500);
        }, 6000);
    }

    function showEndNotice() {
        showToast('Sequence Complete', 'You have navigated through the full Sovereign Diagnostic Pipeline. Data persistence is active.', '#D4AF37');
    }

    document.addEventListener('wheel', (e) => {
        if (rolling) return;
        if (isInsideScrollable(e.target)) return;

        const atTop = window.scrollY <= 5;
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5;

        // If scrolling down but not at bottom, let the page scroll naturally
        if (e.deltaY > 0 && !atBottom) {
            accum = 0;
            return;
        }
        // If scrolling up but not at top, let the page scroll naturally
        if (e.deltaY < 0 && !atTop) {
            accum = 0;
            return;
        }

        // Use e.deltaY to determine direction
        accum += e.deltaY;
        clearTimeout(timer);
        timer = setTimeout(() => { accum = 0; }, 150);

        if (Math.abs(accum) > SENSITIVITY) {
            navigate(accum);
            accum = 0;
        }
    }, { passive: true });

    // Also support keyboard navigation (ArrowDown / ArrowUp)
    document.addEventListener('keydown', (e) => {
        if (rolling) return;
        if (['ArrowDown', 'PageDown'].includes(e.key)) {
            // Check if at bottom of page — use scrollHeight (matches scrollTo(0, scrollHeight) in tests)
            const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5;
            if (atBottom) navigate(1);
        } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
            const atTop = window.scrollY <= 2;
            if (atTop) navigate(-1);
        }
    });

    // Cancel any pending navTimer the moment this page begins unloading.
    // Without this, the 300ms setTimeout may fire during Playwright's page
    // teardown, attempt to access a destroyed document, and throw a pageerror
    // that the test harness incorrectly treats as an application crash.
    window.addEventListener('pagehide', () => {
        if (navTimer !== null) {
            clearTimeout(navTimer);
            navTimer = null;
        }
    });

    console.log('[SOVEREIGN] Navigation Bridge Active: ' + getCurrentPage());

    /* DFT HOOK: programmatic navigation for E2E tests.
     * Calling window._sovereignBridgeNavigate(1) is equivalent to a user
     * scrolling to the bottom and pressing PageDown — it bypasses keyboard
     * focus trapping inside iframes or scroll-zone containers.
     * direction: +1 = forward (next page), -1 = backward (prev page). */
    window._sovereignBridgeNavigate = function(direction) {
        if (rolling) {
            console.warn('[SOVEREIGN] Bridge navigate() called while rolling — ignored');
            return;
        }
        navigate(direction > 0 ? 1 : -1);
    };
})();
