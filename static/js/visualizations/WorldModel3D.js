/**
 * Module: WorldModel3D.js
 * Version: 2.1.0
 * Description: High-fidelity Three.js World Model Visualization mapping the Phase Trajectory.
 *              Generates floating Phase Space manifold above the TXYZ grid.
 */

export class WorldModel3D {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.initialized = false;
        
        // World boundaries
        this.limitX = 10;
        this.limitZ = 10;
    }

    render(canvas, telemetry = [], engineMode = 'ABDUCTION') {
        if (!this.container && !canvas) return;
        const target = canvas || this.container;

        this._initScene(target);
        this._clearScene();
        this._addReactiveAxes();
        this._addPhaseManifold();
        this._addWorldlineSpline(telemetry, engineMode);
        this._animate();
    }

    _initScene(target) {
        if (this.initialized) return;

        const w = target.clientWidth || 300;
        const h = target.clientHeight || 200;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050505);

        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        this.camera.position.set(15, 12, 15);

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
        const point = new THREE.PointLight(0x00E5FF, 2, 50);
        point.position.set(5, 10, 5);
        this.scene.add(point);

        this.initialized = true;
    }

    _clearScene() {
        while(this.scene.children.length > 2) { 
            this.scene.remove(this.scene.children[this.scene.children.length - 1]);
        }
    }

    _addReactiveAxes() {
        const size = 15;
        const divisions = 15;
        
        // Base Minkowski floor grid
        const gridHelper = new THREE.GridHelper(size, divisions, 0x00E5FF, 0x222222);
        gridHelper.position.y = -5;
        this.scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(6);
        axesHelper.position.set(0, -5, 0);
        this.scene.add(axesHelper);

        // Core Platform
        const plateGeo = new THREE.BoxGeometry(4, 0.2, 4);
        const plateMat = new THREE.MeshPhongMaterial({ color: 0x111111, emissive: 0x00E5FF, emissiveIntensity: 0.1 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = -5.1;
        this.scene.add(plate);
    }

    _addPhaseManifold() {
        // Semi-transparent boundary representing constraints (Invariants boundary)
        const geometry = new THREE.CylinderGeometry(8, 8, 10, 32, 1, true);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x0044ff, 
            transparent: true, 
            opacity: 0.08, 
            wireframe: true,
            side: THREE.DoubleSide
        });
        const dome = new THREE.Mesh(geometry, material);
        this.scene.add(dome);
    }

    _addWorldlineSpline(telemetry, engineMode) {
        const colors = { DEDUCTION: 0x00ff00, ABDUCTION: 0xffa500, INDUCTION: 0x00E5FF };
        let baseColor = colors[engineMode] || 0x00E5FF;
        
        // Mock points if telemetry is empty
        const points = [];
        if(!telemetry || telemetry.length === 0) {
            for(let i=0; i<40; i++) {
                const t = i * 0.2;
                // Add a causal drift anomaly
                const drift = (i > 25 && engineMode !== 'DEDUCTION') ? 2.5 : 0;
                points.push(new THREE.Vector3(
                    Math.sin(t) * 4 + (drift * 0.5), 
                    -3 + t * 0.5, 
                    Math.cos(t) * 4 + drift
                ));
            }
        } else {
            // Parse actual physics TXYZ points
            telemetry.forEach((tData) => {
                points.push(new THREE.Vector3(tData.x, tData.t, tData.z)); // mapped Y = Time
            });
        }

        const curve = new THREE.CatmullRomCurve3(points);
        
        // Draw the main spline
        const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.15, 8, false);
        const tubeMat = new THREE.MeshPhongMaterial({ 
            color: baseColor, 
            emissive: baseColor, 
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });
        const spline = new THREE.Mesh(tubeGeo, tubeMat);
        this.scene.add(spline);

        // Draw structural anomalies (nodes escaping manifold)
        points.forEach((p) => {
            const radSq = p.x * p.x + p.z * p.z;
            if(radSq > 64) { // Cylinder radius is 8
                const errGeo = new THREE.SphereGeometry(0.4, 8, 8);
                const errMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000 });
                const errMesh = new THREE.Mesh(errGeo, errMat);
                errMesh.position.copy(p);
                this.scene.add(errMesh);
                
                // Red trace line down to origin
                const traceGeo = new THREE.BufferGeometry().setFromPoints([p, new THREE.Vector3(p.x, -5, p.z)]);
                const traceMat = new THREE.LineDashedMaterial({ color: 0xff0000, dashSize: 0.2, gapSize: 0.1 });
                const traceLine = new THREE.Line(traceGeo, traceMat);
                traceLine.computeLineDistances();
                this.scene.add(traceLine);
            }
        });
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
    window.WorldModel3D = WorldModel3D;
}
