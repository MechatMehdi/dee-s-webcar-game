const WIDTH = 1920;
const HEIGHT = 1080;
const HORIZON = HEIGHT * 0.62;

// ─── SPEED CONFIG ───────────────────────────────────────────────────
const BASE_SPEED      = 160;
const MAX_SPEED       = 520;
const ACCEL           = 0.6;
const BRAKE           = 1.8;
const STEER_SPEED     = 0.025;
const AI_CAR_COUNT    = 10;

// ─── CIRCUIT ────────────────────────────────────────────────────────
class Circuit {
    constructor() {
        this.segments      = [];
        this.segmentLength = 100;
        this.roadWidth     = 1000;
        this.rumbleLength  = 3;
        this.totalLength   = 0;
    }

    addCurve(count, curve) {
        for (let i = 0; i < count; i++) {
            const n       = this.segments.length;
            const isDark  = Math.floor(n / this.rumbleLength) % 2;
            let tree = null;
            if (n % 8 === 0 && n > 80) {
                if (Math.random() > 0.45) {
                    const side = Math.random() > 0.5 ? 1 : -1;
                    tree = { x: side * (1.6 + Math.random() * 7.5) };
                }
            }
            // Neon billboard sometimes
            let billboard = null;
            if (n % 60 === 0 && n > 100) {
                const side = Math.random() > 0.5 ? 1 : -1;
                billboard = {
                    x: side * (2.5 + Math.random() * 4),
                    label: ['NEON CITY', 'SYNTHWAVE', 'DRIVE FAST', 'NO LIMITS', 'GRID ∞', 'TURBO'][Math.floor(Math.random()*6)],
                    color: [0xff00ff, 0x00ffff, 0xffff00, 0xff6600][Math.floor(Math.random()*4)]
                };
            }
            this.segments.push({
                index: n,
                curve: curve,
                z: n * this.segmentLength,
                tree, billboard,
                point: {
                    world: { x: 0, y: 0, z: n * this.segmentLength },
                    screen: { x: 0, y: 0, w: 0 },
                    scale: 0
                },
                color: isDark
                    ? { road: '#040410', grass: '#1a0035', rumble: '#ff00ff', lane: '#ffff00' }
                    : { road: '#080820', grass: '#28004d', rumble: '#8800cc', lane: '#080820' }
            });
        }
        this.totalLength = this.segments.length * this.segmentLength;
    }

    createRoad() {
        this.segments = [];
        // Alternating straights and curves for fun driving
        this.addCurve(100,  0);
        this.addCurve(120,  2);
        this.addCurve(80,  -2.5);
        this.addCurve(140,  0);
        this.addCurve(100,  1.5);
        this.addCurve(100, -1.5);
        this.addCurve(100,  3);
        this.addCurve(120,  0);
        this.addCurve(80,  -3);
        this.addCurve(60,   2);
        this.addCurve(140,  0);
        this.addCurve(100,  2.5);
        this.addCurve(120, -2);
        this.addCurve(80,   0);
        this.totalLength = this.segments.length * this.segmentLength;
    }

    getSegment(z) {
        const index = Math.floor(((z % this.totalLength) + this.totalLength) / this.segmentLength) % this.segments.length;
        return this.segments[index];
    }
}

// ─── CAMERA ─────────────────────────────────────────────────────────
class Camera {
    constructor() {
        this.x = 0;
        this.y = 1000;
        this.z = 0;
        this.distToPlane = 1 / Math.tan((30 * Math.PI) / 180);
    }
}

// ─── MAIN SCENE ─────────────────────────────────────────────────────
class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.playerZ    = 0;
        this.playerX    = 0;
        this.speed      = BASE_SPEED;
        this.stars      = [];
        this.zigzags    = [];
        this.clouds     = [];
        this.aiCars     = [];
        this.particles  = [];
        this.screenShake = 0;
        this.isPaused   = true;
        this.isDead     = false;
        this.score      = 0;
        this.highScore  = 0;
        this.combo      = 0;          // overtake combo
        this.comboTimer = 0;
        this.lapCount   = 0;
        this.drift      = 0;          // visual lean
        this.boostTimer = 0;
        this.roadOffset = 0;          // curve scrolling
        this.nearMiss   = 0;          // near-miss flash timer
        this.speedLines = [];
    }

    preload() {}

    create() {
        this.circuit = new Circuit();
        this.circuit.createRoad();
        this.camera = new Camera();

        this.resetAI();

        // Stars
        for (let i = 0; i < 250; i++) {
            this.stars.push({
                x:    Math.random() * WIDTH,
                y:    Math.random() * HORIZON * 0.95,
                size: Math.random() * 2.5 + 0.5,
                twinkle: Math.random() * Math.PI * 2
            });
        }

        // Clouds
        for (let i = 0; i < 10; i++) {
            const clusterX = Math.random() * WIDTH;
            const clusterY = 60 + Math.random() * 260;
            const parts = [];
            for (let j = 0; j < 7; j++) {
                parts.push({
                    offsetX: Math.random() * 200 - 100,
                    offsetY: Math.random() * 60 - 30,
                    w:       160 + Math.random() * 120,
                    h:       40  + Math.random() * 40,
                    radius:  22
                });
            }
            this.clouds.push({ x: clusterX, y: clusterY, parts });
        }

        // Speed lines
        for (let i = 0; i < 40; i++) {
            this.speedLines.push({
                x:      Math.random() * WIDTH,
                y:      HORIZON + Math.random() * (HEIGHT - HORIZON),
                len:    30 + Math.random() * 80,
                speed:  4 + Math.random() * 8,
                alpha:  0
            });
        }

        this.bgGraphics     = this.add.graphics();
        this.graphics       = this.add.graphics();
        this.playerGraphics = this.add.graphics();
        this.fxGraphics     = this.add.graphics();  // post-fx layer
        this.uiGraphics     = this.add.graphics();

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.sKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.aKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.dKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

        // UI TEXT
        const textStyle = (size, color, stroke) => ({
            font:            `bold ${size}px 'Courier New', monospace`,
            fill:            color,
            stroke:          stroke || '#000022',
            strokeThickness: 4
        });

        this.scoreText   = this.add.text(WIDTH - 55, 130, '000000', textStyle(62, '#00ffff')).setOrigin(1, 0);
        this.speedText   = this.add.text(WIDTH - 55, 210, '0 km/h',  textStyle(34, '#ff00ff')).setOrigin(1, 0);
        this.lapText     = this.add.text(60, 130, 'LAP 1', textStyle(34, '#ffff00')).setOrigin(0, 0);
        this.comboText   = this.add.text(WIDTH/2, 200, '', textStyle(48, '#ff6600', '#220000')).setOrigin(0.5).setVisible(false);
        this.hiScoreText = this.add.text(60, 175, 'BEST: 000000', textStyle(28, '#ff44ff')).setOrigin(0, 0);
        this.nearMissText= this.add.text(WIDTH/2, HEIGHT/2 - 200, 'NEAR MISS!', textStyle(70, '#ff0000')).setOrigin(0.5).setVisible(false).setAlpha(0);

        this.pauseScoreText = this.add.text(WIDTH/2, HEIGHT/2 + 70, '', {
            font: '36px Courier New',
            fill: '#ff00ff',
            stroke: '#000',
            strokeThickness: 3
        }).setOrigin(0.5).setVisible(false);

        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        this.input.on('pointerdown', () => {
            if (this.isPaused || this.isDead) this.handleAction();
        });

        // Try load high score from localStorage safely
        try { this.highScore = parseInt(localStorage.getItem('mehdi_hs') || '0'); } catch(e) {}
    }

    resetAI() {
        this.aiCars = [];
        for (let i = 0; i < AI_CAR_COUNT; i++) {
            this.aiCars.push({
                z:     3000 + i * 13000 + Math.random() * 2000,
                x:     Math.random() > 0.5 ? 0.55 : -0.55,
                speed: 65 + Math.random() * 40,
                color: [0x00ffff, 0xffff00, 0xff6600, 0x00ff88, 0xff44ff][Math.floor(Math.random()*5)],
                passed: false
            });
        }
    }

    handleAction() {
        if (this.isDead) {
            if (this.score > this.highScore) {
                this.highScore = Math.floor(this.score);
                try { localStorage.setItem('mehdi_hs', this.highScore); } catch(e) {}
            }
            this.isDead  = false;
            this.playerZ = 0;
            this.playerX = 0;
            this.speed   = BASE_SPEED;
            this.score   = 0;
            this.combo   = 0;
            this.lapCount= 0;
            this.roadOffset = 0;
            this.resetAI();
        }
        this.isPaused = !this.isPaused;
    }

    project3D(point, camera, circuit) {
        const transX = point.world.x - camera.x;
        const transY = point.world.y - camera.y;
        const transZ = point.world.z - camera.z;
        point.scale     = camera.distToPlane / Math.max(1, transZ);
        point.screen.x  = Math.round(WIDTH / 2 + point.scale * transX * WIDTH / 2);
        point.screen.y  = Math.round(HORIZON   - point.scale * transY * HEIGHT / 2);
        point.screen.w  = Math.round(point.scale * circuit.roadWidth * WIDTH / 2);
    }

    spawnParticle(x, y, color, vx, vy, life, size) {
        this.particles.push({ x, y, color, vx, vy, life, maxLife: life, size: size || 6 });
    }

    update() {
        const dt = this.game.loop.delta / 16.67; // normalize to 60fps

        if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            this.handleAction();
        }

        this.bgGraphics.clear();
        this.graphics.clear();
        this.playerGraphics.clear();
        this.fxGraphics.clear();
        this.uiGraphics.clear();

        const shakeX = this.screenShake > 0 ? (Math.random() - 0.5) * this.screenShake : 0;
        const shakeY = this.screenShake > 0 ? (Math.random() - 0.5) * this.screenShake : 0;
        this.cameras.main.setScroll(shakeX, shakeY);
        if (this.screenShake > 0) this.screenShake -= 1.2;

        this.drawBackground(dt);
        this.drawClouds();
        this.drawZigzags(dt);

        if (!this.isPaused && !this.isDead) {
            this.score += dt * 0.9 * (1 + this.speed / MAX_SPEED);

            // ── STEERING ──────────────────────────────────────
            let steering = 0;
            const leftDown  = this.cursors.left.isDown  || this.aKey.isDown;
            const rightDown = this.cursors.right.isDown || this.dKey.isDown;
            const brakeDown = this.cursors.down.isDown  || this.sKey.isDown;

            if (this.input.activePointer.isDown && !(this.isPaused || this.isDead)) {
                if (this.input.activePointer.x < WIDTH / 2) steering = -1;
                else steering = 1;
            }
            if (leftDown)  steering = -1;
            if (rightDown) steering =  1;

            this.drift = Phaser.Math.Linear(this.drift, steering * 0.18, 0.12 * dt);
            this.playerX += steering * STEER_SPEED * dt * (this.speed / 200);
            this.playerX  = Phaser.Math.Clamp(this.playerX, -2.8, 2.8);

            // ── SPEED ─────────────────────────────────────────
            if (brakeDown) {
                this.speed = Math.max(BASE_SPEED, this.speed - BRAKE * dt * 2);
            } else if (this.boostTimer > 0) {
                this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt * 3);
                this.boostTimer -= dt;
            } else {
                this.speed = Math.min(MAX_SPEED * 0.7, this.speed + ACCEL * dt);
            }

            // ── PROGRESS ──────────────────────────────────────
            const prevZ = this.playerZ;
            this.playerZ = (this.playerZ + this.speed * dt) % this.circuit.totalLength;
            if (this.playerZ < prevZ) { // lap completed
                this.lapCount++;
                this.spawnParticle(WIDTH/2, HEIGHT/2, 0x00ffff, 0, 0, 120, 12);
                this.boostTimer = 90; // lap boost
            }

            // ── ROAD CURVE OFFSET ─────────────────────────────
            const currSeg = this.circuit.getSegment(this.playerZ);
            this.roadOffset += (currSeg.curve || 0) * this.speed * 0.00012 * dt;

            // ── COMBO ─────────────────────────────────────────
            if (this.comboTimer > 0) {
                this.comboTimer -= dt;
            } else if (this.combo > 0) {
                this.combo = 0;
                this.comboText.setVisible(false);
            }

            // ── NEAR-MISS TIMER ───────────────────────────────
            if (this.nearMiss > 0) {
                this.nearMiss -= dt;
                this.nearMissText.setVisible(true).setAlpha(this.nearMiss / 30);
            } else {
                this.nearMissText.setVisible(false);
            }

            // ── AI MOVEMENT ───────────────────────────────────
            this.aiCars.forEach(car => {
                car.z = (car.z + car.speed * dt) % this.circuit.totalLength;
                // Overtake detection
                if (!car.passed) {
                    const diff = ((this.playerZ - car.z) + this.circuit.totalLength) % this.circuit.totalLength;
                    if (diff < 800 && diff > 0) {
                        car.passed = true;
                        this.combo++;
                        this.comboTimer = 90;
                        const pts = this.combo >= 3 ? this.combo * 50 : this.combo * 10;
                        this.score += pts;
                        this.comboText
                            .setText(this.combo >= 3 ? `${this.combo}x COMBO! +${pts}` : `OVERTAKE +${pts}`)
                            .setVisible(true)
                            .setAlpha(1);
                        // Spawn pass particles
                        for (let p = 0; p < 12; p++) {
                            this.spawnParticle(
                                WIDTH/2 + (Math.random()-0.5)*200,
                                HEIGHT - 200 + (Math.random()-0.5)*100,
                                car.color,
                                (Math.random()-0.5)*4, -Math.random()*5 - 1, 60
                            );
                        }
                    }
                } else {
                    const diff = ((car.z - this.playerZ) + this.circuit.totalLength) % this.circuit.totalLength;
                    if (diff < 500) car.passed = false; // reset when AI laps us
                }
            });

            // ── PARTICLES ─────────────────────────────────────
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x    += p.vx * dt;
                p.y    += p.vy * dt;
                p.vy   += 0.15 * dt;
                p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            // ── OFF-ROAD SLOW + DUST ──────────────────────────
            if (Math.abs(this.playerX) > 1.8) {
                this.speed = Math.max(BASE_SPEED, this.speed - 2 * dt);
                if (Math.random() > 0.6) {
                    for (let p = 0; p < 3; p++) {
                        this.spawnParticle(
                            WIDTH/2 + (Math.random()-0.5)*100,
                            HEIGHT - 80,
                            0x8855aa,
                            (Math.random()-0.5)*3, -Math.random()*2, 30, 8
                        );
                    }
                }
            }
        }

        this.camera.z = this.playerZ;
        this.camera.x = this.playerX * this.circuit.roadWidth + this.roadOffset * 200;

        // ── RENDER ROAD ───────────────────────────────────────
        const baseSegment    = this.circuit.getSegment(this.camera.z);
        const maxVisible     = 220;
        const playerCarZ     = this.playerZ + 500;

        for (let n = maxVisible; n > 0; n--) {
            const index   = (baseSegment.index + n) % this.circuit.segments.length;
            const seg     = this.circuit.segments[index];
            const offsetZ = index < baseSegment.index ? this.circuit.totalLength : 0;
            const origZ   = seg.point.world.z;
            seg.point.world.z = index * this.circuit.segmentLength + offsetZ;

            this.project3D(seg.point, this.camera, this.circuit);

            if (n < maxVisible) {
                const next = this.circuit.segments[(index + 1) % this.circuit.segments.length];
                this.renderSegment(seg, next);
            }

            // AI cars
            this.aiCars.forEach(car => {
                const carRelZ = ((car.z - this.playerZ) + this.circuit.totalLength) % this.circuit.totalLength;
                const segRelZ = seg.point.world.z - this.camera.z;
                if (segRelZ >= 0 && Math.abs(car.z - (this.camera.z + segRelZ)) < this.circuit.segmentLength) {
                    this.drawAICar(seg, car);
                    if (!this.isDead && !this.isPaused) {
                        const zDist = ((car.z - this.playerZ) + this.circuit.totalLength) % this.circuit.totalLength;
                        const zDistBehind = ((this.playerZ - car.z) + this.circuit.totalLength) % this.circuit.totalLength;
                        const zClose = zDist < 300 || zDistBehind < 150;
                        const xDiff  = Math.abs(this.playerX - car.x);
                        if (zClose && xDiff < 0.45) {
                            this.isDead  = true;
                            this.isPaused = true;
                            this.screenShake = 25;
                            for (let p = 0; p < 30; p++) {
                                this.spawnParticle(WIDTH/2, HEIGHT-200, 0xff4400,
                                    (Math.random()-0.5)*8, -Math.random()*10-2, 80, 10);
                            }
                        } else if (zClose && xDiff < 0.7) {
                            // Near miss!
                            if (this.nearMiss <= 0) {
                                this.nearMiss = 40;
                                this.score   += 25;
                                this.combo++;
                                this.comboTimer = 90;
                            }
                        }
                    }
                }
            });

            // Trees
            if (seg.tree) {
                this.drawPalmTree(seg);
                if (!this.isDead && !this.isPaused) {
                    const zDiff = Math.abs(seg.point.world.z - playerCarZ);
                    if (zDiff < 120 && Math.abs(this.playerX - seg.tree.x) < 0.45) {
                        this.isDead   = true;
                        this.isPaused = true;
                        this.screenShake = 18;
                    }
                }
            }

            // Billboards
            if (seg.billboard) {
                this.drawBillboard(seg);
            }

            seg.point.world.z = origZ;
        }

        this.drawPlayer(dt);
        this.drawParticles();
        this.drawSpeedLines(dt);
        this.drawUI(dt);
    }

    // ─── BACKGROUND ───────────────────────────────────────────────────
    drawBackground(dt) {
        // Deep sky gradient
        this.bgGraphics.fillGradientStyle(0x000008, 0x000008, 0x1a0030, 0x1a0030, 1);
        this.bgGraphics.fillRect(0, 0, WIDTH, HORIZON);

        // Stars
        const t = this.time.now;
        this.stars.forEach(s => {
            let px = ((s.x - this.playerX * 90) % WIDTH + WIDTH) % WIDTH;
            const twinkleAlpha = 0.4 + 0.4 * Math.sin(t * 0.002 + s.twinkle);
            this.bgGraphics.fillStyle(0xffffff, twinkleAlpha);
            this.bgGraphics.fillPoint(px, s.y, s.size);
        });

        // Sun
        const sunX = WIDTH/2 - this.playerX * 70;
        this.drawCyberpunkCity(sunX);  // city drawn BEFORE sun so sun renders on top
        this.drawRetroSun(sunX);

        // Ground
        this.bgGraphics.fillGradientStyle(0x1a0035, 0x1a0035, 0x0a001a, 0x0a001a, 1);
        this.bgGraphics.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON);

        // Horizon glow
        this.bgGraphics.fillGradientStyle(0xff00ff, 0xff00ff, 0x1a0035, 0x1a0035, 0.12);
        this.bgGraphics.fillRect(0, HORIZON - 30, WIDTH, 60);
    }

    drawRetroSun(x) {
        const y       = HORIZON - 10;
        const radius  = 175;
        const colors  = [0xffff00, 0xff8800, 0xff4400, 0xff0088];

        // Glow aura
        for (let i = 4; i >= 0; i--) {
            const alpha = 0.04 + i * 0.025;
            this.bgGraphics.fillStyle(0xff6600, alpha);
            this.bgGraphics.fillCircle(x, y, radius + i * 18);
        }

        // Sun body — horizontal stripe gradient
        const stripeCount = 14;
        for (let i = 0; i < stripeCount; i++) {
            const t    = i / stripeCount;
            const r    = Math.floor(255 * (1 - t * 0.3) + (t > 0.6 ? 255 * (t - 0.6) * 2 : 0));
            const g    = Math.floor(220 * (1 - t));
            const rb   = Math.floor(t * 150);
            const hex  = (r << 16) | (g << 8) | rb;
            const stripY = (y - radius) + (i / stripeCount) * radius * 2;
            const halfH  = Math.sqrt(Math.max(0, radius*radius - Math.pow(stripY - y, 2)));
            this.bgGraphics.fillStyle(hex, 1);
            this.bgGraphics.fillRect(x - halfH, stripY, halfH * 2, radius * 2 / stripeCount + 1);
        }

        // Horizontal scan lines on bottom half
        this.bgGraphics.lineStyle(radius * 0.065, 0x1a0033, 1);
        for (let i = 0; i < 8; i++) {
            const lineY = y + radius * 0.18 + i * radius * 0.13;
            if (lineY < y + radius) {
                this.bgGraphics.lineBetween(x - radius, lineY, x + radius, lineY);
            }
        }
    }

    // ─── CYBERPUNK CITY SKYLINE ───────────────────────────────────────
    drawCyberpunkCity(sunX) {
        const t        = this.time.now;
        const baseY    = HORIZON;
        const cx       = WIDTH / 2;
        const parallax = this.playerX * 40;

        // [relX, width, height, windowCols, windowRows, accentColor]
        const buildings = [
            [-820, 110, 280, 3, 6, 0x00ffff],
            [-680,  80, 200, 2, 4, 0xff00ff],
            [-560, 140, 360, 4, 7, 0x00ffff],
            [-390,  95, 240, 3, 5, 0xffff00],
            [-270,  70, 185, 2, 4, 0xff00ff],
            [-155, 115, 315, 3, 6, 0x00ffff],
            [ -28,  85, 225, 2, 5, 0xff6600],
            [  85, 130, 400, 4, 8, 0xff00ff],
            [ 230,  90, 265, 3, 5, 0x00ffff],
            [ 345, 115, 195, 3, 4, 0xffff00],
            [ 480,  75, 305, 2, 6, 0xff00ff],
            [ 580, 140, 235, 4, 5, 0x00ffff],
            [ 750,  90, 170, 2, 3, 0xff6600],
            [ 875, 110, 255, 3, 5, 0xff00ff],
        ];

        buildings.forEach(([relX, bw, bh, wCols, wRows, accent]) => {
            const bx = cx + relX - parallax * 0.4;
            const by = baseY - bh;

            // Dark building silhouette
            this.bgGraphics.fillStyle(0x050008, 1);
            this.bgGraphics.fillRect(bx - bw/2, by, bw, bh);

            // Rooftop antenna (deterministic per building)
            if ((Math.abs(Math.round(relX)) % 3) < 2) {
                this.bgGraphics.fillStyle(0x0a000f, 1);
                this.bgGraphics.fillRect(bx - 4, by - 28, 8, 28);
                if (Math.sin(t * 0.003 + relX) > 0.2) {
                    this.bgGraphics.fillStyle(0xff0033, 0.9);
                    this.bgGraphics.fillCircle(bx, by - 30, 5);
                }
            }

            // Neon edge strips
            const aAlpha = 0.22 + 0.08 * Math.sin(t * 0.0015 + relX * 0.01);
            this.bgGraphics.lineStyle(2, accent, aAlpha);
            this.bgGraphics.lineBetween(bx - bw/2, by, bx - bw/2, baseY);
            this.bgGraphics.lineStyle(1, accent, aAlpha * 0.5);
            this.bgGraphics.lineBetween(bx + bw/2, by, bx + bw/2, baseY);
            this.bgGraphics.lineStyle(2, accent, aAlpha * 1.2);
            this.bgGraphics.lineBetween(bx - bw/2, by, bx + bw/2, by);

            // Windows
            const ww    = Math.max(4, (bw - 12) / wCols - 3);
            const wh    = 10;
            const wGapY = (bh - 30) / (wRows + 1);
            for (let row = 0; row < wRows; row++) {
                for (let col = 0; col < wCols; col++) {
                    const wx   = bx - bw/2 + 6 + col * ((bw - 12) / wCols);
                    const wy   = by + 15 + row * wGapY;
                    const seed = Math.abs(Math.sin(relX * 13.7 + row * 7.3 + col * 3.1 + Math.floor(t / 3000)));
                    if (seed > 0.35) {
                        const flicker = 0.3 + 0.15 * Math.sin(t * 0.004 + relX + row + col);
                        this.bgGraphics.fillStyle(accent, flicker * 0.5);
                        this.bgGraphics.fillRect(wx, wy, ww, wh);
                    }
                }
            }
        });

        // Subtle city glow at horizon
        this.bgGraphics.fillGradientStyle(0xff00ff, 0xff00ff, 0x000008, 0x000008, 0.06, 0.06, 0, 0);
        this.bgGraphics.fillRect(0, baseY - 55, WIDTH, 55);
    }

    drawClouds() {
        this.clouds.forEach(c => {
            let cx = ((c.x - this.playerX * 130) % WIDTH + WIDTH) % WIDTH;
            if (cx < -500) cx += WIDTH + 500;
            this.bgGraphics.fillStyle(0x55007a, 0.25);
            c.parts.forEach(p => {
                this.bgGraphics.fillRoundedRect(cx + p.offsetX, c.y + p.offsetY, p.w, p.h, p.radius);
            });
            // Neon edge
            this.bgGraphics.lineStyle(1, 0xff00ff, 0.15);
            this.bgGraphics.strokeRoundedRect(cx + c.parts[0].offsetX, c.y, c.parts[0].w, c.parts[0].h, 22);
        });
    }

    drawZigzags(dt) {
        if (Math.random() > 0.975 && this.zigzags.length < 5) {
            let cx = Math.random() * WIDTH, cy = Math.random() * HORIZON * 0.35;
            const segs = [];
            for (let i = 0; i < 5; i++) {
                const nx = cx + (Math.random()*140-70), ny = cy + (Math.random()*55+15);
                segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
                cx = nx; cy = ny;
            }
            this.zigzags.push({ segs, alpha: 1, color: Math.random() > 0.5 ? 0x00ffff : 0xff00ff, width: 2+Math.random()*3 });
        }
        for (let i = this.zigzags.length-1; i >= 0; i--) {
            const z = this.zigzags[i];
            z.alpha -= 0.035 * dt;
            if (z.alpha <= 0) { this.zigzags.splice(i,1); continue; }
            this.bgGraphics.lineStyle(z.width, z.color, z.alpha);
            z.segs.forEach(s => {
                const px1 = ((s.x1 - this.playerX*45) % WIDTH + WIDTH) % WIDTH;
                const px2 = ((s.x2 - this.playerX*45) % WIDTH + WIDTH) % WIDTH;
                this.bgGraphics.lineBetween(px1, s.y1, px2, s.y2);
            });
        }
    }

    // ─── ROAD RENDERING ───────────────────────────────────────────────
    renderSegment(seg, next) {
        const p1 = seg.point.screen;
        const p2 = next.point.screen;
        if (p1.y < HORIZON) return;
        const yTop = Math.max(HORIZON, p2.y);

        // Grass
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(seg.color.grass).color, 1);
        this.graphics.fillRect(0, yTop, WIDTH, p1.y - yTop);

        // Rumble strips
        const r1 = p1.w * 0.055, r2 = p2.w * 0.055;
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(seg.color.rumble).color, 1);
        this.drawRoadPoly(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, yTop, p2.x - p2.w - r2, yTop);
        this.drawRoadPoly(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, yTop, p2.x + p2.w + r2, yTop);

        // Road surface
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(seg.color.road).color, 1);
        this.drawRoadPoly(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, yTop, p2.x - p2.w, yTop);

        // Lane markers
        if (seg.color.lane !== seg.color.road) {
            const lw1 = p1.w * 0.022, lw2 = p2.w * 0.022;
            // Center dashes
            this.graphics.fillStyle(0x00ffff, 0.6);
            this.drawRoadPoly(p1.x - lw1, p1.y, p1.x + lw1, p1.y, p2.x + lw2, yTop, p2.x - lw2, yTop);
            // Lane thirds
            this.graphics.fillStyle(0xffffff, 0.15);
            const lo1 = p1.w * 0.62, lo2 = p2.w * 0.62;
            this.drawRoadPoly(p1.x - lo1 - lw1*0.5, p1.y, p1.x - lo1 + lw1*0.5, p1.y, p2.x - lo2 + lw2*0.5, yTop, p2.x - lo2 - lw2*0.5, yTop);
            this.drawRoadPoly(p1.x + lo1 - lw1*0.5, p1.y, p1.x + lo1 + lw1*0.5, p1.y, p2.x + lo2 + lw2*0.5, yTop, p2.x + lo2 - lw2*0.5, yTop);
        }

        // Road edge glow
        this.graphics.lineStyle(2, 0xff00ff, 0.3);
        this.graphics.beginPath();
        this.graphics.moveTo(p1.x - p1.w, p1.y); this.graphics.lineTo(p2.x - p2.w, yTop);
        this.graphics.moveTo(p1.x + p1.w, p1.y); this.graphics.lineTo(p2.x + p2.w, yTop);
        this.graphics.strokePath();
    }

    drawRoadPoly(x1,y1, x2,y2, x3,y3, x4,y4) {
        this.graphics.beginPath();
        this.graphics.moveTo(x1,y1); this.graphics.lineTo(x2,y2);
        this.graphics.lineTo(x3,y3); this.graphics.lineTo(x4,y4);
        this.graphics.closePath(); this.graphics.fillPath();
    }

    // ─── AI CAR ───────────────────────────────────────────────────────
    drawAICar(seg, car) {
        const p  = seg.point.screen;
        const s  = seg.point.scale;
        const cx = p.x + car.x * p.w;
        const cy = p.y;
        const w  = 700 * s * (WIDTH/2);
        const h  = 560 * s * (HEIGHT/2);
        const playerOffset = (car.x - this.playerX) * 100 * s;

        // Shadow
        this.graphics.fillStyle(0x000000, 0.35);
        this.graphics.fillEllipse(cx, cy + 4*s*(HEIGHT/2), w*1.15, 22*s*(HEIGHT/2));

        // Headlight glow (pointing toward player)
        const glowColor = car.color;
        this.graphics.fillStyle(glowColor, 0.12);
        this.graphics.fillEllipse(cx, cy - h*0.7, w*0.8, h*0.5);

        // Body side
        const sideCol = Phaser.Display.Color.IntegerToColor(car.color).darken(55).color;
        this.graphics.fillStyle(sideCol, 1);
        if (playerOffset > 0) {
            this.drawRoadPoly(cx-w*0.5,cy, cx-w*0.45,cy-h*0.42, cx-w*0.45-playerOffset,cy-h*0.42, cx-w*0.5-playerOffset,cy);
        } else {
            this.drawRoadPoly(cx+w*0.5,cy, cx+w*0.45,cy-h*0.42, cx+w*0.45-playerOffset,cy-h*0.42, cx+w*0.5-playerOffset,cy);
        }

        // Body front
        this.graphics.fillStyle(car.color, 1);
        this.drawRoadPoly(cx-w*0.5,cy, cx+w*0.5,cy, cx+w*0.45,cy-h*0.42, cx-w*0.45,cy-h*0.42);

        // Mid stripe
        const midCol = Phaser.Display.Color.IntegerToColor(car.color).darken(25).color;
        this.graphics.fillStyle(midCol, 1);
        this.drawRoadPoly(cx-w*0.45,cy-h*0.42, cx+w*0.45,cy-h*0.42, cx+w*0.42,cy-h*0.58, cx-w*0.42,cy-h*0.58);

        // Windshield
        this.graphics.fillStyle(0x0a1a2a, 0.92);
        this.drawRoadPoly(cx-w*0.34,cy-h*0.58, cx+w*0.34,cy-h*0.58, cx+w*0.24,cy-h*0.92, cx-w*0.24,cy-h*0.92);

        // Tail lights
        this.graphics.fillStyle(0xff2200, 1);
        this.graphics.fillRect(cx-w*0.45, cy-h*0.33, w*0.17, h*0.13);
        this.graphics.fillRect(cx+w*0.28, cy-h*0.33, w*0.17, h*0.13);

        // Neon underglow
        this.graphics.lineStyle(2, car.color, 0.4);
        this.graphics.lineBetween(cx-w*0.48, cy-5*s*(HEIGHT/2), cx+w*0.48, cy-5*s*(HEIGHT/2));
    }

    // ─── PALM TREE ────────────────────────────────────────────────────
    drawPalmTree(seg) {
        const p  = seg.point.screen;
        const s  = seg.point.scale;
        const tx = p.x + seg.tree.x * p.w;
        const ty = p.y;
        const bw = 70  * s * (WIDTH/2);
        const tw = 18  * s * (WIDTH/2);
        const th = 1200 * s * (HEIGHT/2);

        // Trunk
        this.graphics.fillStyle(0x110022, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(tx-bw/2, ty); this.graphics.lineTo(tx+bw/2, ty);
        this.graphics.lineTo(tx+tw/2, ty-th); this.graphics.lineTo(tx-tw/2, ty-th);
        this.graphics.closePath(); this.graphics.fillPath();

        // Fronds
        const frondCount = 8;
        const lw = 250 * s * (WIDTH/2);
        const lh = 65  * s * (HEIGHT/2);
        for (let i = 0; i < frondCount; i++) {
            const angle  = Math.PI + i * (Math.PI / (frondCount-1));
            const ox     = Math.cos(angle) * lw * 0.45;
            const oy     = Math.sin(angle) * lh * 0.5;
            const alpha  = 0.85 - i * 0.04;
            this.graphics.fillStyle(0xdd00ee, alpha);
            this.graphics.fillEllipse(tx+ox, ty-th+oy, lw, lh);
        }

        // Glow at base of fronds
        this.graphics.fillStyle(0xff00ff, 0.08);
        this.graphics.fillCircle(tx, ty-th, lw * 0.4);
    }

    // ─── BILLBOARD ────────────────────────────────────────────────────
    drawBillboard(seg) {
        const p  = seg.point.screen;
        const s  = seg.point.scale;
        const bx = p.x + seg.billboard.x * p.w;
        const by = p.y;
        const bw = 500 * s * (WIDTH/2);
        const bh = 220 * s * (HEIGHT/2);
        const postH = 900 * s * (HEIGHT/2);
        const postW = 18  * s * (WIDTH/2);

        // Post
        this.graphics.fillStyle(0x222244, 1);
        this.graphics.fillRect(bx - postW/2, by - postH, postW, postH);

        // Board bg
        this.graphics.fillStyle(0x000022, 0.9);
        this.graphics.fillRect(bx - bw/2, by - postH - bh, bw, bh);

        // Border
        this.graphics.lineStyle(3 * s * (WIDTH/200), seg.billboard.color, 1);
        this.graphics.strokeRect(bx - bw/2, by - postH - bh, bw, bh);

        // Could add text but Phaser text on canvas doesn't scale with 3D easily
        // So draw pixel-style lines as "text" decoration
        const lineW = bw * 0.7;
        this.graphics.lineStyle(4 * s * (WIDTH/200), seg.billboard.color, 0.8);
        this.graphics.lineBetween(bx - lineW/2, by - postH - bh*0.65, bx + lineW/2, by - postH - bh*0.65);
        this.graphics.lineStyle(2 * s * (WIDTH/200), seg.billboard.color, 0.4);
        this.graphics.lineBetween(bx - lineW*0.4/2, by - postH - bh*0.38, bx + lineW*0.4/2, by - postH - bh*0.38);
    }

    // ─── PLAYER CAR ───────────────────────────────────────────────────
    drawPlayer(dt) {
        const cx  = WIDTH / 2;
        const cy  = HEIGHT - 5;
        const w   = 420;
        const h   = 165;
        const leanX = this.drift * 40;
        const t   = this.time.now;
        const speedRatio = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);

        const dead = this.isDead;
        const bodyCol   = dead ? 0x332233 : 0xaa0000;
        const topCol    = dead ? 0x441133 : 0xcc0022;
        const glowCol   = dead ? 0x440044 : 0xff00ff;
        const trimCol   = dead ? 0x333333 : 0x00ffff;

        // Exhaust glow
        if (!dead) {
            const exhaustAlpha = 0.06 + speedRatio * 0.18 + Math.random() * 0.05;
            this.playerGraphics.fillStyle(0xff6600, exhaustAlpha);
            this.playerGraphics.fillEllipse(cx + leanX - w*0.35, cy - 8, 120, 30);
            this.playerGraphics.fillEllipse(cx + leanX + w*0.35, cy - 8, 120, 30);
        }

        // Wheels / tyres
        this.playerGraphics.fillStyle(0x111111, 1);
        this.playerGraphics.fillRect(cx + leanX - w*0.47, cy - 52, 85, 60);
        this.playerGraphics.fillRect(cx + leanX + w*0.47 - 85, cy - 52, 85, 60);

        // Wheel rims (neon)
        this.playerGraphics.lineStyle(4, dead ? 0x333333 : 0x00ffff, 0.7);
        this.playerGraphics.strokeCircle(cx + leanX - w*0.47 + 42, cy - 22, 22);
        this.playerGraphics.strokeCircle(cx + leanX + w*0.47 - 43, cy - 22, 22);

        // Car body — bottom slab
        this.playerGraphics.fillStyle(bodyCol, 1);
        this.drawCarPoly(
            cx + leanX - w*0.52, cy,
            cx + leanX + w*0.52, cy,
            cx + leanX + w*0.50, cy - h*0.42,
            cx + leanX - w*0.50, cy - h*0.42
        );

        // Side skirt line
        this.playerGraphics.lineStyle(3, dead ? 0x555555 : 0x00ffff, 0.9);
        this.playerGraphics.lineBetween(cx+leanX-w*0.51, cy-h*0.22, cx+leanX+w*0.51, cy-h*0.22);

        // Mid body
        this.playerGraphics.fillStyle(topCol, 1);
        this.drawCarPoly(
            cx + leanX - w*0.50, cy - h*0.42,
            cx + leanX + w*0.50, cy - h*0.42,
            cx + leanX + w*0.44, cy - h*0.68,
            cx + leanX - w*0.44, cy - h*0.68
        );

        // Roof/cockpit
        this.playerGraphics.fillStyle(0x0d0d22, 1);
        this.drawCarPoly(
            cx + leanX - w*0.40, cy - h*0.68,
            cx + leanX + w*0.40, cy - h*0.68,
            cx + leanX + w*0.30, cy - h*1.15,
            cx + leanX - w*0.30, cy - h*1.15
        );

        // Windshield inner
        this.playerGraphics.fillStyle(0x002244, 0.8);
        this.drawCarPoly(
            cx + leanX - w*0.34, cy - h*0.68,
            cx + leanX + w*0.34, cy - h*0.68,
            cx + leanX + w*0.24, cy - h*1.12,
            cx + leanX - w*0.24, cy - h*1.12
        );

        // Neon underglow stripe
        const pulse = Math.sin(t * 0.006) * 0.3 + 0.7;
        this.playerGraphics.lineStyle(5, glowCol, pulse);
        this.playerGraphics.lineBetween(cx+leanX-w*0.5, cy - h*0.02, cx+leanX+w*0.5, cy - h*0.02);

        // Headlights
        this.playerGraphics.fillStyle(0xaaffff, 0.95);
        this.playerGraphics.fillRect(cx+leanX-w*0.47, cy - h*0.6, w*0.12, h*0.14);
        this.playerGraphics.fillRect(cx+leanX+w*0.35, cy - h*0.6, w*0.12, h*0.14);


        // Neon trim line
        this.playerGraphics.lineStyle(3, trimCol, 0.7);
        this.playerGraphics.lineBetween(cx+leanX-w*0.50, cy-h*0.42, cx+leanX+w*0.50, cy-h*0.42);

        // Speed boost exhaust particles
        if (!dead && speedRatio > 0.6) {
            const bAlpha = (speedRatio - 0.6) * 2 * pulse;
            this.playerGraphics.fillStyle(0x00ffff, bAlpha * 0.5);
            this.playerGraphics.fillEllipse(cx+leanX, cy, w*0.4, 25);
        }
    }

    drawCarPoly(x1,y1, x2,y2, x3,y3, x4,y4) {
        this.playerGraphics.beginPath();
        this.playerGraphics.moveTo(x1,y1);
        this.playerGraphics.lineTo(x2,y2);
        this.playerGraphics.lineTo(x3,y3);
        this.playerGraphics.lineTo(x4,y4);
        this.playerGraphics.closePath();
        this.playerGraphics.fillPath();
    }

    // ─── PARTICLES ────────────────────────────────────────────────────
    drawParticles() {
        this.particles.forEach(p => {
            const alpha = p.life / p.maxLife;
            this.fxGraphics.fillStyle(p.color, alpha);
            this.fxGraphics.fillCircle(p.x, p.y, p.size * alpha);
        });
    }

    // ─── SPEED LINES ──────────────────────────────────────────────────
    drawSpeedLines(dt) {
        const speedRatio = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
        if (speedRatio < 0.35 || this.isPaused || this.isDead) return;

        const alpha = (speedRatio - 0.35) * 1.4;
        this.speedLines.forEach(sl => {
            sl.x -= sl.speed * dt * speedRatio * 3;
            if (sl.x < 0) { sl.x = WIDTH; sl.y = HORIZON + Math.random() * (HEIGHT - HORIZON); }
            this.fxGraphics.lineStyle(1.5, 0x00ffff, alpha * 0.3);
            this.fxGraphics.lineBetween(sl.x, sl.y, sl.x + sl.len, sl.y);
        });
    }

    // ─── UI ───────────────────────────────────────────────────────────
    drawUI(dt) {
        const t = this.time.now;
        const speedRatio = (this.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);

        // Score box
        this.uiGraphics.fillStyle(0x000011, 0.75);
        this.uiGraphics.fillRoundedRect(WIDTH-400, 110, 370, 165, 12);
        this.uiGraphics.lineStyle(2, 0x00ffff, 0.9);
        this.uiGraphics.strokeRoundedRect(WIDTH-400, 110, 370, 165, 12);

        this.scoreText.setText(Math.floor(this.score).toString().padStart(6, '0'));
        this.speedText.setText(Math.floor(this.speed * 0.6) + ' km/h');
        this.lapText.setText('LAP ' + (this.lapCount + 1));
        this.hiScoreText.setText('BEST: ' + this.highScore.toString().padStart(6,'0'));

        // Speed bar
        const barX = WIDTH - 395, barY = 285, barW = 360, barH = 18;
        this.uiGraphics.fillStyle(0x001122, 1);
        this.uiGraphics.fillRoundedRect(barX, barY, barW, barH, 6);
        const barFill = speedRatio * barW;
        const barCol  = speedRatio > 0.8 ? 0xff0066 : speedRatio > 0.5 ? 0xff6600 : 0x00ffff;
        this.uiGraphics.fillStyle(barCol, 1);
        this.uiGraphics.fillRoundedRect(barX, barY, Math.max(8, barFill), barH, 6);
        this.uiGraphics.lineStyle(1, barCol, 0.5);
        this.uiGraphics.strokeRoundedRect(barX, barY, barW, barH, 6);

        // Lap box
        this.uiGraphics.fillStyle(0x000011, 0.65);
        this.uiGraphics.fillRoundedRect(45, 120, 280, 100, 10);
        this.uiGraphics.lineStyle(2, 0xffff00, 0.8);
        this.uiGraphics.strokeRoundedRect(45, 120, 280, 100, 10);

        // Combo text fade
        if (this.comboText.visible) {
            this.comboText.setAlpha(Math.min(1, this.comboTimer / 30));
        }

        // Near-miss flash overlay
        if (this.nearMiss > 0) {
            const nm = this.nearMiss / 40;
            this.uiGraphics.fillStyle(0xff0000, nm * 0.15);
            this.uiGraphics.fillRect(0, 0, WIDTH, HEIGHT);
        }

        // ── PAUSE / DEAD OVERLAY ──────────────────────────────────────
        if (this.isPaused) {
            // Dim overlay
            this.uiGraphics.fillStyle(0x000011, 0.82);
            this.uiGraphics.fillRect(0, 0, WIDTH, HEIGHT);

            // Panel
            const panW = 620, panH = 370;
            const panX = WIDTH/2 - panW/2, panY = HEIGHT/2 - panH/2;
            this.uiGraphics.fillStyle(0x000022, 0.95);
            this.uiGraphics.fillRoundedRect(panX, panY, panW, panH, 28);

            // Animated border
            const bp = Math.sin(t * 0.003) * 0.4 + 0.7;
            this.uiGraphics.lineStyle(3, this.isDead ? 0xff0044 : 0x00ffff, bp);
            this.uiGraphics.strokeRoundedRect(panX, panY, panW, panH, 28);
            this.uiGraphics.lineStyle(1, this.isDead ? 0xff0044 : 0xff00ff, bp * 0.4);
            this.uiGraphics.strokeRoundedRect(panX+6, panY+6, panW-12, panH-12, 24);

            if (this.isDead) {
                // Red crash banner
                this.uiGraphics.fillStyle(0xff0033, 0.18);
                this.uiGraphics.fillRoundedRect(panX+20, panY+20, panW-40, 80, 14);

                this.pauseScoreText.setVisible(true).setColor('#ff3366')
                    .setText('💥 CRASHED!\nSCORE: ' + Math.floor(this.score));

                // High score indicator
                if (Math.floor(this.score) >= this.highScore && this.highScore > 0) {
                    this.uiGraphics.fillStyle(0xffff00, 0.15);
                    this.uiGraphics.fillRoundedRect(panX+80, panY+200, panW-160, 50, 10);
                    this.uiGraphics.lineStyle(2, 0xffff00, 0.7);
                    this.uiGraphics.strokeRoundedRect(panX+80, panY+200, panW-160, 50, 10);
                }
            } else {
                // Play triangle
                const triSize = 45;
                const triX = WIDTH/2, triY = HEIGHT/2 - 30;
                const pp = Math.sin(t * 0.005) * 0.25 + 0.85;
                this.uiGraphics.fillStyle(0xff00ff, pp);
                this.uiGraphics.beginPath();
                this.uiGraphics.moveTo(triX - triSize, triY - triSize);
                this.uiGraphics.lineTo(triX + triSize + 12, triY);
                this.uiGraphics.lineTo(triX - triSize, triY + triSize);
                this.uiGraphics.closePath(); this.uiGraphics.fillPath();
                this.uiGraphics.lineStyle(3, 0x00ffff, pp * 0.8);
                this.uiGraphics.strokePath();

                this.pauseScoreText.setVisible(true).setColor('#00ffff')
                    .setText('SCORE: ' + Math.floor(this.score));
            }
        } else {
            this.pauseScoreText.setVisible(false);
        }
    }
}

// ─── BOOT ─────────────────────────────────────────────────────────────
new Phaser.Game({
    type:            Phaser.AUTO,
    parent:          'gameContainer',
    width:           WIDTH,
    height:          HEIGHT,
    backgroundColor: '#000000',
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MainScene]
});