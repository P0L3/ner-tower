import initSqlJs from 'sql.js';
import schema from '../schema.sql?raw';
import type { D1Like, D1PreparedLike } from './handler';

/**
 * A D1 stand-in on real SQLite (sql.js, WASM, no native build), loaded with the real schema.sql,
 * so the tests exercise the actual SQL: the upsert, RETURNING, the rank counting and the indexes.
 */
export async function createTestDb(): Promise<D1Like & { exec(sql: string): Record<string, unknown>[] }> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(schema);

    const run = (sql: string, params: unknown[]): Record<string, unknown>[] => {
        const stmt = db.prepare(sql);
        try {
            stmt.bind(params as never[]);
            const rows: Record<string, unknown>[] = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
        } finally { stmt.free(); }
    };
    const wrap = (sql: string, params: unknown[] = []): D1PreparedLike => ({
        bind: (...values) => wrap(sql, values),
        all: async <T>() => ({ results: run(sql, params) as T[] }),
    });
    return {
        prepare: sql => wrap(sql),
        batch: async statements => { const out = []; for (const s of statements) out.push(await s.all()); return out as never; },
        exec: sql => run(sql, []),
    };
}
