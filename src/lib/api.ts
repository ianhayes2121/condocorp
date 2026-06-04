const API_URL = import.meta.env.VITE_API_URL ?? '';

function getToken(): string | null {
  return localStorage.getItem('token');
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
    throw new Error(body.error ?? `Request failed: ${res.status}`);
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
    request<Array<{ id: string; condocorp_id: string; title: string; filename: string; file_path: string; document_type: string; status: string; uploaded_by: string; created_at: string }>>(`/api/documents/${condocorpId}`),
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
      throw new Error(body.error ?? 'Upload failed');
    }
    return res.json();
  },
  process: (condocorpId: string, documentId: string) =>
    request(`/api/documents/${condocorpId}/${documentId}/process`, { method: 'POST' }),
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
      updated_at: string | null;
    }>('/api/platform/llm-prompt'),
  update: (template: string) =>
    request<{
      template: string;
      default_template: string;
      context_placeholder: string;
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
    request<{ answer: string; sources: Array<{ document_title: string; chunk_text: string; chunk_number: number; similarity: number }>; message_id: string }>(`/api/chat/${condocorpId}/ask`, {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, question }),
    }),
};
