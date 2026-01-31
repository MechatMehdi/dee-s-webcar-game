const WIDTH = 1920;
const HEIGHT = 1080;
const HORIZON = HEIGHT * 0.65;

class Circuit {
    constructor() {
        this.segments = [];
        this.segmentLength = 100;
        this.roadWidth = 1000;
        this.rumbleLength = 3;
        this.totalLength = 0;
    }

    createRoad() {
        this.segments = [];
        for (let n = 0; n < 1500; n++) {
            const isDark = Math.floor(n / this.rumbleLength) % 2;

            let tree = null;
            if (n % 10 === 0 && n > 100) {
                if (Math.random() > 0.6) {
                    let side = Math.random() > 0.5 ? 1 : -1;
                    let randomX = side * (1.8 + Math.random() * 8.2);
                    tree = { x: randomX };
                }
            }

            this.segments.push({
                index: n,
                z: n * this.segmentLength,
                tree: tree,
                point: {
                    world: { x: 0, y: 0, z: n * this.segmentLength },
                    screen: { x: 0, y: 0, w: 0 },
                    scale: 0
                },
                color: isDark
                    ? { road: '#050505', grass: '#2d0245', rumble: '#ff00ff', lane: '#ffff00' }
                    : { road: '#0a0a0a', grass: '#420361', rumble: '#950095', lane: '#0a0a0a' }
            });
        }
        this.totalLength = this.segments.length * this.segmentLength;
    }

    getSegment(z) {
        const index = Math.floor((z % this.totalLength) / this.segmentLength);
        return this.segments[index];
    }
}

class Camera {
    constructor() {
        this.x = 0;
        this.y = 1000;
        this.z = 0;
        this.distToPlane = 1 / Math.tan((30 * Math.PI) / 180);
    }
}

class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.playerZ = 0;
        this.playerX = 0;
        this.speed = 180;
        this.stars = [];
        this.zigzags = [];
        this.clouds = [];
        this.aiCars = [];
        this.isPaused = true;
        this.isDead = false;
        this.score = 0;
    }

    preload() {}

    create() {
        this.circuit = new Circuit();
        this.circuit.createRoad();
        this.camera = new Camera();

        for (let i = 0; i < 8; i++) {
            this.aiCars.push({
                z: 5000 + (i * 16000) + (Math.random() * 2000),
                x: Math.random() > 0.5 ? 0.5 : -0.5,
                speed: 70 + Math.random() * 30,
                color: Math.random() > 0.5 ? 0x00ffff : 0xffff00
            });
        }

        for (let i = 0; i < 150; i++) {
            this.stars.push({
                x: Math.random() * WIDTH,
                y: Math.random() * HORIZON,
                size: Math.random() * 2
            });
        }

        for (let i = 0; i < 8; i++) {
            let clusterX = Math.random() * WIDTH;
            let clusterY = 100 + Math.random() * 300;
            let parts = [];
            for (let j = 0; j < 6; j++) {
                parts.push({
                    offsetX: Math.random() * 150 - 75,
                    offsetY: Math.random() * 60 - 30,
                    w: 150 + Math.random() * 100,
                    h: 40 + Math.random() * 40,
                    radius: 20
                });
            }
            this.clouds.push({ x: clusterX, y: clusterY, parts: parts });
        }

        this.bgGraphics = this.add.graphics();
        this.graphics = this.add.graphics();
        this.playerGraphics = this.add.graphics();
        this.uiGraphics = this.add.graphics();
        this.cursors = this.input.keyboard.createCursorKeys();

        this.scoreText = this.add.text(WIDTH - 50, 130, '000000', {
            font: 'bold 60px monospace',
            fill: '#0ff'
        }).setOrigin(1, 0);

        this.pauseScoreText = this.add.text(WIDTH/2, HEIGHT/2 + 65, '', {
            font: '30px monospace',
            fill: '#f0f'
        }).setOrigin(0.5).setVisible(false);

        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.input.on('pointerdown', () => this.handleAction());
    }

    handleAction() {
        if (this.isDead) {
            this.isDead = false;
            this.playerZ = 0;
            this.playerX = 0;
            this.score = 0;
            this.aiCars.forEach((car, i) => car.z = 5000 + (i * 16000));
        }
        this.isPaused = !this.isPaused;
    }

    project3D(point, camera, circuit) {
        const transX = point.world.x - camera.x;
        const transY = point.world.y - camera.y;
        const transZ = point.world.z - camera.z;

        point.scale = camera.distToPlane / Math.max(1, transZ);
        point.screen.x = Math.round(WIDTH / 2 + point.scale * transX * WIDTH / 2);
        point.screen.y = Math.round(HORIZON - point.scale * transY * HEIGHT / 2);
        point.screen.w = Math.round(point.scale * circuit.roadWidth * WIDTH / 2);
    }

    update() {
        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) this.handleAction();

        this.bgGraphics.clear();
        this.graphics.clear();
        this.playerGraphics.clear();
        this.uiGraphics.clear();

        this.drawBackground();
        this.drawClouds();
        this.drawZigzags();

        if (!this.isPaused && !this.isDead) {
            this.score += 1;

            if (this.cursors.left.isDown) this.playerX -= 0.02;
            if (this.cursors.right.isDown) this.playerX += 0.02;
            this.playerX = Phaser.Math.Clamp(this.playerX, -2.8, 2.8);
            this.playerZ = (this.playerZ + this.speed) % this.circuit.totalLength;

            this.aiCars.forEach(car => {
                car.z = (car.z + car.speed) % this.circuit.totalLength;
            });
        }

        this.camera.z = this.playerZ;
        this.camera.x = this.playerX * this.circuit.roadWidth;

        const baseSegment = this.circuit.getSegment(this.camera.z);
        const maxVisibleSegments = 200;
        const playerCarZ = this.playerZ + 700;

        for (let n = maxVisibleSegments; n > 0; n--) {
            const index = (baseSegment.index + n) % this.circuit.segments.length;
            const seg = this.circuit.segments[index];
            const offsetZ = index < baseSegment.index ? this.circuit.totalLength : 0;
            const originalZ = seg.point.world.z;
            seg.point.world.z = index * this.circuit.segmentLength + offsetZ;

            this.project3D(seg.point, this.camera, this.circuit);

            if (n < maxVisibleSegments) {
                const next = this.circuit.segments[(index + 1) % this.circuit.segments.length];
                this.renderSegment(seg, next);
            }

            this.aiCars.forEach(car => {
                if (car.z >= seg.point.world.z && car.z < seg.point.world.z + this.circuit.segmentLength) {
                    this.drawAICar(seg, car);
                    if (!this.isDead && !this.isPaused) {
                        const zDiff = Math.abs(car.z - playerCarZ);
                        const xDiff = Math.abs(this.playerX - car.x);
                        if (zDiff < 120 && xDiff < 0.5) {
                            this.isDead = true;
                            this.isPaused = true;
                        }
                    }
                }
            });

            if (seg.tree) {
                this.drawPalmTree(seg);
                if (!this.isDead && !this.isPaused) {
                    const treeZDiff = Math.abs(seg.point.world.z - playerCarZ);
                    if (treeZDiff < 120 && Math.abs(this.playerX - seg.tree.x) < 0.5) {
                        this.isDead = true;
                        this.isPaused = true;
                    }
                }
            }
            seg.point.world.z = originalZ;
        }

        this.drawPlayer();
        this.drawUI();
    }

    drawAICar(seg, car) {
        const p = seg.point.screen;
        const s = seg.point.scale;
        const cx = p.x + (car.x * p.w);
        const cy = p.y;
        const w = 700 * s * (WIDTH / 2);
        const h = 600 * s * (HEIGHT / 2);
        const playerXOffset = (car.x - this.playerX) * 100 * s;

        this.graphics.fillStyle(0x000000, 0.4);
        this.graphics.fillEllipse(cx, cy, w * 1.1, 20 * s * (HEIGHT / 2));

        const sideColor = Phaser.Display.Color.IntegerToColor(car.color).darken(50).color;
        this.graphics.fillStyle(sideColor, 1);
        if (playerXOffset > 0) {
            this.drawPolygonRoad(cx - w * 0.5, cy, cx - w * 0.45, cy - h * 0.4, cx - w * 0.45 - playerXOffset, cy - h * 0.4, cx - w * 0.5 - playerXOffset, cy);
        } else {
            this.drawPolygonRoad(cx + w * 0.5, cy, cx + w * 0.45, cy - h * 0.4, cx + w * 0.45 - playerXOffset, cy - h * 0.4, cx + w * 0.5 - playerXOffset, cy);
        }

        this.graphics.fillStyle(car.color, 1);
        this.drawPolygonRoad(cx - w * 0.5, cy, cx + w * 0.5, cy, cx + w * 0.45, cy - h * 0.4, cx - w * 0.45, cy - h * 0.4);

        const midColor = Phaser.Display.Color.IntegerToColor(car.color).darken(20).color;
        this.graphics.fillStyle(midColor, 1);
        this.drawPolygonRoad(cx - w * 0.45, cy - h * 0.4, cx + w * 0.45, cy - h * 0.4, cx + w * 0.42, cy - h * 0.55, cx - w * 0.42, cy - h * 0.55);

        this.graphics.fillStyle(0x111111, 1);
        this.drawPolygonRoad(cx - w * 0.35, cy - h * 0.55, cx + w * 0.35, cy - h * 0.55, cx + w * 0.25, cy - h * 0.9, cx - w * 0.25, cy - h * 0.9);

        this.graphics.fillStyle(0xff0000, 1);
        this.graphics.fillRect(cx - w * 0.44, cy - h * 0.3, w * 0.18, h * 0.12);
        this.graphics.fillRect(cx + w * 0.26, cy - h * 0.3, w * 0.18, h * 0.12);
    }

    drawPalmTree(seg) {
        const p = seg.point.screen;
        const s = seg.point.scale;
        const tx = p.x + (seg.tree.x * p.w);
        const ty = p.y;
        const trunkBaseW = 75 * s * (WIDTH / 2);
        const trunkTopW = 20 * s * (WIDTH / 2);
        const trunkH = 1300 * s * (HEIGHT / 2);
        this.graphics.fillStyle(0x000000, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(tx - trunkBaseW / 2, ty);
        this.graphics.lineTo(tx + trunkBaseW / 2, ty);
        this.graphics.lineTo(tx + trunkTopW / 2, ty - trunkH);
        this.graphics.lineTo(tx - trunkTopW / 2, ty - trunkH);
        this.graphics.closePath();
        this.graphics.fillPath();
        const frondCount = 7;
        const leafW = 260 * s * (WIDTH / 2);
        const leafH = 70 * s * (HEIGHT / 2);
        for (let i = 0; i < frondCount; i++) {
            const angle = Math.PI + (i * Math.PI / (frondCount - 1));
            const offsetX = Math.cos(angle) * (leafW * 0.45);
            const offsetY = Math.sin(angle) * (leafH * 0.5);
            this.graphics.fillStyle(0xff00ff, 0.8 - (i * 0.05));
            this.graphics.fillEllipse(tx + offsetX, (ty - trunkH) + offsetY, leafW, leafH);
        }
    }

    drawBackground() {
        this.bgGraphics.fillGradientStyle(0x050010, 0x050010, 0x2d0245, 0x2d0245, 1);
        this.bgGraphics.fillRect(0, 0, WIDTH, HORIZON);
        this.stars.forEach(s => {
            let px = (s.x - (this.playerX * 80)) % WIDTH;
            if (px < 0) px += WIDTH;
            this.bgGraphics.fillStyle(0xffffff, 0.7);
            this.bgGraphics.fillPoint(px, s.y, s.size);
        });
        const sunRadius = 160;
        const sunX = (WIDTH / 2) - (this.playerX * 60);
        this.draw3DSun(sunX, sunRadius, 0xfff000, 0xff3300);
        this.bgGraphics.fillStyle(0x2d0245, 1);
        this.bgGraphics.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON);
    }

    drawClouds() {
        this.clouds.forEach(c => {
            let cx = (c.x - (this.playerX * 120)) % WIDTH;
            if (cx < -400) cx += WIDTH + 400;
            if (cx > WIDTH + 400) cx -= WIDTH + 400;
            this.bgGraphics.fillStyle(0x4b0082, 0.3);
            c.parts.forEach(p => {
                this.bgGraphics.fillRoundedRect(cx + p.offsetX, c.y + p.offsetY, p.w, p.h, p.radius);
            });
        });
    }

    draw3DSun(x, radius, colHighlight, colShadow) {
        const y = HORIZON - (radius - 15);
        this.bgGraphics.fillStyle(colShadow, 1);
        this.bgGraphics.fillCircle(x, y, radius);
        this.bgGraphics.fillGradientStyle(colHighlight, colHighlight, colShadow, colShadow, 0.8);
        this.bgGraphics.fillCircle(x - (radius * 0.1), y - (radius * 0.15), radius * 0.85);
        this.bgGraphics.lineStyle(radius * 0.08, 0x1a0033, 1);
        for(let i = 0; i < 5; i++) {
            let lineY = y + (radius * 0.3) + (i * (radius * 0.18));
            if(lineY < HORIZON) {
                this.bgGraphics.lineBetween(x - radius, lineY, x + radius, lineY);
            }
        }
    }

    drawZigzags() {
        if (Math.random() > 0.97 && this.zigzags.length < 4) {
            let startX = Math.random() * WIDTH;
            let startY = Math.random() * (HORIZON * 0.4);
            let segments = [];
            let cx = startX, cy = startY;
            for (let i = 0; i < 4; i++) {
                let nx = cx + (Math.random() * 120 - 60);
                let ny = cy + (Math.random() * 60 + 20);
                segments.push({x1: cx, y1: cy, x2: nx, y2: ny});
                cx = nx; cy = ny;
            }
            this.zigzags.push({ segments, alpha: 1, color: Math.random() > 0.5 ? 0x00ffff : 0xff00ff });
        }
        for (let i = this.zigzags.length - 1; i >= 0; i--) {
            let z = this.zigzags[i];
            z.alpha -= 0.04;
            if (z.alpha <= 0) { this.zigzags.splice(i, 1); continue; }
            this.bgGraphics.lineStyle(4, z.color, z.alpha);
            z.segments.forEach(s => {
                let px1 = (s.x1 - (this.playerX * 40)) % WIDTH;
                let px2 = (s.x2 - (this.playerX * 40)) % WIDTH;
                this.bgGraphics.lineBetween(px1, s.y1, px2, s.y2);
            });
        }
    }

    renderSegment(seg, next) {
        const p1 = seg.point.screen;
        const p2 = next.point.screen;
        if (p1.y < HORIZON) return;
        let yTop = Math.max(HORIZON, p2.y);
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(seg.color.grass).color);
        this.graphics.fillRect(0, yTop, WIDTH, p1.y - yTop);
        const r1 = p1.w * 0.05, r2 = p2.w * 0.05;
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(seg.color.rumble).color);
        this.drawPolygonRoad(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, yTop, p2.x - p2.w - r2, yTop);
        this.drawPolygonRoad(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, yTop, p2.x + p2.w + r2, yTop);
        this.graphics.fillStyle(Phaser.Display.Color.HexStringToColor(seg.color.road).color);
        this.drawPolygonRoad(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, yTop, p2.x - p2.w, yTop);
        if (seg.color.lane !== seg.color.road) {
            const lw1 = p1.w * 0.02, lw2 = p2.w * 0.02;
            this.graphics.fillStyle(0xffff00);
            this.drawPolygonRoad(p1.x - lw1, p1.y, p1.x + lw1, p1.y, p2.x + lw2, yTop, p2.x - lw2, yTop);
        }
    }

    drawPolygonRoad(x1, y1, x2, y2, x3, y3, x4, y4) {
        this.graphics.beginPath();
        this.graphics.moveTo(x1, y1); this.graphics.lineTo(x2, y2);
        this.graphics.lineTo(x3, y3); this.graphics.lineTo(x4, y4);
        this.graphics.closePath(); this.graphics.fillPath();
    }

    drawPlayer() {
        // CHANGED: cy from HEIGHT - 60 to HEIGHT - 10 to move car to the bottom
        const cx = WIDTH / 2;
        const cy = HEIGHT - 7;
        const w = 400;
        const h = 150;

        const bodyColor = this.isDead ? 0x333333 : 0x880000;
        const detailColor = this.isDead ? 0x555555 : 0xff0000;
        const lightColor = this.isDead ? 0x222222 : 0xff00ff;

        // Draw Wheels
        this.playerGraphics.fillStyle(0x222222, 1);
        this.playerGraphics.fillRect(cx - (w * 0.45), cy - 40, 80, 60);
        this.playerGraphics.fillRect(cx + (w * 0.45) - 80, cy - 40, 80, 60);

        // Draw Car Body Lower
        this.playerGraphics.fillStyle(bodyColor, 1);
        this.drawPolygonCar(cx - w * 0.5, cy, cx + w * 0.5, cy, cx + w * 0.48, cy - h * 0.4, cx - w * 0.48, cy - h * 0.4);

        // Draw Car Body Mid
        this.playerGraphics.fillStyle(detailColor, 1);
        this.drawPolygonCar(cx - w * 0.48, cy - h * 0.4, cx + w * 0.48, cy - h * 0.4, cx + w * 0.42, cy - h * 0.65, cx - w * 0.42, cy - h * 0.65);

        // Draw Windshield/Roof
        this.playerGraphics.fillStyle(0x111111, 1);
        this.drawPolygonCar(cx - w * 0.38, cy - h * 0.65, cx + w * 0.38, cy - h * 0.65, cx + w * 0.28, cy - h * 1.1, cx - w * 0.28, cy - h * 1.1);

        // Draw Tail Lights / Neon
        this.playerGraphics.fillStyle(lightColor, 1);
        for(let i=0; i<4; i++) {
            this.playerGraphics.fillRect(cx - (w * 0.84)/2, cy - h * 0.55 + (i * 8), w * 0.84, 4);
        }
    }
    drawPolygonCar(x1, y1, x2, y2, x3, y3, x4, y4) {
        this.playerGraphics.beginPath();
        this.playerGraphics.moveTo(x1, y1);
        this.playerGraphics.lineTo(x2, y2);
        this.playerGraphics.lineTo(x3, y3);
        this.playerGraphics.lineTo(x4, y4);
        this.playerGraphics.closePath();
        this.playerGraphics.fillPath();
    }

    drawUI() {
        this.scoreText.setText(Math.floor(this.score).toString().padStart(6, '0'));

        this.uiGraphics.fillStyle(0x000000, 0.5);
        this.uiGraphics.fillRect(WIDTH - 380, 115, 350, 100);
        this.uiGraphics.lineStyle(2, 0x00ffff, 0.8);
        this.uiGraphics.strokeRect(WIDTH - 380, 115, 350, 100);

        if (this.isPaused) {
            this.uiGraphics.fillStyle(0x000000, 0.7);
            this.uiGraphics.fillRect(0, 0, WIDTH, HEIGHT);
            this.uiGraphics.lineStyle(6, 0x00ffff, 1);
            this.uiGraphics.strokeRoundedRect(WIDTH/2 - 250, HEIGHT/2 - 120, 500, 300, 40);

            const pulse = Math.sin(this.time.now / 200) * 0.2 + 0.8;
            const triSize = 40;
            const centerX = WIDTH / 2;
            const centerY = HEIGHT / 2 - 20;

            this.uiGraphics.fillStyle(0xff00ff, pulse);
            this.uiGraphics.beginPath();
            this.uiGraphics.moveTo(centerX - triSize, centerY - triSize);
            this.uiGraphics.lineTo(centerX + triSize + 10, centerY);
            this.uiGraphics.lineTo(centerX - triSize, centerY + triSize);
            this.uiGraphics.closePath();
            this.uiGraphics.fillPath();

            this.uiGraphics.lineStyle(4, 0x00ffff, pulse);
            this.uiGraphics.strokePath();

            this.pauseScoreText.setVisible(true);
            if (this.isDead) {
                this.pauseScoreText.setText("CRASHED! SCORE: " + Math.floor(this.score)).setColor('#ff0000');
                this.uiGraphics.fillStyle(0xff0000, 1);
                this.uiGraphics.fillRect(centerX - 150, centerY + 160, 300, 5);
            } else {
                this.pauseScoreText.setText("SCORE: " + Math.floor(this.score)).setColor('#0ff');
            }
        } else {
            this.pauseScoreText.setVisible(false);
        }
    }
}

// THE UPDATED PHASER CONFIG
new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'gameContainer',
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MainScene]
});