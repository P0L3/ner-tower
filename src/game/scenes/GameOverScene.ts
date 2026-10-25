import * as Phaser from 'phaser';
import type { SentenceData, EntityStats } from '../../data/types';
import type { GameSettings } from '../../config/settings';
import { encodeShareCode } from '../../config/shareCode';
import { randomSeed, withNewSeed } from '../../config/settings';
import { SOURCES } from '../../data/sources/index';
import { getLeaderboard } from '../../leaderboard/index';
import { mountGameOverPanel } from '../../ui/gameOverPanel';
import type { Palette } from '../palette';

export class GameOverScene extends Phaser.Scene {
    private finalHeight = 0;
    private dataset!: SentenceData[];
    private entityStats!: EntityStats[];
    private settings!: GameSettings;
    private palette: Palette | undefined;
    private panel: { destroy(): void } | undefined;

    constructor() { super('GameOverScene'); }

    init(data: { height: number, dataset: SentenceData[], entityStats: EntityStats[], settings: GameSettings, palette?: Palette }) {
        this.palette = data.palette;
        this.finalHeight = data.height;
        this.dataset = data.dataset;
        this.entityStats = data.entityStats;
        this.settings = data.settings;
    }

    create() {
        this.add.text(425, 55, 'GAME OVER', { fontSize: '52px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5);
        this.add.text(425, 110, `Score: ${this.finalHeight}m`, { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);
        if (this.settings.weekly) this.add.text(425, 145, `Weekly challenge ${this.settings.weekly}`, { fontSize: '18px', color: '#ffd24a' }).setOrigin(0.5);

        const code = encodeShareCode(this.settings);
        const shareCodeText = this.add.text(425, 215, `Share Code (Click to Copy):\n\n${code}`, {
            fontSize: '14px', color: '#00ffff', align: 'center', backgroundColor: '#222', padding: { x: 10, y: 10 },
            wordWrap: { width: 740, useAdvancedWrap: true }, // share codes are ~100 characters, with no spaces to wrap at
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        shareCodeText.on('pointerdown', () => {
            navigator.clipboard.writeText(code).then(() => {
                shareCodeText.setColor('#00ff00');
                shareCodeText.setText('Share Code (Click to Copy):\n\nCOPIED TO CLIPBOARD!');
            });
        });

        this.add.text(425, 735, 'R: restart with the same seed    S: new seed, same settings    N: menu', { fontSize: '16px', color: '#ffffff', align: 'center' }).setOrigin(0.5);

        // Leaderboard (only in builds that have a leaderboard URL): submit, then show the board.
        const leaderboard = getLeaderboard();
        if (leaderboard) {
            this.panel = mountGameOverPanel({
                canvas: this.game.canvas, leaderboard, settings: this.settings, score: this.finalHeight,
                datasetTitle: SOURCES.find(s => s.datasetId === this.settings.datasetId)?.title,
            });
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.panel?.destroy(); this.panel = undefined; });
        }

        this.input.keyboard!.once('keydown-R', () => {
            this.scene.start('GameScene', { dataset: this.dataset, entityStats: this.entityStats, settings: this.settings, palette: this.palette });
        });

        this.input.keyboard!.once('keydown-S', () => {
            this.scene.start('GameScene', { dataset: this.dataset, entityStats: this.entityStats, settings: withNewSeed(this.settings, randomSeed()), palette: this.palette });
        });

        this.input.keyboard!.once('keydown-N', () => {
            this.scene.start('MainMenuScene');
        });
    }
}
