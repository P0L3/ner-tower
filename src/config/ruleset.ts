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

/** Physics and movement. Jump heights etc. decide which platforms are reachable. */
export const PHYSICS = {
    gravityY: 1200,
    worldWidth: 600,            // playable width; the HUD occupies x >= 600
    worldTop: -500000,
    worldHeight: 502000,
    playerSize: 30,
    playerStartX: 300,
    playerStartY: 1900,
    groundY: 1980,
    groundHeight: 40,
    maxVelocityX: 500,
    maxVelocityY: 1500,
    dragX: 1000,
    accelX: 1500,
    bounceX: 0.8,
    bounceY: 0,
    jumpVelocity: -650,
    jumpSpeedBonus: 200,        // extra jump velocity at full horizontal speed
    superJumpBonus: 300,        // extra jump velocity while the combo is active
} as const;

export const COMBO = {
    superJumpAt: 5,             // combo count that enables super jumps
    windowMs: 1500,             // time to land the next higher platform
    minRise: 10,                // a landing must be this much higher to count
} as const;

export const CAMERA = {
    startScrollY: 1200,
    followOffsetY: 400,         // camera keeps the player this far below the top edge
} as const;

/** Score: 1 height unit per this many pixels climbed. */
export const HEIGHT_UNIT_PX = 10;

/**
 * Height of a jump with initial upward speed v0 under Arcade physics' fixed-step integration
 * (v += g*dt, then y += v*dt, 60 steps per second). Pure, so REACH below follows PHYSICS.
 */
export function jumpApex(v0: number, gravity: number = PHYSICS.gravityY, stepsPerSecond = 60): number {
    if (!(gravity > 0) || !(v0 > 0)) return 0;
    const dt = 1 / stepsPerSecond;
    let v = -v0, y = 0, min = 0;
    while (v <= 0) { v += gravity * dt; y += v * dt; if (y < min) min = y; }
    return -min;
}

/**
 * Reachability rules for the generator. A platform is "reachable" if it is at most `maxRise`
 * above the highest platform the player can currently stand on (horizontal reach is generous
 * and not modeled: air time is >1 s, speed up to 500 px/s, world width 540 px).
 */
export const REACH = {
    /** Apex of a full-speed running jump (about 294 px with the current physics). */
    runningApex: jumpApex(-PHYSICS.jumpVelocity + PHYSICS.jumpSpeedBonus),
    /**
     * Safety factor on the running apex (~11.5% headroom). Note: rises at the default gap fall on
     * a lattice of 155 + 35k px (line spacing 35, gap 120), and 260 is one of its points, so a
     * limit just below 260 would compress many gaps by a pointless 2 px.
     */
    margin: 0.885,
    /** Largest allowed rise between consecutive stable platforms (about 260 px). */
    maxRise: Math.floor(jumpApex(-PHYSICS.jumpVelocity + PHYSICS.jumpSpeedBonus) * 0.885),
    /** Smallest vertical gap between sentences when the generator has to compress the tower. */
    minGap: 24,
    /** Candidate sentences tried per placement before taking the best-effort fallback. */
    maxDraws: 16,
} as const;

export const PHASE = {
    /**
     * Sentences are built for the phase the player will be in this many meters ABOVE the
     * sentence's bottom edge, so the tower ahead already survives the next label turning
     * unstable (covers sentence height and jumping across a phase boundary).
     */
    leadMeters: 30,
} as const;
