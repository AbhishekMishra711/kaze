import pg from 'pg';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import { env } from './env.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

export interface IDatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  getClient(): Promise<IDatabaseClient>;
  transaction<T>(fn: (client: IDatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isEmbedded(): boolean;
}

class PostgresDatabase implements IDatabase {
  private pool: pg.Pool | NeonPool;

  constructor(connectionString: string) {
    if (connectionString.includes('neon.tech')) {
      // Use Neon serverless WebSocket pool (bypasses ISP/firewall port 5432 blocks over port 443)
      this.pool = new NeonPool({ connectionString });
    } else {
      this.pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
    }
  }

  isEmbedded(): boolean {
    return false;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await (this.pool as any).query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
  }

  async getClient(): Promise<IDatabaseClient> {
    const client: any = await this.pool.connect();
    return {
      query: async <T = any>(sql: string, params?: any[]) => {
        const res = await client.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      },
      release: () => client.release()
    };
  }

  async transaction<T>(fn: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PGliteDatabase implements IDatabase {
  private pglite: PGlite;
  private txQueue: Promise<any> = Promise.resolve();

  constructor(dataDir?: string) {
    this.pglite = new PGlite(dataDir || path.resolve(process.cwd(), '.pgdata'));
  }

  isEmbedded(): boolean {
    return true;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.pglite.query(sql, params);
    return { rows: res.rows as T[], rowCount: res.rows.length };
  }

  async getClient(): Promise<IDatabaseClient> {
    return {
      query: async <T = any>(sql: string, params?: any[]) => {
        const res = await this.pglite.query(sql, params);
        return { rows: res.rows as T[], rowCount: res.rows.length };
      },
      release: () => {}
    };
  }

  async transaction<T>(fn: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const runInTx = async () => {
      return this.pglite.transaction(async (tx) => {
        const client: IDatabaseClient = {
          query: async <R = any>(sql: string, params?: any[]) => {
            const res = await tx.query(sql, params);
            return { rows: res.rows as R[], rowCount: res.rows.length };
          },
          release: () => {}
        };
        return await fn(client);
      });
    };

    const next = this.txQueue.then(runInTx, runInTx);
    this.txQueue = next;
    return next;
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}

export function createDatabase(): IDatabase {
  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') {
    console.log('[DB] Connecting to PostgreSQL Pool (Neon/Cloud)...');
    return new PostgresDatabase(env.DATABASE_URL);
  } else {
    console.log('[DB] Initializing Embedded WASM PostgreSQL Engine (.pgdata)...');
    return new PGliteDatabase();
  }
}

export const db = createDatabase();
