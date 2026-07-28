import Knex from 'knex';
import type { Knex as KnexType } from 'knex';
import IORedis from 'ioredis';
import pg from 'pg';

import knexConfig from './knexfile';

// node-pg parses SQL DATE columns (oid 1082) into JS Date objects by
// default. Every service in this codebase treats `local_date` as a plain
// 'YYYY-MM-DD' string (Set membership checks in streak calculation,
// `.slice(0, 10)` in exports, etc) — a JS Date silently breaks every one of
// those comparisons. Registering the raw string parser here fixes it once,
// for every query, instead of patching each call site.
pg.types.setTypeParser(1082 /* DATE */, (value: string) => value);

let knexInstance: KnexType | null = null;
let redisInstance: IORedis | null = null;

/**
 * Returns a lazy singleton Knex instance.
 * The environment is selected via NODE_ENV (defaults to 'development').
 */
export function getKnex(): KnexType {
  if (!knexInstance) {
    const env = process.env['NODE_ENV'] ?? 'development';
    if (env === 'production' && !process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL environment variable is required in production');
    }
    const config = knexConfig[env] ?? knexConfig['development'];
    knexInstance = Knex(config!);
  }
  return knexInstance;
}

/**
 * Returns a lazy singleton IORedis instance.
 * Connection URL can be set via REDIS_URL (defaults to localhost:6379).
 */
export function getRedis(): IORedis {
  if (!redisInstance) {
    const redisUrl = process.env['REDIS_URL'];
    redisInstance = redisUrl
      ? new IORedis(redisUrl, { lazyConnect: false })
      : new IORedis({
          host: process.env['REDIS_HOST'] ?? 'localhost',
          port: Number(process.env['REDIS_PORT'] ?? 6379),
          lazyConnect: false,
        });
  }
  return redisInstance;
}

/**
 * Resets the singletons — used in tests to inject mocks.
 * @internal
 */
export function _resetClients(): void {
  knexInstance = null;
  redisInstance = null;
}

/**
 * Overrides the Knex singleton — used in tests to inject a mock/test instance.
 * @internal
 */
export function _setKnex(instance: KnexType): void {
  knexInstance = instance;
}

/**
 * Overrides the Redis singleton — used in tests to inject a mock/test instance.
 * @internal
 */
export function _setRedis(instance: IORedis): void {
  redisInstance = instance;
}
