import type { Pool } from 'pg';

export const CANNOT_ANSWER_MESSAGE =
  "I don't have that information. Would you like me to create a support ticket?";

export const DEFAULT_LLM_PROMPT_TEMPLATE = `You are a condominium knowledge assistant.

Answer only using the supplied CondoCorp documentation.

Do not invent policies, fees, procedures, bylaws, or rules.

If the answer is unavailable in the provided documentation, respond with exactly:
"${CANNOT_ANSWER_MESSAGE}"

Context:
{{context}}`;

const LEGACY_CANNOT_ANSWER_PATTERNS = [
  'could not find information about that',
  'do not have that information',
];

export function isCannotAnswerResponse(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  if (normalized.includes(CANNOT_ANSWER_MESSAGE.toLowerCase())) return true;
  return LEGACY_CANNOT_ANSWER_PATTERNS.some(p => normalized.includes(p));
}

export function normalizeCannotAnswerResponse(answer: string, hasRelevantContext: boolean): string {
  if (hasRelevantContext && !isCannotAnswerResponse(answer)) return answer;
  if (!hasRelevantContext || isCannotAnswerResponse(answer)) return CANNOT_ANSWER_MESSAGE;
  return answer;
}

export const CONTEXT_PLACEHOLDER = '{{context}}';

export function buildSystemPrompt(template: string, contextBlock: string): string {
  return template.split(CONTEXT_PLACEHOLDER).join(contextBlock);
}

export async function getLlmPromptTemplate(db: Pool): Promise<string> {
  const result = await db.query(
    'SELECT template FROM platform_llm_prompt WHERE id = $1',
    ['default']
  );
  const template = result.rows[0]?.template;
  return typeof template === 'string' && template.trim().length > 0
    ? template
    : DEFAULT_LLM_PROMPT_TEMPLATE;
}
