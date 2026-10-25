import { describe, it, expect } from 'vitest';
import { encodeShareCode, decodeShareCode } from './shareCode';
import { sha256Hex } from '../core/hash';
import { RULESET_VERSION } from './ruleset';
import { LOCAL_DATASET_ID, SETTING_RANGES, SEED_MAX, type GameSettings } from './settings';

const s: GameSettings = { datasetId: 'P0L3/CliReNER_v_1_1_28_SILVER', contentHash: '0123456789abcdef', seed: 482913, baseSpeed: 0.5, speedInc: 0.15, phaseDist: 100 };
const GOLDEN = 'NT1-MXxQMEwzL0NsaVJlTkVSX3ZfMV8xXzI4X1NJTFZFUnwwMTIzNDU2Nzg5YWJjZGVmfDQ4MjkxM3w1MHwxNXwxMDB8NzEyYw';

/** Builds a code with a VALID checksum from raw fields, to reach the checks behind it. */
const forge = (fields: (string | number)[]) => {
    const body = fields.join('|');
    return 'NT1-' + btoa(`${body}|${sha256Hex(`ner-tower-code-v1|${body}`).slice(0, 4)}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fail = (code: string) => { const r = decodeShareCode(code); if (r.ok) throw new Error('expected a failure'); return r; };

describe('share code: encoding', () => {
    it('GOLDEN: the format of version 1 codes is fixed', () => {
        // If this fails you changed what existing codes mean. Bump SHARE_CODE_FORMAT (NT2) instead and keep reading NT1.
        expect(encodeShareCode(s)).toBe(GOLDEN);
        expect(decodeShareCode(GOLDEN)).toEqual({ ok: true, settings: s });
    });
    it('round-trips every corner of the allowed settings, local files and extreme seeds', () => {
        const r = SETTING_RANGES;
        for (const datasetId of ['org/name', 'conll2003', LOCAL_DATASET_ID]) {
            for (const seed of [0, 1, 999999, SEED_MAX]) {
                for (const baseSpeed of [r.baseSpeed.min, 0.3, r.baseSpeed.max]) for (const speedInc of [0, 0.15, 1]) for (const phaseDist of [50, 120, 500]) {
                    const x = { datasetId, contentHash: 'f'.repeat(16), seed, baseSpeed, speedInc, phaseDist };
                    expect(decodeShareCode(encodeShareCode(x))).toEqual({ ok: true, settings: x });
                }
            }
        }
    });
    it('is copy-paste safe: URL-safe alphabet, and whitespace or line breaks are ignored', () => {
        expect(GOLDEN).toMatch(/^NT1-[A-Za-z0-9_-]+$/);
        expect(decodeShareCode(`  ${GOLDEN.slice(0, 30)}\n${GOLDEN.slice(30)}  `).ok).toBe(true);
    });
    it('refuses to encode something that is not a configuration', () => {
        expect(() => encodeShareCode({ ...s, baseSpeed: 0.33 })).toThrow(/baseSpeed/);
        expect(() => encodeShareCode({ ...s, datasetId: 'a|b' })).toThrow();
    });
    it('ignores the display-only weekly label', () => {
        expect(encodeShareCode({ ...s, weekly: '2026-W43' })).toBe(GOLDEN);
    });
});

describe('share code: decoding errors', () => {
    it('empty and unrelated text', () => {
        expect(fail('   ').kind).toBe('empty');
        expect(fail('hello world').kind).toBe('format');
    });
    it('recognizes an old prototype code and says so', () => {
        const legacy = btoa('abcdef0123456789|424242|0.5|0.15|100');
        const e = fail(legacy);
        expect(e.kind).toBe('legacy');
        expect(e.error).toMatch(/old prototype/);
    });
    it('a newer code format asks for an update', () => {
        const e = fail(GOLDEN.replace('NT1-', 'NT2-'));
        expect(e).toMatchObject({ kind: 'version' });
        expect(e.error).toMatch(/format 2/);
    });
    it('damaged codes: truncated, altered, or not base64', () => {
        expect(fail(GOLDEN.slice(0, -6)).kind).toMatch(/checksum|format/);
        expect(fail('NT1-!!!!').kind).toBe('format');
        const tampered = forge([1, s.datasetId, s.contentHash, 482913, 50, 15, 100]).replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
        expect(['checksum', 'format']).toContain(fail(tampered).kind);
        // a valid payload with one digit changed but the old check value
        const body = `1|${s.datasetId}|${s.contentHash}|482914|50|15|100`;
        const old = sha256Hex(`ner-tower-code-v1|1|${s.datasetId}|${s.contentHash}|482913|50|15|100`).slice(0, 4);
        expect(fail('NT1-' + btoa(`${body}|${old}`).replace(/=+$/, '')).kind).toBe('checksum');
    });
    it('a code from another ruleset is refused with a direction', () => {
        const newer = fail(encodeShareCode(s, RULESET_VERSION + 1));
        expect(newer).toMatchObject({ kind: 'ruleset' });
        expect(newer.error).toMatch(/newer version/);
        const older = fail(encodeShareCode(s, RULESET_VERSION - 1));
        expect(older).toMatchObject({ kind: 'ruleset' });
        expect(older.error).toMatch(/cannot be replayed/);
        expect(decodeShareCode(encodeShareCode(s, 7), 7).ok).toBe(true); // decoding is relative to the ruleset passed in
    });
    it('well-formed but out-of-bounds values are rejected, so boards cannot be forked by hand', () => {
        const fields = (over: Partial<Record<number, string | number>>) => {
            const f: (string | number)[] = [RULESET_VERSION, s.datasetId, s.contentHash, 482913, 50, 15, 100];
            for (const [i, v] of Object.entries(over)) f[Number(i)] = v!;
            return forge(f);
        };
        for (const bad of [{ 4: 33 }, { 4: 5 }, { 4: 999 }, { 5: 7 }, { 6: 45 }, { 6: 501 }, { 3: '4294967296' }, { 2: 'XYZ' }, { 1: 'bad id' }]) {
            expect(fail(fields(bad)).kind, JSON.stringify(bad)).toBe('settings');
        }
        expect(fail(fields({ 3: 'abc' })).kind).toBe('format');
    });
});
