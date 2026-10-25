const KEY = 'ner-tower:music';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

const local = (): Storage | undefined => { try { return localStorage; } catch { return undefined; } };

/** Music is on unless the player turned it off. Storage can be blocked: then it is simply on. */
export function loadMusicEnabled(storage: Reader | undefined = local()): boolean {
    try { return storage?.getItem(KEY) !== 'off'; } catch { return true; }
}

export function saveMusicEnabled(on: boolean, storage: Writer | undefined = local()): void {
    try { storage?.setItem(KEY, on ? 'on' : 'off'); } catch { /* keep it for this session only */ }
}
