const KEY = 'ner-tower:dataset';
const local = (): Storage | undefined => { try { return localStorage; } catch { return undefined; } };

/** The dataset the player chose last time (a source id), if any. */
export function loadSelectedDataset(storage: Pick<Storage, 'getItem'> | undefined = local()): string | undefined {
    try { return storage?.getItem(KEY) ?? undefined; } catch { return undefined; }
}

export function saveSelectedDataset(id: string, storage: Pick<Storage, 'setItem'> | undefined = local()): void {
    try { storage?.setItem(KEY, id); } catch { /* remembered for this session only */ }
}
