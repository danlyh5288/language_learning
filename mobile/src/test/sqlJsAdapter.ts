import { type Database, type SqlValue as SqlJsValue } from "sql.js";
import type { SqlValue, VocabDatabase } from "../data/types";

export async function createSqlJsAdapter(): Promise<SqlJsAdapter> {
  const initSqlJs = require("sql.js/dist/sql-asm.js") as typeof import("sql.js").default;
  const SQL = await initSqlJs();
  return new SqlJsAdapter(new SQL.Database());
}

export class SqlJsAdapter implements VocabDatabase {
  constructor(private readonly db: Database) {}

  async execAsync(sql: string): Promise<void> {
    this.db.run(sql);
  }

  async runAsync(sql: string, params: SqlValue[] = []): Promise<void> {
    const statement = this.db.prepare(sql);
    try {
      if (params.length > 0) {
        statement.bind(params as SqlJsValue[]);
      }
      statement.step();
    } finally {
      statement.free();
    }
  }

  async getAllAsync<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const statement = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      if (params.length > 0) {
        statement.bind(params as SqlJsValue[]);
      }
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
    } finally {
      statement.free();
    }
    return rows;
  }

  async getFirstAsync<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const rows = await this.getAllAsync<T>(sql, params);
    return rows[0] ?? null;
  }
}
