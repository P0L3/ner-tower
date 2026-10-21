import * as Phaser from 'phaser';
import type { SentenceData, EntityStats, EntitySpan } from '../../data/types';
import type { GameSettings } from '../../config/settings';
import { seededRandom } from '../../core/rng';
import { zzfx, sndJump, sndLand, sndCombo, sndPhase, sndOver } from '../../core/audio';
import { buildColorMap } from '../palette';

export class GameScene extends Phaser.Scene {
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];
    private settings!: GameSettings;
    private rng!: () => number;

    private player!: Phaser.GameObjects.Container;
    private playerVisual!: Phaser.GameObjects.Rectangle;
    private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private platforms!: Phaser.Physics.Arcade.StaticGroup;
    private entityTextGroup!: Phaser.GameObjects.Group;

    private hudHeightText!: Phaser.GameObjects.Text;
    private uiEntityTexts = new Map<string, Phaser.GameObjects.Text>();
    private colorMap = new Map<string, number>();

    private hasStarted = false;
    private currentPhase = 0;
    private unstableLabels = new Set<string>();
    private startY = 1900;
    private maxHeightReached = 0;
    private highestGeneratedY = 1800;
    private cameraY = 1200;
    private scrollSpeed = 0.5;

    private comboText!: Phaser.GameObjects.Text;
    private comboCount = 0;
    private comboTimer = 0;
    private lastPlatformY = 1900;
    private wasTouchingDown = false;

    constructor() { super('GameScene'); }

    init(data: { dataset: SentenceData[], entityStats: EntityStats[], settings: GameSettings }) {
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
        this.settings = data.settings;
        this.rng = seededRandom(this.settings.seed);

        this.hasStarted = false;
        this.currentPhase = 0;
        this.unstableLabels.clear();
        this.maxHeightReached = 0;
        this.highestGeneratedY = 1800;
        this.cameraY = 1200;
        this.scrollSpeed = this.settings.baseSpeed; // Load from settings
        this.comboCount = 0;
        this.comboTimer = 0;
        this.lastPlatformY = 1900;
        this.wasTouchingDown = false;
        this.uiEntityTexts.clear();
    }

    create() {
        this.physics.world.setBounds(0, -500000, 600, 502000);
        this.cameras.main.setBounds(0, -500000, 850, 502000);
        this.cameras.main.scrollY = this.cameraY;

        this.platforms = this.physics.add.staticGroup();
        this.entityTextGroup = this.add.group();

        const ground = this.add.rectangle(300, 1980, 600, 40, 0x333333);
        this.platforms.add(ground);

        this.colorMap = buildColorMap(this.entityStats);
        this.generateTowerChunk(20);
        this.buildSideHUD();

        const graphics = this.add.graphics();
        graphics.fillStyle(0xffffff, 1);
        graphics.fillRect(0, 0, 8, 8);
        graphics.generateTexture('dust', 8, 8);
        graphics.destroy();

        this.dustEmitter = this.add.particles(0, 0, 'dust', {
            emitting: false, lifespan: 400, speed: { min: 50, max: 150 },
            angle: { min: 180, max: 360 }, scale: { start: 1, end: 0 },
            alpha: { start: 0.6, end: 0 }, gravityY: 400
        });
        this.dustEmitter.setDepth(15);

        this.trailEmitter = this.add.particles(0, 0, 'dust', {
            emitting: false, lifespan: 300, speed: 20,
            scale: { start: 1.5, end: 0 }, alpha: { start: 0.5, end: 0 },
            tint: [0xff00ff, 0x00ffff, 0xffff00], blendMode: 'ADD'
        });
        this.trailEmitter.setDepth(9);

        this.playerVisual = this.add.rectangle(0, 0, 30, 30, 0x00aaff);
        this.player = this.add.container(300, this.startY, [this.playerVisual]);
        this.player.setSize(30, 30);
        this.player.setDepth(10);

        this.trailEmitter.startFollow(this.player, 0, 15);
        this.physics.add.existing(this.player);

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        body.setBounce(0.8, 0);
        body.setMaxVelocity(500, 1500);
        body.setDragX(1000);

        this.physics.add.collider(this.player, this.platforms, undefined, (_player, platform: any) => {
            if (platform.nerLabel && !platform.isRevealed) {
                platform.isRevealed = true;
                const targetColor = this.colorMap.get(platform.nerLabel);
                platform.setFillStyle(0xffffff);
                this.tweens.add({
                    targets: platform, scaleX: 1.1, scaleY: 1.1,
                    duration: 150, yoyo: true, ease: 'Quad.easeOut',
                    onComplete: () => platform.setFillStyle(targetColor)
                });
            }
            if (platform.nerLabel && this.unstableLabels.has(platform.nerLabel)) return false;
            return true;
        }, this);

        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    private buildSideHUD() {
        this.add.rectangle(600, 0, 250, 800, 0x222222).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
        this.add.rectangle(600, 0, 4, 800, 0x555555).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
        this.hudHeightText = this.add.text(620, 20, 'Height: 0m', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setScrollFactor(0).setDepth(101);
        this.comboText = this.add.text(620, 70, '', { fontSize: '28px', color: '#ffff00', fontStyle: 'bold' }).setScrollFactor(0).setDepth(101);
        this.add.text(620, 120, 'STABILITY LOG:', { fontSize: '18px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(101);

        let textY = 150;
        this.entityStats.forEach(stat => {
            const hexColor = '#' + this.colorMap.get(stat.label)!.toString(16).padStart(6, '0');
            const txt = this.add.text(620, textY, `■ ${stat.label}`, { fontSize: '14px', color: hexColor }).setScrollFactor(0).setDepth(101);
            this.uiEntityTexts.set(stat.label, txt);
            textY += 25;
        });
    }

    private generateTowerChunk(count: number) {
        for (let i = 0; i < count; i++) {
            // Replaced Math.random() with seeded this.rng()
            const sentence = this.dataset[Math.floor(this.rng() * this.dataset.length)];
            const h = this.buildSentenceBlocks(sentence, this.highestGeneratedY);
            this.highestGeneratedY -= (h + 120);
        }
    }

    private buildSentenceBlocks(sentence: SentenceData, bottomY: number): number {
        const marginX = 30, lineSpacing = 35;
        let currentX = marginX, lines = 0;
        const measurer = this.add.text(-1000, -1000, '', { fontSize: '18px', fontFamily: 'monospace' });
        interface LayoutItem { token: string; x: number; y: number; width: number; height: number; entitySpan?: EntitySpan; }
        const layout: LayoutItem[] = [];

        for (let i = 0; i < sentence.tokenized_text.length; i++) {
            const token = sentence.tokenized_text[i];
            measurer.setText(token);
            if (currentX + measurer.width > 570) { currentX = marginX; lines++; }
            const span = sentence.ner.find(s => i >= s[0] && i <= s[1]);
            layout.push({ token, x: currentX, y: lines * lineSpacing, width: measurer.width, height: measurer.height, entitySpan: span });
            currentX += measurer.width + 6;
        }
        measurer.destroy();
        const h = (lines + 1) * lineSpacing;
        const startY = bottomY - h;

        for (const item of layout) {
            const dx = item.x, dy = startY + item.y;
            if (item.entitySpan) {
                const label = item.entitySpan[2];
                const txt = this.add.text(dx, dy, item.token, { fontSize: '18px', fontFamily: 'monospace', color: '#ffffff' }).setDepth(2);
                (txt as any).nerLabel = label; this.entityTextGroup.add(txt);
                const plat = this.add.rectangle(dx + (item.width/2), dy + (item.height/2), item.width + 8, item.height + 8, 0x666666).setDepth(1);
                (plat as any).nerLabel = label; (plat as any).isRevealed = false;
                if (this.unstableLabels.has(label)) { plat.setAlpha(0.3); txt.setAlpha(0.3); }
                this.platforms.add(plat);
                const body = plat.body as Phaser.Physics.Arcade.Body;
                body.checkCollision.down = false; body.checkCollision.left = false; body.checkCollision.right = false;
            } else {
                this.add.text(dx, dy, item.token, { fontSize: '18px', fontFamily: 'monospace', color: '#444444' }).setDepth(0);
            }
        }
        return h;
    }

    update(_time: number, delta: number) {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (this.cursors.left.isDown) body.setAccelerationX(-1500);
        else if (this.cursors.right.isDown) body.setAccelerationX(1500);
        else body.setAccelerationX(0);

        if (this.comboTimer > 0) {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0) {
                this.comboCount = 0;
                this.comboText.setText('');
                this.playerVisual.setFillStyle(0x00aaff);
                this.trailEmitter.emitting = false;
            }
        }

        if (body.touching.down && !this.wasTouchingDown) {
            this.playerVisual.rotation = 0;

            zzfx(...sndLand); // Sound: Land

            this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 15, 10);
            this.tweens.killTweensOf(this.playerVisual);
            this.playerVisual.setScale(1);
            this.tweens.add({ targets: this.playerVisual, scaleX: 1.4, scaleY: 0.6, duration: 120, yoyo: true, ease: 'Sine.easeOut' });

            if (this.player.y < this.lastPlatformY - 10) {
                this.comboCount++; this.comboTimer = 1500; this.lastPlatformY = this.player.y;
                if (this.comboCount >= 5) {
                    this.comboText.setText(`COMBO: ${this.comboCount}\nSUPER JUMP!`);
                    this.comboText.setColor('#ff00ff');
                    this.playerVisual.setFillStyle(0xff00ff);
                    this.trailEmitter.emitting = true;
                }
                else {
                    this.comboText.setText(`COMBO: ${this.comboCount}`);
                    this.comboText.setColor('#ffff00');
                }
            }
        }

        if (this.cursors.up.isDown && body.touching.down) {
            this.hasStarted = true;
            let jf = -650 - (200 * (Math.abs(body.velocity.x)/500));

            if (this.comboCount >= 5) {
                jf -= 300;
                zzfx(...sndCombo); // Sound: Super Jump
            } else {
                zzfx(...sndJump); // Sound: Normal Jump
            }
            body.setVelocityY(jf);

            this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 15, 8);
            this.tweens.killTweensOf(this.playerVisual);
            this.playerVisual.setScale(1);
            this.tweens.add({ targets: this.playerVisual, scaleX: 0.8, scaleY: 1.2, duration: 100, yoyo: true, ease: 'Quad.easeOut' });
        }

        if (!body.touching.down && this.comboCount >= 5) {
            this.playerVisual.rotation += (body.velocity.x > 0 ? 0.15 : -0.15);
        }

        this.wasTouchingDown = body.touching.down;

        if (this.hasStarted) {
            this.cameraY -= this.scrollSpeed;
            const target = this.player.y - 400;
            if (target < this.cameraY) this.cameraY = target;
            this.cameras.main.scrollY = this.cameraY;
            if (this.player.y > this.cameras.main.scrollY + 800) {
                zzfx(...sndOver); // Sound: Game Over
                this.scene.start('GameOverScene', { height: this.maxHeightReached, dataset: this.dataset, entityStats: this.entityStats, settings: this.settings });
            }
        }

        if (this.player.y < this.highestGeneratedY + 1000) this.generateTowerChunk(20);

        const currentHeight = Math.floor((this.startY - this.player.y) / 10);
        if (currentHeight > this.maxHeightReached) {
            this.maxHeightReached = currentHeight;
            this.hudHeightText.setText(`Height: ${this.maxHeightReached}m`);
        }

        const targetPhase = Math.floor(this.maxHeightReached / this.settings.phaseDist); // Load from settings
        if (targetPhase > this.currentPhase && this.currentPhase < this.entityStats.length - 1) {
            this.currentPhase = targetPhase;
            const unstableEntity = this.entityStats[this.currentPhase - 1].label;

            zzfx(...sndPhase); // Sound: Warning Phase

            this.unstableLabels.add(unstableEntity);
            this.cameras.main.shake(200, 0.01);
            const uiText = this.uiEntityTexts.get(unstableEntity);
            if (uiText) { uiText.setColor('#555555'); uiText.setText(`[X] ${unstableEntity}`); }
            this.platforms.getChildren().forEach((p: any) => { if (p.nerLabel === unstableEntity) p.setAlpha(0.3); });
            this.entityTextGroup.getChildren().forEach((t: any) => { if (t.nerLabel === unstableEntity) t.setAlpha(0.3); });
            this.scrollSpeed += this.settings.speedInc; // Load from settings
        }
    }
}
