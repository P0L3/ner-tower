import { PHYSICS, HEIGHT_UNIT_PX } from '../config/ruleset';

/**
 * Phases: as the player climbs, entity labels turn unstable (fall-through) one by one, in the
 * order of `labelOrder` (easiest/most frequent first). The last label never turns unstable,
 * so a path always exists. The game and the tower generator share these functions.
 */

/** Height in meters of a world Y coordinate, same unit as the score. */
export function heightAtY(y: number): number {
    return (PHYSICS.playerStartY - y) / HEIGHT_UNIT_PX;
}

/** Phase for a height: one phase per `phaseDist` meters, capped at labelCount - 1. */
export function phaseAt(heightMeters: number, phaseDist: number, labelCount: number): number {
    const maxPhase = Math.max(0, labelCount - 1);
    const dist = phaseDist > 0 ? phaseDist : 1;
    return Math.min(maxPhase, Math.max(0, Math.floor(heightMeters / dist)));
}

/** Labels that are unstable in a phase: the first `phase` labels of the order. */
export function unstableLabelsAt(phase: number, labelOrder: readonly string[]): string[] {
    const count = Math.min(Math.max(0, phase), Math.max(0, labelOrder.length - 1));
    return labelOrder.slice(0, count);
}
