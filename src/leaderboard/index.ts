import { leaderboardUrl } from './config';
import { LeaderboardClient } from './client';
import { Outbox } from './outbox';
import { PlayerStore, browserStorage } from './player';
import { Leaderboard } from './service';
import { BestScores } from './bests';

export { Leaderboard } from './service';

let instance: Leaderboard | undefined | null = null;

/** The game's leaderboard, or undefined when this build has no `VITE_LEADERBOARD_URL` (then the UI hides it). */
export function getLeaderboard(): Leaderboard | undefined {
    if (instance === null) {
        const url = leaderboardUrl();
        if (url === undefined) instance = undefined;
        else {
            const storage = browserStorage();
            instance = new Leaderboard(new LeaderboardClient(url), new PlayerStore(storage), new Outbox(storage), new BestScores(storage));
        }
    }
    return instance;
}
