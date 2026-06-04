import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTEXT_PLACEHOLDER = "{{context}}";
const QUESTION_PLACEHOLDER = "{{question}}";

const CANNOT_ANSWER_MESSAGE =
  "I don't have that information. Would you like me to create a support ticket?";

const DEFAULT_LLM_PROMPT_TEMPLATE = `You are CondoCorp Assistant — a friendly, clear guide who helps homeowners understand their condominium community.

Your primary source of truth is the CondoCorp documentation in the retrieved context below. It may include declarations, bylaws, rules, policies, FAQs, meeting minutes, and reserve fund studies.

Your job is to give residents a useful answer so they do not need to call the board for everyday questions. Do not punt to the board, property manager, or management company as a default closing line.

How to answer:
- Write like a helpful neighbor, not a legal memo. Use plain language and short paragraphs.
- Lead with a direct answer to what they asked. For yes/no questions, start with yes, no, or "it depends" in natural language — never use labels like "Answer:" or section headers.
- Ground answers in their documents when you can. Weave citations in naturally (e.g. "Your declaration describes common elements as…") rather than listing "Source 4, Chunk 11".
- If the docs only partly cover the question, say what they do say, then add practical guidance from general condominium knowledge — and say clearly when something is general practice vs. written in their documents.
- If the docs are silent on a detail, still answer the spirit of the question using what the docs do say plus sensible condo norms (e.g. shared spaces are for ordinary resident use unless a rule says otherwise). One short caveat is fine; do not replace the answer with "contact the board."
- Never invent specific CondoCorp rules, fees, restrictions, or policies.
- Do not include a Sources section or repeat source lists — the app shows sources separately.
- Residents often ask follow-ups ("can I take my kids there?"). Use conversation history to understand what "there" or "that" refers to.
- Avoid boilerplate endings such as "check with your board," "contact management," or "verify with the property manager." Only mention the board when the documents explicitly require board approval for that situation, or the question is about a live dispute, fee waiver, or other matter only the board can decide.

If the question is completely unrelated to condominium living, or you cannot offer any useful guidance even with general industry knowledge, respond with exactly:
"${CANNOT_ANSWER_MESSAGE}"

Retrieved Context:
${CONTEXT_PLACEHOLDER}

User Question:
${QUESTION_PLACEHOLDER}`;

function buildSystemPrompt(template: string, contextBlock: string, question: string): string {
  return template
    .split(CONTEXT_PLACEHOLDER)
    .join(contextBlock)
    .split(QUESTION_PLACEHOLDER)
    .join(question);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const json = await response.json();
  return json.data[0].embedding;
}

async function chatCompletion(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.45,
      max_tokens: 1536,
    }),
  });
  const json = await response.json();
  return json.choices[0].message.content;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the user's JWT
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, condocorp_id, question } = await req.json();

    // Verify user is a member of this condocorp
    const { data: membership } = await supabase
      .from("condocorp_memberships")
      .select("id")
      .eq("condocorp_id", condocorp_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embedding for the question
    const questionEmbedding = await generateEmbedding(question);

    // Search chunks filtered by condocorp_id (tenant isolation enforced at DB level)
    const { data: chunks } = await supabase.rpc("match_document_chunks", {
      query_embedding: questionEmbedding,
      match_condocorp_id: condocorp_id,
      match_count: 5,
      match_threshold: 0.32,
    });

    // Get document titles for citations
    const docIds = [...new Set((chunks ?? []).map((c: { document_id: string }) => c.document_id))];
    const { data: docs } = docIds.length > 0
      ? await supabase.from("documents").select("id, title").in("id", docIds)
      : { data: [] };

    const docTitleMap = new Map((docs ?? []).map((d: { id: string; title: string }) => [d.id, d.title]));

    // Also fetch FAQs for this condocorp
    const { data: faqs } = await supabase
      .from("faqs")
      .select("question, answer")
      .eq("condocorp_id", condocorp_id);

    // Build context
    const chunkContext =
      (chunks ?? []).length > 0
        ? (chunks ?? [])
            .map((c: { chunk_text: string; document_id: string; chunk_number: number }, i: number) =>
              `[Source ${i + 1}: ${docTitleMap.get(c.document_id) ?? "Unknown"}, Chunk ${c.chunk_number}]\n${c.chunk_text}`
            )
            .join("\n\n")
        : "(No matching document excerpts were retrieved for this question.)";

    const faqContext = (faqs ?? [])
      .map((f: { question: string; answer: string }) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");

    const contextBlock = [chunkContext, faqContext && `\n\nFAQs:\n${faqContext}`]
      .filter(Boolean)
      .join("");

    const { data: promptRow } = await supabase
      .from("platform_llm_prompt")
      .select("template")
      .eq("id", "default")
      .maybeSingle();

    const promptTemplate =
      typeof promptRow?.template === "string" && promptRow.template.trim().length > 0
        ? promptRow.template
        : DEFAULT_LLM_PROMPT_TEMPLATE;

    const systemPrompt = buildSystemPrompt(promptTemplate, contextBlock, question);

    const answer = await chatCompletion(systemPrompt, question);

    // Build source citations
    const sources = (chunks ?? []).map((c: { document_id: string; chunk_text: string; chunk_number: number; similarity: number }) => ({
      document_title: docTitleMap.get(c.document_id) ?? "Unknown",
      chunk_text: c.chunk_text.substring(0, 200),
      chunk_number: c.chunk_number,
      similarity: c.similarity,
    }));

    // Store the assistant message
    const { data: msgData } = await supabase.from("messages").insert({
      conversation_id,
      role: "assistant",
      content: answer,
      sources,
    }).select("id").single();

    // Audit log
    await supabase.from("audit_logs").insert({
      condocorp_id,
      user_id: user.id,
      action: "question_asked",
      details: { question, sources_count: sources.length },
    });

    return new Response(
      JSON.stringify({
        answer,
        sources,
        message_id: msgData?.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
