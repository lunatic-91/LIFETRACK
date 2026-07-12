import type { Knex } from 'knex';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env['DATABASE_URL'] ?? {
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      database: process.env['DB_NAME'] ?? 'lifetrack_dev',
      user: process.env['DB_USER'] ?? 'lifetrack',
      password: process.env['DB_PASSWORD'] ?? 'lifetrack_dev',
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
      extension: 'ts',
    },
  },
  test: {
    client: 'pg',
    connection: process.env['TEST_DB_URL'] ?? {
      host: process.env['TEST_DB_HOST'] ?? 'localhost',
      port: Number(process.env['TEST_DB_PORT'] ?? 5432),
      database: process.env['TEST_DB_NAME'] ?? 'lifetrack_test',
      user: process.env['TEST_DB_USER'] ?? 'lifetrack',
      password: process.env['TEST_DB_PASSWORD'] ?? 'lifetrack_dev',
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './seeds',
      extension: 'ts',
    },
  },
  production: {
    client: 'pg',
    // Validated lazily in getKnex() (db/client.ts) so simply importing this
    // file (e.g. in tests that never select the 'production' config) can't
    // throw just because DATABASE_URL isn't set in that environment.
    connection: process.env['DATABASE_URL'] ?? '',
    // Kept small on purpose: API and Postgres each run on a 1 OCPU / 1GB
    // Oracle Free Tier VM, so every open connection costs real memory.
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
  },
};

export default config;
