import type { EntityStats } from '../data/types';

/** Label -> 0xRRGGBB. Sources ship their own (see data/sources/clirener-palette.ts). */
export type Palette = Readonly<Record<string, number>>;

/** Standard HSL -> packed RGB (h, s, l in 0..1). Pure, so color assignment can be tested without Phaser. */
export function hslToRgb(h: number, s: number, l: number): number {
    const k = (n: number) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return (f(0) << 16) | (f(8) << 8) | f(4);
}

/**
 * Color per label: the dataset's own palette where it has one, otherwise a golden-ratio hue
 * sequence (deterministic per label order). Colors are cosmetic: they never affect the tower.
 */
export function buildColorMap(entityStats: EntityStats[], palette: Palette = {}): Map<string, number> {
    const colorMap = new Map<string, number>();
    let hue = 0;
    const goldenRatio = 0.618033988749895;
    for (const stat of entityStats) {
        const fixed = palette[stat.label];
        if (fixed !== undefined) colorMap.set(stat.label, fixed);
        else {
            hue = (hue + goldenRatio) % 1;
            colorMap.set(stat.label, hslToRgb(hue, 0.6, 0.6));
        }
    }
    return colorMap;
}
