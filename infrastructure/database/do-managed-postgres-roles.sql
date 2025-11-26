-- DigitalOcean Managed PostgreSQL: roles and privileges
-- Usage:
-- 1) Connect as admin (DO dashboard reset/superuser) to the target database (e.g., apex)
-- 2) Run this script once per cluster/database
-- 3) Store credentials securely (DO App Secrets; operator backup in KeePassXC or `pass`)

-- Create application role with least privilege
DO
$$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname = 'apex_app'
  ) THEN
    CREATE ROLE apex_app LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
  END IF;
END
$$;

-- Create admin role for migrations/maintenance
DO
$$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname = 'apex_admin'
  ) THEN
    CREATE ROLE apex_admin LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
  END IF;
END
$$;

-- Ensure extensions schema exists if needed
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION apex_admin;

-- Grant connect and usage
GRANT CONNECT ON DATABASE apex TO apex_app, apex_admin;
GRANT USAGE ON SCHEMA public TO apex_app;
GRANT USAGE ON SCHEMA public TO apex_admin;

-- Admin: full DDL/DML on public for migrations
GRANT ALL PRIVILEGES ON SCHEMA public TO apex_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO apex_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO apex_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO apex_admin;

-- App: read/write on tables; no DDL
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO apex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO apex_app;

-- Apply grants to existing objects
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apex_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apex_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO apex_app;

-- Enforce SSL (application side)
-- Note: DO Managed PostgreSQL enforces SSL at the server; applications must use sslmode=require in DATABASE_URL.

-- Optional: Lock down dangerous commands for apex_app
REVOKE CREATE ON SCHEMA public FROM apex_app;
REVOKE TEMPORARY ON DATABASE apex FROM apex_app;
