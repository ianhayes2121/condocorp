-- Allow Google-only accounts and link Google identities
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text UNIQUE;
