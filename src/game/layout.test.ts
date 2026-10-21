import { describe, it, expect } from 'vitest';
import { layoutSentence, MAX_TOKEN_CHARS } from './layout';
import { LAYOUT } from '../config/ruleset';
import { SAMPLE_SENTENCES } from '../data/fixtures/sample';
import type { SentenceData } from '../data/types';

const sent = (tokens: string[], ner: SentenceData['ner'] = []): SentenceData =>
    ({ text: tokens.join(' '), tokenized_text: tokens, ner });
const byId = (id: string) => SAMPLE_SENTENCES.find(s => s.id === id)!;

describe('layoutSentence', () => {
    it('places tokens left to right with a fixed gap and fixed glyph width', () => {
        const l = layoutSentence(sent(['ab', 'cde']));
        expect(l.tokens[0]).toMatchObject({ x: LAYOUT.marginX, y: 0, width: 2 * LAYOUT.charWidth });
        expect(l.tokens[1].x).toBe(LAYOUT.marginX + 2 * LAYOUT.charWidth + LAYOUT.tokenGap);
        expect(l.lines).toBe(0);
        expect(l.height).toBe(LAYOUT.lineSpacing);
    });

    it('wraps before a token that would cross the right edge', () => {
        const l = layoutSentence(byId('fx-3'));
        expect(l.lines).toBeGreaterThan(0);
        expect(l.height).toBe((l.lines + 1) * LAYOUT.lineSpacing);
        for (const t of l.tokens) {
            expect(t.x + t.width).toBeLessThanOrEqual(LAYOUT.rightEdge);
            expect(t.x).toBeGreaterThanOrEqual(LAYOUT.marginX);
        }
        // y only ever increases, in whole lines
        for (let i = 1; i < l.tokens.length; i++) {
            expect(l.tokens[i].y).toBeGreaterThanOrEqual(l.tokens[i - 1].y);
            expect(l.tokens[i].y % LAYOUT.lineSpacing).toBe(0);
        }
    });

    it('truncates over-long tokens with an ellipsis and never leaves an empty first line', () => {
        const l = layoutSentence(byId('fx-5'));
        const url = l.tokens[1];
        expect(Array.from(url.text)).toHaveLength(MAX_TOKEN_CHARS);
        expect(url.text.endsWith('\u2026')).toBe(true);
        expect(url.width).toBe(MAX_TOKEN_CHARS * LAYOUT.charWidth);
        expect(l.tokens[0].y).toBe(0);
        expect(url.x + url.width).toBeLessThanOrEqual(LAYOUT.rightEdge);
    });

    it('gives platforms only to entity tokens, sized from the token box', () => {
        const l = layoutSentence(byId('fx-1')); // Marie Curie studied radioactivity in Paris .
        expect(l.tokens.map(t => t.label)).toEqual(['PERSON', 'PERSON', undefined, undefined, undefined, 'LOCATION', undefined]);
        const t = l.tokens[0];
        expect(t.platform).toEqual({
            x: t.x - LAYOUT.platformPad / 2,
            y: t.y - LAYOUT.platformPad / 2,
            w: t.width + LAYOUT.platformPad,
            h: LAYOUT.textHeight + LAYOUT.platformPad,
        });
        expect(l.tokens[2].platform).toBeUndefined();
    });

    it('resolves overlapping spans in favor of the first listed span', () => {
        const l = layoutSentence(byId('fx-6')); // The New York City Marathon starts early .
        expect(l.tokens.map(t => t.label)).toEqual([undefined, 'LOCATION', 'LOCATION', 'LOCATION', 'EVENT', undefined, undefined, undefined]);
    });

    it('ignores invalid spans instead of clamping them', () => {
        const l = layoutSentence(byId('fx-7')); // Heavy rain fell .
        expect(l.tokens.map(t => t.label)).toEqual(['PHENOMENON', 'PHENOMENON', undefined, undefined]);
    });

    it('handles an empty sentence', () => {
        const l = layoutSentence(sent([]));
        expect(l.tokens).toEqual([]);
        expect(l.height).toBe(LAYOUT.lineSpacing);
    });

    it('is a pure function of the sentence', () => {
        expect(layoutSentence(byId('fx-10'))).toEqual(layoutSentence(byId('fx-10')));
    });
});
