import * as Phaser from 'phaser';
import type { SentenceData, EntityStats } from '../../data/types';
import type { GameSettings } from '../../config/settings';
import { encodeLegacyShareCode } from '../../config/legacyShareCode';
import type { Palette } from '../palette';

export class GameOverScene extends Phaser.Scene {
    private finalHeight = 0;
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];
    private settings!: GameSettings;
    private palette: Palette | undefined;

    constructor() { super('GameOverScene'); }

    init(data: { height: number, dataset: SentenceData[], entityStats: EntityStats[], settings: GameSettings, palette?: Palette }) {
        this.palette = data.palette;
        this.finalHeight = data.height;
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
        this.settings = data.settings;
    }

    create() {
        this.add.text(425, 200, 'GAME OVER', { fontSize: '64px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(425, 280, `Score: ${this.finalHeight}m`, { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);

        // Generate the shareable seed string
        const seedStr = encodeLegacyShareCode(this.settings);

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
            this.scene.start('GameScene', { dataset: this.dataset, entityStats: this.entityStats, settings: this.settings, palette: this.palette });
        });

        this.input.keyboard!.once('keydown-N', () => {
            this.scene.start('MainMenuScene');
        });
    }
}
