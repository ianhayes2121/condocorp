ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS failure_reason text;
