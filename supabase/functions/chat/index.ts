import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      temperature: 0.3,
      max_tokens: 1024,
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
      match_threshold: 0.5,
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
    const chunkContext = (chunks ?? [])
      .map((c: { chunk_text: string; document_id: string; chunk_number: number }, i: number) =>
        `[Source ${i + 1}: ${docTitleMap.get(c.document_id) ?? "Unknown"}, Chunk ${c.chunk_number}]\n${c.chunk_text}`
      )
      .join("\n\n");

    const faqContext = (faqs ?? [])
      .map((f: { question: string; answer: string }) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");

    const contextBlock = [chunkContext, faqContext && `\n\nFAQs:\n${faqContext}`]
      .filter(Boolean)
      .join("");

    const systemPrompt = `You are a condominium knowledge assistant.

Answer only using the supplied CondoCorp documentation.

Do not invent policies, fees, procedures, bylaws, or rules.

If the answer is unavailable in the provided documentation, respond with:
"I could not find information about that in the CondoCorp documentation."

Context:
${contextBlock}`;

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
