/**
 * Prints what a curated dataset needs for its Classic challenge, and checks that the fixed tower is sound.
 *
 *   npm run classic:pin            # every Hub dataset (needs network)
 *   npm run classic:pin -- clirener-gold
 *
 * For each source it downloads the data, prints the `classicHash` line to paste into the source file,
 * and builds the Classic tower with the real generator to report how climbable it is.
 */
import { HUB_SOURCES } from '../src/data/sources/index';
import { classicSeed, CLASSIC_PRESET } from '../src/config/classic';
import { shortContentHash } from '../src/config/settings';
import { profileEntities } from '../src/data/profile';
import { seededRandom } from '../src/core/rng';
import { TowerPlanner } from '../src/game/tower';
import { filterPlayable } from '../src/data/playable';

const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'));
const sources = HUB_SOURCES.filter(s => wanted.length === 0 || wanted.includes(s.id));
if (sources.length === 0) { console.error(`No such source. Known: ${HUB_SOURCES.map(s => s.id).join(', ')}`); process.exit(1); }

let problems = 0;
for (const src of sources) {
    console.log(`\n== ${src.title} (${src.datasetId})`);
    try {
        const { canonical, rowsRead } = await src.load({ onProgress: p => { if (p.phase === 'download') process.stdout.write(`\r   downloading ${p.loaded}/${p.total}`); } });
        process.stdout.write('\r' + ' '.repeat(40) + '\r');
        const hash = shortContentHash(canonical.contentHash);
        const data = filterPlayable(canonical.sentences);
        const order = profileEntities(data).map(s => s.label);
        const seed = classicSeed(src.datasetId);
        const planner = new TowerPlanner(data, seededRandom(seed), { labelOrder: order, phaseDist: CLASSIC_PRESET.phaseDist });
        const placed = Array.from({ length: 600 }, () => planner.next());
        const fallback = placed.filter(p => p.fallback).length;
        const maxPhase = Math.max(...placed.map(p => p.phase));

        console.log(`   ${rowsRead} rows read, ${data.length} playable sentences, ${order.length} labels`);
        console.log(`   classic seed ${seed}; first 600 sentences reach phase ${maxPhase} of ${order.length - 1}; best-effort fallbacks: ${fallback} (${(100 * fallback / placed.length).toFixed(1)}%)`);
        if (fallback / placed.length > 0.02) { problems++; console.log('   WARNING: more than 2% of placements needed the fallback; the Classic tower has unfair climbs.'); }
        if (src.classicHash === undefined) console.log(`   paste into the source file:   classicHash: '${hash}',`);
        else if (src.classicHash === hash) console.log(`   OK: classicHash '${hash}' matches the data.`);
        else { problems++; console.log(`   MISMATCH: the source pins '${src.classicHash}' but the data now hashes to '${hash}'. The Classic board is paused until you decide: keep the old one (data was damaged) or start a new board (update classicHash, which makes a new board).`); }
    } catch (e) {
        problems++;
        console.log(`   failed: ${e instanceof Error ? e.message : e}`);
    }
}
process.exit(problems > 0 ? 1 : 0);
