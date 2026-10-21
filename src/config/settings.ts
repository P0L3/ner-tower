/** Global run settings. Becomes part of the versioned share code in M4. */
export interface GameSettings {
    datasetHash: string;
    seed: number;
    baseSpeed: number;
    speedInc: number;
    phaseDist: number;
}
