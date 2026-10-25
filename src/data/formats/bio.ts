import type { EntitySpan } from '../types';

/**
 * Decodes one sentence of BIO tags (`O`, `B-<label>`, `I-<label>`) into inclusive
 * `[start, end, label]` spans. Handles IOB2 and IOB1: an `I-` tag opens an entity when none is
 * open or when the label changes, and a `B-` tag always starts a new one. Labels may contain
 * spaces ("Body Part"), which is why this works on tag strings and not on whitespace-split text.
 * Anything that is not a `B-`/`I-` tag counts as outside.
 */
export function bioTagsToSpans(tags: readonly string[]): EntitySpan[] {
    const ner: EntitySpan[] = [];
    let start = -1, label = '';

    for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        if (tag.startsWith('B-')) {
            if (start !== -1) ner.push([start, i - 1, label]);
            start = i; label = tag.substring(2);
        } else if (tag.startsWith('I-')) {
            if (start === -1) { start = i; label = tag.substring(2); }
            else if (label !== tag.substring(2)) {
                ner.push([start, i - 1, label]);
                start = i; label = tag.substring(2);
            }
        } else {
            if (start !== -1) { ner.push([start, i - 1, label]); start = -1; label = ''; }
        }
    }
    if (start !== -1) ner.push([start, tags.length - 1, label]);
    return ner;
}
