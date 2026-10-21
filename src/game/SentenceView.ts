import * as Phaser from 'phaser';
import { LAYOUT, PHYSICS } from '../config/ruleset';
import type { PlacedSentence } from './tower';
import type { StreamedView } from './streamer';

/** What the view needs from the scene. */
export interface TowerContext {
    scene: Phaser.Scene;
    platforms: Phaser.Physics.Arcade.StaticGroup;
    colorOf(label: string): number;
    isUnstable(label: string): boolean;
}

/** Stored on each platform zone (`zone.getData('plat')`) so collisions can find their sentence. */
export interface PlatformRef {
    view: SentenceView;
    tokenIndex: number;
    label: string;
}

const UNREVEALED_FILL = '#666666';
const ENTITY_TEXT = '#ffffff';
const PLAIN_TEXT = '#444444';
const UNSTABLE_ALPHA = 0.3;

let textureCounter = 0; // unique across scene restarts, so texture keys never collide

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/**
 * One sentence = ONE canvas texture (text + platform backgrounds) + one invisible physics zone
 * per platform. Compared to one Text object per token this removes hundreds of canvas/texture
 * allocations per chunk, which was the cause of the freeze.
 */
export class SentenceView implements StreamedView {
    readonly placed: PlacedSentence;
    private readonly ctx: TowerContext;
    private readonly key: string;
    private readonly canvas: Phaser.Textures.CanvasTexture;
    private readonly image: Phaser.GameObjects.Image;
    private readonly zones: Phaser.GameObjects.Zone[] = [];
    private readonly labels = new Set<string>();
    private readonly revealed = new Set<number>();
    private readonly offsetY = LAYOUT.platformPad / 2; // platforms stick out above the first line

    constructor(ctx: TowerContext, placed: PlacedSentence) {
        this.ctx = ctx;
        this.placed = placed;
        this.key = `sentence-${textureCounter++}`;

        const height = Math.ceil(placed.layout.height + this.offsetY);
        const canvas = ctx.scene.textures.createCanvas(this.key, PHYSICS.worldWidth, height);
        if (!canvas) throw new Error(`Could not create canvas texture ${this.key}`);
        this.canvas = canvas;

        this.image = ctx.scene.add.image(0, placed.topY - this.offsetY, this.key).setOrigin(0, 0).setDepth(0);

        placed.layout.tokens.forEach((t, i) => {
            if (t.label === undefined || !t.platform) return;
            this.labels.add(t.label);
            const p = t.platform;
            const zone = ctx.scene.add.zone(p.x + p.w / 2, placed.topY + p.y + p.h / 2, p.w, p.h);
            ctx.platforms.add(zone); // creates the static body
            const body = zone.body as Phaser.Physics.Arcade.StaticBody;
            body.checkCollision.down = false; body.checkCollision.left = false; body.checkCollision.right = false;
            const ref: PlatformRef = { view: this, tokenIndex: i, label: t.label };
            zone.setData('plat', ref);
            this.zones.push(zone);
        });

        this.redraw();
    }

    hasLabel(label: string): boolean { return this.labels.has(label); }

    /** Repaints the whole sentence from current state (revealed platforms, unstable labels). */
    redraw(): void {
        const g = this.canvas.getContext();
        g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        g.font = `${LAYOUT.fontSize}px monospace`;
        g.textBaseline = 'middle';

        const tokens = this.placed.layout.tokens;
        const alphaOf = (label: string) => this.ctx.isUnstable(label) ? UNSTABLE_ALPHA : 1;

        // Platforms first, text on top
        tokens.forEach((t, i) => {
            if (t.label === undefined || !t.platform) return;
            g.globalAlpha = alphaOf(t.label);
            g.fillStyle = this.revealed.has(i) ? hex(this.ctx.colorOf(t.label)) : UNREVEALED_FILL;
            g.fillRect(t.platform.x, t.platform.y + this.offsetY, t.platform.w, t.platform.h);
        });
        for (const t of tokens) {
            g.globalAlpha = t.label !== undefined ? alphaOf(t.label) : 1;
            g.fillStyle = t.label !== undefined ? ENTITY_TEXT : PLAIN_TEXT;
            g.fillText(t.text, t.x, t.y + this.offsetY + t.height / 2);
        }
        g.globalAlpha = 1;
        this.canvas.refresh();
    }

    /** First landing on a platform: show its real color, with the white flash + bounce on top. */
    reveal(tokenIndex: number): void {
        if (this.revealed.has(tokenIndex)) return;
        this.revealed.add(tokenIndex);
        this.redraw(); // paints the final color underneath the flash

        const p = this.placed.layout.tokens[tokenIndex].platform!;
        const flash = this.ctx.scene.add
            .rectangle(p.x + p.w / 2, this.placed.topY + p.y + p.h / 2, p.w, p.h, 0xffffff)
            .setDepth(3);
        this.ctx.scene.tweens.add({
            targets: flash, scaleX: 1.1, scaleY: 1.1,
            duration: 150, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => flash.destroy(),
        });
    }

    destroy(sceneShutdown = false): void {
        if (!sceneShutdown) {
            for (const z of this.zones) this.ctx.platforms.remove(z, true, true); // also frees the body
            this.image.destroy();
        }
        this.ctx.scene.textures.remove(this.key);
    }
}
