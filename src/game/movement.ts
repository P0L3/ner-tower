import { PHYSICS, CAMERA, HEIGHT_UNIT_PX } from '../config/ruleset';

/**
 * Gameplay rules that decide what a run is worth, as pure functions so the ruleset lock test
 * can pin them. GameScene calls these; do not re-implement the formulas there.
 */

/** Initial vertical velocity of a jump (negative = up). Faster horizontal speed jumps higher. */
export function jumpVelocity(velocityX: number, superJump: boolean): number {
    let v = PHYSICS.jumpVelocity - (PHYSICS.jumpSpeedBonus * (Math.abs(velocityX) / PHYSICS.maxVelocityX));
    if (superJump) v -= PHYSICS.superJumpBonus;
    return v;
}

/** Camera: scrolls up at `scrollSpeed` per frame and is pulled up when the player climbs. */
export function nextCameraY(cameraY: number, scrollSpeed: number, playerY: number): number {
    const scrolled = cameraY - scrollSpeed;
    const target = playerY - CAMERA.followOffsetY;
    return target < scrolled ? target : scrolled;
}

/** Score in meters for a player Y position. */
export function scoreAtY(playerY: number): number {
    return Math.floor((PHYSICS.playerStartY - playerY) / HEIGHT_UNIT_PX);
}

/** Game over: the player fell below the bottom edge of the view. */
export function hasFallenOut(playerY: number, cameraScrollY: number, viewHeight: number): boolean {
    return playerY > cameraScrollY + viewHeight;
}
