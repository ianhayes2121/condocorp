import type { Pool } from 'pg';

export const DEFAULT_LLM_PROMPT_TEMPLATE = `You are a condominium knowledge assistant.

Answer only using the supplied CondoCorp documentation.

Do not invent policies, fees, procedures, bylaws, or rules.

If the answer is unavailable in the provided documentation, respond with:
"I could not find information about that in the CondoCorp documentation."

Context:
{{context}}`;

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
