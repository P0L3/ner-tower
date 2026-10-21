import * as Phaser from 'phaser';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { GameScene } from './game/scenes/GameScene';
import { GameOverScene } from './game/scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO, width: 850, height: 800, parent: 'game-container', backgroundColor: '#1a1a1a',
    physics: { default: 'arcade', arcade: { gravity: { y: 1200, x: 0 }, debug: false } },
    scene: [MainMenuScene, GameScene, GameOverScene]
};

new Phaser.Game(config);
