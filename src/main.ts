import * as Phaser from 'phaser';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { GameScene } from './game/scenes/GameScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { PHYSICS } from './config/ruleset';
import { GAME_WIDTH, GAME_HEIGHT } from './config/view';
import { LAYOUT_EVENT } from './ui/dom';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO, width: GAME_WIDTH, height: GAME_HEIGHT, parent: 'game-container', backgroundColor: '#1a1a1a',
    // The canvas keeps its 850x800 design resolution and is scaled to fit the window, centered.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: PHYSICS.gravityY, x: 0 }, debug: false } },
    scene: [MainMenuScene, GameScene, GameOverScene]
};

const game = new Phaser.Game(config);
// DOM overlays (menu, game over panel) follow the canvas: tell them when Phaser changed its size.
game.scale.on(Phaser.Scale.Events.RESIZE, () => window.dispatchEvent(new Event(LAYOUT_EVENT)));
