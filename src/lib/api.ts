const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setAuthToken(token: string | undefined | null): void {
  if (!token || token === 'undefined' || token === 'null') {
    throw new Error('Sign-in did not return a session token');
  }
  localStorage.setItem('token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('authUser');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? body.failure_reason ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; first_name: string; last_name: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string, first_name: string, last_name: string) =>
    request<{ token: string; user: { id: string; email: string; first_name: string; last_name: string } }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, first_name, last_name }),
    }),
  me: () =>
    request<{ id: string; email: string; first_name: string; last_name: string }>('/api/auth/me'),
  google: (credential: string, invite_email?: string) =>
    request<{ token: string; user: { id: string; email: string; first_name: string; last_name: string } }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential, invite_email }),
    }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  requestAccess: (data: {
    condocorp_name: string;
    condocorp_address: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    confirm_board_member: boolean;
    confirm_terms: boolean;
  }) =>
    request<{ token: string; user: { id: string; email: string; first_name: string; last_name: string } }>('/api/auth/request-access', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// CondoCorps
export const condocorps = {
  list: () =>
    request<Array<{ membership_id: string; role: string; membership_status: string; id: string; name: string; address: string; status: string; created_at: string }>>('/api/condocorps'),
  listAll: () =>
    request<Array<{ id: string; name: string; address: string; status: string; created_at: string }>>('/api/condocorps/all'),
  create: (name: string, address: string) =>
    request('/api/condocorps', { method: 'POST', body: JSON.stringify({ name, address }) }),
  update: (id: string, name: string, address: string) =>
    request(`/api/condocorps/${id}`, { method: 'PUT', body: JSON.stringify({ name, address }) }),
  updateStatus: (id: string, status: string) =>
    request(`/api/condocorps/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  stats: (id: string) =>
    request<{ totalDocuments: number; totalChunks: number; totalUsers: number; totalConversations: number; totalFaqs: number }>(`/api/condocorps/${id}/stats`),
  activity: (id: string) =>
    request<Array<{ id: string; action: string; details: Record<string, unknown>; created_at: string }>>(`/api/condocorps/${id}/activity`),
};

// Members
export const members = {
  list: (condocorpId: string) =>
    request<Array<{ id: string; role: string; status: string; created_at: string; user_id: string; email: string; first_name: string; last_name: string }>>(`/api/members/${condocorpId}`),
  invite: (condocorpId: string, email: string, role: string) =>
    request(`/api/members/${condocorpId}`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  remove: (condocorpId: string, membershipId: string) =>
    request(`/api/members/${condocorpId}/${membershipId}`, { method: 'PATCH' }),
};

// Documents
export const documents = {
  list: (condocorpId: string) =>
    request<Array<{ id: string; condocorp_id: string; title: string; filename: string; file_path: string; document_type: string; status: string; failure_reason: string | null; uploaded_by: string; created_at: string }>>(`/api/documents/${condocorpId}`),
  upload: async (condocorpId: string, file: File, title: string, documentType: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('document_type', documentType);
    const token = getToken();
    const res = await fetch(`${API_URL}/api/documents/${condocorpId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? body.failure_reason ?? 'Upload failed');
    }
    return res.json();
  },
  process: (condocorpId: string, documentId: string) =>
    request(`/api/documents/${condocorpId}/${documentId}/process`, { method: 'POST' }),
  file: async (condocorpId: string, documentId: string): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/documents/${condocorpId}/${documentId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error ?? 'Failed to load document');
    }
    return res.blob();
  },
  chunks: (condocorpId: string, documentId: string) =>
    request<Array<{ id: string; chunk_number: number; chunk_text: string; created_at: string }>>(`/api/documents/${condocorpId}/${documentId}/chunks`),
  delete: (condocorpId: string, documentId: string) =>
    request(`/api/documents/${condocorpId}/${documentId}`, { method: 'DELETE' }),
};

export const processDocument = documents.process;

// FAQs
export const faqs = {
  list: (condocorpId: string) =>
    request<Array<{ id: string; question: string; answer: string; created_at: string }>>(`/api/faqs/${condocorpId}`),
  create: (condocorpId: string, question: string, answer: string) =>
    request(`/api/faqs/${condocorpId}`, { method: 'POST', body: JSON.stringify({ question, answer }) }),
  update: (condocorpId: string, faqId: string, question: string, answer: string) =>
    request(`/api/faqs/${condocorpId}/${faqId}`, { method: 'PUT', body: JSON.stringify({ question, answer }) }),
  delete: (condocorpId: string, faqId: string) =>
    request(`/api/faqs/${condocorpId}/${faqId}`, { method: 'DELETE' }),
};

// Invitations
export const invitations = {
  list: (condocorpId: string) =>
    request<Array<{ id: string; email: string; role: string; status: string; created_at: string; expires_at: string; invited_by_first: string; invited_by_last: string }>>(`/api/invitations/${condocorpId}`),
};

// Platform LLM prompt (SuperAdmin)
export const platformLlmPrompt = {
  get: () =>
    request<{
      template: string;
      default_template: string;
      context_placeholder: string;
      question_placeholder: string;
      updated_at: string | null;
    }>('/api/platform/llm-prompt'),
  update: (template: string) =>
    request<{
      template: string;
      default_template: string;
      context_placeholder: string;
      question_placeholder: string;
      updated_at: string;
    }>('/api/platform/llm-prompt', {
      method: 'PUT',
      body: JSON.stringify({ template }),
    }),
};

// Question presets (Ask a Question suggested questions)
export const questionPresets = {
  listPlatform: () =>
    request<Array<{ id: string; text: string; sort_order: number }>>('/api/question-presets/platform'),
  updatePlatform: (texts: string[]) =>
    request<Array<{ id: string; text: string; sort_order: number }>>('/api/question-presets/platform', {
      method: 'PUT',
      body: JSON.stringify({ texts }),
    }),
  list: (condocorpId: string) =>
    request<{ source: 'platform' | 'condocorp'; presets: Array<{ id: string; text: string; sort_order: number }> }>(
      `/api/question-presets/${condocorpId}`
    ),
  manage: (condocorpId: string) =>
    request<{
      using_platform_defaults: boolean;
      presets: Array<{ id: string; text: string; sort_order: number }>;
      platform_presets: Array<{ id: string; text: string; sort_order: number }>;
    }>(`/api/question-presets/${condocorpId}/manage`),
  update: (condocorpId: string, texts: string[]) =>
    request<{ using_platform_defaults: boolean; presets: Array<{ id: string; text: string; sort_order: number }> }>(
      `/api/question-presets/${condocorpId}`,
      { method: 'PUT', body: JSON.stringify({ texts }) }
    ),
  reset: (condocorpId: string) =>
    request<{ using_platform_defaults: boolean; presets: Array<{ id: string; text: string; sort_order: number }> }>(
      `/api/question-presets/${condocorpId}`,
      { method: 'DELETE' }
    ),
};

// Chat
export const chat = {
  conversations: (condocorpId: string) =>
    request<Array<{ id: string; created_at: string }>>(`/api/chat/${condocorpId}/conversations`),
  createConversation: (condocorpId: string) =>
    request<{ id: string; condocorp_id: string; user_id: string; created_at: string }>(`/api/chat/${condocorpId}/conversations`, { method: 'POST' }),
  messages: (conversationId: string) =>
    request<Array<{ id: string; role: string; content: string; sources: unknown; created_at: string }>>(`/api/chat/conversations/${conversationId}/messages`),
  ask: (condocorpId: string, conversationId: string, question: string) =>
    request<{
      answer: string;
      sources: Array<{ document_title: string; chunk_text: string; chunk_number: number; similarity: number }>;
      message_id: string;
      cannot_answer?: boolean;
    }>(`/api/chat/${condocorpId}/ask`, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, question }),
    }),
};

// Support tickets
export const tickets = {
  list: (condocorpId: string) =>
    request<Array<SupportTicketRow>>(`/api/tickets/${condocorpId}`),
  get: (condocorpId: string, ticketId: string) =>
    request<{ ticket: SupportTicketRow; replies: SupportTicketReply[] }>(
      `/api/tickets/${condocorpId}/${ticketId}`
    ),
  create: (
    condocorpId: string,
    data: { subject: string; question: string; conversation_id?: string; message_id?: string }
  ) =>
    request<SupportTicketRow>(`/api/tickets/${condocorpId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  reply: (condocorpId: string, ticketId: string, content: string) =>
    request(`/api/tickets/${condocorpId}/${ticketId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  update: (
    condocorpId: string,
    ticketId: string,
    data: { status?: string; assigned_to?: string | null }
  ) =>
    request<SupportTicketRow>(`/api/tickets/${condocorpId}/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  close: (
    condocorpId: string,
    ticketId: string,
    data?: { add_to_knowledge?: boolean; kb_question?: string; kb_answer?: string }
  ) =>
    request<{
      ticket: SupportTicketRow;
      knowledge?: { faqId: string; documentId: string; chunksCreated: number };
      prompt_add_to_knowledge?: boolean;
    }>(`/api/tickets/${condocorpId}/${ticketId}/close`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),
};

export interface SupportTicketRow {
  id: string;
  condocorp_id: string;
  created_by: string;
  assigned_to: string | null;
  status: 'open' | 'in_progress' | 'closed';
  subject: string;
  question: string;
  conversation_id: string | null;
  message_id: string | null;
  knowledge_added: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  creator_email?: string;
  creator_first_name?: string;
  creator_last_name?: string;
  assignee_email?: string | null;
  assignee_first_name?: string | null;
  assignee_last_name?: string | null;
}

export interface SupportTicketReply {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
}
