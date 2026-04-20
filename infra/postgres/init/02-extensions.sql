-- Enable Postgres extensions required by wallet-portal.
-- Runs once on fresh volume initialisation (docker-entrypoint-initdb.d).

-- pgcrypto: gen_random_uuid(), crypt(), digest() used by auth + wallet tables
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_stat_statements: query performance monitoring (helpful for debugging)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
