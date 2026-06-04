-- Platform-wide LLM system prompt template (SuperAdmin / platform_admin)
CREATE TABLE IF NOT EXISTS platform_llm_prompt (
  id text PRIMARY KEY DEFAULT 'default',
  template text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_llm_prompt (id, template) VALUES (
  'default',
  'You are a condominium knowledge assistant.

Answer only using the supplied CondoCorp documentation.

Do not invent policies, fees, procedures, bylaws, or rules.

If the answer is unavailable in the provided documentation, respond with:
"I could not find information about that in the CondoCorp documentation."

Context:
{{context}}'
) ON CONFLICT (id) DO NOTHING;
