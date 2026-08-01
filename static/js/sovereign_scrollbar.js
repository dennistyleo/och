/**
 * SOVEREIGN SCROLLBAR ENGINE v20.0
 * Adds: pill-end arrow caps (▲▼ / ◄►) + horizontal rail (scroll-zone-x).
 */
(function () {
  'use strict';

  /* ═══════════  TOKENS  ═══════════ */
  const PILL_W = 10, SLOT_W = 6, THUMB_W = 4, THUMB_INSET = 1;
  const MIN_THUMB = 12, MAX_THUMB_R = 0.40, CAP_H = 12;

  const PILL_GRAD =
    'linear-gradient(to right,#0c0800 0%,#2a1e00 6%,#6b5000 14%,' +
    '#a07800 22%,#c8a010 30%,#d4ac18 35%,#bfa020 44%,' +
    '#9a7e10 56%,#7a6208 68%,#4a3e04 80%,#1e1800 90%,#080600 100%)';

  const PILL_GRAD_H =
    'linear-gradient(to bottom,#0c0800 0%,#2a1e00 6%,#6b5000 14%,' +
    '#a07800 22%,#c8a010 30%,#d4ac18 35%,#bfa020 44%,' +
    '#9a7e10 56%,#7a6208 68%,#4a3e04 80%,#1e1800 90%,#080600 100%)';

  const SLOT_BG   = '#7e6a0b'; /* Solid bronze track slot per mockup change notes */
  const THUMB_BG  = 'linear-gradient(to right, #7a6308 0%, #bb9d13 25%, #ffffff 38%, #fff4bd 42%, #bb9d13 55%, #9c810c 75%, #bb9d13 100%)'; /* Specular shiny gold vertical thumb using #bb9d13 */
  const THUMB_BGH = 'linear-gradient(to bottom, #7a6308 0%, #bb9d13 25%, #ffffff 38%, #fff4bd 42%, #bb9d13 55%, #9c810c 75%, #bb9d13 100%)'; /* Specular shiny gold horizontal thumb using #bb9d13 */
  const TRI_COL   = '#3d2800';

  /* ═══════════  HIDE NATIVE  ═══════════ */
  if (!document.getElementById('sv-hide-native')) {
    const s = document.createElement('style');
    s.id = 'sv-hide-native';
    s.textContent =
      '.sv-host{scrollbar-width:none!important;}' +
      '.sv-host::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}' +
      /* FIX-MODAL-Z-01: original selector targeted non-existent #hitl-overlay.
       * Updated to cover all three real modal states:
       *   #sov-hitl-bridge  = HITLModal bridge overlay (hitl_modal_bridge.js)
       *   #abm-ov           = AxiomBrowserModal full-screen overlay (axiom_browser_modal.js)
       *   body.hitl-active  = class added by HITLModal.show()
       *   body.modal-active-lock = class added by HITLModal.show() */
      '#sov-hitl-bridge ~ .sv-pill, #hitl-bridge-overlay ~ .sv-pill,' +
      'body:has(#sov-hitl-bridge) .sv-pill, body:has(#hitl-bridge-overlay) .sv-pill,' +
      'body:has(#abm-ov) .sv-pill,' +
      'body:has(#sov-axiom-repo-modal) .sv-pill,' +
      'body.hitl-active .sv-pill,' +
      'body.axiom-repo-open .sv-pill,' +
      'body.modal-active-lock .sv-pill' +
      '{visibility:hidden!important;pointer-events:none!important;}';
    document.head.appendChild(s);
  }

  function el(t) { return document.createElement(t); }
  function css(n, s) { Object.assign(n.style, s); }

  /* ═══════════  ARROW CAP  ═══════════ */
  function buildCap(dir) {
    const horiz = dir === 'left' || dir === 'right';
    const cap = el('div');
    css(cap, {
      flexShrink: '0', display: 'flex', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', background: 'transparent',
      width:  (horiz ? CAP_H : PILL_W) + 'px',
      height: (horiz ? PILL_W : CAP_H) + 'px',
    });
    const a = el('div');
    const T = 'transparent';
    const tri_w = '2px';
    const tri_h = '4px';
    if (dir === 'top')    css(a, { width:'0',height:'0', borderLeft:`${tri_w} solid ${T}`, borderRight:`${tri_w} solid ${T}`, borderBottom:`${tri_h} solid ${TRI_COL}` });
    if (dir === 'bottom') css(a, { width:'0',height:'0', borderLeft:`${tri_w} solid ${T}`, borderRight:`${tri_w} solid ${T}`, borderTop:`${tri_h} solid ${TRI_COL}` });
    if (dir === 'left')   css(a, { width:'0',height:'0', borderTop:`${tri_w} solid ${T}`, borderBottom:`${tri_w} solid ${T}`, borderRight:`${tri_h} solid ${TRI_COL}` });
    if (dir === 'right')  css(a, { width:'0',height:'0', borderTop:`${tri_w} solid ${T}`, borderBottom:`${tri_w} solid ${T}`, borderLeft:`${tri_h} solid ${TRI_COL}` });
    a.style.pointerEvents = 'none';
    cap.appendChild(a);
    cap.addEventListener('mouseenter', () => { cap.style.filter = 'brightness(1.4)'; });
    cap.addEventListener('mouseleave', () => { cap.style.filter = ''; });
    return cap;
  }

  /* ═══════════  KNURL  ═══════════ */
  function buildKnurl(horiz) {
    const k = el('div');
    css(k, {
      position:'absolute', top:horiz?'0':'50%', bottom:horiz?'0':'auto',
      left:horiz?'50%':'0', right:horiz?'auto':'0',
      transform: horiz ? 'translateX(-50%)' : 'translateY(-50%)',
      display:'flex', flexDirection: horiz ? 'row' : 'column',
      alignItems:'center', gap:'2px', pointerEvents:'none',
    });
    for (let i = 0; i < 3; i++) {
      const ln = el('div');
      css(ln, {
        background:'rgba(0,0,0,0.80)', borderRadius:'0',
        boxShadow: horiz ? '0.5px 0 0 rgba(255,200,40,0.30)' : '0 0.5px 0 rgba(255,200,40,0.30)',
        width:  horiz ? '1.5px' : '80%',
        height: horiz ? '80%'  : '1.5px',
      });
      k.appendChild(ln);
    }
    return k;
  }

  /* ═══════════  VERTICAL RAIL  ═══════════ */
  function buildRail() {
    const pill = el('div');
    pill.className = 'sv-pill';
    css(pill, {
      position:'absolute', width: PILL_W+'px', borderRadius:'9999px', /* Perfectly rounded pill outer ends */
      background:PILL_GRAD, zIndex:'150', display:'flex',
      flexDirection:'column', alignItems:'center', pointerEvents:'auto',
      userSelect:'none', boxSizing:'border-box', visibility:'hidden', opacity:'0',
      transition:'opacity 0.14s ease',
      boxShadow: 'none',
    });

    const topCap = buildCap('top');

    const slot = el('div');
    css(slot, {
      flex:'1', width:SLOT_W+'px', background:SLOT_BG, position:'relative',
      overflow:'hidden', borderRadius:'9999px', /* Perfectly rounded pill track slot */ minHeight:'0',
      boxShadow:'inset 1px 0 4px rgba(0,0,0,0.95),inset -1px 0 4px rgba(0,0,0,0.95)',
    });

    const thumb = el('div');
    css(thumb, {
      position:'absolute', left:THUMB_INSET+'px', width:THUMB_W+'px', top:'0',
      minHeight:MIN_THUMB+'px', borderRadius:'9999px', /* Perfectly rounded moving gold tab */ cursor:'grab',
      boxSizing:'border-box', background:THUMB_BG, transition:'filter 0.1s ease', overflow:'hidden',
      boxShadow:'0 1px 3px rgba(0,0,0,0.9),0 -1px 3px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,220,80,0.4)',
    });
    slot.appendChild(thumb);

    const botCap = buildCap('bottom');
    pill.appendChild(topCap);
    pill.appendChild(slot);
    pill.appendChild(botCap);

    return { pill, slot, thumb, topCap, botCap };
  }

  /* ═══════════  HORIZONTAL RAIL  ═══════════ */
  function buildHorizontalRail() {
    const pill = el('div');
    pill.className = 'sv-pill sv-pill-h';
    css(pill, {
      position:'absolute', height:PILL_W+'px', borderRadius:'9999px',
      background:PILL_GRAD_H, zIndex:'150', display:'flex',
      flexDirection:'row', alignItems:'center', pointerEvents:'auto',
      userSelect:'none', boxSizing:'border-box', visibility:'hidden', opacity:'0',
      transition:'opacity 0.14s ease',
      boxShadow:'none',
    });

    const leftCap = buildCap('left');

    const slot = el('div');
    css(slot, {
      flex:'1', height:SLOT_W+'px', background:SLOT_BG, position:'relative',
      overflow:'hidden', borderRadius:'9999px', /* Perfectly rounded pill track slot */ minWidth:'0',
      boxShadow:'inset 0 1px 4px rgba(0,0,0,0.95),inset 0 -1px 4px rgba(0,0,0,0.95)',
    });

    const thumb = el('div');
    css(thumb, {
      position:'absolute', top:THUMB_INSET+'px', height:THUMB_W+'px', left:'0',
      minWidth:MIN_THUMB+'px', borderRadius:'9999px', /* Perfectly rounded moving gold tab */ cursor:'grab',
      boxSizing:'border-box', background:THUMB_BGH, transition:'filter 0.1s ease', overflow:'hidden',
      boxShadow:'1px 0 3px rgba(0,0,0,0.9),-1px 0 3px rgba(0,0,0,0.9),inset 1px 0 0 rgba(255,220,80,0.4)',
    });
    slot.appendChild(thumb);

    const rightCap = buildCap('right');
    pill.appendChild(leftCap);
    pill.appendChild(slot);
    pill.appendChild(rightCap);

    return { pill, slot, thumb, leftCap, rightCap };
  }

  /* ═══════════  ATTACH VERTICAL  ═══════════ */
  function attachTo(host) {
    if (host._svDone) return;
    host._svDone = true;
    host.classList.add('sv-host');

    const comp = getComputedStyle(host);
    if (comp.overflowY !== 'scroll' && comp.overflowY !== 'auto') host.style.overflowY = 'auto';

    /* Unified parent docking: dock to parent column wrapper to enforce absolute height alignment */
    const scrollParent = host.parentElement || host;
    if (scrollParent) {
      const parentComp = getComputedStyle(scrollParent);
      if (parentComp.position === 'static') scrollParent.style.position = 'relative';
    }

    const { pill, slot, thumb, topCap, botCap } = buildRail();
    if (scrollParent) scrollParent.appendChild(pill);

    const forceShow = host.hasAttribute('data-sv-force');
    let rafId = null;

    function updateGeometry() {
      /* MODAL GUARD — D5: setInterval overrides CSS; guard must run FIRST */
      if (document.body.classList.contains('hitl-active') ||
          document.body.classList.contains('modal-active-lock') ||
          document.querySelector('#hitl-bridge-overlay') || document.querySelector('#sov-hitl-bridge') ||
          document.querySelector('#abm-ov')) {
        pill.style.visibility = 'hidden'; pill.style.opacity = '0'; return;
      }
      if (!scrollParent) return;
      const sh = host.scrollHeight, ch = host.clientHeight;
      const pw = scrollParent.offsetWidth, ph = scrollParent.offsetHeight;
      if (!forceShow && (sh <= ch + 2 || pw <= 0 || ph <= 0)) {
        pill.style.visibility = 'hidden'; pill.style.opacity = '0'; return;
      }
      if (pw <= 0 || ph <= 0) {
        pill.style.visibility = 'hidden'; pill.style.opacity = '0'; return;
      }

      /* Unified Height Alignment: Clears header banners & aligns tops perfectly */
      pill.style.position = 'absolute';
      const hasHeader = scrollParent.querySelector('.zone2-hdr, .panel-tab, .zone1-label, .zone-left-hdr, .gold-panel-tab');
      if (hasHeader) {
        pill.style.top = '44px';   /* starts exactly below header banners */
        pill.style.bottom = '12px'; /* stops clear of bottom outline */
        pill.style.height = '';     /* driven by top+bottom */
      } else {
        pill.style.top = '10px';
        pill.style.bottom = '10px';
        pill.style.height = '';
      }
      pill.style.right = '4px'; /* Inset inside gold outline casing */
      pill.style.visibility = 'visible'; pill.style.opacity = '1';

      const slotH = slot.offsetHeight;
      const maxScroll = Math.max(sh - ch, 1);
      const ratio = ch / Math.max(sh, ch + 1);
      const maxThumbR = MAX_THUMB_R;
      const minThumbH = MIN_THUMB;
      const thumbH = Math.max(minThumbH, Math.min(slotH * maxThumbR, slotH * ratio));
      const maxTop = slotH - thumbH;
      const topPx = (forceShow && maxScroll <= 1) ? 0 : (host.scrollTop / maxScroll) * maxTop;
      thumb.style.height = thumbH + 'px';
      thumb.style.top = topPx + 'px';
    }

    function sched() { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(updateGeometry); }

    /* Expose force-update hook */
    host._svUpdate = sched;

    topCap.addEventListener('click', () => host.scrollBy({ top: -host.clientHeight * 0.85, behavior: 'smooth' }));
    botCap.addEventListener('click', () => host.scrollBy({ top:  host.clientHeight * 0.85, behavior: 'smooth' }));

    slot.addEventListener('pointerdown', (e) => {
      if (e.target === thumb || thumb.contains(e.target)) return;
      const dir = e.clientY - slot.getBoundingClientRect().top < parseFloat(thumb.style.top || '0') ? -1 : 1;
      host.scrollBy({ top: dir * host.clientHeight * 0.85, behavior: 'smooth' });
    });

    let dragging = false, dragY0 = 0, scrollY0 = 0;
    thumb.addEventListener('pointerdown', (e) => {
      dragging = true; dragY0 = e.clientY; scrollY0 = host.scrollTop;
      thumb.style.cursor = 'grabbing'; thumb.setPointerCapture(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
    thumb.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - dragY0, slotH = slot.offsetHeight, thumbH = thumb.offsetHeight;
      const maxTop = slotH - thumbH, maxScroll = host.scrollHeight - host.clientHeight;
      host.scrollTop = scrollY0 + (dy / Math.max(maxTop, 1)) * maxScroll;
    });
    thumb.addEventListener('pointerup',     () => { dragging = false; thumb.style.cursor = 'grab'; });
    thumb.addEventListener('pointercancel', () => { dragging = false; thumb.style.cursor = 'grab'; });
    thumb.addEventListener('mouseenter', () => { thumb.style.filter = 'brightness(1.4) saturate(1.3)'; });
    thumb.addEventListener('mouseleave', () => { thumb.style.filter = ''; });
    pill.addEventListener('wheel', (e) => { host.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });

    host.addEventListener('scroll',  sched, { passive: true });
    window.addEventListener('resize', sched, { passive: true });
    new ResizeObserver(sched).observe(host);
    sched();
    setInterval(sched, 500);
  }

  /* ═══════════  ATTACH HORIZONTAL  ═══════════ */
  function attachHTo(host) {
    if (host._svHDone) return;
    host._svHDone = true;
    host.classList.add('sv-host');

    const comp = getComputedStyle(host);
    if (comp.overflowX !== 'scroll' && comp.overflowX !== 'auto') host.style.overflowX = 'auto';
    if (comp.position === 'static') host.style.position = 'relative';

    const { pill, slot, thumb, leftCap, rightCap } = buildHorizontalRail();
    host.appendChild(pill);

    const forceShow = host.hasAttribute('data-sv-force');
    let rafId = null;

    function updateGeometry() {
      /* MODAL GUARD — D5: setInterval overrides CSS; guard must run FIRST */
      if (document.body.classList.contains('hitl-active') ||
          document.body.classList.contains('modal-active-lock') ||
          document.querySelector('#hitl-bridge-overlay') || document.querySelector('#sov-hitl-bridge') ||
          document.querySelector('#abm-ov')) {
        pill.style.visibility = 'hidden'; pill.style.opacity = '0'; return;
      }
      const sw = host.scrollWidth, cw = host.clientWidth;
      if (!forceShow && (sw <= cw + 2 || host.offsetWidth <= 0 || host.offsetHeight <= 0)) {
        pill.style.visibility = 'hidden'; pill.style.opacity = '0'; return;
      }
      if (host.offsetWidth <= 0 || host.offsetHeight <= 0) {
        pill.style.visibility = 'hidden'; pill.style.opacity = '0'; return;
      }
      pill.style.position = 'absolute';
      pill.style.left = host.scrollLeft + 'px';
      pill.style.bottom = '4px';
      pill.style.width  = (cw - PILL_W) + 'px';  /* leave room for vertical rail on right */
      pill.style.visibility = 'visible'; pill.style.opacity = '1';

      const slotW = slot.offsetWidth;
      const maxScroll = Math.max(sw - cw, 1);
      const ratio = cw / Math.max(sw, cw + 1);
      const thumbW = Math.max(MIN_THUMB, Math.min(slotW * MAX_THUMB_R, slotW * ratio));
      const maxLeft = slotW - thumbW;
      const leftPx = (forceShow && maxScroll <= 1) ? 0 : (host.scrollLeft / maxScroll) * maxLeft;
      thumb.style.width = thumbW + 'px';
      thumb.style.left  = leftPx + 'px';
    }

    function sched() { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(updateGeometry); }

    leftCap.addEventListener('click',  () => host.scrollBy({ left: -host.clientWidth * 0.85, behavior: 'smooth' }));
    rightCap.addEventListener('click', () => host.scrollBy({ left:  host.clientWidth * 0.85, behavior: 'smooth' }));

    slot.addEventListener('pointerdown', (e) => {
      if (e.target === thumb || thumb.contains(e.target)) return;
      const dir = e.clientX - slot.getBoundingClientRect().left < parseFloat(thumb.style.left || '0') ? -1 : 1;
      host.scrollBy({ left: dir * host.clientWidth * 0.85, behavior: 'smooth' });
    });

    let dragging = false, dragX0 = 0, scrollX0 = 0;
    thumb.addEventListener('pointerdown', (e) => {
      dragging = true; dragX0 = e.clientX; scrollX0 = host.scrollLeft;
      thumb.style.cursor = 'grabbing'; thumb.setPointerCapture(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
    thumb.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragX0, slotW = slot.offsetWidth, thumbW = thumb.offsetWidth;
      const maxLeft = slotW - thumbW, maxScroll = host.scrollWidth - host.clientWidth;
      if (maxLeft > 0 && maxScroll > 0) host.scrollLeft = scrollX0 + (dx / maxLeft) * maxScroll;
    });
    thumb.addEventListener('pointerup',     () => { dragging = false; thumb.style.cursor = 'grab'; });
    thumb.addEventListener('pointercancel', () => { dragging = false; thumb.style.cursor = 'grab'; });
    thumb.addEventListener('mouseenter', () => { thumb.style.filter = 'brightness(1.4) saturate(1.3)'; });
    thumb.addEventListener('mouseleave', () => { thumb.style.filter = ''; });
    pill.addEventListener('wheel', (e) => { host.scrollLeft += e.deltaX || e.deltaY; e.preventDefault(); }, { passive: false });

    host.addEventListener('scroll',  sched, { passive: true });
    window.addEventListener('resize', sched, { passive: true });
    new ResizeObserver(sched).observe(host);
    sched();
    setInterval(sched, 500);
  }

  /* ═══════════  INIT  ═══════════ */
  function init() {
    const seen = new Set();
    document.querySelectorAll('.scroll-zone').forEach(n => { if (!seen.has(n)) { seen.add(n); attachTo(n); } });
    document.querySelectorAll('.scroll-zone-x').forEach(n => { if (!seen.has(n)) { seen.add(n); } attachHTo(n); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SovereignScrollbar = { attach: attachTo, attachH: attachHTo, init };
})();
