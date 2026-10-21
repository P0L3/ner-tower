import type { SentenceData } from '../data/types';
import { LAYOUT } from '../config/ruleset';
import { isValidSpan } from '../data/playable';

/** Axis-aligned box, top-left origin, in pixels. */
export interface Box { x: number; y: number; w: number; h: number; }

export interface TokenLayout {
    /** Text to display. Equals the token unless it was truncated to fit a line. */
    text: string;
    /** Top-left of the token, relative to the sentence's top-left origin. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Entity label if this token belongs to an entity span. */
    label?: string;
    /** Landing platform (entity tokens only), same coordinate space as x/y. */
    platform?: Box;
}

export interface SentenceLayout {
    tokens: TokenLayout[];
    /** Index of the last line (0 = single line). */
    lines: number;
    /** Total height of the sentence block in pixels. */
    height: number;
}

const ELLIPSIS = '\u2026';

/** Max characters a single token may occupy: longer tokens are truncated with an ellipsis. */
export const MAX_TOKEN_CHARS = Math.floor((LAYOUT.rightEdge - LAYOUT.marginX) / LAYOUT.charWidth);

/**
 * Label per token index. If spans overlap, the span listed first in `ner` wins.
 * Invalid spans (out of range, start > end) are ignored, same rule as `filterPlayable`.
 */
function labelsPerToken(sentence: SentenceData): (string | undefined)[] {
    const n = sentence.tokenized_text.length;
    const labels = new Array<string | undefined>(n).fill(undefined);
    for (const span of sentence.ner) {
        if (!isValidSpan(span, n)) continue;
        for (let i = span[0]; i <= span[1]; i++) {
            if (labels[i] === undefined) labels[i] = span[2];
        }
    }
    return labels;
}

/**
 * Pure, deterministic layout of one sentence. No Phaser, no fonts, no DOM:
 * the same sentence always yields the same geometry on every machine.
 */
export function layoutSentence(sentence: SentenceData): SentenceLayout {
    const { charWidth, textHeight, tokenGap, marginX, rightEdge, lineSpacing, platformPad } = LAYOUT;
    const labels = labelsPerToken(sentence);
    const tokens: TokenLayout[] = [];

    let x = marginX;
    let line = 0;

    for (let i = 0; i < sentence.tokenized_text.length; i++) {
        let text = sentence.tokenized_text[i];
        let chars = Array.from(text).length; // code points, not UTF-16 units
        if (chars > MAX_TOKEN_CHARS) {
            text = Array.from(text).slice(0, MAX_TOKEN_CHARS - 1).join('') + ELLIPSIS;
            chars = MAX_TOKEN_CHARS;
        }
        const width = chars * charWidth;

        if (x + width > rightEdge) { x = marginX; line++; }

        const y = line * lineSpacing;
        const token: TokenLayout = { text, x, y, width, height: textHeight };
        const label = labels[i];
        if (label !== undefined) {
            token.label = label;
            token.platform = {
                x: x - platformPad / 2,
                y: y - platformPad / 2,
                w: width + platformPad,
                h: textHeight + platformPad,
            };
        }
        tokens.push(token);
        x += width + tokenGap;
    }

    return { tokens, lines: line, height: (line + 1) * lineSpacing };
}
