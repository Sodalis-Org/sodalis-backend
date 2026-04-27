BEGIN;

ALTER TABLE users
    ADD COLUMN harmony_score INTEGER NOT NULL DEFAULT 0 CHECK (harmony_score >= 0);

COMMIT;
