/*
 * Three.js (r128) renderer for the ant colony simulation.
 *
 * Sim space is 2D (x: 0..2400, y: 0..1800). It maps onto the ground plane:
 *   world.x = sim.x * SCALE - FIELD_W / 2
 *   world.z = sim.y * SCALE - FIELD_H / 2
 */

const SCALE = 0.1;
const FIELD_W = WORLD.W * SCALE;   // 240
const FIELD_H = WORLD.H * SCALE;   // 180

const MAX_ANTS = 3000;
const MAX_ENEMIES = 200;
const MAX_CORPSES = 1500;
const MAX_FOOD = 64;

class SceneRenderer {
    constructor(container) {
        this.container = container;
        this.onColonyClick = null;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x030712);
        this.scene.fog = new THREE.Fog(0x030712, 260, 720);

        this.camera = new THREE.PerspectiveCamera(
            48, window.innerWidth / window.innerHeight, 0.5, 1200);
        this.camera.position.set(0, 170, 185);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.06;
        this.controls.maxPolarAngle = 1.42;
        this.controls.minDistance = 25;
        this.controls.maxDistance = 480;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.35;
        this.controls.addEventListener('start', () => {
            this.controls.autoRotate = false;
        });

        this.glowTexture = makeGlowTexture();
        this.focusAnim = null;
        this.nestMeshes = [];
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.pointerDownAt = null;

        this.buildEnvironment();
        this.buildDynamicPools();
        this.bindPointerEvents();

        window.addEventListener('resize', () => this.handleResize());
    }

    /* ------------------------------------------------------------- */
    /* Static environment: ground, lights, world border, dust.        */
    /* ------------------------------------------------------------- */

    buildEnvironment() {
        const hemi = new THREE.HemisphereLight(0x8899bb, 0x0a0d14, 0.5);
        this.scene.add(hemi);

        const key = new THREE.DirectionalLight(0xffd9a8, 0.6);
        key.position.set(120, 160, 70);
        this.scene.add(key);

        const rim = new THREE.DirectionalLight(0x4d6bff, 0.18);
        rim.position.set(-140, 80, -110);
        this.scene.add(rim);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(560, 460),
            new THREE.MeshStandardMaterial({
                map: makeGroundTexture(),
                color: 0x8a90a5, // darken the map so trails and ants pop
                roughness: 1,
                metalness: 0,
            }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        this.scene.add(ground);

        // Glowing frame marking the simulation bounds.
        const frame = new THREE.Group();
        const frameMat = new THREE.MeshBasicMaterial({
            color: 0xffb87a, transparent: true, opacity: 0.35,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const t = 0.5;
        const mk = (w, h, x, z) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frameMat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(x, 0.05, z);
            frame.add(m);
        };
        mk(FIELD_W + t * 2, t, 0, -FIELD_H / 2 - t / 2);
        mk(FIELD_W + t * 2, t, 0, FIELD_H / 2 + t / 2);
        mk(t, FIELD_H, -FIELD_W / 2 - t / 2, 0);
        mk(t, FIELD_H, FIELD_W / 2 + t / 2, 0);
        this.scene.add(frame);

        // Scattered rocks outside the field for depth.
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 1 });
        const rockGeo = new THREE.IcosahedronGeometry(1, 0);
        const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 40);
        const dummy = new THREE.Object3D();
        let placed = 0;
        for (let i = 0; i < 200 && placed < 40; i++) {
            const x = (Math.random() - 0.5) * 520;
            const z = (Math.random() - 0.5) * 420;
            if (Math.abs(x) < FIELD_W / 2 + 8 && Math.abs(z) < FIELD_H / 2 + 8) continue;
            const s = 1 + Math.random() * 4;
            dummy.position.set(x, s * 0.25, z);
            dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
            dummy.scale.set(s, s * 0.6, s);
            dummy.updateMatrix();
            rocks.setMatrixAt(placed, dummy.matrix);
            placed += 1;
        }
        rocks.count = placed;
        rocks.instanceMatrix.needsUpdate = true;
        this.scene.add(rocks);

        // Drifting dust motes above the field.
        const dustCount = 320;
        const dustPos = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i++) {
            dustPos[i * 3] = (Math.random() - 0.5) * 360;
            dustPos[i * 3 + 1] = 2 + Math.random() * 55;
            dustPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
            color: 0xffd9a8, size: 0.9, map: this.glowTexture,
            transparent: true, opacity: 0.35,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.scene.add(this.dust);

        // Pheromone field rendered as a live texture hovering on the ground.
        this.pherCols = Math.ceil(WORLD.W / 8);
        this.pherRows = Math.ceil(WORLD.H / 8);
        this.pherData = new Uint8Array(this.pherCols * this.pherRows * 4);
        this.pherTexture = new THREE.DataTexture(
            this.pherData, this.pherCols, this.pherRows, THREE.RGBAFormat);
        this.pherTexture.magFilter = THREE.LinearFilter;
        this.pherTexture.minFilter = THREE.LinearFilter;
        this.pherPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(FIELD_W, FIELD_H),
            new THREE.MeshBasicMaterial({
                map: this.pherTexture, transparent: true,
                blending: THREE.AdditiveBlending, depthWrite: false,
            }));
        this.pherPlane.rotation.x = -Math.PI / 2;
        this.pherPlane.position.y = 0.12;
        this.scene.add(this.pherPlane);
    }

    /* ------------------------------------------------------------- */
    /* Instanced pools reused across resets.                           */
    /* ------------------------------------------------------------- */

    buildDynamicPools() {
        this.dummy = new THREE.Object3D();
        this.tmpColor = new THREE.Color();
        this.colorCache = new Map();

        const makePool = (geometry, material, capacity, withColor) => {
            const mesh = new THREE.InstancedMesh(geometry, material, capacity);
            if (withColor) {
                // Allocate the per-instance color buffer at FULL capacity
                // while count is still `capacity` — r128's setColorAt sizes
                // the buffer from the current count, and we shrink count next.
                mesh.setColorAt(0, new THREE.Color(1, 1, 1));
                mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            }
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.count = 0;
            this.scene.add(mesh);
            return mesh;
        };

        this.antMesh = makePool(
            makeAntGeometry(),
            new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }),
            MAX_ANTS, true);

        this.enemyMesh = makePool(
            makeEnemyGeometry(),
            new THREE.MeshStandardMaterial({
                color: 0x8b1a2a, roughness: 0.5, metalness: 0.2,
                emissive: 0x330000, emissiveIntensity: 0.7,
            }),
            MAX_ENEMIES);

        this.corpseMesh = makePool(
            new THREE.SphereGeometry(0.4, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x30303a, roughness: 1 }),
            MAX_CORPSES);

        this.cargoMesh = makePool(
            new THREE.SphereGeometry(0.32, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffd166 }),
            MAX_ANTS);

        this.foodMesh = makePool(
            new THREE.IcosahedronGeometry(1.4, 0),
            new THREE.MeshStandardMaterial({
                color: 0xffc94d, roughness: 0.25, metalness: 0.35,
                emissive: 0xb07a10, emissiveIntensity: 0.55,
            }),
            MAX_FOOD);

        // Warm glow pooled under each food crystal.
        this.foodGlow = makePool(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                color: 0xffb340, map: this.glowTexture, transparent: true,
                opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
            }),
            MAX_FOOD);

        this.nestGroup = new THREE.Group();
        this.scene.add(this.nestGroup);
    }

    /* Rebuild per-world objects (nest mounds) after a reset. */
    buildWorld(world) {
        while (this.nestGroup.children.length) {
            const nest = this.nestGroup.children[0];
            this.nestGroup.remove(nest);
            nest.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                // Materials are per-nest; shared textures survive dispose().
                if (obj.material) obj.material.dispose();
            });
        }
        this.nestMeshes = [];
        this.nestRings = [];
        this.poolsDirty = true;

        world.colonies.forEach((colony, i) => {
            const group = new THREE.Group();
            const [wx, wz] = simToWorld(colony.x, colony.y);
            group.position.set(wx, 0, wz);

            // Apron of excavated dirt so the mound sits into the ground.
            const apron = new THREE.Mesh(
                new THREE.CircleGeometry(9.5, 28),
                new THREE.MeshStandardMaterial({
                    color: 0x14100b, roughness: 1,
                    transparent: true, opacity: 0.85,
                }));
            apron.rotation.x = -Math.PI / 2;
            apron.position.y = 0.06;
            group.add(apron);

            const mound = new THREE.Mesh(
                new THREE.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: 0x2b1f14, roughness: 1 }));
            mound.scale.set(1, 0.55, 1);
            group.add(mound);

            const entrance = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5, 1.9, 0.7, 16),
                new THREE.MeshBasicMaterial({ color: 0x05070c }));
            entrance.position.y = 3.1;
            group.add(entrance);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(8, 0.22, 10, 48),
                new THREE.MeshBasicMaterial({
                    color: colony.color, transparent: true, opacity: 0.85,
                }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.25;
            group.add(ring);
            this.nestRings.push(ring);

            const glow = new THREE.Mesh(
                new THREE.PlaneGeometry(30, 30),
                new THREE.MeshBasicMaterial({
                    color: colony.color, map: this.glowTexture, transparent: true,
                    opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
                }));
            glow.rotation.x = -Math.PI / 2;
            glow.position.y = 0.08;
            group.add(glow);

            if (i < 4) {
                const light = new THREE.PointLight(colony.color, 0.55, 60, 2);
                light.position.y = 8;
                group.add(light);
            }

            mound.userData.colonyIndex = i;
            this.nestMeshes.push(mound);
            this.nestGroup.add(group);
        });
    }

    /* ------------------------------------------------------------- */
    /* Per-frame update                                                */
    /* ------------------------------------------------------------- */

    render(world, time, opts) {
        // Instance pools only change when the sim ticks (or after a rebuild);
        // food keeps animating so the paused scene still feels alive.
        if (opts.simTicked || this.poolsDirty) {
            this.updateAnts(world, opts);
            this.updateEnemies(world);
            this.updateCorpses(world);
            this.poolsDirty = false;
        }
        this.updateFood(world, time);
        if (opts.showPheromones) {
            this.pherPlane.visible = true;
            if (this.frame === undefined) this.frame = 0;
            this.frame += 1;
            if (this.frame % 3 === 0) this.updatePheromoneTexture(world, opts);
        } else {
            this.pherPlane.visible = false;
        }

        // Nest rings breathe.
        if (this.nestRings) {
            this.nestRings.forEach((ring, i) => {
                const extinct = world.colonies[i] && world.colonies[i].isExtinct;
                ring.material.opacity = extinct
                    ? 0.12 : 0.55 + Math.sin(time * 2 + i) * 0.3;
            });
        }

        this.dust.rotation.y = time * 0.008;

        if (this.focusAnim) this.stepFocusAnim();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    updateAnts(world, opts) {
        const dummy = this.dummy;
        const color = this.tmpColor;
        let n = 0;
        let cargo = 0;

        for (const colony of world.colonies) {
            let base = this.colorCache.get(colony.color);
            if (!base) {
                base = new THREE.Color(colony.color);
                this.colorCache.set(colony.color, base);
            }
            for (const ant of colony.ants) {
                if (ant.isDead || n >= MAX_ANTS) continue;
                const [wx, wz] = simToWorld(ant.x, ant.y);
                let scale = 1;
                color.copy(base);
                switch (ant.type) {
                    case 'queen':
                        scale = 1.9;
                        color.set(0xffd700);
                        break;
                    case 'scout':
                        scale = 0.9;
                        color.lerp(WHITE, 0.35);
                        break;
                    case 'warrior':
                        scale = 1.25;
                        color.lerp(BLACK, 0.3);
                        break;
                }
                dummy.position.set(wx, 0.42 * scale, wz);
                dummy.rotation.set(0, -ant.direction, 0);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                this.antMesh.setMatrixAt(n, dummy.matrix);
                this.antMesh.setColorAt(n, color);

                if (ant.hasFood && cargo < MAX_ANTS) {
                    dummy.position.set(
                        wx - Math.cos(ant.direction) * 1.1,
                        0.9 * scale,
                        wz - Math.sin(ant.direction) * 1.1);
                    dummy.rotation.set(0, 0, 0);
                    dummy.scale.set(1, 1, 1);
                    dummy.updateMatrix();
                    this.cargoMesh.setMatrixAt(cargo, dummy.matrix);
                    cargo += 1;
                }
                n += 1;
            }
        }

        this.antMesh.count = n;
        flagUpdate(this.antMesh.instanceMatrix, n * 16);
        if (this.antMesh.instanceColor) flagUpdate(this.antMesh.instanceColor, n * 3);
        this.cargoMesh.count = cargo;
        flagUpdate(this.cargoMesh.instanceMatrix, cargo * 16);
    }

    updateEnemies(world) {
        const dummy = this.dummy;
        let n = 0;
        for (const enemy of world.enemies) {
            if (enemy.isDead || n >= MAX_ENEMIES) continue;
            const [wx, wz] = simToWorld(enemy.x, enemy.y);
            dummy.position.set(wx, 0.7, wz);
            dummy.rotation.set(0, -enemy.direction, 0);
            dummy.scale.set(1.6, 1.6, 1.6);
            dummy.updateMatrix();
            this.enemyMesh.setMatrixAt(n, dummy.matrix);
            n += 1;
        }
        this.enemyMesh.count = n;
        flagUpdate(this.enemyMesh.instanceMatrix, n * 16);
    }

    updateFood(world, time) {
        const dummy = this.dummy;
        let n = 0;
        for (const food of world.foodSources) {
            if (food.amount <= 0 || n >= MAX_FOOD) continue;
            const [wx, wz] = simToWorld(food.x, food.y);
            const s = 0.5 + 1.3 * Math.min(1, food.amount / 300);
            dummy.position.set(wx, 1.6 + Math.sin(time * 1.4 + n * 1.7) * 0.25, wz);
            dummy.rotation.set(0, time * 0.5 + n, 0.35);
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            this.foodMesh.setMatrixAt(n, dummy.matrix);

            dummy.position.set(wx, 0.1, wz);
            dummy.rotation.set(-Math.PI / 2, 0, 0);
            const gs = 8 + s * 7;
            dummy.scale.set(gs, gs, gs);
            dummy.updateMatrix();
            this.foodGlow.setMatrixAt(n, dummy.matrix);
            n += 1;
        }
        this.foodMesh.count = n;
        flagUpdate(this.foodMesh.instanceMatrix, n * 16);
        this.foodGlow.count = n;
        flagUpdate(this.foodGlow.instanceMatrix, n * 16);
    }

    updateCorpses(world) {
        const dummy = this.dummy;
        let n = 0;
        for (const colony of world.colonies) {
            for (const corpse of colony.deadAnts) {
                if (n >= MAX_CORPSES) break;
                const [wx, wz] = simToWorld(corpse.x, corpse.y);
                dummy.position.set(wx, 0.25, wz);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 0.6, 1);
                dummy.updateMatrix();
                this.corpseMesh.setMatrixAt(n, dummy.matrix);
                n += 1;
            }
        }
        this.corpseMesh.count = n;
        flagUpdate(this.corpseMesh.instanceMatrix, n * 16);
    }

    updatePheromoneTexture(world, opts) {
        const data = this.pherData;
        data.fill(0);
        const cols = this.pherCols;
        const rows = this.pherRows;

        for (const colony of world.colonies) {
            let cFood = TRAIL_COLORS.food;
            let cScout = TRAIL_COLORS.scout;
            let cNest = TRAIL_COLORS.nest;
            if (opts.colonyColored) {
                this.tmpColor.set(colony.color);
                const r = this.tmpColor.r * 255;
                const g = this.tmpColor.g * 255;
                const b = this.tmpColor.b * 255;
                cFood = [r, g, b];
                cScout = [r * 0.8 + 40, g * 0.8 + 40, b * 0.8 + 40];
                cNest = [r * 0.55, g * 0.55, b * 0.55];
            }
            const field = colony.pheromones;
            for (const [k, cell] of field.cells) {
                const cx = k % field.cols;
                const cy = (k - cx) / field.cols;
                // Sim y grows "south"; texture row 0 sits at max z (south edge)
                // after the plane is rotated onto the ground, so rows flip.
                const idx = ((rows - 1 - cy) * cols + cx) * 4;
                let r = data[idx];
                let g = data[idx + 1];
                let b = data[idx + 2];
                let a = data[idx + 3];

                const add = (c, strength, gain) => {
                    const v = Math.min(1, strength / field.maxStrength) * gain;
                    r += c[0] * v; g += c[1] * v; b += c[2] * v; a += 175 * v;
                };
                if (cell.food > 0.05) add(cFood, cell.food, 1.15);
                if (cell.scout > 0.05) add(cScout, cell.scout, 0.7);
                if (cell.nest > 0.05) add(cNest, cell.nest, 0.16);
                if (cell.alarm > 0.05) add(TRAIL_COLORS.alarm, cell.alarm, 1.1);

                data[idx] = Math.min(255, r);
                data[idx + 1] = Math.min(255, g);
                data[idx + 2] = Math.min(255, b);
                data[idx + 3] = Math.min(255, a);
            }
        }
        this.pherTexture.needsUpdate = true;
    }

    /* ------------------------------------------------------------- */
    /* Camera helpers                                                  */
    /* ------------------------------------------------------------- */

    focusOnColony(world, index) {
        const colony = world.colonies[index];
        if (!colony) return;
        const [wx, wz] = simToWorld(colony.x, colony.y);
        this.controls.autoRotate = false;
        const dir = new THREE.Vector3()
            .subVectors(this.camera.position, this.controls.target)
            .normalize();
        this.focusAnim = {
            t: 0,
            fromTarget: this.controls.target.clone(),
            toTarget: new THREE.Vector3(wx, 0, wz),
            fromPos: this.camera.position.clone(),
            toPos: new THREE.Vector3(wx, 0, wz).add(dir.multiplyScalar(70)),
        };
    }

    resetCamera() {
        this.controls.autoRotate = false;
        this.focusAnim = {
            t: 0,
            fromTarget: this.controls.target.clone(),
            toTarget: new THREE.Vector3(0, 0, 0),
            fromPos: this.camera.position.clone(),
            toPos: new THREE.Vector3(0, 170, 185),
        };
    }

    stepFocusAnim() {
        const anim = this.focusAnim;
        anim.t = Math.min(1, anim.t + 0.035);
        const e = 1 - Math.pow(1 - anim.t, 3); // ease-out cubic
        this.controls.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
        this.camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
        if (anim.t >= 1) this.focusAnim = null;
    }

    bindPointerEvents() {
        const el = this.renderer.domElement;
        el.addEventListener('pointerdown', (e) => {
            this.pointerDownAt = { x: e.clientX, y: e.clientY };
        });
        el.addEventListener('pointerup', (e) => {
            if (!this.pointerDownAt) return;
            const moved = Math.hypot(
                e.clientX - this.pointerDownAt.x, e.clientY - this.pointerDownAt.y);
            this.pointerDownAt = null;
            if (moved > 6) return; // it was a drag, not a click
            this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.pointer, this.camera);
            const hits = this.raycaster.intersectObjects(this.nestMeshes);
            if (hits.length && this.onColonyClick) {
                this.onColonyClick(hits[0].object.userData.colonyIndex);
            }
        });
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

/* ------------------------------------------------------------------ */
/* Geometry / texture helpers                                          */
/* ------------------------------------------------------------------ */

const WHITE = { r: 1, g: 1, b: 1 };
const BLACK = { r: 0, g: 0, b: 0 };

const TRAIL_COLORS = {
    food: [255, 196, 64],
    scout: [72, 255, 150],
    nest: [70, 140, 255],
    alarm: [255, 48, 48],
};

function simToWorld(x, y) {
    return [x * SCALE - FIELD_W / 2, y * SCALE - FIELD_H / 2];
}

/* Upload only the live prefix of an instanced attribute (r128 resets
   updateRange.count to -1 after each upload; count 0 would error). */
function flagUpdate(attribute, count) {
    if (count <= 0) return;
    attribute.updateRange.offset = 0;
    attribute.updateRange.count = count;
    attribute.needsUpdate = true;
}

/* Merge indexed BufferGeometries (position/normal only). */
function mergeGeometries(geometries) {
    let vertCount = 0;
    let indexCount = 0;
    for (const g of geometries) {
        vertCount += g.attributes.position.count;
        indexCount += g.index.count;
    }
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const indices = new Uint32Array(indexCount);
    let vOffset = 0;
    let iOffset = 0;
    for (const g of geometries) {
        positions.set(g.attributes.position.array, vOffset * 3);
        normals.set(g.attributes.normal.array, vOffset * 3);
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i++) indices[iOffset + i] = idx[i] + vOffset;
        vOffset += g.attributes.position.count;
        iOffset += idx.length;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    return merged;
}

/* Stylised ant: abdomen + thorax + head along +X (its heading). */
function makeAntGeometry() {
    const abdomen = new THREE.SphereGeometry(0.62, 10, 8);
    abdomen.scale(1.25, 0.8, 0.9);
    abdomen.translate(-0.72, 0.02, 0);

    const thorax = new THREE.SphereGeometry(0.36, 8, 6);
    thorax.translate(0, 0.08, 0);

    const head = new THREE.SphereGeometry(0.3, 8, 6);
    head.scale(1.15, 0.9, 0.85);
    head.translate(0.52, 0.1, 0);

    const merged = mergeGeometries([abdomen, thorax, head]);
    merged.scale(0.85, 0.85, 0.85);
    return merged;
}

/* Predator: low, wide beetle-like body with a jawed head. */
function makeEnemyGeometry() {
    const body = new THREE.SphereGeometry(0.75, 10, 8);
    body.scale(1.4, 0.65, 1.05);
    body.translate(-0.3, 0, 0);

    const head = new THREE.ConeGeometry(0.45, 1.0, 8);
    head.rotateZ(-Math.PI / 2);
    head.translate(1.0, 0.05, 0);

    const spikeL = new THREE.ConeGeometry(0.14, 0.7, 6);
    spikeL.rotateX(-0.5);
    spikeL.translate(-0.4, 0.5, 0.35);

    const spikeR = new THREE.ConeGeometry(0.14, 0.7, 6);
    spikeR.rotateX(0.5);
    spikeR.translate(-0.4, 0.5, -0.35);

    return mergeGeometries([body, head, spikeL, spikeR]);
}

function makeGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(
        size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function makeGroundTexture() {
    const w = 1024;
    const h = 840;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);

    // Soft light pool in the centre where the field sits.
    const glow = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.55);
    glow.addColorStop(0, 'rgba(38,48,72,0.55)');
    glow.addColorStop(1, 'rgba(10,15,26,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Speckle noise.
    for (let i = 0; i < 4200; i++) {
        const a = Math.random() * 0.05;
        ctx.fillStyle = Math.random() < 0.5
            ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }

    // Faint grid over the field region only (field is the centre
    // FIELD_W/560 x FIELD_H/460 fraction of the plane).
    const fx = (1 - FIELD_W / 560) / 2 * w;
    const fy = (1 - FIELD_H / 460) / 2 * h;
    const fw = (FIELD_W / 560) * w;
    const fh = (FIELD_H / 460) * h;
    ctx.strokeStyle = 'rgba(150,180,255,0.045)';
    ctx.lineWidth = 1;
    const step = fw / 24;
    for (let x = fx; x <= fx + fw + 1; x += step) {
        ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x, fy + fh); ctx.stroke();
    }
    for (let y = fy; y <= fy + fh + 1; y += step) {
        ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx + fw, y); ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
}
