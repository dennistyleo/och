/**
 * Module: CausalCorridor3D.js
 * Version: 2.1.0
 * Description: Relativistic Causal Corridor Visualization mirroring Minkowski Spacetime.
 *              Renders Dual Light Cones (Future Prediction, Past RCA) mapping the Causal boundaries.
 */

export class CausalCorridor3D {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.initialized = false;
        
        this.C_PHI = 0.5; // Relativistic causality constant
    }

    render(canvas, causalData = {}, mode = 'PREDICTION') {
        if (!this.container && !canvas) return;
        const target = canvas || this.container;

        this._initScene(target);
        this._clearScene();
        this._buildMinkowskiSpace(causalData, mode);
        this._animate();
    }

    _initScene(target) {
        if (this.initialized) return;
        const w = target.clientWidth || 300;
        const h = target.clientHeight || 200;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xFFFFFF);

        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        // Orthogonal-like angle for Minkowski diagram
        this.camera.position.set(0, 5, 25);

        this.renderer = new THREE.WebGLRenderer({
            canvas: target instanceof HTMLCanvasElement ? target : undefined,
            antialias: true,
            alpha: true
        });

        if (!(target instanceof HTMLCanvasElement)) {
            this.renderer.setSize(w, h);
            target.appendChild(this.renderer.domElement);
        }

        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
        }

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const p1 = new THREE.PointLight(0x00C853, 2, 50);
        p1.position.set(0, 0, 0);
        this.scene.add(p1);

        this.initialized = true;
    }

    _clearScene() {
        while(this.scene.children.length > 2) {
            this.scene.remove(this.scene.children[this.scene.children.length - 1]);
        }
    }

    _buildMinkowskiSpace(data, mode) {
        this._addSpacetimeAxes();
        
        let validAxioms = Array.isArray(data) ? data : (data.selected || Object.values(data));
        if (!validAxioms || validAxioms.length === 0) validAxioms = [{id: 'N0', name: 'Baseline'}];

        // 1. Dual Light Cones (s^2 = 0 boundary)
        this._buildDualLightCones();

        // 2. Plot Nodes (Inside/Outside Cones)
        this._plotCausalNodes(validAxioms, mode);
    }

    _addSpacetimeAxes() {
        const axesMat = new THREE.LineBasicMaterial({ color: 0xD4AF37, transparent: true, opacity: 0.8 });
        
        // Time Axis (Y)
        const lineGeoY = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -10, 0),
            new THREE.Vector3(0, 10, 0)
        ]);
        this.scene.add(new THREE.Line(lineGeoY, axesMat));

        // Space Axis (X)
        const lineGeoX = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-10, 0, 0),
            new THREE.Vector3(10, 0, 0)
        ]);
        this.scene.add(new THREE.Line(lineGeoX, axesMat));
    }

    _buildDualLightCones() {
        const coneGroup = new THREE.Group();
        
        // Future Cone (Prediction) - y is positive Time
        const futureGeo = new THREE.ConeGeometry(5, 10, 32, 1, true);
        const futureMat = new THREE.MeshPhongMaterial({ 
            color: 0x00E5FF, 
            transparent: true, 
            opacity: 0.15,
            side: THREE.DoubleSide,
            emissive: 0x00E5FF,
            emissiveIntensity: 0.1
        });
        const futureCone = new THREE.Mesh(futureGeo, futureMat);
        futureCone.position.set(0, 5, 0);
        coneGroup.add(futureCone);

        // Past Cone (RCA) - y is negative Time
        const pastGeo = new THREE.ConeGeometry(5, 10, 32, 1, true);
        const pastMat = new THREE.MeshPhongMaterial({ 
            color: 0xFF5500, 
            transparent: true, 
            opacity: 0.15,
            side: THREE.DoubleSide,
            emissive: 0xFF5500,
            emissiveIntensity: 0.1
        });
        const pastCone = new THREE.Mesh(pastGeo, pastMat);
        pastCone.rotation.x = Math.PI; // point upwards to origin
        pastCone.position.set(0, -5, 0);
        coneGroup.add(pastCone);

        this.scene.add(coneGroup);
    }

    _plotCausalNodes(axioms, mode) {
        const nodeGroup = new THREE.Group();
        
        // Mock causal chain
        for(let i=0; i<30; i++) {
            // T mapped to Y axis [-10, 10]
            const t = (i / 30) * 20 - 10;
            // X mapped to physical bounds
            const dx = (Math.random() - 0.5) * 8;
            const dz = (Math.random() - 0.5) * 8;
            
            // Calculate s^2 = dx^2 + dz^2 - c^2*dt^2 (where dt is t-0 relative to origin)
            const rSq = dx*dx + dz*dz;
            const cSq = (Math.abs(t) * this.C_PHI) * (Math.abs(t) * this.C_PHI);
            const insideCone = rSq <= cSq * 1.5; // Slight padding for visuals
            
            // Determine color based on time and causality
            let color = 0x888888; // Space-like (Outside Cone)
            if (insideCone) {
                if (t > 0) color = 0x00C853; // Future Time-like (Green)
                else color = 0xFF0000; // Past Time-like / RCA Source (Red)
            }

            const geo = new THREE.SphereGeometry(0.2, 16, 16);
            const mat = new THREE.MeshPhongMaterial({ color: color, emissive: color, emissiveIntensity: 0.8 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(dx, t, dz);
            nodeGroup.add(mesh);
            
            // Draw causal links to origin for items strictly inside
            if(insideCone) {
                const linkGeo = new THREE.BufferGeometry().setFromPoints([mesh.position, new THREE.Vector3(0,0,0)]);
                const linkMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.3 });
                nodeGroup.add(new THREE.Line(linkGeo, linkMat));
            }
        }
        this.scene.add(nodeGroup);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        if (this.controls) this.controls.update();
        if(this.scene && this.camera && this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

if (typeof window !== 'undefined') {
    window.CausalCorridor3D = CausalCorridor3D;
}
