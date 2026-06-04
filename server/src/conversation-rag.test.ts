import { describe, expect, it } from 'vitest';
import {
  buildRetrievalQuery,
  looksLikeFollowUp,
} from './conversation-rag.js';

describe('looksLikeFollowUp', () => {
  it('detects short follow-up questions', () => {
    const history = [
      { role: 'user', content: 'explain the common elements in simple terms' },
      { role: 'assistant', content: 'Common elements are shared parts of the property.' },
    ];
    expect(looksLikeFollowUp('what can we do with the common elements', history)).toBe(true);
    expect(looksLikeFollowUp('can anyone walk on a common element', history)).toBe(true);
  });

  it('does not treat standalone long questions as follow-ups', () => {
    expect(looksLikeFollowUp('Please provide a comprehensive overview of all parking rules and guest parking procedures for our building including fees and enforcement.', [])).toBe(false);
  });
});

describe('buildRetrievalQuery', () => {
  it('combines prior turns with the current question', () => {
    const history = [
      { role: 'user', content: 'explain the common elements in simple terms' },
      { role: 'assistant', content: 'Common elements are pipes, wires, and shared areas.' },
    ];
    const query = buildRetrievalQuery('what can we do with them', history);
    expect(query).toContain('common elements');
    expect(query).toContain('what can we do with them');
  });
});
