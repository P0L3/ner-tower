import * as Phaser from 'phaser';
import type { SentenceData, EntityStats, EntitySpan } from './types';

// ==========================================
// 1. MAIN MENU SCENE
// ==========================================
class MainMenuScene extends Phaser.Scene {
    private promptText!: Phaser.GameObjects.Text;

    constructor() { super('MainMenuScene'); }

    create() {
        // Centered based on the new 850px width
        this.add.text(425, 200, 'NER TOWER', { fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.promptText = this.add.text(425, 400, 'Drag & Drop your dataset.json here', { fontSize: '24px', color: '#aaaaaa' }).setOrigin(0.5);

        const canvas = this.game.canvas;
        canvas.addEventListener('dragover', (e) => { e.preventDefault(); this.promptText.setColor('#00ff00'); this.promptText.setText('Release to load...'); });
        canvas.addEventListener('dragleave', (e) => { e.preventDefault(); this.promptText.setColor('#aaaaaa'); this.promptText.setText('Drag & Drop your dataset.json here'); });
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            this.promptText.setColor('#ffff00');
            this.promptText.setText('Processing...');
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

        dataset.forEach(sentence => {
            sentence.ner.forEach(entity => {
                const label = entity[2];
                const tokenLength = (entity[1] - entity[0]) + 1;
                if (!statsMap.has(label)) statsMap.set(label, { count: 0, totalTokens: 0 });
                const current = statsMap.get(label)!;
                current.count += 1;
                current.totalTokens += tokenLength;
            });
        });

        const entityStats: EntityStats[] =[];
        statsMap.forEach((data, label) => {
            const avgLength = data.totalTokens / data.count;
            entityStats.push({ label, frequency: data.count, avgLength, hardnessScore: 1000 / (data.count * avgLength) });
        });
        
        entityStats.sort((a, b) => a.hardnessScore - b.hardnessScore);

        this.promptText.setColor('#00ff00');
        this.promptText.setText(`Loaded! Starting Game...`);
        setTimeout(() => { this.scene.start('GameScene', { dataset, entityStats }); }, 1000);
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

    private hudHeightText!: Phaser.GameObjects.Text;
    private uiEntityTexts = new Map<string, Phaser.GameObjects.Text>();
    private colorMap = new Map<string, number>();
    private availableColors =[0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd, 0x8c564b, 0xe377c2, 0xbcbd22, 0x17becf];
    
    private currentPhase = 0;
    private unstableLabels = new Set<string>();
    private startY = 1900;
    private maxHeightReached = 0;
    private highestGeneratedY = 1800;

    // --- NEW CAMERA VARIABLES ---
    private cameraY = 1200; // Tracks the current "top" of our scrolling view
    private scrollSpeed = 0.5; // Baseline pixels per frame the camera moves up

    constructor() { super('GameScene'); }

    init(data: { dataset: SentenceData[], entityStats: EntityStats[] }) {
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
        // Reset variables for restart
        this.currentPhase = 0;
        this.unstableLabels.clear();
        this.maxHeightReached = 0;
        this.highestGeneratedY = 1800;
        this.cameraY = 1200; 
    }

    create() {
        this.physics.world.setBounds(0, -500000, 600, 502000); 
        this.cameras.main.setBounds(0, -500000, 850, 502000);

        this.platforms = this.physics.add.staticGroup();
        const ground = this.add.rectangle(300, 1980, 600, 40, 0x333333);
        this.platforms.add(ground);

        this.entityStats.forEach((stat, index) => {
            this.colorMap.set(stat.label, this.availableColors[index % this.availableColors.length]);
        });

        this.generateTowerChunk(20);
        this.buildSideHUD();

        this.player = this.add.rectangle(300, this.startY, 30, 30, 0x00aaff);
        this.player.setDepth(10);
        this.physics.add.existing(this.player);
        
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setCollideWorldBounds(true);
        body.setBounce(0.8, 0); 
        body.setMaxVelocity(400, 800);

        this.physics.add.collider(this.player, this.platforms, undefined, (player, platform: any) => {
            if (platform.nerLabel && !platform.isRevealed) {
                platform.isRevealed = true;
                platform.setFillStyle(this.colorMap.get(platform.nerLabel));
            }
            if (platform.nerLabel && this.unstableLabels.has(platform.nerLabel)) return false;
            return true; 
        }, this);

        // NOTICE: We removed startFollow here. We will handle camera in update().
        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    private buildSideHUD() {
        const uiBg = this.add.rectangle(600, 0, 250, 800, 0x222222).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
        const uiBorder = this.add.rectangle(600, 0, 4, 800, 0x555555).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
        this.hudHeightText = this.add.text(620, 20, 'Height: 0m', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setScrollFactor(0).setDepth(101);
        this.add.text(620, 70, 'STABILITY LOG:', { fontSize: '18px', color: '#aaaaaa' }).setScrollFactor(0).setDepth(101);

        let textY = 100;
        this.entityStats.forEach(stat => {
            const hexColor = '#' + this.colorMap.get(stat.label)!.toString(16).padStart(6, '0');
            const txt = this.add.text(620, textY, `■ ${stat.label}`, { fontSize: '14px', color: hexColor }).setScrollFactor(0).setDepth(101);
            this.uiEntityTexts.set(stat.label, txt);
            textY += 25;
        });
    }

    private generateTowerChunk(sentenceCount: number) {
        for (let i = 0; i < sentenceCount; i++) {
            const sentence = this.dataset[Math.floor(Math.random() * this.dataset.length)];
            const sentenceHeight = this.buildSentenceBlocks(sentence, this.highestGeneratedY);
            this.highestGeneratedY -= (sentenceHeight + 120);
        }
    }

    private buildSentenceBlocks(sentence: SentenceData, bottomY: number): number {
        const marginX = 30;
        const lineSpacing = 35;
        let currentX = marginX;
        let lines = 0;
        const measurer = this.add.text(-1000, -1000, '', { fontSize: '18px', fontFamily: 'monospace' });
        interface LayoutItem { token: string; x: number; y: number; width: number; height: number; entitySpan?: EntitySpan; }
        const layout: LayoutItem[] =[];
        for (let i = 0; i < sentence.tokenized_text.length; i++) {
            const token = sentence.tokenized_text[i];
            measurer.setText(token);
            if (currentX + measurer.width > 570) { currentX = marginX; lines++; }
            const span = sentence.ner.find(s => i >= s[0] && i <= s[1]);
            layout.push({ token, x: currentX, y: lines * lineSpacing, width: measurer.width, height: measurer.height, entitySpan: span });
            currentX += measurer.width + 6; 
        }
        measurer.destroy();
        const totalSentenceHeight = (lines + 1) * lineSpacing;
        const startY = bottomY - totalSentenceHeight; 
        for (const item of layout) {
            const drawX = item.x; const drawY = startY + item.y;
            if (item.entitySpan) {
                this.add.text(drawX, drawY, item.token, { fontSize: '18px', fontFamily: 'monospace', color: '#ffffff' }).setDepth(2);
                const plat = this.add.rectangle(drawX + (item.width / 2), drawY + (item.height / 2), item.width + 8, item.height + 8, 0x666666).setDepth(1);
                (plat as any).nerLabel = item.entitySpan[2];
                (plat as any).isRevealed = false;
                this.platforms.add(plat);
                const body = plat.body as Phaser.Physics.Arcade.Body;
                body.checkCollision.down = false; body.checkCollision.left = false; body.checkCollision.right = false;
            } else {
                this.add.text(drawX, drawY, item.token, { fontSize: '18px', fontFamily: 'monospace', color: '#444444' }).setDepth(0);
            }
        }
        return totalSentenceHeight;
    }

    update() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        const jumpForce = -700; 
        
        // Horizontal Movement
        if (this.cursors.left.isDown) body.setAccelerationX(-1000);
        else if (this.cursors.right.isDown) body.setAccelerationX(1000);
        else { body.setAccelerationX(0); body.setVelocityX(body.velocity.x * 0.9); }

        // Jump
        if (this.cursors.up.isDown && body.touching.down) body.setVelocityY(jumpForce);

        // --- STICKY CAMERA LOGIC (Only Moves Up) ---
        // 1. Automatic slow scroll up
        this.cameraY -= this.scrollSpeed;

        // 2. Follow player if they go higher than the middle of the screen
        const targetCameraY = this.player.y - 400;
        if (targetCameraY < this.cameraY) {
            this.cameraY = targetCameraY;
        }

        // Apply the sticky position to the camera
        this.cameras.main.scrollY = this.cameraY;

        // --- DEATH CONDITION (The Void) ---
        // Now that cameraY never moves down, this will trigger if you fall!
        if (this.player.y > this.cameras.main.scrollY + 800) {
            this.scene.start('GameOverScene', { height: this.maxHeightReached });
        }

        // --- INFINITE GENERATION ---
        if (this.player.y < this.highestGeneratedY + 1000) this.generateTowerChunk(20);

        // --- PROGRESSION & HUD ---
        const currentHeight = Math.floor((this.startY - this.player.y) / 10);
        if (currentHeight > this.maxHeightReached) {
            this.maxHeightReached = currentHeight;
            this.hudHeightText.setText(`Height: ${this.maxHeightReached}m`);
        }

        const targetPhase = Math.floor(this.maxHeightReached / 50);
        if (targetPhase > this.currentPhase && this.currentPhase < this.entityStats.length - 1) {
            this.currentPhase = targetPhase;
            const unstableEntity = this.entityStats[this.currentPhase - 1].label;
            this.unstableLabels.add(unstableEntity);
            this.cameras.main.shake(200, 0.01);
            const uiText = this.uiEntityTexts.get(unstableEntity);
            if (uiText) { uiText.setColor('#555555'); uiText.setText(`[X] ${unstableEntity}`); }
            
            // Increase scroll speed slightly as you get higher!
            this.scrollSpeed += 0.1;
        }
    }
}

// ==========================================
// 3. GAME OVER SCENE
// ==========================================
class GameOverScene extends Phaser.Scene {
    private finalHeight = 0;

    constructor() { super('GameOverScene'); }

    init(data: { height: number }) {
        this.finalHeight = data.height;
    }

    create() {
        this.add.text(425, 300, 'GAME OVER', { fontSize: '64px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(425, 400, `You climbed: ${this.finalHeight}m`, { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
        
        const restartText = this.add.text(425, 500, 'Click to Restart', { fontSize: '24px', color: '#00ff00' }).setOrigin(0.5);
        restartText.setInteractive();

        this.input.on('pointerdown', () => {
            // Send back to main menu to upload a new file, or auto-restart with same data
            // For now, let's just go to main menu
            this.scene.start('MainMenuScene');
        });
    }
}

// ==========================================
// GAME CONFIGURATION
// ==========================================
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 850, // Expanded width for the UI panel!
    height: 800,
    parent: 'game-container',
    backgroundColor: '#1a1a1a',
    physics: { default: 'arcade', arcade: { gravity: { y: 1200, x: 0 }, debug: false } },
    scene: [MainMenuScene, GameScene, GameOverScene] 
};

new Phaser.Game(config);