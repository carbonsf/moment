// In-memory Cloudflare D1 shim on node:sqlite (Node >= 22.5). Test-only.
// Supports prepare().bind().first/all/run/raw and batch() (one transaction).

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = fileURLToPath(new URL('../worker/schema.sql', import.meta.url));

/** @param {unknown[]} args */
function toSqlArgs(args) {
  return args.map((a) => {
    if (a === undefined) throw new TypeError('D1_TYPE_ERROR: undefined bind value');
    if (typeof a === 'boolean') return a ? 1 : 0;
    return a;
  });
}

const plain = (row) => (row ? { ...row } : row);

class Statement {
  /** @param {D1Shim} d1 @param {string} sql @param {unknown[]} [args] */
  constructor(d1, sql, args = []) {
    this.d1 = d1;
    this.sql = sql;
    this.args = args;
  }

  /** @param {...unknown} args */
  bind(...args) {
    return new Statement(this.d1, this.sql, toSqlArgs(args));
  }

  #stmt() {
    this.d1.queries.push(this.sql);
    return this.d1.db.prepare(this.sql);
  }

  /** @param {string} [col] */
  async first(col) {
    const row = plain(this.#stmt().get(...this.args));
    if (!row) return null;
    return col ? (col in row ? row[col] : null) : row;
  }

  async all() {
    return this._allSync();
  }

  _allSync() {
    const results = this.#stmt().all(...this.args).map(plain);
    const changes = this.d1.db.prepare('SELECT changes() AS c').get().c;
    return { success: true, results, meta: { changes } };
  }

  async run() {
    const r = this.#stmt().run(...this.args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }

  async raw() {
    return this.#stmt().all(...this.args).map((r) => Object.values(r));
  }
}

export class D1Shim {
  /** @param {string} [schemaSql] */
  constructor(schemaSql = readFileSync(SCHEMA, 'utf8')) {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(schemaSql);
    /** @type {string[]} every SQL executed, for assertions */
    this.queries = [];
  }

  /** @param {string} sql */
  prepare(sql) {
    return new Statement(this, sql);
  }

  /** @param {Statement[]} stmts */
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => s._allSync());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** @param {string} sql */
  async exec(sql) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  /** Sync helper for test assertions. @param {string} sql @param {...unknown} args */
  rows(sql, ...args) {
    return this.db.prepare(sql).all(...toSqlArgs(args)).map(plain);
  }
}

/** @returns {D1Shim} */
export const createD1 = () => new D1Shim();
