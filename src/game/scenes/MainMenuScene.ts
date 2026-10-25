import * as Phaser from 'phaser';
import { profileEntities } from '../../data/profile';
import { SOURCES } from '../../data/sources/index';
import { createDefaultCache } from '../../data/cache';
import { mountMenu, type MenuHandle, type StartPayload } from '../../ui/menu';

/** Thin on purpose: the menu is a DOM overlay (src/ui/menu.ts); this scene only hosts it. */
export class MainMenuScene extends Phaser.Scene {
    private menu: MenuHandle | undefined;

    constructor() { super('MainMenuScene'); }

    create() {
        this.menu = mountMenu({
            canvas: this.game.canvas,
            sources: SOURCES,
            cache: createDefaultCache(),
            onStart: payload => this.startGame(payload),
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeMenu());
    }

    private closeMenu() {
        this.menu?.destroy();
        this.menu = undefined;
    }

    private startGame({ dataset, settings, palette }: StartPayload) {
        this.closeMenu();
        this.scene.start('GameScene', { dataset, entityStats: profileEntities(dataset), settings, palette });
    }
}
