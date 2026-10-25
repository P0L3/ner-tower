import { sha256Hex } from '../core/hash';
import { RULESET_VERSION } from './ruleset';
import { configFields } from './board';
import { settingsProblem, type GameSettings } from './settings';

/**
 * Share code: `NT1-` + base64url of `ruleset|datasetId|contentHash|seed|base|inc|phase|check`.
 *
 * - `NT1` is the FORMAT version of the code; a future layout becomes `NT2` and old codes keep working.
 * - `ruleset` is RULESET_VERSION at the time the run was made. A different ruleset builds a
 *   different tower for the same seed, so such codes are refused with an explanation.
 * - `base`/`inc` are speeds in whole hundredths, so no float formatting ever matters.
 * - `check` is 4 hex chars of SHA-256 over the rest, so typos and cut-off codes get a clear message.
 */
export const SHARE_CODE_FORMAT = 1;
const PREFIX = `NT${SHARE_CODE_FORMAT}-`;
const CHECK_TAG = `ner-tower-code-v${SHARE_CODE_FORMAT}`;
const FIELD_COUNT = 7;

export type ShareCodeErrorKind = 'empty' | 'legacy' | 'format' | 'version' | 'checksum' | 'ruleset' | 'settings';
export type ShareCodeResult = { ok: true; settings: GameSettings } | { ok: false; kind: ShareCodeErrorKind; error: string };

const b64urlEncode = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function b64urlDecode(s: string): string | undefined {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return undefined;
    try { return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); } catch { return undefined; }
}
const check = (body: string) => sha256Hex(`${CHECK_TAG}|${body}`).slice(0, 4);

/** Throws if the settings cannot be a configuration (a bug in the caller, not user input). */
export function encodeShareCode(s: GameSettings, rulesetVersion: number = RULESET_VERSION): string {
    const problem = settingsProblem(s);
    if (problem) throw new Error(`Cannot make a share code: ${problem}.`);
    const body = configFields(s, rulesetVersion).join('|');
    return PREFIX + b64urlEncode(`${body}|${check(body)}`);
}

const fail = (kind: ShareCodeErrorKind, error: string): ShareCodeResult => ({ ok: false, kind, error });

export function decodeShareCode(input: string, currentRuleset: number = RULESET_VERSION): ShareCodeResult {
    const text = input.replace(/\s+/g, '');
    if (text === '') return fail('empty', 'Paste a share code.');

    const prefix = /^NT(\d+)-/.exec(text);
    if (!prefix) {
        const old = b64urlDecode(text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
        if (old !== undefined && old.split('|').length === 5) {
            return fail('legacy', 'This is an old prototype share code. Those no longer work; finish a run to get a new one.');
        }
        return fail('format', 'This does not look like a NER Tower share code.');
    }
    if (Number(prefix[1]) !== SHARE_CODE_FORMAT) {
        return fail('version', `This share code uses format ${prefix[1]}, from a newer version of NER Tower. Update the game to replay it.`);
    }

    const payload = b64urlDecode(text.slice(prefix[0].length));
    const parts = payload?.split('|');
    if (payload === undefined || !/^[\x20-\x7e]*$/.test(payload) || parts!.length !== FIELD_COUNT + 1) {
        return fail('format', 'This share code is damaged or incomplete.');
    }
    const body = parts!.slice(0, FIELD_COUNT).join('|');
    if (check(body) !== parts![FIELD_COUNT]) return fail('checksum', 'This share code is damaged or incomplete. Copy it again.');

    const [ruleset, datasetId, contentHash, seed, base, inc, phase] = parts!;
    if (![ruleset, seed, base, inc, phase].every(n => /^\d{1,10}$/.test(n))) return fail('format', 'This share code is damaged or incomplete.');

    const rulesetVersion = Number(ruleset);
    if (rulesetVersion !== currentRuleset) {
        return fail('ruleset', rulesetVersion < currentRuleset
            ? `This run was made under ruleset ${rulesetVersion}, but this game plays ruleset ${currentRuleset}. The same seed builds a different tower now, so it cannot be replayed.`
            : `This run was made under ruleset ${rulesetVersion}, from a newer version of NER Tower than this one (ruleset ${currentRuleset}). Update the game to replay it.`);
    }

    const settings: GameSettings = {
        datasetId, contentHash, seed: Number(seed),
        baseSpeed: Number(base) / 100, speedInc: Number(inc) / 100, phaseDist: Number(phase),
    };
    const problem = settingsProblem(settings);
    if (problem) return fail('settings', `This share code is not valid (${problem}).`);
    return { ok: true, settings };
}
