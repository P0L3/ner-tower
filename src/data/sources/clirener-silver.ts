import { hfBioSource } from './hfBio';
import { CLIRENER_PALETTE } from './clirener-palette';

/** CliReNER silver: 1,027 author-annotated sentences from 50 climate-science papers (CC BY 4.0). */
export const clirenerSilver = hfBioSource({
    id: 'clirener-silver',
    title: 'CliReNER Silver',
    description: 'Climate-research sentences from 50 papers, annotated by the authors: 28 entity types, 1,027 sentences.',
    license: 'CC BY 4.0',
    version: '1.1.28',
    repo: 'P0L3/CliReNER_v_1_1_28_SILVER',
    palette: CLIRENER_PALETTE,
    classicHash: 'cd720abff1c377bc',
    // classicHash: run `npm run classic:pin`, paste the value here, and the Classic challenge is on.
    expectedRows: 1027,
});
