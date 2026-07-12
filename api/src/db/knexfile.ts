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
    connection: process.env['DATABASE_URL'],
    pool: {
      min: 2,
      max: 20,
    },
    migrations: {
      directory: './migrations',
      extension: 'ts',
    },
  },
};

export default config;
