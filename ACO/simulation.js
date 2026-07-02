/*
 * Ant Colony Simulation — core logic (no rendering).
 *
 * The world is a 2D plane (WORLD.W x WORLD.H simulation units). The 3D
 * renderer maps sim (x, y) onto the ground plane (x, z). All behaviour —
 * pheromone fields, ant roles, colony lifecycle, predators, battles —
 * lives here so it can be tested and rendered independently.
 */

const WORLD = { W: 2400, H: 1800 };

const ANT_PROFILES = {
    queen: {
        speed: 0.5, pheromoneStrength: 2, health: 200, foodConsumption: 0.02,
        maxAge: 30000, turnSpeed: 0.1,
    },
    scout: {
        speed: 2.0, pheromoneStrength: 2, health: 100, foodConsumption: 0.008,
        maxAge: 2000, turnSpeed: 0.2, explorationRate: 1.5,
        sensorDistance: 80, foodSensorRange: 60,
    },
    forager: {
        speed: 1.8, pheromoneStrength: 1.5, health: 100, foodConsumption: 0.01,
        maxAge: 1800, turnSpeed: 0.15, explorationRate: 0.3,
        sensorDistance: 50, foodSensorRange: 45,
    },
    warrior: {
        speed: 2.2, pheromoneStrength: 0.6, health: 120, foodConsumption: 0.02,
        maxAge: 2500, turnSpeed: 0.18, explorationRate: 0.8,
        sensorDistance: 120, attackRange: 15, damage: 20, patrolRadius: 140,
    },
};

/* ------------------------------------------------------------------ */
/* Pheromone field: sparse grid of 4 channels per colony.              */
/* ------------------------------------------------------------------ */

class PheromoneField {
    constructor() {
        this.cellSize = 8;
        this.cols = Math.ceil(WORLD.W / this.cellSize);
        this.rows = Math.ceil(WORLD.H / this.cellSize);
        // key -> { food, nest, scout, alarm }
        this.cells = new Map();
        this.evaporation = { food: 0.95, nest: 0.96, scout: 0.93, alarm: 0.9 };
        this.diffusion = 0.02;
        this.maxStrength = 2.5;
        this.pruneBelow = 0.05;
    }

    key(cx, cy) { return cy * this.cols + cx; }

    cellAt(cx, cy, create) {
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return null;
        const k = this.key(cx, cy);
        let cell = this.cells.get(k);
        if (!cell && create) {
            cell = { food: 0, nest: 0, scout: 0, alarm: 0 };
            this.cells.set(k, cell);
        }
        return cell || null;
    }

    add(x, y, type, amount) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const cell = this.cellAt(cx, cy, true);
        if (!cell) return;
        if (type === 'alarm') amount *= 2;
        const current = cell[type];
        // Saturating deposit: strong trails top out instead of growing forever.
        cell[type] = Math.min(this.maxStrength,
            current + amount * (1 - current / this.maxStrength));
    }

    /* Bounds-checked cell fetch (no key aliasing across map edges). */
    get(cx, cy) {
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return null;
        return this.cells.get(this.key(cx, cy)) || null;
    }

    update() {
        const next = new Map();
        const { cols } = this;
        const d = this.diffusion;
        // Conservative diffusion: each cell gives 4*d of itself away and
        // receives d from each neighbour, THEN evaporates — so total mass
        // always shrinks (the old version added inflow without outflow and
        // trails grew to saturation instead of fading).
        const keep = 1 - 4 * d;
        for (const [k, cell] of this.cells) {
            const cx = k % cols;
            const cy = (k - cx) / cols;
            const neighbors = [
                this.get(cx - 1, cy), this.get(cx + 1, cy),
                this.get(cx, cy - 1), this.get(cx, cy + 1),
            ];
            let food = cell.food * keep;
            let nest = cell.nest * keep;
            let scout = cell.scout * keep;
            let alarm = cell.alarm * keep;
            for (const n of neighbors) {
                if (!n) continue;
                food += n.food * d;
                nest += n.nest * d;
                scout += n.scout * d;
                alarm += n.alarm * d;
            }
            food *= this.evaporation.food;
            nest *= this.evaporation.nest;
            scout *= this.evaporation.scout;
            alarm *= this.evaporation.alarm;

            if (food > this.pruneBelow || nest > this.pruneBelow ||
                scout > this.pruneBelow || alarm > this.pruneBelow) {
                next.set(k, {
                    food: Math.min(this.maxStrength, food),
                    nest: Math.min(this.maxStrength, nest),
                    scout: Math.min(this.maxStrength, scout),
                    alarm: Math.min(this.maxStrength, alarm),
                });
            }
        }
        this.cells = next;
    }

    /* Sample channels around (x, y); pass `only` to restrict to one type.
       Returns {x, y, type, strength}. */
    getNearby(x, y, radius = 24, only = null) {
        const results = [];
        const range = Math.ceil(radius / this.cellSize);
        const baseX = Math.floor(x / this.cellSize);
        const baseY = Math.floor(y / this.cellSize);
        const types = only ? [only] : ['food', 'nest', 'scout', 'alarm'];
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                const cell = this.get(baseX + dx, baseY + dy);
                if (!cell) continue;
                const px = (baseX + dx) * this.cellSize + this.cellSize / 2;
                const py = (baseY + dy) * this.cellSize + this.cellSize / 2;
                const dist = Math.hypot(px - x, py - y);
                if (dist > radius) continue;
                const falloff = 1 - dist / radius;
                for (const type of types) {
                    if (cell[type] > 0.05) {
                        results.push({ x: px, y: py, type, strength: cell[type] * falloff });
                    }
                }
            }
        }
        return results;
    }

    /* Strength of one channel at a point (cheap single-cell lookup). */
    sample(x, y, type) {
        const cell = this.get(
            Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
        return cell ? cell[type] : 0;
    }
}

/* ------------------------------------------------------------------ */
/* Spatial hash for neighbour queries (battles, predator targeting).   */
/* ------------------------------------------------------------------ */

class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.buckets = new Map();
    }

    clear() { this.buckets.clear(); }

    /* Numeric bucket key (offset so edge queries at -1 stay valid). */
    key(bx, by) { return (bx + 16) * 1024 + (by + 16); }

    insert(item) {
        const k = this.key(
            Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
        let bucket = this.buckets.get(k);
        if (!bucket) { bucket = []; this.buckets.set(k, bucket); }
        bucket.push(item);
    }

    query(x, y, radius) {
        const results = [];
        const r = Math.ceil(radius / this.cellSize);
        const bx = Math.floor(x / this.cellSize);
        const by = Math.floor(y / this.cellSize);
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const bucket = this.buckets.get(this.key(bx + dx, by + dy));
                if (bucket) results.push(...bucket);
            }
        }
        return results;
    }
}

/* ------------------------------------------------------------------ */
/* Ants                                                                */
/* ------------------------------------------------------------------ */

class Ant {
    constructor(x, y, type, colony) {
        const profile = ANT_PROFILES[type];
        Object.assign(this, profile);
        this.x = x;
        this.y = y;
        this.type = type;
        this.colony = colony;
        this.world = colony.world;
        this.direction = Math.random() * Math.PI * 2;
        this.age = 0;
        this.isDead = false;
        this.hasFood = false;
        this.carryingDeadAnt = null;
        this.maxHealth = this.health;
        this.diedInBattle = false;
        this.returningHome = false; // scouts: heading back to recruit

        if (type === 'queen') {
            this.eggCooldown = 0;
            this.eggInterval = 24;
            this.eggCost = 2;
            this.queenThreshold = 350;
            this.nextQueenTimer = 3000;
        }
    }

    update(dt) {
        if (this.isDead) return;
        this.age += dt;
        this.health -= this.foodConsumption * dt;
        if (this.age > this.maxAge || this.health <= 0) {
            this.die();
            return;
        }

        if (!this.hasFood && !this.carryingDeadAnt && this.type !== 'queen') {
            this.checkForDeadAnts();
        }

        if (this.carryingDeadAnt) {
            this.moveTowardsNest(dt);
        } else {
            switch (this.type) {
                case 'queen': this.updateQueen(dt); break;
                case 'scout': this.updateScout(dt); break;
                case 'forager': this.updateForager(dt); break;
                case 'warrior': this.updateWarrior(dt); break;
            }
        }

        if (Math.hypot(this.x - this.colony.x, this.y - this.colony.y) < 12) {
            this.arriveAtNest();
        }
    }

    /* --- role behaviours ------------------------------------------ */

    updateQueen(dt) {
        this.eggCooldown -= dt;
        this.nextQueenTimer -= dt;
        if (this.eggCooldown <= 0 && this.colony.foodStock >= this.eggCost) {
            this.colony.foodStock -= this.eggCost;
            const roles = ['forager', 'forager', 'scout', 'warrior'];
            const role = roles[Math.floor(Math.random() * roles.length)];
            this.colony.addAnt(role);
            this.eggCooldown = this.eggInterval;
        }
        if (this.nextQueenTimer <= 0 && this.colony.foodStock >= this.queenThreshold) {
            this.colony.foodStock -= this.queenThreshold;
            this.colony.addAnt('queen');
            this.colony.log('A new queen has been born!', '#ffd700');
            this.nextQueenTimer = 3000;
        }
        // Workers feed the queen at the nest — she never forages herself.
        if (this.health < this.maxHealth * 0.7 && this.colony.foodStock > 2) {
            this.colony.foodStock -= 0.5;
            this.health = Math.min(this.maxHealth, this.health + 15);
        }
        // Queens patrol just outside the mound (radius 60 sim units) so
        // they stay visible instead of walking inside the nest geometry.
        if (Math.random() < 0.02 * dt) this.direction += (Math.random() - 0.5) * Math.PI;
        const dist = Math.hypot(this.x - this.colony.x, this.y - this.colony.y);
        if (dist > 95) {
            this.direction = Math.atan2(this.colony.y - this.y, this.colony.x - this.x);
        } else if (dist < 62) {
            this.direction = Math.atan2(this.y - this.colony.y, this.x - this.colony.x);
        }
        this.applyMovement(dt, 0.4);
    }

    updateScout(dt) {
        // After a find, commit to the trip home, laying a recruitment
        // trail the whole way (arriveAtNest clears the flag).
        if (this.returningHome) {
            this.colony.pheromones.add(this.x, this.y, 'scout',
                this.pheromoneStrength * 1.2 * dt);
            this.moveTowardsNest(dt);
            return;
        }
        const food = this.findNearestFood(this.foodSensorRange * 2);
        if (food) {
            if (Math.hypot(this.x - food.x, this.y - food.y) > this.foodSensorRange) {
                this.steerTowards(food.x, food.y, dt);
            } else {
                this.markFoundFood(food); // one burst at the site
                this.returningHome = true;
            }
        } else if (Math.random() < 0.1 * this.explorationRate * dt) {
            this.direction += (Math.random() - 0.5) * this.turnSpeed * 4;
        }
        this.applyMovement(dt);
    }

    updateForager(dt) {
        if (this.hasFood) {
            this.moveTowardsNest(dt);
            return;
        }
        // Sample sensor directions, follow the strongest signal.
        let best = 0;
        let bestOffset = 0;
        for (const offset of [-1.2, -0.8, -0.4, -0.2, 0, 0.2, 0.4, 0.8, 1.2]) {
            const s = this.sense(offset);
            if (s > best) { best = s; bestOffset = offset; }
        }
        if (best > 0.1) {
            this.direction += bestOffset * this.turnSpeed * dt;
        } else if (Math.random() < 0.08 * this.explorationRate * dt) {
            this.direction += (Math.random() - 0.5) * this.turnSpeed * 2;
        }
        this.checkFoodPickup();
        this.applyMovement(dt);
    }

    updateWarrior(dt) {
        // Converge on alarm pheromones first.
        const alarms = this.colony.pheromones
            .getNearby(this.x, this.y, 60, 'alarm')
            .filter((p) => p.strength > 0.5);
        if (alarms.length) {
            const target = alarms[Math.floor(Math.random() * alarms.length)];
            this.steerTowards(target.x, target.y, dt);
            this.applyMovement(dt);
            return;
        }

        // Then hunt nearby predators.
        let enemy = null;
        let closest = this.sensorDistance;
        for (const e of this.world.enemies) {
            if (e.isDead) continue;
            const d = Math.hypot(this.x - e.x, this.y - e.y);
            if (d < closest) { closest = d; enemy = e; }
        }
        if (enemy) {
            if (closest < this.attackRange) {
                this.attack(enemy, dt);
            } else {
                this.steerTowards(enemy.x, enemy.y, dt, 0.5);
                this.applyMovement(dt);
            }
            return;
        }

        // Otherwise patrol around the nest.
        const distHome = Math.hypot(this.x - this.colony.x, this.y - this.colony.y);
        if (distHome > this.patrolRadius) {
            this.direction = Math.atan2(this.colony.y - this.y, this.colony.x - this.x)
                + (Math.random() - 0.5) * 0.3;
        } else if (Math.random() < 0.03 * dt) {
            this.direction += (Math.random() - 0.5) * Math.PI * 0.5;
        }
        this.applyMovement(dt);
    }

    /* --- shared helpers ------------------------------------------- */

    sense(offset) {
        const sx = this.x + Math.cos(this.direction + offset) * this.sensorDistance;
        const sy = this.y + Math.sin(this.direction + offset) * this.sensorDistance;
        let signal = 0;

        // Direct food smell.
        for (const food of this.world.foodSources) {
            if (food.amount <= 0) continue;
            const d = Math.hypot(sx - food.x, sy - food.y);
            if (d < this.foodSensorRange) {
                signal += 15 * Math.exp(-d / (this.foodSensorRange / 2));
            }
        }

        // Pheromone trails: food trails pull outward-facing foragers,
        // scout trails advertise fresh discoveries.
        const homeAngle = Math.atan2(this.colony.y - this.y, this.colony.x - this.x);
        const facingHome = Math.abs(normalizeAngle(this.direction - homeAngle)) < Math.PI / 2;
        signal += this.colony.pheromones.sample(sx, sy, 'food') * (facingHome ? 0.5 : 3);
        signal += this.colony.pheromones.sample(sx, sy, 'scout') * 2.5;
        return signal;
    }

    steerTowards(tx, ty, dt, jitter = 0) {
        const target = Math.atan2(ty - this.y, tx - this.x)
            + (Math.random() - 0.5) * jitter;
        const delta = normalizeAngle(target - this.direction);
        this.direction += Math.sign(delta) * Math.min(Math.abs(delta), this.turnSpeed * dt);
    }

    moveTowardsNest(dt) {
        this.steerTowards(this.colony.x, this.colony.y, dt);
        if (this.hasFood) {
            this.colony.pheromones.add(this.x, this.y, 'food', this.pheromoneStrength * 2 * dt);
        }
        this.applyMovement(dt);
    }

    applyMovement(dt, speedFactor = 1) {
        const speed = this.speed * speedFactor * (this.hasFood ? 0.7 : 1) * dt;
        this.x += Math.cos(this.direction) * speed;
        this.y += Math.sin(this.direction) * speed;
        if (this.x < 0 || this.x > WORLD.W) {
            this.direction = Math.PI - this.direction;
            this.x = Math.max(0, Math.min(WORLD.W, this.x));
        }
        if (this.y < 0 || this.y > WORLD.H) {
            this.direction = -this.direction;
            this.y = Math.max(0, Math.min(WORLD.H, this.y));
        }
        // Everyone leaves a faint "this way home" gradient trail.
        if (!this.hasFood && this.type !== 'queen') {
            this.colony.pheromones.add(this.x, this.y, 'nest',
                0.1 * this.pheromoneStrength * dt);
        }
        if (this.carryingDeadAnt) {
            this.carryingDeadAnt.x = this.x - 5 * Math.cos(this.direction);
            this.carryingDeadAnt.y = this.y - 5 * Math.sin(this.direction);
        }
    }

    checkFoodPickup() {
        if (this.hasFood) return;
        for (const food of this.world.foodSources) {
            if (food.amount <= 0) continue;
            if (Math.hypot(this.x - food.x, this.y - food.y) < 12) {
                this.hasFood = true;
                food.amount -= 1;
                this.colony.pheromones.add(this.x, this.y, 'food', this.pheromoneStrength * 2);
                this.direction = Math.atan2(this.colony.y - this.y, this.colony.x - this.x);
                break;
            }
        }
    }

    findNearestFood(range) {
        let nearest = null;
        let nearestDist = range;
        for (const food of this.world.foodSources) {
            if (food.amount <= 0) continue;
            const d = Math.hypot(this.x - food.x, this.y - food.y);
            if (d < nearestDist) { nearestDist = d; nearest = food; }
        }
        return nearest;
    }

    markFoundFood(food) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            for (let r = 10; r <= 30; r += 10) {
                this.colony.pheromones.add(
                    food.x + Math.cos(a) * r, food.y + Math.sin(a) * r,
                    'scout', this.pheromoneStrength * (3 - r / 15));
            }
        }
    }

    checkForDeadAnts() {
        if (this.type === 'warrior' || this.hasFood || this.carryingDeadAnt) return;
        for (const corpse of this.colony.deadAnts) {
            if (corpse.isBeingCarried) continue;
            if (Math.hypot(this.x - corpse.x, this.y - corpse.y) < 20) {
                this.carryingDeadAnt = corpse;
                corpse.isBeingCarried = true;
                this.direction = Math.atan2(this.colony.y - this.y, this.colony.x - this.x);
                break;
            }
        }
    }

    arriveAtNest() {
        if (this.returningHome) {
            this.returningHome = false;
            this.direction += Math.PI + (Math.random() - 0.5);
        }
        if (this.hasFood) {
            this.hasFood = false;
            // Each carried morsel is worth several stock units — one
            // delivery must cover more than the 2-food cost of one egg
            // for the colony economy to be sustainable.
            this.colony.foodStock += 2.5;
            this.health = Math.min(this.maxHealth, this.health + 10);
            this.direction = Math.atan2(this.y - this.colony.y, this.x - this.colony.x)
                + (Math.random() - 0.5);
        } else if (this.carryingDeadAnt) {
            const idx = this.colony.deadAnts.indexOf(this.carryingDeadAnt);
            if (idx > -1) this.colony.deadAnts.splice(idx, 1);
            this.carryingDeadAnt = null;
            this.colony.foodStock += 0.5;
            this.direction += Math.PI + (Math.random() - 0.5);
        } else if (this.health < this.maxHealth * 0.6 && this.colony.foodStock > 2) {
            // Hungry ants refuel from the shared stock.
            this.colony.foodStock -= 0.5;
            this.health = Math.min(this.maxHealth, this.health + 15);
        }
    }

    attack(target, dt) {
        target.health -= this.damage * dt;
        if (target.health <= 0 && !target.isDead) {
            target.die();
            if (target.isEnemy) {
                this.colony.log('Warriors slew a predator!', '#90ee90');
                this.colony.enemiesKilled += 1;
            }
        }
    }

    die(inBattle = false) {
        if (this.isDead) return;
        this.isDead = true;
        this.diedInBattle = inBattle;
        this.colony.totalDeaths += 1;
        if (this.carryingDeadAnt) {
            // Drop the corpse where we fell so others can claim it.
            this.carryingDeadAnt.isBeingCarried = false;
            this.carryingDeadAnt = null;
        }
        if (this.type === 'queen') {
            this.colony.log('The queen has died!', '#ff4d4d');
        }
        this.colony.deadAnts.push({
            x: this.x, y: this.y, isBeingCarried: false,
        });
        if (inBattle) {
            // Alarm burst recruits warriors to the site.
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                for (let r = 5; r <= 40; r += 10) {
                    this.colony.pheromones.add(
                        this.x + Math.cos(a) * r, this.y + Math.sin(a) * r,
                        'alarm', 5 * (1 - r / 45));
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Predators: world-level hostiles that hunt ants of any colony.      */
/* ------------------------------------------------------------------ */

class Enemy {
    constructor(x, y, settings, world) {
        this.x = x;
        this.y = y;
        this.world = world;
        this.speed = settings.speed;
        this.damage = settings.damage;
        this.health = settings.health;
        this.maxHealth = settings.health;
        this.attackRange = 14;
        this.turnSpeed = 0.1;
        this.direction = Math.random() * Math.PI * 2;
        this.isDead = false;
        this.isEnemy = true;
        this.age = 0;
        this.maxAge = 3600;
    }

    update(dt, antHash) {
        if (this.isDead) return;
        this.age += dt;
        if (this.age > this.maxAge) { this.isDead = true; return; }

        let target = null;
        let closest = 300;
        for (const ant of antHash.query(this.x, this.y, 300)) {
            if (ant.isDead || ant.isEnemy) continue;
            const d = Math.hypot(this.x - ant.x, this.y - ant.y);
            if (d < closest) { closest = d; target = ant; }
        }

        if (target) {
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            const delta = normalizeAngle(angle - this.direction);
            this.direction += Math.sign(delta) * Math.min(Math.abs(delta), this.turnSpeed * dt);
            if (closest < this.attackRange) {
                target.health -= this.damage * dt * 0.5;
                if (target.health <= 0 && !target.isDead) {
                    target.colony.log(`A ${target.type} was killed by a predator!`, '#ff6b6b');
                    target.die(true);
                }
            }
        } else if (Math.random() < 0.05 * dt) {
            this.direction += (Math.random() - 0.5) * Math.PI * 0.5;
        }

        const speed = this.speed * dt;
        this.x += Math.cos(this.direction) * speed;
        this.y += Math.sin(this.direction) * speed;
        if (this.x < 0 || this.x > WORLD.W) this.direction = Math.PI - this.direction;
        if (this.y < 0 || this.y > WORLD.H) this.direction = -this.direction;
        this.x = Math.max(0, Math.min(WORLD.W, this.x));
        this.y = Math.max(0, Math.min(WORLD.H, this.y));
    }

    die() { this.isDead = true; }
}

/* ------------------------------------------------------------------ */
/* Colony                                                              */
/* ------------------------------------------------------------------ */

class Colony {
    constructor(x, y, color, world, index) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.world = world;
        this.index = index;
        this.ants = [];
        this.deadAnts = [];
        this.foodStock = 200;
        this.pheromones = new PheromoneField();
        this.age = 0;
        this.isExtinct = false;
        this.queenDead = false;
        this.queenRespawnTimer = 0;
        this.antsBorn = 0;
        this.enemiesKilled = 0;
        this.totalDeaths = 0;
        this.logs = [];
        this.maxLogs = 60;
        this.populationHistory = [];
    }

    addAnt(type) {
        const ant = new Ant(this.x, this.y, type, this);
        this.ants.push(ant);
        this.antsBorn += 1;
        if (this.antsBorn % 100 === 0) {
            this.world.notify(`Colony ${this.index + 1} reached ${this.antsBorn} ants born!`, '#90ee90');
        }
        return ant;
    }

    update(dt) {
        if (this.isExtinct) return;
        this.age += dt;

        const living = this.ants.filter((a) => !a.isDead);
        if (living.length === 0) {
            this.isExtinct = true;
            this.log('Colony has gone extinct.', '#ff4d4d');
            this.world.notify(`Colony ${this.index + 1} has gone extinct!`, '#ff4d4d');
            return;
        }

        // Queen lifecycle.
        const hasQueen = living.some((a) => a.type === 'queen');
        if (!hasQueen && !this.queenDead) {
            this.queenDead = true;
            this.queenRespawnTimer = 0;
            this.world.notify(`Colony ${this.index + 1}'s queen has died!`, '#ffa500');
        }
        if (this.queenDead && this.foodStock >= 120) {
            this.queenRespawnTimer += dt;
            if (this.queenRespawnTimer > 400) {
                this.foodStock -= 120;
                this.addAnt('queen');
                this.queenDead = false;
                this.log('A new queen has emerged!', '#ffd700');
                this.world.notify(`Colony ${this.index + 1} has a new queen!`, '#ffd700');
            }
        }

        // Deaths are tallied in Ant.die(); here we just drop the bodies.
        // Iterate a snapshot so eggs laid mid-loop wait until next tick.
        this.ants = this.ants.filter((a) => !a.isDead);
        const roster = this.ants.slice();
        for (const ant of roster) ant.update(dt);
        this.ants = this.ants.filter((a) => !a.isDead);

        // Corpses drift slightly.
        for (const corpse of this.deadAnts) {
            if (!corpse.isBeingCarried) {
                corpse.x += (Math.random() * 0.2 - 0.1) * dt;
                corpse.y += (Math.random() * 0.2 - 0.1) * dt;
            }
        }
    }

    log(message, color = 'rgba(255,255,255,0.85)') {
        const seconds = Math.floor(this.age / 60);
        const stamp = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const entry = { message: `[${stamp}] ${message}`, color };
        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) this.logs.pop();
        this.world.feed(this, message, color);
    }

    population() {
        return this.ants.filter((a) => !a.isDead).length;
    }

    countByType(type) {
        return this.ants.filter((a) => !a.isDead && a.type === type).length;
    }
}

/* ------------------------------------------------------------------ */
/* World: owns colonies, shared food, predators and global events.    */
/* ------------------------------------------------------------------ */

class SimulationWorld {
    constructor(settings) {
        this.settings = settings;
        this.age = 0;
        this.colonies = [];
        this.enemies = [];
        this.foodSources = [];
        this.foodSpawnTimer = 0;
        this.enemySpawnTimer = 0;
        this.antHash = new SpatialHash(40);
        this.onNotify = null;   // (message, color)
        this.onFeed = null;     // (colony, message, color)
        this.pheromoneClock = 0;
        this.historyClock = 0;

        const palette = settings.palette;
        for (let i = 0; i < settings.colonyCount; i++) {
            const pos = this.pickColonySpot(i, settings.colonyCount);
            const colony = new Colony(pos.x, pos.y, palette[i % palette.length], this, i);
            colony.foodStock = settings.startingFood;
            colony.addAnt('queen');
            for (const [type, count] of Object.entries(settings.population)) {
                for (let n = 0; n < count; n++) colony.addAnt(type);
            }
            this.colonies.push(colony);
        }

        for (let i = 0; i < settings.food.count; i++) this.spawnFood();
    }

    /* Spread colonies around the map so they don't stack. */
    pickColonySpot(index, total) {
        const angle = (index / total) * Math.PI * 2 + Math.random() * 0.5;
        const rx = WORLD.W * (0.22 + Math.random() * 0.1);
        const ry = WORLD.H * (0.22 + Math.random() * 0.1);
        return {
            x: WORLD.W / 2 + Math.cos(angle) * rx,
            y: WORLD.H / 2 + Math.sin(angle) * ry,
        };
    }

    spawnFood() {
        if (this.foodSources.length >= this.settings.food.maxSources) return;
        let x; let y; let tries = 0;
        do {
            x = WORLD.W * (0.05 + Math.random() * 0.9);
            y = WORLD.H * (0.05 + Math.random() * 0.9);
            tries += 1;
        } while (tries < 20 && this.colonies.some(
            (c) => Math.hypot(x - c.x, y - c.y) < 150));

        const variants = [
            { mult: 1, name: 'a food cache' },
            { mult: 2, name: 'a large food cache' },
            { mult: 0.5, name: 'a small food cache' },
        ];
        const v = variants[Math.floor(Math.random() * variants.length)];
        const amount = this.settings.food.amount * v.mult;
        this.foodSources.push({ x, y, amount, maxAmount: amount });
    }

    spawnEnemy() {
        const edge = Math.floor(Math.random() * 4);
        let x = 20; let y = 20;
        if (edge === 0) { x = Math.random() * WORLD.W; y = 20; }
        if (edge === 1) { x = WORLD.W - 20; y = Math.random() * WORLD.H; }
        if (edge === 2) { x = Math.random() * WORLD.W; y = WORLD.H - 20; }
        if (edge === 3) { x = 20; y = Math.random() * WORLD.H; }
        this.enemies.push(new Enemy(x, y, this.settings.enemy, this));
    }

    update(dt) {
        this.age += dt;

        // Index living ants once per tick for predators and battles.
        this.antHash.clear();
        for (const colony of this.colonies) {
            if (colony.isExtinct) continue;
            for (const ant of colony.ants) {
                if (!ant.isDead) this.antHash.insert(ant);
            }
        }

        for (const colony of this.colonies) colony.update(dt);

        for (const enemy of this.enemies) enemy.update(dt, this.antHash);
        this.enemies = this.enemies.filter((e) => !e.isDead);

        if (this.settings.enemy.enabled) {
            this.enemySpawnTimer += dt;
            // Soft cap keeps predator pressure proportional to colony count
            // instead of accumulating to a wipeout population.
            const maxEnemies = this.colonies.length * 2 + 2;
            if (this.enemySpawnTimer > this.settings.enemy.spawnRate &&
                this.enemies.length < maxEnemies) {
                this.enemySpawnTimer = 0;
                this.spawnEnemy();
            }
        }

        // Food economy: cull empties, keep a minimum on the map, drip new ones.
        this.foodSources = this.foodSources.filter((f) => f.amount > 0);
        this.foodSpawnTimer += dt;
        if (this.foodSources.length < 3 ||
            (this.foodSpawnTimer > this.settings.food.spawnRate &&
             this.foodSources.length < this.settings.food.maxSources)) {
            this.foodSpawnTimer = 0;
            this.spawnFood();
        }

        this.resolveBattles(dt);

        // Evaporate/diffuse fields every 2 ticks of SIM time (dt-correct,
        // so slow motion doesn't decay trails faster per sim-second).
        this.pheromoneClock += dt;
        while (this.pheromoneClock >= 2) {
            this.pheromoneClock -= 2;
            for (const colony of this.colonies) colony.pheromones.update();
        }

        // Population history for sparklines (sampled every ~half second).
        this.historyClock += dt;
        if (this.historyClock >= 30) {
            this.historyClock = 0;
            for (const colony of this.colonies) {
                const history = colony.populationHistory;
                history.push({ t: Math.floor(this.age), pop: colony.population() });
                if (history.length > 160) history.shift();
            }
        }
    }

    /* Inter-colony skirmishes when ants from rival nests collide. */
    resolveBattles(dt) {
        let casualties = 0;
        const seen = new Set();
        for (const colony of this.colonies) {
            for (const ant of colony.ants) {
                if (ant.isDead) continue;
                for (const other of this.antHash.query(ant.x, ant.y, 15)) {
                    if (other.isDead || other.colony === colony) continue;
                    const pairKey = ant.x < other.x
                        ? `${colony.index}:${other.colony.index}`
                        : `${other.colony.index}:${colony.index}`;
                    if (Math.hypot(ant.x - other.x, ant.y - other.y) < 15) {
                        // Skirmishes are attritional, not instantly lethal —
                        // rivals meet constantly at shared food caches.
                        const [, loser] = Math.random() < 0.5
                            ? [ant, other] : [other, ant];
                        loser.health -= 8 * dt;
                        if (loser.health <= 0 && !loser.isDead) {
                            loser.die(true);
                            casualties += 1;
                            seen.add(pairKey);
                        }
                    }
                }
            }
        }
        if (casualties >= 5 && seen.size) {
            this.notify(`Major battle between rival colonies! (${casualties} casualties)`, '#ff6b6b');
        }
    }

    notify(message, color) {
        if (this.onNotify) this.onNotify(message, color);
    }

    feed(colony, message, color) {
        if (this.onFeed) this.onFeed(colony, message, color);
    }

    livingAnts() {
        let total = 0;
        for (const colony of this.colonies) total += colony.population();
        return total;
    }
}

function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
