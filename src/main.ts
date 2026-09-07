import * as Phaser from 'phaser';
import type { SentenceData, EntityStats, EntitySpan, GameSettings } from './types';

// ==========================================
// UTILITIES: RNG, HASHING, & AUDIO
// ==========================================

// 1. Seeded Random Generator (Mulberry32)
function seededRandom(a: number) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// 2. Fast String Hashing (FNV-1a)
function hashString(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

// 3. ZzFX Micro-Synthesizer
// @ts-ignore
const zzfx=(...t)=>zzfxP(zzfxG(...t));const zzfxP=(...t)=>{let e=zzfxX.createBufferSource(),f=zzfxX.createBuffer(t.length,t[0].length,zzfxR);t.map((d,i)=>f.getChannelData(i).set(d)),e.buffer=f,e.connect(zzfxX.destination),e.start();return e};const zzfxG=(q=1,k=.05,c=220,e=0,t=0,u=.1,r=0,F=1,v=0,z=0,w=0,A=0,l=0,B=0,x=0,G=0,d=0,y=1,m=0,C=0)=>{let b=2*Math.PI,H=v*=500*b/zzfxR**2,I=(0<x?1:-1)*b/4,D=c*=(1+2*k*Math.random()-k)*b/zzfxR,Z=[],g=0,E=0,a=0,n=1,J=0,K=0,f=0,p,h;e=99+zzfxR*e;m*=zzfxR;t*=zzfxR;u*=zzfxR;d*=zzfxR;z*=500*b/zzfxR**3;x*=b/zzfxR;w*=b/zzfxR;A*=zzfxR;l=zzfxR*l|0;for(h=e+m+t+u+d|0;a<h;Z[a++]=f)++K%(100*G|0)||(f=r?1<r?2<r?3<r?Math.sin((g%b)**3):Math.max(Math.min(Math.tan(g),1),-1):1-(2*g/b%2+2)%2:1-4*Math.abs(Math.round(g/b)-g/b):Math.sin(g),f=(l?1-C+C*Math.sin(2*Math.PI*a/l):1)*(0<f?1:-1)*Math.abs(f)**F*q*zzfxV*(a<e?a/e:a<e+m?1-(a-e)/m*(1-y):a<e+m+t?y:a<h-d?(h-a-d)/u*y:0),f=d?f/2+(d>a?0:(a<h-d?1:(h-a)/d)*Z[a-d|0]/2):f),p=(c+=v+=z)*Math.sin(E*x-I),g+=p-p*B*(1-1E9*(Math.sin(a)+1)%2),E+=p-p*B*(1-1E9*(Math.sin(a)**2+1)%2),n&&++n>A&&(c+=w,D+=w,n=0),!l||++J%l||(c=D,v=H,n=n||1);return Z};const zzfxV=.3,zzfxR=44100;
// @ts-ignore
const zzfxX=new(window.AudioContext||window.webkitAudioContext);

// Sound Effect Presets
const sndJump = [1.2,,150,.01,.01,.08,1,1.1,-15,10,,,.02,,,,,,.5];
const sndLand = [1.5,,80,.02,.01,.05,1,1.4,10,,,,,,,,,,.5];
const sndCombo = [2.0,,500,.01,.05,.2,1,1.5,15,50,,,,,,,,.7];
const sndPhase = [1.5,,300,.1,.2,.3,3,1.5,-20,,,,,,,,,.5];
const sndOver = [2.5,,100,.1,.5,1,4,2.5,-30,20,,,,.1,,,,.8];


// ==========================================
// 1. MAIN MENU SCENE
// ==========================================
class MainMenuScene extends Phaser.Scene {
    private promptText!: Phaser.GameObjects.Text;

    constructor() { super('MainMenuScene'); }

    create() {
        this.add.text(425, 120, 'NER TOWER', { fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.promptText = this.add.text(425, 200, 'Drag & Drop Dataset\n(JSON or CoNLL .txt)', { fontSize: '24px', color: '#aaaaaa', align: 'center' }).setOrigin(0.5);

        this.createHTMLUI();

        const canvas = this.game.canvas;
        canvas.addEventListener('dragover', this.handleDragOver);
        canvas.addEventListener('dragleave', this.handleDragLeave);
        canvas.addEventListener('drop', this.handleDrop);
    }

    private handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        this.promptText.setColor('#00ff00');
        this.promptText.setText('Release to load...');
    };

    private handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        this.promptText.setColor('#aaaaaa');
        this.promptText.setText('Drag & Drop Dataset\n(JSON or CoNLL .txt)');
    };

    private handleDrop = (e: DragEvent) => {
        e.preventDefault();
        // Resume Audio Context on first interaction
        if (zzfxX.state === 'suspended') zzfxX.resume();

        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            this.readFile(e.dataTransfer.files[0]);
        }
    };

    private createHTMLUI() {
        let uiContainer = document.getElementById('ner-ui-container');
        if (!uiContainer) {
            uiContainer = document.createElement('div');
            uiContainer.id = 'ner-ui-container';
            uiContainer.style.position = 'absolute';
            uiContainer.style.top = '300px';
            uiContainer.style.left = '50%';
            uiContainer.style.transform = 'translateX(-50%)';
            uiContainer.style.zIndex = '10';
            uiContainer.style.display = 'flex';
            uiContainer.style.flexDirection = 'column';
            uiContainer.style.gap = '10px';
            uiContainer.style.color = '#fff';
            uiContainer.style.fontFamily = 'monospace';
            uiContainer.style.background = 'rgba(0,0,0,0.8)';
            uiContainer.style.padding = '20px';
            uiContainer.style.borderRadius = '8px';
            uiContainer.style.border = '2px solid #444';
            uiContainer.style.width = '350px';
            document.body.appendChild(uiContainer);
        }
        uiContainer.style.display = 'flex'; // Ensure visible on return to main menu

        uiContainer.innerHTML = `
            <div style="text-align: center; margin-bottom: 5px; font-weight: bold; color: #00ff00;">DIFFICULTY SETTINGS</div>
            <div style="display: flex; justify-content: space-between; gap: 10px;">
                <label>Base Speed:</label>
                <input type="range" id="ner-base" min="0.1" max="2.0" step="0.1" value="0.5">
                <span id="ner-base-val" style="width: 30px;">0.5</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 10px;">
                <label>Speed Inc:</label>
                <input type="range" id="ner-inc" min="0" max="1.0" step="0.05" value="0.15">
                <span id="ner-inc-val" style="width: 30px;">0.15</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 10px;">
                <label>Phase Dist:</label>
                <input type="range" id="ner-phase" min="50" max="500" step="10" value="100">
                <span id="ner-phase-val" style="width: 30px;">100m</span>
            </div>
            <hr style="width: 100%; border-color: #555; margin: 15px 0;">
            <div style="text-align: center; margin-bottom: 5px; font-weight: bold; color: #00aaff;">REPLAY FROM SEED</div>
            <input type="text" id="ner-seed" placeholder="Paste Share Code here..." style="width: 100%; box-sizing: border-box; padding: 5px; background: #222; color: #fff; border: 1px solid #555;">
            <div id="ner-err" style="color: #ff4444; font-size: 12px; margin-top: 5px; text-align: center; min-height: 15px;"></div>
        `;

        const updateVal = (id: string, valId: string, suffix: string = '') => {
            const el = document.getElementById(id) as HTMLInputElement;
            const valEl = document.getElementById(valId) as HTMLSpanElement;
            if(el && valEl) el.addEventListener('input', () => { valEl.innerText = el.value + suffix; });
        };
        updateVal('ner-base', 'ner-base-val');
        updateVal('ner-inc', 'ner-inc-val');
        updateVal('ner-phase', 'ner-phase-val', 'm');
    }

    private readFile(file: File) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const rawContent = event.target?.result as string;
            let dataset: SentenceData[] = [];
            
            // 1. Try parsing as JSON, fallback to CoNLL
            try {
                const parsed = JSON.parse(rawContent);
                if (Array.isArray(parsed)) dataset = parsed;
                else throw new Error("Not a JSON array");
            } catch (error) {
                dataset = this.parseCoNLL(rawContent);
                if (dataset.length === 0) {
                    this.showError('Error: Invalid JSON or CoNLL format.');
                    return;
                }
            }

            // 2. Hash dataset & Read settings
            const fileHash = hashString(rawContent);
            const seedInput = (document.getElementById('ner-seed') as HTMLInputElement).value.trim();
            
            let finalSettings: GameSettings = {
                datasetHash: fileHash,
                seed: Math.floor(Math.random() * 1000000),
                baseSpeed: parseFloat((document.getElementById('ner-base') as HTMLInputElement).value),
                speedInc: parseFloat((document.getElementById('ner-inc') as HTMLInputElement).value),
                phaseDist: parseFloat((document.getElementById('ner-phase') as HTMLInputElement).value)
            };

            // 3. Override if Seed pasted
            if (seedInput) {
                try {
                    const decoded = atob(seedInput);
                    const [dHash, dSeed, dBase, dInc, dPhase] = decoded.split('|');
                    if (dHash !== fileHash) {
                        this.showError('Hash mismatch! Wrong dataset for this seed.');
                        return;
                    }
                    finalSettings.seed = parseInt(dSeed, 10);
                    finalSettings.baseSpeed = parseFloat(dBase);
                    finalSettings.speedInc = parseFloat(dInc);
                    finalSettings.phaseDist = parseFloat(dPhase);
                } catch (e) {
                    this.showError('Invalid Share Code.');
                    return;
                }
            }

            // 4. Cleanup UI and start
            const uiContainer = document.getElementById('ner-ui-container');
            if (uiContainer) uiContainer.style.display = 'none';

            this.profileData(dataset, finalSettings);
        };
        reader.readAsText(file);
    }

    private showError(msg: string) {
        const errEl = document.getElementById('ner-err');
        if (errEl) errEl.innerText = msg;
        this.promptText.setColor('#ff0000');
        this.promptText.setText(msg);
    }

    private parseCoNLL(text: string): SentenceData[] {
        const lines = text.split('\n');
        const dataset: SentenceData[] = [];
        let currentTokens: string[] = [];
        let currentTags: string[] = [];

        const commitSentence = () => {
            if (currentTokens.length > 0) {
                const ner: EntitySpan[] = [];
                let start = -1, label = "";

                for (let i = 0; i < currentTags.length; i++) {
                    const tag = currentTags[i];
                    if (tag.startsWith('B-')) {
                        if (start !== -1) ner.push([start, i - 1, label]);
                        start = i; label = tag.substring(2);
                    } else if (tag.startsWith('I-')) {
                        if (start === -1) { start = i; label = tag.substring(2); }
                        else if (label !== tag.substring(2)) {
                            ner.push([start, i - 1, label]);
                            start = i; label = tag.substring(2);
                        }
                    } else {
                        if (start !== -1) { ner.push([start, i - 1, label]); start = -1; label = ""; }
                    }
                }
                if (start !== -1) ner.push([start, currentTags.length - 1, label]);
                dataset.push({ text: currentTokens.join(" "), tokenized_text: currentTokens, ner: ner });
                currentTokens = []; currentTags = [];
            }
        };

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('-DOCSTART-')) { commitSentence(); continue; }
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                currentTokens.push(parts[0]);
                currentTags.push(parts[parts.length - 1]);
            }
        }
        commitSentence();
        return dataset;
    }

    private profileData(dataset: SentenceData[], settings: GameSettings) {
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
        
        // Remove listeners before scene change to prevent duplicate events on reset
        const canvas = this.game.canvas;
        canvas.removeEventListener('dragover', this.handleDragOver);
        canvas.removeEventListener('dragleave', this.handleDragLeave);
        canvas.removeEventListener('drop', this.handleDrop);

        this.scene.start('GameScene', { dataset, entityStats, settings });
    }
}

// ==========================================
// 2. THE GAME SCENE
// ==========================================
class GameScene extends Phaser.Scene {
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

        this.setupColors();
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

        this.physics.add.collider(this.player, this.platforms, undefined, (player, platform: any) => {
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

    update(time: number, delta: number) {
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

// ==========================================
// 3. GAME OVER SCENE
// ==========================================
class GameOverScene extends Phaser.Scene {
    private finalHeight = 0;
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];
    private settings!: GameSettings;

    constructor() { super('GameOverScene'); }

    init(data: { height: number, dataset: SentenceData[], entityStats: EntityStats[], settings: GameSettings }) {
        this.finalHeight = data.height;
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
        this.settings = data.settings;
    }

    create() {
        this.add.text(425, 200, 'GAME OVER', { fontSize: '64px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(425, 280, `Score: ${this.finalHeight}m`, { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
        
        // Generate the shareable seed string
        const seedStr = btoa(`${this.settings.datasetHash}|${this.settings.seed}|${this.settings.baseSpeed}|${this.settings.speedInc}|${this.settings.phaseDist}`);
        
        const shareCodeText = this.add.text(425, 380, `Share Code (Click to Copy):\n\n${seedStr}`, { 
            fontSize: '18px', color: '#00ffff', align: 'center', backgroundColor: '#222', padding: {x: 10, y: 10} 
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        shareCodeText.on('pointerdown', () => {
            navigator.clipboard.writeText(seedStr).then(() => {
                shareCodeText.setColor('#00ff00');
                shareCodeText.setText(`Share Code (Click to Copy):\n\nCOPIED TO CLIPBOARD!`);
            });
        });

        this.add.text(425, 520, 'Press "R" to Restart\nPress "N" for New File', { fontSize: '24px', color: '#ffffff', align: 'center' }).setOrigin(0.5);
        
        this.input.keyboard!.once('keydown-R', () => {
            this.scene.start('GameScene', { dataset: this.dataset, entityStats: this.entityStats, settings: this.settings });
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