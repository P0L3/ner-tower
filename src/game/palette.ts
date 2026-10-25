import * as Phaser from 'phaser';
import type { EntityStats } from '../data/types';
import { CLIRENER_PALETTE } from '../data/sources/clirener-palette';

/**
 * CliReNER ontology colors, now owned by the dataset sources (data/sources/clirener-palette.ts).
 * Kept as the default until the menu passes the chosen source's palette (next step).
 */
export const FIXED_COLORS = CLIRENER_PALETTE;

/** Fixed color if known, otherwise a golden-ratio hue sequence (deterministic per label order). */
export function buildColorMap(entityStats: EntityStats[]): Map<string, number> {
    const colorMap = new Map<string, number>();
    let hue = 0;
    const goldenRatio = 0.618033988749895;
    entityStats.forEach(stat => {
        if (FIXED_COLORS[stat.label]) colorMap.set(stat.label, FIXED_COLORS[stat.label]);
        else {
            hue = (hue + goldenRatio) % 1;
            colorMap.set(stat.label, Phaser.Display.Color.HSLToColor(hue, 0.6, 0.6).color);
        }
    });
    return colorMap;
}
