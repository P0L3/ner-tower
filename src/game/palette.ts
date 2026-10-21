import * as Phaser from 'phaser';
import type { EntityStats } from '../data/types';

/**
 * CliReNER ontology colors. Moves into the per-dataset source definition in M3.
 */
export const FIXED_COLORS: Record<string, number> = {
    "Asset": 0xB06C23, "Body Part": 0x6ebe9e, "Body of Water": 0x068d96, "Chemical": 0x8426bf, "Disease": 0xf7300a, "Ecosystem": 0xabebc6, "Energy Source": 0xf7ef0a, "Field of Study": 0x262626, "Geographical Feature": 0xb36004, "Intellectual Artefact": 0xc903AB, "Location": 0xafa79e, "Mathematical Expression": 0xad26bf, "Measuring Device": 0xf7c80a, "Meteorological Phenomenon": 0x0ae7f7, "Method": 0xF759AB, "Natural Disaster": 0xf7750a, "Natural Phenomenon": 0x38bf26, "Organism": 0x6eba6a, "Organization": 0xb09223, "Other": 0xe9dff2, "Person": 0xb59297, "Physical Artefact": 0xB593AC, "Physical Phenomenon": 0xba26bf, "Policy": 0xB0A223, "Quantity": 0x949494, "Satellite": 0x101247, "System": 0x171200, "Time Period": 0x4d4d4d
};

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
