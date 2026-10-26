import * as Phaser from 'phaser';
import type { SentenceData, EntityStats } from '../../data/types';
import type { GameSettings } from '../../config/settings';
import { PHYSICS, COMBO, CAMERA } from '../../config/ruleset';
import { seededRandom } from '../../core/rng';
import { playSound, resumeAudio, audioContext, sndJump, sndLand, sndCombo, sndPhase, sndOver } from '../../core/audio';
import { Composer, musicSeed } from '../../music/composer';
import { MusicPlayer } from '../../music/player';
import { loadMusicEnabled, saveMusicEnabled } from '../../music/prefs';
import { getVolumes } from '../../core/volume';
import { buildColorMap, type Palette } from '../palette';
import { TowerPlanner } from '../tower';
import { phaseAt, unstableLabelsAt } from '../phases';
import { jumpVelocity, nextCameraY, scoreAtY, hasFallenOut } from '../movement';
import { TowerStreamer } from '../streamer';
import { SentenceView, type PlatformRef } from '../SentenceView';

/** A landing makes a sound only after at least this long in the air (ground contact can flicker). */
const LAND_SOUND_MIN_AIR_MS = 90;

export class GameScene extends Phaser.Scene {
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];
    private settings!: GameSettings;
    private palette: Palette | undefined;
    private planner!: TowerPlanner;
    private labelOrder: string[] = [];
    private streamer!: TowerStreamer;
    private music: MusicPlayer | undefined;
    private musicText!: Phaser.GameObjects.Text;

    private player!: Phaser.GameObjects.Container;
    private playerVisual!: Phaser.GameObjects.Rectangle;
    private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private platforms!: Phaser.Physics.Arcade.StaticGroup;

    private hudHeightText!: Phaser.GameObjects.Text;
    private uiEntityTexts = new Map<string, Phaser.GameObjects.Text>();
    private colorMap = new Map<string, number>();

    private hasStarted = false;
    private currentPhase = 0;
    private unstableLabels = new Set<string>();
    private maxHeightReached = 0;
    private cameraY: number = CAMERA.startScrollY;
    private scrollSpeed = 0.5;

    private comboText!: Phaser.GameObjects.Text;
    private comboCount = 0;
    private comboTimer = 0;
    private lastPlatformY: number = PHYSICS.playerStartY;
    private wasTouchingDown = false;
    private airMs = 0;

    constructor() { super('GameScene'); }

    init(data: { dataset: SentenceData[], entityStats: EntityStats[], settings: GameSettings, palette?: Palette }) {
        this.dataset = data.dataset;
        this.palette = data.palette;
        this.entityStats = data.entityStats;
        this.settings = data.settings;
        this.labelOrder = this.entityStats.map(s => s.label);
        this.planner = new TowerPlanner(this.dataset, seededRandom(this.settings.seed), {
            labelOrder: this.labelOrder,
            phaseDist: this.settings.phaseDist,
        });

        this.hasStarted = false;
        this.currentPhase = 0;
        this.unstableLabels.clear();
        this.maxHeightReached = 0;
        this.cameraY = CAMERA.startScrollY;
        this.scrollSpeed = this.settings.baseSpeed; // Load from settings
        this.comboCount = 0;
        this.comboTimer = 0;
        this.lastPlatformY = PHYSICS.playerStartY;
        this.wasTouchingDown = false;
        this.airMs = 0;
        this.uiEntityTexts.clear();
    }

    create() {
        this.physics.world.setBounds(0, PHYSICS.worldTop, PHYSICS.worldWidth, PHYSICS.worldHeight);
        this.cameras.main.setBounds(0, PHYSICS.worldTop, 850, PHYSICS.worldHeight);
        this.cameras.main.scrollY = this.cameraY;

        this.platforms = this.physics.add.staticGroup();

        const ground = this.add.rectangle(PHYSICS.worldWidth / 2, PHYSICS.groundY, PHYSICS.worldWidth, PHYSICS.groundHeight, 0x333333);
        this.platforms.add(ground);

        this.colorMap = buildColorMap(this.entityStats, this.palette);

        // Tower: built lazily within a per-frame budget; the first screenful is built right now.
        this.streamer = new TowerStreamer(this.planner, placed => new SentenceView({
            scene: this,
            platforms: this.platforms,
            colorOf: label => this.colorMap.get(label) ?? 0x666666,
            isUnstable: label => this.unstableLabels.has(label),
        }, placed));
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.streamer.dispose());
        const cam = this.cameras.main;
        this.streamer.update(cam.scrollY, cam.scrollY + cam.height, Infinity);

        this.buildSideHUD();
        this.startMusic();

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

        this.playerVisual = this.add.rectangle(0, 0, PHYSICS.playerSize, PHYSICS.playerSize, 0x00aaff);
        this.player = this.add.container(PHYSICS.playerStartX, PHYSICS.playerStartY, [this.playerVisual]);
        this.player.setSize(PHYSICS.playerSize, PHYSICS.playerSize);
        this.player.setDepth(10);

        this.trailEmitter.startFollow(this.player, 0, PHYSICS.playerSize / 2);
        this.physics.add.existing(this.player);

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        body.setBounce(PHYSICS.bounceX, PHYSICS.bounceY);
        body.setMaxVelocity(PHYSICS.maxVelocityX, PHYSICS.maxVelocityY);
        body.setDragX(PHYSICS.dragX);

        this.physics.add.collider(this.player, this.platforms, undefined, (_player, platform: any) => {
            const ref = platform.getData?.('plat') as PlatformRef | undefined;
            if (!ref) return true; // ground
            ref.view.reveal(ref.tokenIndex);
            // Unstable entity types let the player fall through
            return !this.unstableLabels.has(ref.label);
        }, this);

        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    private buildSideHUD() {
        this.add.rectangle(600, 0, 250, 800, 0x222222).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
        this.add.rectangle(600, 0, 4, 800, 0x555555).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
        this.hudHeightText = this.add.text(620, 20, 'Height: 0m', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setScrollFactor(0).setDepth(101);
        this.comboText = this.add.text(620, 70, '', { fontSize: '28px', color: '#ffff00', fontStyle: 'bold' }).setScrollFactor(0).setDepth(101);
        this.add.text(620, 120, 'STABILITY LOG:', { fontSize: '18px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(101);

        // 28 labels would run off the bottom at 25 px each: squeeze the list to fit (display only)
        const rowH = Math.min(25, 600 / Math.max(1, this.entityStats.length));
        let textY = 150;
        this.entityStats.forEach(stat => {
            const hexColor = '#' + this.colorMap.get(stat.label)!.toString(16).padStart(6, '0');
            const txt = this.add.text(620, textY, `■ ${stat.label}`, { fontSize: '14px', color: hexColor }).setScrollFactor(0).setDepth(101);
            this.uiEntityTexts.set(stat.label, txt);
            textY += rowH;
        });

        this.musicText = this.add.text(620, 765, '', { fontSize: '14px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(101);
    }

    /**
     * Background music, composed from the dataset and seeded like the tower (see docs/MUSIC.md).
     * Cosmetic: it has its own RNG and never influences the tower or the score.
     */
    private startMusic() {
        resumeAudio();
        const { datasetId, contentHash, seed } = this.settings;
        const music = new MusicPlayer(audioContext, new Composer(this.dataset, musicSeed(datasetId, contentHash, seed)), { enabled: loadMusicEnabled(), volume: getVolumes().music });
        this.music = music;
        music.start();
        this.refreshMusicLabel();
        this.input.keyboard!.on('keydown-M', () => {
            music.setEnabled(!music.isEnabled);
            saveMusicEnabled(music.isEnabled);
            this.refreshMusicLabel();
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { music.stop(0.3); this.music = undefined; });
    }

    private refreshMusicLabel() {
        this.musicText.setText(`Music: ${this.music?.isEnabled ? 'on' : 'off'}  (M)`);
    }

    update(_time: number, delta: number) {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (this.cursors.left.isDown) body.setAccelerationX(-PHYSICS.accelX);
        else if (this.cursors.right.isDown) body.setAccelerationX(PHYSICS.accelX);
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

        const jumpsNow = this.cursors.up.isDown && body.touching.down; // holding Up: the landing is also a take-off
        if (!body.touching.down) this.airMs += delta;

        if (body.touching.down && !this.wasTouchingDown) {
            this.playerVisual.rotation = 0;

            // Sound: Land. Not when this frame is already a take-off (then only the jump is heard), and not for a contact flicker.
            if (!jumpsNow && this.airMs >= LAND_SOUND_MIN_AIR_MS) playSound(sndLand);

            this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 15, 10);
            this.tweens.killTweensOf(this.playerVisual);
            this.playerVisual.setScale(1);
            this.tweens.add({ targets: this.playerVisual, scaleX: 1.4, scaleY: 0.6, duration: 120, yoyo: true, ease: 'Sine.easeOut' });

            if (this.player.y < this.lastPlatformY - COMBO.minRise) {
                this.comboCount++; this.comboTimer = COMBO.windowMs; this.lastPlatformY = this.player.y;
                if (this.comboCount >= COMBO.superJumpAt) {
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

        if (body.touching.down) this.airMs = 0;

        if (jumpsNow) {
            this.hasStarted = true;
            const superJump = this.comboCount >= COMBO.superJumpAt;
            const jf = jumpVelocity(body.velocity.x, superJump);
            playSound(superJump ? sndCombo : sndJump); // Sound: Super Jump / Normal Jump
            body.setVelocityY(jf);

            this.dustEmitter.emitParticleAt(this.player.x, this.player.y + 15, 8);
            this.tweens.killTweensOf(this.playerVisual);
            this.playerVisual.setScale(1);
            this.tweens.add({ targets: this.playerVisual, scaleX: 0.8, scaleY: 1.2, duration: 100, yoyo: true, ease: 'Quad.easeOut' });
        }

        if (!body.touching.down && this.comboCount >= COMBO.superJumpAt) {
            this.playerVisual.rotation += (body.velocity.x > 0 ? 0.15 : -0.15);
        }

        this.wasTouchingDown = body.touching.down;

        const cam = this.cameras.main;
        if (this.hasStarted) {
            this.cameraY = nextCameraY(this.cameraY, this.scrollSpeed, this.player.y);
            cam.scrollY = this.cameraY;
            if (hasFallenOut(this.player.y, cam.scrollY, cam.height)) {
                playSound(sndOver); // Sound: Game Over
                this.scene.start('GameOverScene', { height: this.maxHeightReached, dataset: this.dataset, entityStats: this.entityStats, settings: this.settings, palette: this.palette });
            }
        }

        // Keep the tower built ahead of the camera (time-budgeted) and drop what is far below
        this.streamer.update(cam.scrollY, cam.scrollY + cam.height);

        const currentHeight = scoreAtY(this.player.y);
        if (currentHeight > this.maxHeightReached) {
            this.maxHeightReached = currentHeight;
            this.hudHeightText.setText(`Height: ${this.maxHeightReached}m`);
        }

        const phase = phaseAt(this.maxHeightReached, this.settings.phaseDist, this.labelOrder.length);
        if (phase > this.currentPhase) {
            const advanced = phase - this.currentPhase;
            this.currentPhase = phase;

            playSound(sndPhase); // Sound: Warning Phase
            this.cameras.main.shake(200, 0.01);

            // Turn EVERY label that is unstable at this phase (also covers skipped phases)
            for (const label of unstableLabelsAt(phase, this.labelOrder)) {
                if (this.unstableLabels.has(label)) continue;
                this.unstableLabels.add(label);
                const uiText = this.uiEntityTexts.get(label);
                if (uiText) { uiText.setColor('#555555'); uiText.setText(`[X] ${label}`); }
                this.streamer.refreshLabel(label); // dims those platforms in all live sentences
            }
            this.scrollSpeed += this.settings.speedInc * advanced; // Load from settings
            this.music?.setPhase(phase, this.unstableLabels); // lead notes of unstable labels fall silent, drums and tempo build
        }
    }
}
