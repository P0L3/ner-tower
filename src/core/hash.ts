/** Fast non-cryptographic string hash (FNV-1a, 32 bit). Replaced by SHA-256 in M3/M4. */
export function hashString(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}
