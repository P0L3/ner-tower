import * as Phaser from 'phaser';
import type { SentenceData, EntityStats, EntitySpan } from './types';

// ==========================================
// 1. MAIN MENU SCENE
// ==========================================
class MainMenuScene extends Phaser.Scene {
    private promptText!: Phaser.GameObjects.Text;

    constructor() { super('MainMenuScene'); }

    create() {
        this.add.text(425, 200, 'NER TOWER', { fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.promptText = this.add.text(425, 400, 'Drag & Drop your dataset.json here', { fontSize: '24px', color: '#aaaaaa' }).setOrigin(0.5);

        const canvas = this.game.canvas;
        canvas.addEventListener('dragover', (e) => { e.preventDefault(); this.promptText.setColor('#00ff00'); this.promptText.setText('Release to load...'); });
        canvas.addEventListener('dragleave', (e) => { e.preventDefault(); this.promptText.setColor('#aaaaaa'); this.promptText.setText('Drag & Drop your dataset.json here'); });
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                this.readFile(e.dataTransfer.files[0]);
            }
        });
    }

    private readFile(file: File) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const dataset: SentenceData[] = JSON.parse(event.target?.result as string);
                this.profileData(dataset);
            } catch (error) {
                this.promptText.setColor('#ff0000');
                this.promptText.setText('Error: Invalid JSON format.');
            }
        };
        reader.readAsText(file);
    }

    private profileData(dataset: SentenceData[]) {
        const statsMap = new Map<string, { count: number, totalTokens: number }>();
        dataset.forEach(s => s.ner.forEach(e => {
            const label = e[2];
            const len = (e[1] - e[0]) + 1;
            if (!statsMap.has(label)) statsMap.set(label, { count: 0, totalTokens: 0 });
            const curr = statsMap.get(label)!;
            curr.count++; curr.totalTokens += len;
        }));
        const entityStats: EntityStats[] = [];
        statsMap.forEach((v, k) => entityStats.push({ label: k, frequency: v.count, avgLength: v.totalTokens/v.count, hardnessScore: 1000/(v.count * (v.totalTokens/v.count)) }));
        entityStats.sort((a, b) => a.hardnessScore - b.hardnessScore);
        this.scene.start('GameScene', { dataset, entityStats });
    }
}

// ==========================================
// 2. THE GAME SCENE
// ==========================================
class GameScene extends Phaser.Scene {
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];
    
    private player!: Phaser.GameObjects.Rectangle;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private platforms!: Phaser.Physics.Arcade.StaticGroup;
    private entityTextGroup!: Phaser.GameObjects.Group;

    private hudHeightText!: Phaser.GameObjects.Text;
    private uiEntityTexts = new Map<string, Phaser.GameObjects.Text>();
    private colorMap = new Map<string, number>();
    
    private readonly FIXED_COLORS: Record<string, number> = {
        "Asset": 0xB06C23, "Body Part": 0x6ebe9e, "Body of Water": 0x068d96, "Chemical": 0x8426bf, "Disease": 0xf7300a, "Ecosystem": 0xabebc6, "Energy Source": 0xf7ef0a, "Field of Study": 0x262626, "Geographical Feature": 0xb36004, "Intellectual Artefact": 0xc903AB, "Location": 0xafa79e, "Mathematical Expression": 0xad26bf, "Measuring Device": 0xf7c80a, "Meteorological Phenomenon": 0x0ae7f7, "Method": 0xF759AB, "Natural Disaster": 0xf7750a, "Natural Phenomenon": 0x38bf26, "Organism": 0x6eba6a, "Organization": 0xb09223, "Other": 0xe9dff2, "Person": 0xb59297, "Physical Artefact": 0xB593AC, "Physical Phenomenon": 0xba26bf, "Policy": 0xB0A223, "Quantity": 0x949494, "Satellite": 0x101247, "System": 0x171200, "Time Period": 0x4d4d4d
    };

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

    init(data: { dataset: SentenceData[], entityStats: EntityStats[] }) {
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
        // Reset all variables for a clean restart
        this.hasStarted = false;
        this.currentPhase = 0;
        this.unstableLabels.clear();
        this.maxHeightReached = 0;
        this.highestGeneratedY = 1800;
        this.cameraY = 1200; 
        this.scrollSpeed = 0.5;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.lastPlatformY = 1900;
        this.wasTouchingDown = false;
        this.uiEntityTexts.clear();
    }

    create() {
        this.physics.world.setBounds(0, -500000, 600, 502000); 
        this.cameras.main.setBounds(0, -500000, 850, 502000);
        this.cameras.main.scrollY = this.cameraY; // Start at the bottom

        this.platforms = this.physics.add.staticGroup();
        this.entityTextGroup = this.add.group();

        const ground = this.add.rectangle(300, 1980, 600, 40, 0x333333);
        this.platforms.add(ground);

        this.setupColors();
        this.generateTowerChunk(20);
        this.buildSideHUD();

        this.player = this.add.rectangle(300, this.startY, 30, 30, 0x00aaff);
        this.player.setDepth(10);
        this.physics.add.existing(this.player);
        
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        body.setBounce(0.8, 0); 
        body.setMaxVelocity(500, 1500); 
        body.setDragX(1000); 

        this.physics.add.collider(this.player, this.platforms, undefined, (player, platform: any) => {
            if (platform.nerLabel && !platform.isRevealed) {
                platform.isRevealed = true;
                platform.setFillStyle(this.colorMap.get(platform.nerLabel));
            }
            if (platform.nerLabel && this.unstableLabels.has(platform.nerLabel)) return false;
            return true; 
        }, this);

        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    private setupColors() {
        let hue = 0;
        const goldenRatio = 0.618033988749895;
        this.entityStats.forEach(stat => {
            if (this.FIXED_COLORS[stat.label]) this.colorMap.set(stat.label, this.FIXED_COLORS[stat.label]);
            else {
                hue = (hue + goldenRatio) % 1;
                this.colorMap.set(stat.label, Phaser.Display.Color.HSLToColor(hue, 0.6, 0.6).color);
            }
        });
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
            const sentence = this.dataset[Math.floor(Math.random() * this.dataset.length)];
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

    update(time: number, delta: number) {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (this.cursors.left.isDown) body.setAccelerationX(-1500);
        else if (this.cursors.right.isDown) body.setAccelerationX(1500);
        else body.setAccelerationX(0);

        if (this.comboTimer > 0) {
            this.comboTimer -= delta;
            if (this.comboTimer <= 0) { this.comboCount = 0; this.comboText.setText(''); this.player.setFillStyle(0x00aaff); }
        }

        if (body.touching.down && !this.wasTouchingDown) {
            this.player.rotation = 0;
            if (this.player.y < this.lastPlatformY - 10) {
                this.comboCount++; this.comboTimer = 1500; this.lastPlatformY = this.player.y;
                if (this.comboCount >= 5) { this.comboText.setText(`COMBO: ${this.comboCount}\nSUPER JUMP!`); this.comboText.setColor('#ff00ff'); this.player.setFillStyle(0xff00ff); }
                else { this.comboText.setText(`COMBO: ${this.comboCount}`); this.comboText.setColor('#ffff00'); }
            }
        }

        if (this.cursors.up.isDown && body.touching.down) {
            this.hasStarted = true;
            let jf = -650 - (200 * (Math.abs(body.velocity.x)/500));
            if (this.comboCount >= 5) jf -= 300;
            body.setVelocityY(jf);
        }

        if (!body.touching.down && this.comboCount >= 5) this.player.rotation += (body.velocity.x > 0 ? 0.15 : -0.15);
        this.wasTouchingDown = body.touching.down;

        if (this.hasStarted) {
            this.cameraY -= this.scrollSpeed;
            const target = this.player.y - 400;
            if (target < this.cameraY) this.cameraY = target;
            this.cameras.main.scrollY = this.cameraY;
            if (this.player.y > this.cameras.main.scrollY + 800) this.scene.start('GameOverScene', { height: this.maxHeightReached, dataset: this.dataset, entityStats: this.entityStats });
        }

        if (this.player.y < this.highestGeneratedY + 1000) this.generateTowerChunk(20);

        const currentHeight = Math.floor((this.startY - this.player.y) / 10);
        if (currentHeight > this.maxHeightReached) {
            this.maxHeightReached = currentHeight;
            this.hudHeightText.setText(`Height: ${this.maxHeightReached}m`);
        }

        const targetPhase = Math.floor(this.maxHeightReached / 100);
        if (targetPhase > this.currentPhase && this.currentPhase < this.entityStats.length - 1) {
            this.currentPhase = targetPhase;
            const unstableEntity = this.entityStats[this.currentPhase - 1].label;
            this.unstableLabels.add(unstableEntity);
            this.cameras.main.shake(200, 0.01);
            const uiText = this.uiEntityTexts.get(unstableEntity);
            if (uiText) { uiText.setColor('#555555'); uiText.setText(`[X] ${unstableEntity}`); }
            this.platforms.getChildren().forEach((p: any) => { if (p.nerLabel === unstableEntity) p.setAlpha(0.3); });
            this.entityTextGroup.getChildren().forEach((t: any) => { if (t.nerLabel === unstableEntity) t.setAlpha(0.3); });
            this.scrollSpeed += 0.15;
        }
    }
}

// ==========================================
// 3. GAME OVER SCENE
// ==========================================
class GameOverScene extends Phaser.Scene {
    private finalHeight = 0;
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];

    constructor() { super('GameOverScene'); }

    init(data: { height: number, dataset: SentenceData[], entityStats: EntityStats[] }) {
        this.finalHeight = data.height;
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
    }

    create() {
        this.add.text(425, 250, 'GAME OVER', { fontSize: '64px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(425, 330, `Score: ${this.finalHeight}m`, { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
        
        const restartMsg = this.add.text(425, 450, 'Press "R" to Restart\nPress "N" for New File', { fontSize: '24px', color: '#ffffff', align: 'center' }).setOrigin(0.5);
        
        // Listen for keys
        this.input.keyboard!.once('keydown-R', () => {
            this.scene.start('GameScene', { dataset: this.dataset, entityStats: this.entityStats });
        });

        this.input.keyboard!.once('keydown-N', () => {
            this.scene.start('MainMenuScene');
        });
    }
}

// ==========================================
// GAME CONFIGURATION
// ==========================================
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO, width: 850, height: 800, parent: 'game-container', backgroundColor: '#1a1a1a',
    physics: { default: 'arcade', arcade: { gravity: { y: 1200, x: 0 }, debug: false } },
    scene: [MainMenuScene, GameScene, GameOverScene] 
};
new Phaser.Game(config);