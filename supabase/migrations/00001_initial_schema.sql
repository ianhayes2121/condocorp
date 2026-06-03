-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS condocorps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS condocorp_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('platform_admin', 'condocorp_admin', 'board_member', 'homeowner', 'property_manager')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(condocorp_id, user_id)
);

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  floor integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unit_ownerships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ownership_type text NOT NULL CHECK (ownership_type IN ('owner', 'tenant', 'manager')),
  start_date date NOT NULL DEFAULT current_date,
  end_date date
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  title text NOT NULL,
  filename text NOT NULL,
  file_path text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('bylaw', 'declaration', 'rule', 'policy', 'faq', 'reserve_fund', 'meeting_minutes', 'other')),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'chunked', 'indexed', 'failed')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_number integer NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faqs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('condocorp_admin', 'board_member', 'homeowner', 'property_manager')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  condocorp_id uuid NOT NULL REFERENCES condocorps(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_memberships_user ON condocorp_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_condocorp ON condocorp_memberships(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_documents_condocorp ON documents(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_chunks_condocorp ON document_chunks(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_conversations_condocorp ON conversations(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_condocorp ON audit_logs(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_faqs_condocorp ON faqs(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_units_condocorp ON units(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_invitations_condocorp ON invitations(condocorp_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
