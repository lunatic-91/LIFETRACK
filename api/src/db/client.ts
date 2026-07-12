import Knex from 'knex';
import type { Knex as KnexType } from 'knex';
import IORedis from 'ioredis';

import knexConfig from './knexfile';

let knexInstance: KnexType | null = null;
let redisInstance: IORedis | null = null;

/**
 * Returns a lazy singleton Knex instance.
 * The environment is selected via NODE_ENV (defaults to 'development').
 */
export function getKnex(): KnexType {
  if (!knexInstance) {
    const env = process.env['NODE_ENV'] ?? 'development';
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
