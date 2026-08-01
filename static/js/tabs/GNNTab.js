/* ══════════════════════════════════════════════════════════
   Module: GNNTab.js
   Version: 1.0.0
   Description: Self-registering GNN tab component.
                3D shape analysis with Three.js.
                Green nodes (#00bf63) = normal.
                Red nodes (#ff4444) = drift detected.
   Skill: gnn-code-generator
   Standards: ISO/IEC 25010 (Functional Suitability, Reliability)
              ISO 26262 (Drift detection for automotive safety)
   Rule 06: Self-registration pattern.
   Rule 04: All errors caught and logged with E-codes.
   ══════════════════════════════════════════════════════════ */

const NODE_COLOR_NORMAL = 0x00bf63; // Bedrock Green — normal state
const NODE_COLOR_DRIFT  = 0xff4444; // Alert Red — drift detected

class GNNTab {
    constructor() {
        this._element  = null;
        this._scene    = null;
        this._camera   = null;
        this._renderer = null;
        this._nodes    = [];
        this._animId   = null;
        this._data     = null;
    }

    /**
     * Called by ComponentRegistry when container is created.
     * @param {HTMLElement} element
     */
    bind(element) {
        this._element = element;
        this._renderEmpty();
    }

    /** Called when this tab becomes visible — start render loop */
    onActivate() {
        if (this._data) {
            this._initThree();
            this._buildShape(this._data);
            this._startLoop();
        }
    }

    /** Called when this tab is hidden — stop render loop */
    onDeactivate() {
        this._stopLoop();
    }

    /**
     * Called when drift/shape data arrives via BUS.
     * @param {Object} data - DRIFT_DETECTED payload
     */
    onData(data) {
        if (!data) {
            console.warn('[GNN_TAB] No data received — graceful degradation');
            return;
        }
        this._data = data;
        if (this._element && this._scene) {
            this._clearScene();
            this._buildShape(data);
        }
    }

    /**
     * Initialize Three.js scene, camera, and renderer.
     * @private
     */
    _initThree() {
        try {
            if (typeof THREE === 'undefined') {
                console.error('E005: MODULE_TIMEOUT — Three.js not loaded');
                this._renderFallback();
                return;
            }

            // Clear any existing canvas
            this._element.innerHTML = '';

            this._scene    = new THREE.Scene();
            this._scene.background = new THREE.Color(0x111111);

            this._camera   = new THREE.PerspectiveCamera(
                75, this._element.clientWidth / this._element.clientHeight, 0.1, 1000
            );
            this._camera.position.z = 5;

            this._renderer = new THREE.WebGLRenderer({ antialias: true });
            this._renderer.setSize(this._element.clientWidth, this._element.clientHeight);
            this._element.appendChild(this._renderer.domElement);

            // Ambient + directional light
            const ambient = new THREE.AmbientLight(0x404040, 2);
            const light   = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(5, 5, 5);
            this._scene.add(ambient, light);

        } catch (err) {
            console.error('E005: GNN_INIT_FAILED —', err);
            this._renderFallback();
        }
    }

    /**
     * Build 3D shape from nodes and edges.
     * @param {Object} data - { nodes: [{id, x, y, z, drift}], edges: [{from, to}] }
     * @private
     */
    _buildShape(data) {
        if (!this._scene || !data || !data.nodes) return;

        const nodeMap = {};
        data.nodes.forEach(node => {
            try {
                const color    = node.drift ? NODE_COLOR_DRIFT : NODE_COLOR_NORMAL;
                const geometry = new THREE.SphereGeometry(0.15, 16, 16);
                const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
                const mesh     = new THREE.Mesh(geometry, material);

                mesh.position.set(
                    node.x || Math.random() * 4 - 2,
                    node.y || Math.random() * 4 - 2,
                    node.z || Math.random() * 4 - 2
                );
                mesh.userData.nodeId = node.id;
                this._scene.add(mesh);
                nodeMap[node.id] = mesh;
                this._nodes.push(mesh);
            } catch (err) {
                console.error(`E003: NODE_BUILD_FAILED — ${node.id}:`, err);
            }
        });

        // Build edges (lines between nodes)
        if (data.edges) {
            data.edges.forEach(edge => {
                try {
                    const fromMesh = nodeMap[edge.from];
                    const toMesh   = nodeMap[edge.to];
                    if (!fromMesh || !toMesh) return;

                    const points  = [fromMesh.position, toMesh.position];
                    const geo     = new THREE.BufferGeometry().setFromPoints(points);
                    const mat     = new THREE.LineBasicMaterial({ color: 0xc9a349, opacity: 0.5, transparent: true });
                    this._scene.add(new THREE.Line(geo, mat));
                } catch (err) {
                    console.error('E003: EDGE_BUILD_FAILED:', err);
                }
            });
        }
    }

    /**
     * Start the Three.js animation/render loop.
     * @private
     */
    _startLoop() {
        const animate = () => {
            this._animId = requestAnimationFrame(animate);
            // Slow auto-rotation for 3D depth perception
            this._nodes.forEach(n => {
                n.rotation.x += 0.005;
                n.rotation.y += 0.005;
            });
            this._renderer?.render(this._scene, this._camera);
        };
        animate();
    }

    /** Stop render loop and free resources */
    _stopLoop() {
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
    }

    /** Clear all meshes from the scene */
    _clearScene() {
        this._nodes.forEach(n => this._scene.remove(n));
        this._nodes = [];
    }

    /** Render when Three.js is unavailable */
    _renderFallback() {
        if (this._element) {
            this._element.innerHTML = `
                <div class="gnn-fallback">
                    <p>GNN 3D Visualization unavailable — Three.js not loaded.</p>
                </div>
            `;
        }
    }

    /** Render placeholder before data arrives */
    _renderEmpty() {
        if (this._element) {
            this._element.innerHTML = `
                <div class="gnn-empty-state">
                    <p>Awaiting GNN shape data...</p>
                </div>
            `;
        }
    }
}

/**
 * Self-registration entry point — called by main.js bootloader.
 * Follows gnn-code-generator skill pattern.
 * @param {Object} registry - ComponentRegistry instance
 * @param {Object} bus      - SovereignBUS instance
 */
export function register(registry, bus) {
    const component = new GNNTab();
    registry.registerTab({
        id:        'gnn',
        label:     'GNN MODEL',
        order:     2,
        component,
    });

    // Subscribe to drift detection data
    bus.on('DRIFT_DETECTED', payload => component.onData(payload));

    // ── DEDUCTION_COMPLETE → initDeduction() ───────────────────────────────
    // When the backend pipeline emits a sealed audit_packet, forward it to the
    // 3D engine to re-render all 3 phases in deduction mode.
    // [DFT][GNNTAB_DEDUCTION_COMPLETE]
    bus.on('DEDUCTION_COMPLETE', payload => {
        if (typeof HealthcareMedical3D !== 'undefined') {
            const pkt = payload && payload.audit_packet ? payload.audit_packet : payload;
            console.log('[DFT][GNNTAB_DEDUCTION_COMPLETE] verdict=%s branch=%s',
                pkt && pkt.overall_verdict, pkt && pkt.branch);
            HealthcareMedical3D.initDeduction(pkt || null);
        } else {
            console.warn('[GNN_TAB] HealthcareMedical3D not loaded — DEDUCTION_COMPLETE ignored');
        }
    });

    // Accept doe:result via postMessage from parent frame (same-page iframe)
    window.addEventListener('message', function (ev) {
        if (!ev.data) return;
        if (ev.data.type === 'doe:result' && typeof HealthcareMedical3D !== 'undefined') {
            const pkt = ev.data.payload && ev.data.payload.packet
                ? ev.data.payload.packet : ev.data.payload;
            HealthcareMedical3D.initDeduction(pkt || null);
        }
        if (ev.data.type === 'deduction:domain:switch' && typeof HealthcareMedical3D !== 'undefined') {
            // Trigger mockup domain tab switch without a live audit packet
            HealthcareMedical3D.initDeduction(null);
        }
    });

    return component;
}
