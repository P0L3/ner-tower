import { hfBioSource } from './hfBio';
import { CLIRENER_PALETTE } from './clirener-palette';

/** CliReNER gold: 192 sentences annotated by 12 domain experts (CC BY 4.0). */
export const clirenerGold = hfBioSource({
    id: 'clirener-gold',
    title: 'CliReNER Gold',
    description: 'Climate-research sentences annotated by 12 domain experts: 28 entity types, 192 sentences.',
    license: 'CC BY 4.0',
    version: '1.1.28',
    repo: 'P0L3/CliReNER_v_1_1_28_GOLD',
    palette: CLIRENER_PALETTE,
    expectedRows: 192,
});
