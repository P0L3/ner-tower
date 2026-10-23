import * as Phaser from 'phaser';
import type { SentenceData } from '../../data/types';
import type { GameSettings } from '../../config/settings';
import { resumeAudio } from '../../core/audio';
import { profileEntities } from '../../data/profile';
import { loadDatasetText } from '../../data/load';
import { DatasetParseError } from '../../data/formats/index';

export class MainMenuScene extends Phaser.Scene {
    private promptText!: Phaser.GameObjects.Text;

    constructor() { super('MainMenuScene'); }

    create() {
        this.add.text(425, 120, 'NER TOWER', { fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.promptText = this.add.text(425, 200, 'Drag & Drop Dataset\n(JSON or CoNLL .txt)', { fontSize: '24px', color: '#aaaaaa', align: 'center', wordWrap: { width: 700 } }).setOrigin(0.5);

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
        resumeAudio();

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
            // 1. Detect format, parse and canonicalize (clear error messages on failure)
            let dataset: SentenceData[];
            let fileHash: string;
            try {
                const loaded = loadDatasetText(rawContent);
                dataset = loaded.canonical.sentences;
                fileHash = loaded.canonical.contentHash.slice(0, 16); // short form until the M4 share code
            } catch (err) {
                this.showError(err instanceof DatasetParseError ? `Error: ${err.message}` : 'Error: could not read this file.');
                return;
            }

            // 2. Read settings
            const seedInput = (document.getElementById('ner-seed') as HTMLInputElement).value.trim();

            let finalSettings: GameSettings = {
                datasetHash: fileHash,
                seed: Math.floor(Math.random() * 1000000),
                baseSpeed: parseFloat((document.getElementById('ner-base') as HTMLInputElement).value),
                speedInc: parseFloat((document.getElementById('ner-inc') as HTMLInputElement).value),
                phaseDist: parseFloat((document.getElementById('ner-phase') as HTMLInputElement).value)
            };

            // 4. Override if Seed pasted
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

            // 5. Cleanup UI and start
            const uiContainer = document.getElementById('ner-ui-container');
            if (uiContainer) uiContainer.style.display = 'none';

            this.startGame(dataset, finalSettings);
        };
        reader.readAsText(file);
    }

    private showError(msg: string) {
        const errEl = document.getElementById('ner-err');
        if (errEl) errEl.innerText = msg;
        this.promptText.setColor('#ff0000');
        this.promptText.setText(msg);
    }

    private startGame(dataset: SentenceData[], settings: GameSettings) {
        const entityStats = profileEntities(dataset);

        // Remove listeners before scene change to prevent duplicate events on reset
        const canvas = this.game.canvas;
        canvas.removeEventListener('dragover', this.handleDragOver);
        canvas.removeEventListener('dragleave', this.handleDragLeave);
        canvas.removeEventListener('drop', this.handleDrop);

        this.scene.start('GameScene', { dataset, entityStats, settings });
    }
}
