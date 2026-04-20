-- Create application-level Postgres roles with appropriate permissions.
-- Runs once on fresh volume initialisation (docker-entrypoint-initdb.d).
-- In production these roles use strong random passwords from Secrets Manager.

-- admin_api_rw: read-write access for admin-api service
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_api_rw') THEN
    CREATE ROLE admin_api_rw WITH LOGIN PASSWORD 'admin_api_dev_pw';
  END IF;
END
$$;

-- wallet_engine_rw: read-write access scoped to deposit/transaction tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wallet_engine_rw') THEN
    CREATE ROLE wallet_engine_rw WITH LOGIN PASSWORD 'wallet_engine_dev_pw';
  END IF;
END
$$;

-- policy_engine_ro: read-only access for policy evaluation queries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'policy_engine_ro') THEN
    CREATE ROLE policy_engine_ro WITH LOGIN PASSWORD 'policy_engine_dev_pw';
  END IF;
END
$$;

-- Grant connect on wallet_portal database
GRANT CONNECT ON DATABASE wallet_portal TO admin_api_rw;
GRANT CONNECT ON DATABASE wallet_portal TO wallet_engine_rw;
GRANT CONNECT ON DATABASE wallet_portal TO policy_engine_ro;

-- Grant schema usage (public schema created by postgres default)
GRANT USAGE ON SCHEMA public TO admin_api_rw;
GRANT USAGE ON SCHEMA public TO wallet_engine_rw;
GRANT USAGE ON SCHEMA public TO policy_engine_ro;

-- admin_api_rw: full DML on all current + future tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO admin_api_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO admin_api_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO admin_api_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO admin_api_rw;

-- wallet_engine_rw: full DML on deposits + transactions tables only
-- (Broader grant here for dev; narrow in prod via row-level security)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wallet_engine_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wallet_engine_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wallet_engine_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO wallet_engine_rw;

-- policy_engine_ro: SELECT only
GRANT SELECT ON ALL TABLES IN SCHEMA public TO policy_engine_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO policy_engine_ro;
