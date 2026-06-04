export type Role = 'platform_admin' | 'condocorp_admin' | 'board_member' | 'homeowner' | 'property_manager';
export type MembershipStatus = 'active' | 'inactive' | 'pending';
export type CondoCorpStatus = 'active' | 'suspended' | 'pending';
export type DocumentType = 'bylaw' | 'declaration' | 'rule' | 'policy' | 'faq' | 'reserve_fund' | 'meeting_minutes' | 'other';
export type DocumentStatus = 'uploaded' | 'processing' | 'chunked' | 'indexed' | 'failed';
export type OwnershipType = 'owner' | 'tenant' | 'manager';
export type MessageRole = 'user' | 'assistant';

export interface CondoCorp {
  id: string;
  name: string;
  address: string;
  status: CondoCorpStatus;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

export interface CondoCorpMembership {
  id: string;
  condocorp_id: string;
  user_id: string;
  role: Role;
  status: MembershipStatus;
  created_at: string;
  condocorps?: CondoCorp;
  users?: User;
}

export interface Unit {
  id: string;
  condocorp_id: string;
  unit_number: string;
  floor: number;
  created_at: string;
}

export interface UnitOwnership {
  id: string;
  unit_id: string;
  user_id: string;
  ownership_type: OwnershipType;
  start_date: string;
  end_date: string | null;
}

export interface Document {
  id: string;
  condocorp_id: string;
  title: string;
  filename: string;
  file_path: string;
  document_type: DocumentType;
  status: DocumentStatus;
  uploaded_by: string;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  condocorp_id: string;
  document_id: string;
  chunk_number: number;
  chunk_text: string;
  embedding: number[] | null;
  created_at: string;
}

export interface FAQ {
  id: string;
  condocorp_id: string;
  question: string;
  answer: string;
  created_at: string;
}

export interface QuestionPreset {
  id: string;
  text: string;
  sort_order: number;
}

export interface Conversation {
  id: string;
  condocorp_id: string;
  user_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  sources?: SourceCitation[];
  created_at: string;
}

export interface SourceCitation {
  document_title: string;
  chunk_text: string;
  chunk_number: number;
  similarity: number;
}

export interface AuditLog {
  id: string;
  condocorp_id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}
