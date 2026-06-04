/** Top document chunks to retrieve per question. */
export const RAG_TOP_K = 5;

/**
 * Minimum similarity (1 - cosine distance) for a match to count as relevant context.
 * 0.5 was too strict — many on-topic questions scored 0.35–0.48 against real bylaws.
 */
export const RAG_MIN_SIMILARITY = 0.32;

export function hasRetrievalContext(
  topSimilarity: number | null | undefined,
  faqCount: number
): boolean {
  if (faqCount > 0) return true;
  return topSimilarity != null && topSimilarity >= RAG_MIN_SIMILARITY;
}
