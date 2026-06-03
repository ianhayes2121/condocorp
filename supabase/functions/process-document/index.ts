import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text: string, targetSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 1 > targetSize && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap from end of current chunk
      const overlapText = current.slice(-overlap);
      current = overlapText + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Handle case where a single paragraph exceeds target size
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > targetSize * 2) {
      let start = 0;
      while (start < chunk.length) {
        result.push(chunk.slice(start, start + targetSize).trim());
        start += targetSize - overlap;
      }
    } else {
      result.push(chunk);
    }
  }

  return result;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: batch,
      }),
    });
    const json = await response.json();
    for (const item of json.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { document_id, condocorp_id } = await req.json();

    // Update status to processing
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document_id);

    // Get document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .eq("condocorp_id", condocorp_id)
      .single();

    if (docError || !doc) {
      throw new Error("Document not found");
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(doc.file_path);

    if (downloadError || !fileData) {
      throw new Error("Failed to download file");
    }

    // Extract text based on file type
    let rawText = "";
    const ext = doc.filename.toLowerCase().split(".").pop();

    if (ext === "txt") {
      rawText = await fileData.text();
    } else if (ext === "html" || ext === "htm") {
      const html = await fileData.text();
      rawText = extractTextFromHtml(html);
    } else if (ext === "pdf") {
      // For PDF: use the text content (basic extraction)
      // In production, integrate a PDF parsing library
      rawText = await fileData.text();
    } else if (ext === "docx") {
      // For DOCX: extract text from XML content
      // In production, integrate a DOCX parsing library
      rawText = await fileData.text();
    } else {
      rawText = await fileData.text();
    }

    // Clean text
    const cleanedText = cleanText(rawText);

    if (!cleanedText) {
      await supabase
        .from("documents")
        .update({ status: "failed" })
        .eq("id", document_id);
      throw new Error("No text content extracted");
    }

    // Chunk text
    const textChunks = chunkText(cleanedText);

    // Update status
    await supabase
      .from("documents")
      .update({ status: "chunked" })
      .eq("id", document_id);

    // Delete existing chunks for this document (for reprocessing)
    await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", document_id);

    // Generate embeddings
    const embeddings = await generateEmbeddings(textChunks);

    // Insert chunks with embeddings
    const chunkRows = textChunks.map((text, i) => ({
      condocorp_id,
      document_id,
      chunk_number: i + 1,
      chunk_text: text,
      embedding: embeddings[i],
    }));

    // Insert in batches
    const insertBatchSize = 50;
    for (let i = 0; i < chunkRows.length; i += insertBatchSize) {
      const batch = chunkRows.slice(i, i + insertBatchSize);
      await supabase.from("document_chunks").insert(batch);
    }

    // Mark as indexed
    await supabase
      .from("documents")
      .update({ status: "indexed" })
      .eq("id", document_id);

    // Audit log
    await supabase.from("audit_logs").insert({
      condocorp_id,
      user_id: doc.uploaded_by,
      action: "document_processed",
      details: {
        description: `Processed ${doc.title}`,
        document_id,
        chunks_created: textChunks.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        chunks_created: textChunks.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    console.error("Document processing error:", message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
