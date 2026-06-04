import { describe, expect, it } from 'vitest';
import { hasRetrievalContext, RAG_MIN_SIMILARITY } from './rag.js';

describe('hasRetrievalContext', () => {
  it('treats FAQs as relevant context', () => {
    expect(hasRetrievalContext(null, 1)).toBe(true);
    expect(hasRetrievalContext(0.1, 2)).toBe(true);
  });

  it('requires similarity at or above the minimum when there are no FAQs', () => {
    expect(hasRetrievalContext(RAG_MIN_SIMILARITY, 0)).toBe(true);
    expect(hasRetrievalContext(RAG_MIN_SIMILARITY - 0.01, 0)).toBe(false);
    expect(hasRetrievalContext(null, 0)).toBe(false);
  });
});
