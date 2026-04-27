-- ============================================================
-- Sodalis Domus — Tickets de Maintenance
-- PostgreSQL 17+
-- ============================================================

BEGIN;

-- ── Types ────────────────────────────────────────────────────
CREATE TYPE maintenance_category AS ENUM (
    'PLUMBING', 'ELECTRICITY', 'APPLIANCE', 'FURNITURE', 'INTERNET', 'OTHER'
);

CREATE TYPE maintenance_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TYPE maintenance_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- ── Maintenance Tickets ──────────────────────────────────────
CREATE TABLE maintenance_tickets (
    id          SERIAL       PRIMARY KEY,
    title       VARCHAR(200) NOT NULL CHECK (char_length(title) >= 1),
    description TEXT,
    category    maintenance_category NOT NULL,
    priority    maintenance_priority NOT NULL DEFAULT 'LOW',
    status      maintenance_status   NOT NULL DEFAULT 'OPEN',
    created_by  UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    assigned_to UUID         REFERENCES users(id)  ON DELETE SET NULL,
    coloc_id    UUID NOT NULL REFERENCES colocs(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX idx_maintenance_coloc_id ON maintenance_tickets (coloc_id);
CREATE INDEX idx_maintenance_status   ON maintenance_tickets (status);
CREATE INDEX idx_maintenance_priority ON maintenance_tickets (priority);

COMMIT;
