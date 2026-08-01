/* ══════════════════════════════════════════════════════════
   Module: UIManager.js
   Version: 1.0.0
   Description: Orchestrates Sovereign Matrix dashboard states 
               and iconic notched header dynamics.
══════════════════════════════════════════════════════════ */

export class UIManager {
  constructor() {
    this.elements = {
      landingRoot: document.getElementById('landing-root'),
      opRoot: document.getElementById('op-root'),
      initializeBtn: document.getElementById('initialize-engine'),
      returnBtn: document.getElementById('hdr-return-btn'),
      paradigmBtns: document.querySelectorAll('.lp-paradigm-btn'),
      opPages: document.querySelectorAll('.op-page')
    };
    this.selectedParadigm = 'INDUCTION'; // Default
    this.init();
  }

  init() {
    this.elements.initializeBtn?.addEventListener('click', () => this.enterOperation());
    this.elements.returnBtn?.addEventListener('click', () => this.enterLanding());
    
    // Paradigm selection logic
    this.elements.paradigmBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.paradigmBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedParadigm = btn.dataset.paradigm || btn.textContent.trim();
      });
    });

    // Auto-enter op if URL hash says so (for dev)
    if (window.location.hash === '#op') this.enterOperation();
  }

  enterOperation() {
    this.elements.landingRoot.style.display = 'none';
    this.elements.opRoot.classList.add('visible');
    
    // Routing Logic: DEDUCTION -> OP-03, others -> OP-01
    const isDeduction = this.selectedParadigm === 'DEDUCTION';
    const targetPageId = isDeduction ? 'op-page-3' : 'op-page-1';
    
    this.elements.opPages.forEach(pg => {
      pg.classList.remove('active-page');
      if (pg.id === targetPageId) pg.classList.add('active-page');
    });

    // Update Header for OP-03 specific banner
    const descRow = document.querySelector('.hdr-row-descriptions');
    if (descRow) {
      if (isDeduction) {
        descRow.innerHTML = '<div class="hdr-row-banner">DEDUCTION SPECIFIED EVALUATION</div>';
        descRow.style.border = 'none';
      } else {
        descRow.innerHTML = `
           <div class="hdr-desc-box">LOGIC ENGINE REVISION</div>
           <div class="hdr-desc-box">ONTOLOGICAL ENGINE</div>
           <div class="hdr-desc-box">AXIOM ENGINE</div>
           <div class="hdr-desc-box">GNN VECTOR ENGINE</div>
           <div class="hdr-desc-box">GENERATION ENGINE</div>
        `;
        descRow.style.borderBottom = '1px solid rgba(126, 105, 6, 0.3)';
      }
    }

    window.location.hash = 'op';
    this.animateTubes();
    this.showFloatingToast(`ENGINE INITIALIZED — ${this.selectedParadigm} PROTOCOL ACTIVE`);
  }

  enterLanding() {
    this.elements.opRoot.classList.remove('visible');
    this.elements.landingRoot.style.display = 'block';
    window.location.hash = '';
  }

  animateTubes() {
    const tubes = [
      { id: 'tube-l1', scalar: 'scalar-l1', target: 85 },
      { id: 'tube-l2', scalar: 'scalar-l2', target: 92 },
      { id: 'tube-l3', scalar: 'scalar-l3', target: 64 },
      { id: 'tube-l4', scalar: 'scalar-l4', target: 78 },
      { id: 'tube-l5', scalar: 'scalar-l5', target: 81 }
    ];

    tubes.forEach((t, i) => {
      setTimeout(() => {
        const fill = document.querySelector(`#${t.id} .liquid-fill`);
        const scalar = document.getElementById(t.scalar);
        if (fill) fill.style.width = `${t.target}%`;
        if (scalar) {
          let cur = 0;
          const inter = setInterval(() => {
            if (cur >= t.target) clearInterval(inter);
            scalar.textContent = `${cur}%`;
            cur++;
          }, 15);
        }
      }, i * 150);
    });
  }

  showFloatingToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}
