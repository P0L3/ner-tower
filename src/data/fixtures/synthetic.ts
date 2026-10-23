import { seededRandom } from '../../core/rng';
import type { SentenceData } from '../types';

/**
 * Deterministic synthetic NER dataset for tests and the analyze tool: Zipf-distributed labels
 * (L0 most frequent), 8-40 tokens per sentence, 1-3 token entities.
 */
export function makeSyntheticDataset(sentences: number, labelCount: number, seed: number): SentenceData[] {
    const r = seededRandom(seed);
    const weights = Array.from({ length: labelCount }, (_, i) => 1 / (i + 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const pickLabel = () => {
        let x = r() * total;
        for (let i = 0; i < labelCount; i++) { x -= weights[i]; if (x <= 0) return 'L' + i; }
        return 'L' + (labelCount - 1);
    };
    const out: SentenceData[] = [];
    for (let k = 0; k < sentences; k++) {
        const len = 8 + Math.floor(r() * 33);
        const tokens = Array.from({ length: len }, () => 'x'.repeat(2 + Math.floor(r() * 9)));
        const ner: SentenceData['ner'] = [];
        let i = 0;
        while (i < len) {
            if (r() < 0.12) {
                const l = 1 + (r() < 0.35 ? 1 : 0) + (r() < 0.1 ? 1 : 0);
                const e = Math.min(len - 1, i + l - 1);
                ner.push([i, e, pickLabel()]);
                i = e + 2;
            } else i++;
        }
        out.push({ id: 's' + k, text: tokens.join(' '), tokenized_text: tokens, ner });
    }
    return out;
}
