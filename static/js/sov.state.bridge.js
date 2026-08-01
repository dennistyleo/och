/**
 * Module: sov.state.bridge.js
 * Version: 1.0.0
 * Description: Sovereign State Bridge — mirrors OP-01 pipeline state to embedded OP-02 iframe.
 *
 * Contract:
 *   - OP-01 calls SovStateBridge.save(packet) on PIPELINE_COMPLETE and on any tube bar update
 *   - OP-01 calls SovStateBridge.pushToIframe() when op02-iframe loads or panel opens
 *   - OP-02 receives 'message' event with type='SOV_STATE_SYNC' and calls SovStateBridge.apply(packet)
 *
 * Storage key: sessionStorage['sovereign_op01_state'] — full audit packet + tube progress + file name
 */
'use strict';
(function(W) {
    var STORE_KEY = 'sovereign_op01_state';
    var BADGE_KEY = 'sovereign_session_evaluated';

    /* ── Session Badge Operations ────────────────────────────────────────── */
    function saveSessionBadge(packet) {
        if (!packet) return;
        try {
            var badge = {
                filename:     (W._sovereignLastFile && W._sovereignLastFile.name) || W.sessionStorage.getItem('sovereign_last_file') || '',
                domain:       packet.domain || 'GENERAL',
                elected:      packet.elected ? packet.elected.length : 0,
                candidate:    packet.candidate ? packet.candidate.length : 0,
                ts:           packet.timestamp || Date.now(),
                tubeProgress: packet.tubeProgress || []
            };
            W.sessionStorage.setItem(BADGE_KEY, JSON.stringify(badge));
            console.log('[SovStateBridge] Session badge saved | domain:', badge.domain, '| filename:', badge.filename);
        } catch(e) {
            console.warn('[SovStateBridge] saveSessionBadge error:', e);
        }
    }

    function clearSessionBadge() {
        try {
            W.sessionStorage.removeItem(BADGE_KEY);
            console.log('[SovStateBridge] Session badge cleared');
        } catch(e) {
            console.warn('[SovStateBridge] clearSessionBadge error:', e);
        }
    }

    /* ── Save: called by OP-01 after PIPELINE_COMPLETE ─────────────────── */
    function save(packet) {
        if (!packet) return;
        try {
            var state = {
                mode:          packet.mode          || 'abduction',
                domain:        packet.domain         || 'GENERAL',
                elected:       packet.elected        || [],
                candidate:     packet.candidate      || [],
                standby:       packet.standby        || [],
                tubeProgress:  packet.tubeProgress   || [],
                causalTopology:packet.causalTopology || [],
                timestamp:     packet.timestamp      || Date.now(),
                filename:      (W._sovereignLastFile && W._sovereignLastFile.name) || W.sessionStorage.getItem('sovereign_last_file') || '',
                xai_narrative: packet.xai_narrative  || null,
                solver_results:packet.solver_results || null,
                doctor_insight:W.sessionStorage ? W.sessionStorage.getItem('sovereign_doctor_insight') : null,
                clientConfig:  W.sessionStorage ? W.sessionStorage.getItem('sovereign_client_config') : null,
                pipelineComplete: true,
            };
            W.sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
            console.log('[SovStateBridge] State saved | elected:', state.elected.length, '| domain:', state.domain);
            saveSessionBadge(state);
            
            // Mirror to localStorage['sovereign_audit_data'] immediately for direct navigation access
            try {
                var _clientCfg = {};
                try { var _cc = W.sessionStorage.getItem('sovereign_client_config'); if (_cc) _clientCfg = JSON.parse(_cc); } catch(_) {}
                var _mirrorPayload = {
                    filename: state.filename || '',
                    domain: (state.domain || 'GENERAL').toUpperCase(),
                    mode: (state.mode || 'abduction').toUpperCase(),
                    elected: state.elected || [],
                    candidate: state.candidate || [],
                    standby: state.standby || [],
                    xai_narrative: state.xai_narrative || null,
                    solver_results: state.solver_results || null,
                    doctor_insight: state.doctor_insight || null,
                    clientOrg:  _clientCfg.orgName || '',
                    clientLogo: _clientCfg.logoUrl || '',
                    clientDesc: _clientCfg.description || '',
                    operator: W.sessionStorage.getItem('sovereign_operator') || 'OCM SYSTEM',
                    pipelineVersion: 'G3FP\u00b7OCM\u00b7v4.1',
                    generatedAt: new Date().toISOString(),
                    _source: 'sov.state.bridge.save',
                };
                W.localStorage.setItem('sovereign_audit_data', JSON.stringify(_mirrorPayload));
                console.log('[SovStateBridge] Direct write of sovereign_audit_data to localStorage.');
            } catch(_le) {}

            if (W.SovereignBUS) {
                W.SovereignBUS.emit('PIPELINE_COMPLETE', state);
            }
        } catch(e) {
            console.warn('[SovStateBridge] save error:', e);
        }
    }

    /* ── Push to OP-02 iframe ────────────────────────────────────────────── */
    function pushToIframe() {
        try {
            var iframe = W.document.getElementById('op02-iframe');
            if (!iframe || !iframe.contentWindow) return;
            var raw = W.sessionStorage.getItem(STORE_KEY);
            if (!raw) return;
            var state = JSON.parse(raw);
            iframe.contentWindow.postMessage({ type: 'SOV_STATE_SYNC', state: state }, '*');
            console.log('[SovStateBridge] Pushed state to op02-iframe | elected:', state.elected.length);
        } catch(e) {
            console.warn('[SovStateBridge] pushToIframe error:', e);
        }
    }

    /* ── Restore OP-01 state on page load ───────────────────────────────── */
    function restoreIfAvailable() {
        try {
            /* If this is a page reload, user expects a clean slate. Clear the state. */
            if (W.performance && W.performance.getEntriesByType) {
                var navs = W.performance.getEntriesByType('navigation');
                if (navs.length > 0 && navs[0].type === 'reload') {
                    console.log('[SovStateBridge] Reload detected — clearing session state to default.');
                    W.sessionStorage.removeItem(STORE_KEY);
                    clearSessionBadge();
                    return false;
                }
            }

            var raw = W.sessionStorage.getItem(STORE_KEY);
            if (!raw) return false;
            var state = JSON.parse(raw);
            if (!state || !state.pipelineComplete) return false;
            console.log('[SovStateBridge] Restoring OP-01 state | elected:', state.elected.length, '| domain:', state.domain);
            /* Restore tube bars */
            var tp = state.tubeProgress || [];
            if (tp.length) {
                var bars = W.document.querySelectorAll('.eng-bar-fill');
                var pcts = W.document.querySelectorAll('.eng-bar-pct');
                var barData = tp.map(function(w, i) {
                    var colors = ['#00B0FF','#D4AF37','#FF914D','#7C4DFF','#00C853'];
                    return { w: w, c: colors[i] || '#00C853' };
                });
                bars.forEach(function(bar, i) {
                    if (!barData[i]) return;
                    bar.style.width = barData[i].w + '%';
                    bar.style.background = barData[i].c;
                    bar.style.transition = 'width 0.8s ease';
                    bar.setAttribute('data-test-progress', barData[i].w);
                });
                pcts.forEach(function(pct, i) {
                    if (!barData[i]) return;
                    pct.textContent = Math.round(barData[i].w) + '%';
                });
            }
            /* Restore bottom strip mini bars */
            var miniTp = state.tubeProgress || [100,80,65,55,50];
            for (var ti = 1; ti <= 5; ti++) {
                var mf = W.document.getElementById('pnb-t' + ti + 'f');
                if (mf) mf.style.width = Math.min(100, miniTp[ti-1] || 0) + '%';
            }
            /* Arm audit button breathing */
            var auditBtn = W.document.getElementById('pnb-audit');
            if (auditBtn && auditBtn.getAttribute('data-armed') !== 'true') {
                auditBtn.style.transition = 'opacity 0.7s, border-color 0.5s, color 0.5s';
                auditBtn.style.opacity = '1';
                auditBtn.style.borderColor = '#00C853';
                auditBtn.style.color = '#00C853';
                auditBtn.style.cursor = 'pointer';
                auditBtn.style.pointerEvents = 'auto';
                auditBtn.style.animation = 'sovApproveGlow 1.1s ease-in-out infinite';
                auditBtn.setAttribute('data-armed', 'true');
            }
            var hdrAudit = W.document.getElementById('btn-audit-hdr');
            if (hdrAudit) hdrAudit.style.display = '';
            /* Ensure bottom sync strip and E2E status banner are visible on restore */
            var sb = W.document.getElementById('sov-eval-status-banner');
            if (sb) {
                sb.textContent = '✓ 5L Pipeline Complete — Audit Ready';
                sb.style.color = '#00C853';
                sb.style.display = 'flex';
            }
            var strip = W.document.getElementById('pnb-sync-strip');
            if (strip) {
                strip.style.display = 'flex';
            }

            /* Restore evaluation status bar to evaluated in drop-zone */
            var bar = W.document.getElementById('sov-eval-status-bar');
            if (bar) {
                bar.className = '';
                bar.classList.add('evaluated');
                var filename = state.filename || 'file';
                var domain = state.domain || 'GENERAL';
                var electedCount = state.elected ? state.elected.length : 0;
                var timeAgo = 'just now';
                if (state.timestamp) {
                    var diffMs = Date.now() - state.timestamp;
                    var diffSec = Math.floor(diffMs / 1000);
                    var diffMin = Math.floor(diffSec / 60);
                    var diffHr = Math.floor(diffMin / 60);
                    if (diffSec < 60) timeAgo = 'just now';
                    else if (diffMin < 60) timeAgo = diffMin === 1 ? '1 min ago' : diffMin + ' mins ago';
                    else if (diffHr < 24) timeAgo = diffHr === 1 ? '1 hr ago' : diffHr + ' hrs ago';
                }
                bar.innerHTML = '<span>✓</span> <span>EVALUATED &middot; ' + filename + ' &middot; ' + domain.toUpperCase() + ' &middot; ' + electedCount + ' axiom(s) elected &middot; ' + timeAgo + '</span>';
            }

            /* Restore drop headline in drop zone */
            var hl = W.document.querySelector('.drop-headline');
            if (hl) {
                var sc = (state.elected && state.elected.length) ? '#00C853' : (state.candidate && state.candidate.length) ? '#D4AF37' : '#aaa';
                var fName = state.filename || 'file';
                var elLen = state.elected ? state.elected.length : 0;
                var canLen = state.candidate ? state.candidate.length : 0;
                hl.innerHTML = '<div style="font-family:\'JetBrains Mono\',monospace;font-size: 12px;line-height:1.8">'
                    + '<div style="color:var(--green2);margin-bottom:4px"><strong>Evaluated:</strong> ' + fName + '</div>'
                    + '<div style="color:' + sc + ';font-weight:700;font-size: 12px">\\u26a1 ' + elLen + ' ELECTED \\u00b7 ' + canLen + ' CANDIDATE</div>'
                    + '<div style="margin-top:8px;font-size:10px;color:#888;cursor:pointer;text-decoration:underline;" onclick="if(window._startOver)window._startOver()">[ Reset Pipeline ]</div>'
                    + '</div>';
            }

            /* Restore/Update Floating HUD evaluated state */
            if (W._updateFloatingHUD) {
                W._updateFloatingHUD('evaluated', { elected: state.elected ? state.elected.length : 0, domain: state.domain || 'GENERAL' });
            }
            /* Restore in-memory cache */
            W._sovereignLastTiered = state;
            W._sovereignLastAuditPacket = state;
            /* Restore CUSTOMIZE/REJECT buttons */
            var custBtn = W.document.getElementById('pnb-customize');
            if (custBtn && custBtn.getAttribute('data-armed') !== 'true') {
                custBtn.style.opacity = '1';
                custBtn.style.borderColor = '#D4AF37';
                custBtn.style.color = '#D4AF37';
                custBtn.style.cursor = 'pointer';
                custBtn.style.pointerEvents = 'auto';
                custBtn.setAttribute('data-armed', 'true');
            }
            var rejBtn = W.document.getElementById('pnb-reject');
            if (rejBtn && rejBtn.getAttribute('data-armed') !== 'true') {
                rejBtn.style.opacity = '1';
                rejBtn.style.borderColor = '#FF4444';
                rejBtn.style.color = '#FF4444';
                rejBtn.style.cursor = 'pointer';
                rejBtn.style.pointerEvents = 'auto';
                rejBtn.setAttribute('data-armed', 'true');
            }
            /* Restore empirical telemetry and axiom applied list manually to avoid missing dependencies */
            if (W.AxiomMatcher && W.document.getElementById('tele-body-op01')) {
                var tiered = {
                    selected: state.elected || [],
                    candidate: state.candidate || [],
                    standby: state.standby || [],
                    domain: state.domain || 'GENERAL'
                };
                try {
                    W.AxiomMatcher.renderTelemetry('tele-body-op01', tiered, false);
                } catch(e) { console.warn('renderTelemetry failed during restore', e); }
            }

            var z41body = W.document.querySelector('#zone4-1 .z41-body');
            if (z41body) {
                var el = state.elected || [];
                var ca = state.candidate || [];
                var sb = state.standby || [];
                if (el.length === 0 && ca.length === 0 && sb.length === 0) {
                    z41body.innerHTML = '<div style="font-family:&apos;JetBrains Mono&apos;,monospace;font-size:10px;color:#444;padding:12px;line-height:1.9">No axioms matched.<br>Upload a document with searchable text.</div>';
                } else {
                    var tierColors = { 'ELECTED': '#00C853', 'CANDIDATE': '#D4AF37', 'STANDBY': '#555' };
                    var allAx = [];
                    el.forEach(function(a){ allAx.push({ax:a, tier:'ELECTED'}); });
                    ca.forEach(function(a){ allAx.push({ax:a, tier:'CANDIDATE'}); });
                    sb.forEach(function(a){ allAx.push({ax:a, tier:'STANDBY'}); });
                    
                    z41body.innerHTML = allAx.map(function(item) {
                        var ax = item.ax;
                        var col = tierColors[item.tier];
                        var score = Math.round((ax.score || 0) * 100);
                        return '<div style="font-family:Calibri,\u5fae\u8edf\u6b63\u9ed1\u9ad4,sans-serif;font-size:12px;padding:10px 12px;border-left:3px solid ' + col + ';margin-bottom:4px;background:#ffffff;border-bottom:1px solid #e8e8e8;">'
                             + '<div style="color:' + col + ';font-size:10px;letter-spacing:0.5px;margin-bottom:2px;">&#9889; [' + item.tier + '] ' + (ax.id || '') + ' &middot; Score: ' + score + '%</div>'
                             + '<div style="color:#222;margin-top:2px;font-weight:700;font-size:12px;">' + (ax.name || '') + '</div>'
                             + (ax.statement ? '<div style="color:#555;margin-top:3px;font-size:12px;line-height:1.5;">' + (ax.statement||'').substring(0,120) + '</div>' : '')
                             + '<div style="color:#444;margin-top:4px;font-size:11px;font-style:italic;">Formula: ' + (ax.formula || 'Z = e\u02e3 \u2212 ln(y + \u03b5)') + '</div>'
                             + '</div>';
                    }).join('<div style="height:1px;background:#e8e8e8;margin:0;"></div>');
                }
                /* Force sovereign pill to re-measure after content rendered on restore */
                W.requestAnimationFrame(function() {
                    var _z41 = W.document.getElementById('zone4-1');
                    if (_z41 && typeof _z41._svUpdate === 'function') _z41._svUpdate();
                });
            }

            if (W.HealthcareMedical3D && state.elected) {
                W.HealthcareMedical3D.init('phase1', 'zone4-gnn', {
                    elected: state.elected || [],
                    candidate: state.candidate || [],
                    standby: state.standby || [],
                    domain: state.domain || 'GENERAL'
                });
                var _gnnEl = W.document.getElementById('zone4-gnn');
                if (_gnnEl) _gnnEl.setAttribute('data-test-render', 'active');
            }

            /* Emit PIPELINE_COMPLETE on BUS so any existing subscriber re-runs */
            setTimeout(function() {
                if (W.SovereignBUS) {
                    W.SovereignBUS.emit('PIPELINE_COMPLETE', state);
                } else {
                    /* BUS not ready yet — wait */
                    var _rt = 0;
                    var _rInterval = setInterval(function() {
                        if (W.SovereignBUS || _rt++ > 20) {
                            clearInterval(_rInterval);
                            if (W.SovereignBUS) W.SovereignBUS.emit('PIPELINE_COMPLETE', state);
                        }
                    }, 250);
                }
            }, 300);
            return true;
        } catch(e) {
            console.warn('[SovStateBridge] restoreIfAvailable error:', e);
            return false;
        }
    }

    /* ── Apply on OP-02 (receives from postMessage) ─────────────────────── */
    function applyInOp02(state) {
        if (!state || !state.pipelineComplete) return;
        try {
            /* 1. Tube bars */
            var tp = state.tubeProgress || [];
            if (tp.length) {
                var bars = W.document.querySelectorAll('.eng-bar-fill');
                var pcts = W.document.querySelectorAll('.eng-bar-pct');
                var colors = ['#00B0FF','#D4AF37','#FF914D','#7C4DFF','#00C853'];
                bars.forEach(function(bar, i) {
                    if (tp[i] === undefined) return;
                    bar.style.width = tp[i] + '%';
                    bar.style.background = colors[i] || '#00C853';
                    bar.style.transition = 'width 1.4s cubic-bezier(.4,0,.2,1)';
                });
                pcts.forEach(function(pct, i) {
                    if (tp[i] === undefined) return;
                    pct.textContent = Math.round(tp[i]) + '%';
                });
            }
            /* 3. Arm audit button breathing */
            var rptBtn = W.document.getElementById('btn-op02-report');
            var pnbAudit = W.document.getElementById('pnb-audit');
            [rptBtn, pnbAudit].forEach(function(btn) {
                if (btn && btn.getAttribute('data-armed') !== 'true') {
                    btn.style.transition = 'opacity 0.7s, border-color 0.5s, color 0.5s';
                    btn.style.opacity = '1';
                    btn.style.borderColor = '#00C853';
                    btn.style.color = '#00C853';
                    btn.style.cursor = 'pointer';
                    btn.style.pointerEvents = 'auto';
                    btn.style.animation = 'sovApproveGlow 1.1s ease-in-out infinite';
                    btn.setAttribute('data-armed', 'true');
                    btn.style.display = 'inline-block';
                }
            });
            /* 4. Telemetry panel — OCM ELECTION line */
            var teleBody = W.document.getElementById('tele-body-op02');
            if (teleBody) {
                var el = state.elected  || [];
                var ca = state.candidate|| [];
                var st = state.standby  || [];
                /* Inject election count line */
                var existingElLine = teleBody.querySelector('[data-sov-sync="election"]');
                if (!existingElLine) {
                    existingElLine = W.document.createElement('div');
                    existingElLine.setAttribute('data-sov-sync', 'election');
                    existingElLine.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:10px;color:#00C853;letter-spacing:1px;padding:4px 8px;border-bottom:1px solid rgba(0,200,83,.15);';
                    teleBody.insertBefore(existingElLine, teleBody.firstChild);
                }
                existingElLine.innerHTML = '\u26a1 OCM ELECTION: <strong>' + el.length + ' ELECTED</strong> &middot; ' + ca.length + ' CANDIDATE &middot; ' + st.length + ' STANDBY';
                /* Mode + domain line */
                var existingMdLine = teleBody.querySelector('[data-sov-sync="mode"]');
                if (!existingMdLine) {
                    existingMdLine = W.document.createElement('div');
                    existingMdLine.setAttribute('data-sov-sync', 'mode');
                    existingMdLine.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:10px;color:#888;letter-spacing:1px;padding:3px 8px;border-bottom:1px solid rgba(0,0,0,.3);';
                    teleBody.insertBefore(existingMdLine, existingElLine.nextSibling);
                }
                existingMdLine.textContent = (state.mode||'abduction').toUpperCase() + ' \u2014 domain: ' + (state.domain||'GENERAL') + ' \u2014 file: ' + (state.filename||'');
            }
            /* 5. Axiom Applied panels */
            var axiomPanels = W.document.querySelectorAll('#ded-body-op02-1, #ded-body-op02-2');
            if (axiomPanels.length) {
                axiomPanels.forEach(function(panel, pi) {
                    var axData = (pi === 0) ? (state.elected || []) : (state.candidate || []);
                    if (!axData || !axData.length) {
                        if (pi === 0) {
                            panel.innerHTML = '<div style="padding:12px;color:#888;font-style:italic;">No elected axioms matched.</div>';
                        } else {
                            panel.innerHTML = '<div style="padding:12px;color:#888;font-style:italic;">No candidate axioms matched.</div>';
                        }
                        return;
                    }
                    var colors = {ELECTED:'#00C853', CANDIDATE:'#D4AF37', STANDBY:'#555'};
                    var tierLbl = (pi === 0) ? 'ELECTED' : 'CANDIDATE';
                    var col = colors[tierLbl] || '#aaa';
                    panel.innerHTML = axData.map(function(a) {
                        var score = Math.round((a.score || 0) * 100);
                        return '<div class="am-ax" style="font-family:Calibri,\u5fae\u8edf\u6b63\u9ed1\u9ad4,sans-serif;font-size:12px;padding:10px 12px;border-left:3px solid ' + col + ';margin-bottom:4px;background:#ffffff;border-bottom:1px solid #e8e8e8;">'
                            + '<div style="color:' + col + ';font-size:10px;letter-spacing:0.5px;margin-bottom:2px;">&#9889; [' + tierLbl + '] ' + (a.id||'') + ' &middot; Score: ' + score + '%</div>'
                            + '<div style="color:#222;margin-top:2px;font-weight:700;font-size:12px;">' + (a.name||'').substring(0,60) + '</div>'
                            + (a.statement ? '<div style="color:#555;margin-top:3px;font-size:12px;line-height:1.5;">' + (a.statement||'').substring(0,120) + '</div>' : '')
                            + (a.formula ? '<div style="color:#444;margin-top:4px;font-size:11px;font-style:italic;">Formula: ' + (a.formula||'').substring(0,80) + '</div>' : '')
                            + '</div>';
                    }).join('');
                });
                
                /* Trigger sovereign pill geometry recalculation after axiom content is rendered */
                W.requestAnimationFrame(function() {
                    var z21 = W.document.getElementById('axiom-inner-z21');
                    var z31 = W.document.getElementById('axiom-inner-z31');
                    if (z21 && typeof z21._svUpdate === 'function') z21._svUpdate();
                    if (z31 && typeof z31._svUpdate === 'function') z31._svUpdate();
                });
            }
            /* 6. Emit PIPELINE_COMPLETE on BUS so existing subscribers (renderModels etc) run */
            if (W.SovereignBUS) {
                W.SovereignBUS.emit('PIPELINE_COMPLETE', state);
            }
            /* Store in local cache too */
            W._sovereignLastTiered = state;
            try { W.sessionStorage.setItem('sovereign_tiered_results', JSON.stringify({elected:state.elected,candidate:state.candidate,standby:state.standby,domain:state.domain})); } catch(_) {}
            if (state.clientConfig) { try { W.sessionStorage.setItem('sovereign_client_config', state.clientConfig); } catch(_) {} }
            if (state.doctor_insight) { try { W.sessionStorage.setItem('sovereign_doctor_insight', state.doctor_insight); } catch(_) {} }
            /* 7. Mirror sovereign_audit_data to localStorage for OP-02 audit delegation.
             * OP-01 writes this on button click — we pre-populate it from bridge state
             * so OP-02's Generate Audit Report button works without requiring OP-01 click first. */
            try {
                var _existing = W.localStorage.getItem('sovereign_audit_data');
                var _existingData = _existing ? JSON.parse(_existing) : {};
                /* Only write if OP-01's richer payload isn't already there (has narrative etc.) */
                if (!_existingData.narrative && state.elected && state.elected.length > 0) {
                    var _clientCfg = {};
                    try { var _cc = W.sessionStorage.getItem('sovereign_client_config'); if (_cc) _clientCfg = JSON.parse(_cc); } catch(_) {}
                    var _mirrorPayload = {
                        filename: state.filename || '',
                        domain: (state.domain || 'GENERAL').toUpperCase(),
                        mode: (state.mode || 'abduction').toUpperCase(),
                        elected: state.elected || [],
                        candidate: state.candidate || [],
                        standby: state.standby || [],
                        xai_narrative: state.xai_narrative || null,
                        solver_results: state.solver_results || null,
                        doctor_insight: state.doctor_insight || null,
                        clientOrg:  _clientCfg.orgName || '',
                        clientLogo: _clientCfg.logoUrl || '',
                        clientDesc: _clientCfg.description || '',
                        operator: W.sessionStorage.getItem('sovereign_operator') || 'OCM SYSTEM',
                        pipelineVersion: 'G3FP\u00b7OCM\u00b7v4.1',
                        generatedAt: new Date().toISOString(),
                        _source: 'sov.state.bridge',
                    };
                    W.localStorage.setItem('sovereign_audit_data', JSON.stringify(_mirrorPayload));
                    console.log('[SovStateBridge] sovereign_audit_data pre-populated for OP-02 delegation | elected:', state.elected.length);
                }
            } catch (_le) {}
            console.log('[SovStateBridge] Applied state in OP-02 | elected:', (state.elected||[]).length);
        } catch(e) {
            console.warn('[SovStateBridge] applyInOp02 error:', e);
        }
    }


    /* ── Install OP-02 message listener (called by OP-02 on load) ───────── */
    function installOp02Listener() {
        W.addEventListener('message', function(ev) {
            try {
                if (!ev.data || ev.data.type !== 'SOV_STATE_SYNC') return;
                applyInOp02(ev.data.state);
            } catch(e) {
                console.warn('[SovStateBridge] message handler error:', e);
            }
        });
        /* Also try to pull state from sessionStorage (same-tab navigation restore)
         * ONLY restore if a valid session evaluation badge exists. */
        try {
            var badge = W.sessionStorage.getItem('sovereign_session_evaluated');
            if (badge) {
                var raw = W.sessionStorage.getItem('sovereign_op01_state');
                if (raw) {
                    var st = JSON.parse(raw);
                    if (st && st.pipelineComplete) applyInOp02(st);
                }
            } else {
                console.log('[SovStateBridge] No active session badge found. Resetting OP-02 progress to 0%');
                try {
                    var bars = W.document.querySelectorAll('.eng-bar-fill');
                    var pcts = W.document.querySelectorAll('.eng-bar-pct');
                    bars.forEach(function(bar) {
                        bar.style.width = '0%';
                        bar.setAttribute('data-test-progress', '0');
                    });
                    pcts.forEach(function(pct) {
                        pct.textContent = '0%';
                    });
                } catch(_eb) {}
            }
        } catch(_) {}
    }

    /* ── Public API ──────────────────────────────────────────────────────── */
    W.SovStateBridge = {
        save: save,
        pushToIframe: pushToIframe,
        restoreIfAvailable: restoreIfAvailable,
        applyInOp02: applyInOp02,
        installOp02Listener: installOp02Listener,
        saveSessionBadge: saveSessionBadge,
        clearSessionBadge: clearSessionBadge,
    };

    /* ── Slide-in toast notification shared across pages ─────────────────── */
    W._showToast = W._showToast || function (title, msg, color, duration) {
        color = color || '#00C853'; duration = duration || 6000;
        const old = W.document.getElementById('sov-toast-main');
        if (old) old.remove();
        const t = W.document.createElement('div');
        t.id = 'sov-toast-main';
        t.style.cssText = 'position:fixed;bottom:54px;right:20px;background:#0f100f;border:1px solid ' + color
            + ';border-radius:8px;padding:14px 18px;min-width:260px;max-width:380px;z-index:9998;'
            + 'font-family:\'JetBrains Mono\',monospace;font-size:12px;'
            + 'box-shadow:0 4px 24px ' + color + '22;'
            + 'transform:translateX(420px);transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);';
        t.innerHTML = '<div style="color:' + color + ';font-weight:700;letter-spacing:1px;margin-bottom:5px">' + title + '</div>'
            + '<div style="color:#777;line-height:1.7;font-size:12px">' + msg + '</div>'
            + '<div style="margin-top:10px;display:flex;gap:8px">'
            + '<button onclick="if(window._sovereignAuditReport){window._sovereignAuditReport();}else if(window.parent&&window.parent._sovereignAuditReport){window.parent._sovereignAuditReport();}this.closest(\'#sov-toast-main\').remove()" '
            + 'style="flex:1;padding:6px 8px;background:#0a1f0a;border:1px solid ' + color + ';color:' + color
            + ';border-radius:4px;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:12px;font-weight:700">'
            + '\uD83D\uDCC4 AUDIT REPORT</button>'
            + '<button onclick="this.closest(\'#sov-toast-main\').remove()" '
            + 'style="padding:6px 10px;background:transparent;border:1px solid #222;color:#444;border-radius:4px;cursor:pointer;font-size:12px">'
            + '\u2715</button>'
            + '</div>';
        W.document.body.appendChild(t);
        W.requestAnimationFrame(function() { t.style.transform = 'translateX(0)'; });
        const timer = setTimeout(function() {
            t.style.transform = 'translateX(420px)';
            setTimeout(function() { t && t.remove(); }, 400);
        }, duration);
        t.addEventListener('mouseenter', function() { clearTimeout(timer); });
    };

    /* ── Pro / MCP Modal Portal Implementation ───────────────────────────── */
    function getMCPConfig() {
        var defaultCfg = {
            port: "8081",
            domain: "HEALTHCARE",
            enabledTools: ["query_axioms", "solve_compliance", "evaluate_evidence"],
            enabledAgents: ["SNet Gemini 3 Flash Preview", "Claude 3.5 Sonnet"],
            localLlmEnabled: false,
            localLlmHost: "http://localhost:11434",
            customTools: [
                {
                    name: "cardiac_signal_check",
                    factor: "ECG Amplitude > 1.2mV"
                }
            ]
        };
        try {
            var raw = W.localStorage.getItem('sovereign_mcp_config');
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed) return parsed;
            }
        } catch(e) {}
        return defaultCfg;
    }

    function saveMCPConfig(cfg) {
        try {
            W.localStorage.setItem('sovereign_mcp_config', JSON.stringify(cfg));
            if (W.SovereignBUS) {
                W.SovereignBUS.emit('MCP_CONFIG_UPDATED', {
                    sender: 'mcp_coordinator',
                    config: cfg,
                    timestamp: new Date().toISOString()
                });
            }
            console.log('[SovStateBridge] MCP config updated:', cfg);
        } catch(e) {
            console.warn('[SovStateBridge] saveMCPConfig error:', e);
        }
    }

    function _syncProHeaderStatus() {
        const isPro = W.sessionStorage.getItem('sovereign_pro_tier') === 'true' || W.localStorage.getItem('sovereign_pro_tier') === 'true';
        
        const btnMcpOp01 = W.document.getElementById('btn-mcp');
        if (btnMcpOp01) {
            if (isPro) {
                btnMcpOp01.innerHTML = 'MCP API <span style="color:#D4AF37;text-shadow:0 0 6px rgba(212,175,55,0.6)">⚡ PRO</span>';
                btnMcpOp01.style.borderColor = '#D4AF37';
            } else {
                btnMcpOp01.innerHTML = 'MCP API <span style="color:#888">✦</span>';
                btnMcpOp01.style.borderColor = '';
            }
        }
        
        const btnMcpOp02 = W.document.getElementById('btn-mcp-op02');
        if (btnMcpOp02) {
            if (isPro) {
                btnMcpOp02.innerHTML = 'MCP API <span style="color:#D4AF37;text-shadow:0 0 6px rgba(212,175,55,0.6)">⚡ PRO</span>';
                btnMcpOp02.style.borderColor = '#D4AF37';
            } else {
                btnMcpOp02.innerHTML = 'MCP API <span style="color:#888">✦</span>';
                btnMcpOp02.style.borderColor = '#00C853';
            }
        }

        try {
            const iframe = W.document.getElementById('op02-iframe');
            if (iframe && iframe.contentDocument) {
                const innerBtn = iframe.contentDocument.getElementById('btn-mcp-op02');
                if (innerBtn) {
                    if (isPro) {
                        innerBtn.innerHTML = 'MCP API <span style="color:#D4AF37;text-shadow:0 0 6px rgba(212,175,55,0.6)">⚡ PRO</span>';
                        innerBtn.style.borderColor = '#D4AF37';
                    } else {
                        innerBtn.innerHTML = 'MCP API <span style="color:#888">✦</span>';
                        innerBtn.style.borderColor = '#00C853';
                    }
                }
            }
        } catch(e) {}
    }

    function _openMCPModal() {
        const ov = W.document.createElement('div');
        ov.id = 'sov-mcp-modal-ov';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(5,5,5,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:\'JetBrains Mono\',monospace;';
        
        function renderContent() {
            const currentlyPro = W.sessionStorage.getItem('sovereign_pro_tier') === 'true' || W.localStorage.getItem('sovereign_pro_tier') === 'true';
            
            if (!currentlyPro) {
                return `
                <div style="background:#0c0d0c;border:2px solid #D4AF37;border-radius:12px;padding:36px 40px;width:540px;max-width:90%;position:relative;box-shadow:0 0 40px rgba(212,175,55,0.15);animation:sovModalSlide 0.3s cubic-bezier(0.16,1,0.3,1);">
                    <button id="mcp-modal-close" style="position:absolute;top:14px;right:18px;background:none;border:none;color:#666;font-size:20px;cursor:pointer;transition:color 0.2s;">✕</button>
                    
                    <div style="text-align:center;margin-bottom:24px;">
                        <div style="display:inline-block;padding:8px 16px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:20px;color:#D4AF37;font-size:10px;letter-spacing:3px;font-weight:700;margin-bottom:12px;">SOVEREIGN PRO REQUIRED</div>
                        <h3 style="color:#FFF;font-size:18px;letter-spacing:1px;margin:0 0 10px;font-family:\'Inter\',sans-serif;font-weight:700;">Model Context Protocol (MCP)</h3>
                        <p style="color:#888;font-size:11px;line-height:1.6;margin:0;">Integrate the SAA compliance engine directly into your enterprise IDEs, reasoning models, and orchestration layers.</p>
                    </div>
                    
                    <div style="background:#111211;border:1px solid #222;border-radius:8px;padding:16px 20px;margin-bottom:24px;display:flex;flex-direction:column;gap:12px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;font-size:11px;">
                            <span style="color:#D4AF37;">✦</span>
                            <div><strong style="color:#eee;">Enterprise IDE Integration:</strong> Connect Cursor or Claude Desktop directly to SAA.</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:10px;font-size:11px;">
                            <span style="color:#D4AF37;">✦</span>
                            <div><strong style="color:#eee;">AI Agent Coordination:</strong> Dispatch reasoning tasks to local and external LLM frameworks.</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:10px;font-size:11px;">
                            <span style="color:#D4AF37;">✦</span>
                            <div><strong style="color:#eee;">Custom Tools Registry:</strong> Write and register your own custom validation code within the 5L pipeline.</div>
                        </div>
                    </div>
                    
                    <div style="display:flex;align-items:center;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.15);border-radius:6px;padding:10px 14px;margin-bottom:20px;gap:10px;font-size:10px;color:#aaa;line-height:1.4;">
                        <span style="color:#D4AF37;font-size:14px;">ℹ</span>
                        <div>Need a key? Visit the <a href="/pricing.html" target="_blank" style="color:#D4AF37;text-decoration:underline;">Pricing page</a> to obtain a Sovereign Pro enterprise key instantly.</div>
                    </div>

                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
                        <label style="color:#666;font-size:9px;letter-spacing:1.5px;font-weight:700;">ENTERPRISE LICENSE KEY</label>
                        <input id="sov-license-input" type="text" placeholder="SOV-PRO-XXXX-XXXX" style="background:#141514;border:1px solid #444;border-radius:6px;padding:12px;color:#D4AF37;font-family:inherit;font-size:12px;outline:none;transition:border-color 0.2s;text-align:center;" />
                    </div>
                    
                    <div style="display:flex;gap:12px;">
                        <button id="btn-mcp-bypass" style="flex:1;background:transparent;border:1px solid rgba(212,175,55,0.4);border-radius:6px;padding:12px;color:#D4AF37;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;">✦ Developer Bypass</button>
                        <button id="btn-mcp-verify" style="flex:1;background:#D4AF37;border:none;border-radius:6px;padding:12px;color:#000;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:filter 0.2s;">Verify & Activate</button>
                    </div>
                </div>`;
            } else {
                const cfg = getMCPConfig();
                
                // Active Custom Tools render
                const customToolsHTML = cfg.customTools && cfg.customTools.length > 0
                    ? cfg.customTools.map(function(t, idx) {
                        return `
                        <div style="display:flex;justify-content:space-between;align-items:center;background:#111211;border:1px solid #222;border-radius:4px;padding:8px 12px;font-size:10px;">
                            <div>
                                <span style="color:#00C853;margin-right:6px;">●</span>
                                <strong style="color:#fff;">${t.name}</strong>
                                <span style="color:#666;margin:0 6px;">|</span>
                                <span style="color:#aaa;">Factor: ${t.factor}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;">
                                <span style="color:#00C853;font-size:9px;background:rgba(0,200,83,0.08);border:1px solid rgba(0,200,83,0.3);padding:2px 6px;border-radius:10px;font-weight:700;">ACTIVE IN 5L PIPELINE</span>
                                <button class="btn-mcp-delete-tool" data-idx="${idx}" style="background:none;border:none;color:#ff4444;font-size:12px;cursor:pointer;padding:2px 4px;transition:color 0.2s;">✕</button>
                            </div>
                        </div>`;
                    }).join('')
                    : `<div style="text-align:center;padding:16px;color:#555;font-size:10px;border:1px dashed #333;border-radius:4px;">No custom tools registered yet. Use the fields above to add one!</div>`;

                return `
                <div style="background:#0c0d0c;border:2px solid #00C853;border-radius:12px;padding:32px 36px;width:720px;max-width:95%;position:relative;box-shadow:0 0 50px rgba(0,200,83,0.15);animation:sovModalSlide 0.3s cubic-bezier(0.16,1,0.3,1);">
                    <button id="mcp-modal-close" style="position:absolute;top:14px;right:18px;background:none;border:none;color:#666;font-size:20px;cursor:pointer;transition:color 0.2s;">✕</button>
                    
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid #222;padding-bottom:16px;">
                        <div>
                            <div style="display:inline-block;padding:4px 10px;background:rgba(0,200,83,0.08);border:1px solid rgba(0,200,83,0.3);border-radius:20px;color:#00C853;font-size:9px;letter-spacing:3px;font-weight:700;margin-bottom:6px;">PRO PORTAL ACTIVATED</div>
                            <h3 style="color:#FFF;font-size:16px;letter-spacing:1px;margin:0;font-family:\'Inter\',sans-serif;font-weight:700;">Model Context Protocol (MCP) Coordinator</h3>
                        </div>
                        <button id="btn-mcp-revoke" style="background:transparent;border:1px solid rgba(255,68,68,0.4);border-radius:4px;padding:5px 10px;color:#FF4444;font-size:9px;font-family:inherit;cursor:pointer;transition:all 0.2s;">Revoke License</button>
                    </div>
                    
                    <!-- Tabs bar -->
                    <div style="display:flex;gap:4px;background:#141514;padding:4px;border-radius:6px;margin-bottom:20px;">
                        <button class="mcp-tab active" data-tab="blueprint" style="flex:1;background:rgba(0,200,83,0.1);border:none;border-radius:4px;padding:10px;color:#00C853;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.2s;">1. Enterprise Blueprint</button>
                        <button class="mcp-tab" data-tab="coordination" style="flex:1;background:transparent;border:none;border-radius:4px;padding:10px;color:#888;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.2s;">2. Agent Coordinator</button>
                        <button class="mcp-tab" data-tab="expand" style="flex:1;background:transparent;border:none;border-radius:4px;padding:10px;color:#888;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.2s;">3. Expand OCM Tools</button>
                    </div>
                    
                    <!-- Tab Panels -->
                    <div id="mcp-panel-blueprint" class="mcp-panel" style="display:block;">
                        <p style="color:#aaa;font-size:11px;line-height:1.6;margin:0 0 12px;">Add this MCP configuration to your <code>claude_desktop_config.json</code> or Cursor settings to expose SAA live proofs to your local assistant models:</p>
                        
                        <div style="display:flex;gap:12px;align-items:center;background:#141514;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:10px;color:#ccc;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span>API Port:</span>
                                <input type="number" id="mcp-cfg-port" value="${cfg.port}" style="background:#000;border:1px solid #444;color:#00C853;width:60px;padding:4px 6px;font-family:inherit;font-size:10px;border-radius:4px;outline:none;" />
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span>Domain Filter:</span>
                                <select id="mcp-cfg-domain" style="background:#000;border:1px solid #444;color:#00C853;padding:4px 6px;font-family:inherit;font-size:10px;border-radius:4px;outline:none;">
                                    <option value="HEALTHCARE" ${cfg.domain === 'HEALTHCARE' ? 'selected' : ''}>HEALTHCARE</option>
                                    <option value="AEROSPACE" ${cfg.domain === 'AEROSPACE' ? 'selected' : ''}>AEROSPACE</option>
                                    <option value="CONTRACT" ${cfg.domain === 'CONTRACT' ? 'selected' : ''}>CONTRACT</option>
                                    <option value="GENERAL" ${cfg.domain === 'GENERAL' ? 'selected' : ''}>GENERAL</option>
                                </select>
                            </div>
                        </div>

                        <div style="background:#111211;border:1px solid #222;border-radius:6px;padding:14px 18px;margin-bottom:12px;max-height:180px;overflow-y:auto;font-family:\'JetBrains Mono\',monospace;font-size:10px;color:#00C853;line-height:1.5;">
                            <pre style="margin:0;"></pre>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#666;">
                            <span>✔ Connection Status: <strong style="color:#00C853;text-shadow:0 0 6px rgba(0,200,83,0.3);">LIVE (Secure Local API Node)</strong></span>
                            <button id="btn-mcp-copy" style="background:#1a1b1a;border:1px solid #444;border-radius:4px;padding:6px 12px;color:#aaa;font-family:inherit;cursor:pointer;font-size:10px;transition:all 0.2s;">Copy Configuration</button>
                        </div>
                    </div>
                    
                    <div id="mcp-panel-coordination" class="mcp-panel" style="display:none;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                            <div>
                                <h4 style="color:#fff;font-size:11px;margin:0 0 10px;letter-spacing:1px;border-bottom:1px solid #222;padding-bottom:6px;">Exposed SAA Toolset</h4>
                                <div style="display:flex;flex-direction:column;gap:8px;font-size:10px;color:#ccc;">
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-tool="query_axioms" ${cfg.enabledTools.includes('query_axioms') ? 'checked' : ''} style="accent-color:#00C853;" /> query_axioms (invariants filter)</label>
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-tool="solve_compliance" ${cfg.enabledTools.includes('solve_compliance') ? 'checked' : ''} style="accent-color:#00C853;" /> solve_compliance (run EML parser)</label>
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-tool="evaluate_evidence" ${cfg.enabledTools.includes('evaluate_evidence') ? 'checked' : ''} style="accent-color:#00C853;" /> evaluate_evidence (trigger 5L scan)</label>
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-tool="export_usd_hologram" ${cfg.enabledTools.includes('export_usd_hologram') ? 'checked' : ''} style="accent-color:#00C853;" /> export_usd_hologram (Vision Pro USDZ)</label>
                                </div>
                            </div>
                            <div>
                                <h4 style="color:#fff;font-size:11px;margin:0 0 10px;letter-spacing:1px;border-bottom:1px solid #222;padding-bottom:6px;">Coordinating AI Agents</h4>
                                <div style="display:flex;flex-direction:column;gap:8px;font-size:10px;color:#ccc;">
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-agent="SNet Gemini 3 Flash Preview" ${cfg.enabledAgents.includes('SNet Gemini 3 Flash Preview') ? 'checked' : ''} style="accent-color:#00C853;" /> SNet Gemini 3 Flash Preview (Default)</label>
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-agent="Claude 3.5 Sonnet" ${cfg.enabledAgents.includes('Claude 3.5 Sonnet') ? 'checked' : ''} style="accent-color:#00C853;" /> Claude 3.5 Sonnet (SSO Gate)</label>
                                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="chk-local-llm" ${cfg.localLlmEnabled ? 'checked' : ''} style="accent-color:#00C853;" /> Local Reasoning Engine (Ollama/Llama-3)</label>
                                </div>
                                <div id="local-llm-settings" style="display:${cfg.localLlmEnabled ? 'flex' : 'none'};margin-top:10px;padding:8px;background:#141514;border:1px solid #222;border-radius:4px;flex-direction:column;gap:6px;">
                                    <span style="font-size:8px;color:#666;">OLLAMA HOST URL</span>
                                    <input type="text" id="mcp-ollama-host" value="${cfg.localLlmHost || 'http://localhost:11434'}" style="background:#0c0d0c;border:1px solid #444;border-radius:4px;color:#00C853;padding:6px 8px;font-size:9px;font-family:inherit;outline:none;" />
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:20px;text-align:right;">
                            <button id="btn-mcp-settings-apply" style="background:#00C853;color:#000;border:none;border-radius:4px;padding:8px 16px;font-size:10px;font-family:inherit;font-weight:700;cursor:pointer;transition:all 0.2s;">Apply Settings</button>
                        </div>
                    </div>
                    
                    <div id="mcp-panel-expand" class="mcp-panel" style="display:none;">
                        <div style="display:flex;flex-direction:column;gap:12px;">
                            <p style="color:#aaa;font-size:11px;line-height:1.6;margin:0;">Register your custom compliance validator or expand SAA tool parameters:</p>
                            
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                                <div style="display:flex;flex-direction:column;gap:4px;">
                                    <label style="color:#666;font-size:8px;font-weight:700;">TOOL NAME</label>
                                    <input id="custom-tool-name" type="text" placeholder="e.g. signal_integrator" style="background:#141514;border:1px solid #333;border-radius:4px;padding:8px;color:#fff;font-family:inherit;font-size:11px;outline:none;" />
                                </div>
                                <div style="display:flex;flex-direction:column;gap:4px;">
                                    <label style="color:#666;font-size:8px;font-weight:700;">PROBATIVE FACTOR / THRESHOLD</label>
                                    <input id="custom-tool-factor" type="text" placeholder="e.g. JTAG Freq < 10MHz" style="background:#141514;border:1px solid #333;border-radius:4px;padding:8px;color:#fff;font-family:inherit;font-size:11px;outline:none;" />
                                </div>
                            </div>
                            
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <label style="color:#666;font-size:8px;font-weight:700;">VALIDATOR BOILERPLATE CODE (LIVE SPEC PREVIEW)</label>
                                <div style="background:#111211;border:1px solid #222;border-radius:4px;padding:10px 14px;max-height:110px;overflow-y:auto;font-size:9px;color:#00C853;line-height:1.5;">
                                    <pre id="mcp-boilerplate-preview" style="margin:0;"></pre>
                                </div>
                            </div>
                            
                            <div style="text-align:right;">
                                <button id="btn-register-tool" style="background:#00C853;color:#000;border:none;border-radius:4px;padding:8px 16px;font-size:10px;font-family:inherit;font-weight:700;cursor:pointer;transition:all 0.2s;">✦ Register Custom Tool</button>
                            </div>

                            <div style="margin-top:6px;">
                                <h4 style="color:#fff;font-size:10px;margin:0 0 8px;letter-spacing:1px;border-bottom:1px solid #222;padding-bottom:4px;">Registered Custom OCM Tools</h4>
                                <div id="mcp-custom-tools-list" style="display:flex;flex-direction:column;gap:6px;max-height:100px;overflow-y:auto;">
                                    ${customToolsHTML}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        }
        
        ov.innerHTML = renderContent();
        W.document.body.appendChild(ov);
        
        function bindEvents() {
            const currentlyPro = W.sessionStorage.getItem('sovereign_pro_tier') === 'true' || W.localStorage.getItem('sovereign_pro_tier') === 'true';
            
            const closeBtn = W.document.getElementById('mcp-modal-close');
            if (closeBtn) closeBtn.onclick = function() { ov.remove(); };
            
            if (!currentlyPro) {
                const licenseInp = W.document.getElementById('sov-license-input');
                const verifyBtn = W.document.getElementById('btn-mcp-verify');
                const bypassBtn = W.document.getElementById('btn-mcp-bypass');
                
                if (verifyBtn) {
                    verifyBtn.onclick = function() {
                        const key = licenseInp.value.trim();
                        if (key.toUpperCase().startsWith('SOV-PRO')) {
                            W.sessionStorage.setItem('sovereign_pro_tier', 'true');
                            W.localStorage.setItem('sovereign_pro_tier', 'true');
                            _syncProHeaderStatus();
                            if (W._showToast) W._showToast('SOVEREIGN PRO ACTIVATED', 'Licence verified successfully. Welcome SAA Pro Member!', '#00C853');
                            ov.innerHTML = renderContent();
                            bindEvents();
                        } else {
                            alert('Invalid SAA License Key. License keys must start with SOV-PRO-');
                        }
                    };
                }
                
                if (bypassBtn) {
                    bypassBtn.onclick = function() {
                        W.sessionStorage.setItem('sovereign_pro_tier', 'true');
                        W.localStorage.setItem('sovereign_pro_tier', 'true');
                        _syncProHeaderStatus();
                        if (W._showToast) W._showToast('DEVELOPER MODE ENABLED', 'Sovereign Pro quick-verification bypass activated!', '#00C853');
                        ov.innerHTML = renderContent();
                        bindEvents();
                    };
                }
            } else {
                const cfg = getMCPConfig();
                
                updateBlueprintPre();
                
                const portInp = W.document.getElementById('mcp-cfg-port');
                const domSel = W.document.getElementById('mcp-cfg-domain');
                if (portInp) portInp.oninput = function() { updateBlueprintPre(); };
                if (domSel) domSel.onchange = function() { updateBlueprintPre(); };
                
                function updateBlueprintPre() {
                    const portVal = W.document.getElementById('mcp-cfg-port') ? W.document.getElementById('mcp-cfg-port').value : '8081';
                    const domVal = W.document.getElementById('mcp-cfg-domain') ? W.document.getElementById('mcp-cfg-domain').value : 'HEALTHCARE';
                    const pre = W.document.querySelector('#mcp-panel-blueprint pre');
                    if (pre) {
                        pre.textContent = JSON.stringify({
                            "mcpServers": {
                                "sovereign-axiom-engine": {
                                    "command": "npx",
                                    "args": ["-y", "sovereign-matrix-mcp@latest"],
                                    "env": {
                                        "SOVEREIGN_API_KEY": W.sessionStorage.getItem('sovereign_operator') || 'OCM_OPERATOR_PRO',
                                        "SOVEREIGN_PORT": portVal,
                                        "SOVEREIGN_DOMAIN": domVal
                                    }
                                }
                            }
                        }, null, 2);
                    }
                }

                const revokeBtn = W.document.getElementById('btn-mcp-revoke');
                if (revokeBtn) {
                    revokeBtn.onclick = function() {
                        W.sessionStorage.removeItem('sovereign_pro_tier');
                        W.localStorage.removeItem('sovereign_pro_tier');
                        _syncProHeaderStatus();
                        if (W._showToast) W._showToast('LICENSE REVOKED', 'Sovereign Pro credentials cleared from session.', '#FF4444');
                        ov.innerHTML = renderContent();
                        bindEvents();
                    };
                }
                
                const tabs = W.document.querySelectorAll('.mcp-tab');
                tabs.forEach(function(tab) {
                    tab.onclick = function() {
                        tabs.forEach(function(t) {
                            t.style.background = 'transparent';
                            t.style.color = '#888';
                            t.classList.remove('active');
                        });
                        tab.style.background = 'rgba(0,200,83,0.1)';
                        tab.style.color = '#00C853';
                        tab.classList.add('active');
                        
                        const activeTab = tab.getAttribute('data-tab');
                        W.document.querySelectorAll('.mcp-panel').forEach(function(p) { p.style.display = 'none'; });
                        const panel = W.document.getElementById('mcp-panel-' + activeTab);
                        if (panel) panel.style.display = 'block';
                    };
                });
                
                const chkLocal = W.document.getElementById('chk-local-llm');
                if (chkLocal) {
                    chkLocal.onchange = function() {
                        const settings = W.document.getElementById('local-llm-settings');
                        if (settings) settings.style.display = chkLocal.checked ? 'flex' : 'none';
                    };
                }
                
                const copyBtn = W.document.getElementById('btn-mcp-copy');
                if (copyBtn) {
                    copyBtn.onclick = function() {
                        var codeText = W.document.querySelector('#mcp-panel-blueprint pre').textContent;
                        W.navigator.clipboard.writeText(codeText).then(function() {
                            if (W._showToast) W._showToast('COPIED', 'Configuration copied to clipboard successfully!', '#00C853');
                            else alert('Config copied to clipboard!');
                        });
                    };
                }
                
                const settingsApplyBtn = W.document.getElementById('btn-mcp-settings-apply');
                if (settingsApplyBtn) {
                    settingsApplyBtn.onclick = function() {
                        const portVal = W.document.getElementById('mcp-cfg-port') ? W.document.getElementById('mcp-cfg-port').value : '8081';
                        const domVal = W.document.getElementById('mcp-cfg-domain') ? W.document.getElementById('mcp-cfg-domain').value : 'HEALTHCARE';
                        
                        const enabledTools = [];
                        W.document.querySelectorAll('[data-tool]').forEach(function(cb) {
                            if (cb.checked) enabledTools.push(cb.getAttribute('data-tool'));
                        });

                        const enabledAgents = [];
                        W.document.querySelectorAll('[data-agent]').forEach(function(cb) {
                            if (cb.checked) enabledAgents.push(cb.getAttribute('data-agent'));
                        });

                        const localLlmEnabled = W.document.getElementById('chk-local-llm').checked;
                        const localLlmHost = W.document.getElementById('mcp-ollama-host').value;

                        const newCfg = {
                            port: portVal,
                            domain: domVal,
                            enabledTools: enabledTools,
                            enabledAgents: enabledAgents,
                            localLlmEnabled: localLlmEnabled,
                            localLlmHost: localLlmHost,
                            customTools: cfg.customTools
                        };

                        saveMCPConfig(newCfg);
                        
                        if (W._showToast) W._showToast('SETTINGS APPLIED', 'Agent and tools settings saved successfully!', '#00C853');
                        else alert('Settings saved successfully!');
                    };
                }

                const customNameInp = W.document.getElementById('custom-tool-name');
                const customFactorInp = W.document.getElementById('custom-tool-factor');
                
                function updateCodePreview() {
                    const name = (customNameInp && customNameInp.value.trim()) || 'cardiac_signal_check';
                    const factor = (customFactorInp && customFactorInp.value.trim()) || 'ECG Amplitude > 1.2mV';
                    const pre = W.document.getElementById('mcp-boilerplate-preview');
                    if (pre) {
                        pre.textContent = `// Expose custom tool directly to MCP server
mcp.tool("${name}", "Validates OCM factor: ${factor}", {
  value: { type: "number", description: "Empirical factor reading" }
}, async ({ value }) => {
  const reference = 1.2; // SAA boundary threshold
  return {
    valid: value >= reference,
    probativeValue: Math.min(1.0, value / reference),
    trace: \`Signal matched against SAA rule ${name.toUpperCase()}_THRESHOLD\`
  };
});`;
                    }
                }
                
                if (customNameInp) customNameInp.oninput = updateCodePreview;
                if (customFactorInp) customFactorInp.oninput = updateCodePreview;
                
                updateCodePreview();
                
                const regToolBtn = W.document.getElementById('btn-register-tool');
                if (regToolBtn) {
                    regToolBtn.onclick = function() {
                        const name = customNameInp.value.trim();
                        const factor = customFactorInp.value.trim();
                        if (!name || !factor) {
                            alert('Please provide a Tool Name and Probative Factor.');
                            return;
                        }
                        
                        cfg.customTools.push({
                            name: name,
                            factor: factor
                        });
                        
                        saveMCPConfig(cfg);
                        
                        if (W.SovereignBUS) {
                            W.SovereignBUS.emit('CUSTOM_TOOL_REGISTERED', {
                                sender: 'mcp_coordinator',
                                tool: { name: name, factor: factor },
                                timestamp: new Date().toISOString()
                            });
                        }

                        if (W._showToast) W._showToast('CUSTOM TOOL REGISTERED', 'Tool "' + name + '" successfully bound to 5L calibration registry.', '#00C853');
                        
                        ov.innerHTML = renderContent();
                        bindEvents();
                    };
                }

                W.document.querySelectorAll('.btn-mcp-delete-tool').forEach(function(btn) {
                    btn.onclick = function() {
                        const idx = parseInt(btn.getAttribute('data-idx'));
                        const deletedTool = cfg.customTools[idx];
                        cfg.customTools.splice(idx, 1);
                        saveMCPConfig(cfg);
                        
                        if (W._showToast) W._showToast('TOOL REMOVED', 'Tool "' + deletedTool.name + '" removed from custom OCM registry.', '#FF4444');
                        
                        ov.innerHTML = renderContent();
                        bindEvents();
                    };
                });
            }
        }
        
        bindEvents();
        
        ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
        
        if (!W.document.getElementById('sov-mcp-modal-style')) {
            const style = W.document.createElement('style');
            style.id = 'sov-mcp-modal-style';
            style.textContent = `
                @keyframes sovModalSlide {
                    from { transform: translateY(12px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .mcp-tab.active {
                    box-shadow: 0 0 8px rgba(0,200,83,0.2);
                }
                #mcp-modal-close:hover {
                    color: #ff4444 !important;
                }
            `;
            W.document.head.appendChild(style);
        }
    }

    function _sovereignOp02AuditReport() {
        var raw = W.localStorage.getItem('sovereign_audit_data');
        var data = null;
        if (raw) {
            try { data = JSON.parse(raw); } catch(_) {}
        }
        
        if (!data) {
            // Rebuild from session state / in-memory cache
            var state = W._sovereignLastTiered || {};
            // If in-memory is empty, try sessionStorage fallback
            if (!state.elected && !state.candidate) {
                try {
                    var rawSession = W.sessionStorage.getItem(STORE_KEY);
                    if (rawSession) state = JSON.parse(rawSession) || {};
                } catch(_) {}
            }
            
            var elected = state.elected || [];
            var candidate = state.candidate || [];
            var standby = state.standby || [];
            
            // Guard against empty elected and candidate arrays when rebuilding
            if (!elected.length && !candidate.length) {
                if (W._showToast) {
                    W._showToast('⚠ Audit Report Error', 'No axioms evaluated yet. Process a file in OP-01 first.', '#FF4444');
                }
                return;
            }
            
            // Build the compliant payload
            data = {
                filename: state.filename || 'unknown',
                domain: (state.domain || 'GENERAL').toUpperCase(),
                mode: (state.mode || 'abduction').toUpperCase(),
                elected: elected,
                candidate: candidate,
                standby: standby,
                xai_narrative: state.xai_narrative || null,
                solver_results: state.solver_results || null,
                doctor_insight: state.doctor_insight || null,
                pipelineVersion: 'G3FP\u00b7OCM\u00b7v4.1',
                generatedAt: new Date().toISOString(),
                _source: 'sov.state.bridge'
            };
            W.localStorage.setItem('sovereign_audit_data', JSON.stringify(data));
        } else {
            // Guard against empty elected/candidate arrays in existing payload
            var elected = data.elected || [];
            var candidate = data.candidate || [];
            if (!elected.length && !candidate.length) {
                if (W._showToast) {
                    W._showToast('⚠ Audit Report Error', 'No elected axioms in this audit payload.', '#FF4444');
                }
                return;
            }
        }
        
        // Route and open report
        var mode = (data.mode || 'abduction').toLowerCase();
        var routes = { qa: 'qa_report.html', rca: 'rca_report.html', causal: 'causal_corridor.html' };
        var target = routes[mode] || 'audit_report.html';
        
        var w = W.open(target, '_blank');
        if (w) w.focus();
    }

    W._sovereignOp02AuditReport = _sovereignOp02AuditReport;
    W._openMCPModal = _openMCPModal;
    W._syncProHeaderStatus = _syncProHeaderStatus;

    // Automatic hook
    try {
        if (W.document.readyState === 'loading') {
            W.document.addEventListener('DOMContentLoaded', function() {
                _syncProHeaderStatus();
            });
        } else {
            _syncProHeaderStatus();
        }
    } catch(e) {}

    W.addEventListener('load', function() {
        _syncProHeaderStatus();
    });

}(window));
