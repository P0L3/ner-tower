/**
 * Base URL of the leaderboard Worker, from the build-time variable `VITE_LEADERBOARD_URL`.
 * Without a valid URL the whole leaderboard UI stays hidden and the game makes no requests.
 */
export function leaderboardUrl(env: Record<string, unknown> = import.meta.env): string | undefined {
    const raw = env.VITE_LEADERBOARD_URL;
    if (typeof raw !== 'string') return undefined;
    const url = raw.trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s/]+/.test(url) ? url : undefined;
}
