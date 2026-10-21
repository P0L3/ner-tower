/**
 * RULESET: every constant that influences what a seed produces.
 *
 * Changing anything in here (or in layout.ts / tower.ts logic) changes the tower for existing
 * seeds. Once the ruleset is frozen (milestone M2) such a change MUST bump RULESET_VERSION.
 *
 * 0 = not frozen yet; scores must not be ranked.
 */
export const RULESET_VERSION = 0;

/**
 * Token layout metrics in pixels. These are FIXED numbers, deliberately not measured from the
 * rendered font: the browser's `monospace` font differs per OS, and a seed must produce the
 * same geometry everywhere. 18px monospace fonts are ~10.8px wide, so 11 is a close fit.
 */
export const LAYOUT = {
    fontSize: 18,       // render hint only
    charWidth: 11,
    textHeight: 22,
    tokenGap: 6,        // space between tokens on a line
    marginX: 30,        // left margin of a sentence
    rightEdge: 570,     // tokens may not extend past this x
    lineSpacing: 35,    // vertical distance between wrapped lines
    platformPad: 8,     // platform is the token box grown by this much (total, both sides)
} as const;

export const TOWER = {
    firstBottomY: 1800, // bottom edge of the first sentence
    sentenceGap: 120,   // vertical gap between consecutive sentences
} as const;
