export type ChatHistoryMessage = {
  role: string;
  content: string;
};

/** Max prior turns to include in the LLM request (user + assistant pairs). */
export const CHAT_HISTORY_LIMIT = 10;

/**
 * Follow-ups are often short or use pronouns ("it", "they") and embed poorly
 * without the prior question and answer.
 */
export function looksLikeFollowUp(question: string, history: ChatHistoryMessage[]): boolean {
  if (history.length === 0) return false;

  const q = question.trim();
  const wordCount = q.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 14) return true;
  if (/^(what|can|how|who|when|where|why|is|are|do|does|did|could|would|should)\b/i.test(q)) {
    return true;
  }
  if (/\b(it|they|them|those|these|there|that|this)\b/i.test(q)) return true;

  return false;
}

/**
 * Build text to embed for vector search. Standalone questions pass through;
 * follow-ups combine the current question with recent user/assistant turns.
 */
export function buildRetrievalQuery(question: string, history: ChatHistoryMessage[]): string {
  if (history.length === 0) return question;

  const prior = history.filter(
    m => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0
  );
  if (prior.length === 0) return question;

  const lastUser = [...prior].reverse().find(m => m.role === 'user');
  const lastAssistant = [...prior].reverse().find(m => m.role === 'assistant');

  const parts: string[] = [];
  if (lastUser && lastUser.content.trim() !== question.trim()) {
    parts.push(lastUser.content.trim());
  }
  if (lastAssistant) {
    const summary = lastAssistant.content.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (summary) parts.push(summary);
  }
  parts.push(question.trim());

  return parts.join('\n');
}

export function toLlmHistoryMessages(
  history: ChatHistoryMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-CHAT_HISTORY_LIMIT)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
}
