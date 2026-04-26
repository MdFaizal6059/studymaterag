import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UploadedStudyFile = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  extractedText?: string;
};

export type RetrievedChunk = {
  id: string;
  fileName: string;
  content: string;
  score: number;
};

const FALLBACK_ANSWER = "Answer not found in the provided data.";
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "how", "in",
  "is", "it", "its", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "what",
  "when", "where", "which", "who", "why", "with", "you", "your", "about", "into", "than", "then",
]);

function normalizeText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim().replace(/^-+|-+$/g, ""))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function topKeywords(value: string, limit = 24) {
  const counts = new Map<string, number>();
  for (const token of tokenize(value)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function chunkText(text: string) {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  const size = 320;
  const overlap = 40;
  for (let start = 0; start < words.length; start += size - overlap) {
    const chunk = words.slice(start, start + size).join(" ").trim();
    if (chunk.split(/\s+/).length >= 12) chunks.push(chunk);
  }
  return chunks;
}

function dataUrlToBytes(dataUrl: string) {
  const [header, encoded = ""] = dataUrl.split(",");
  const contentType = header.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, contentType };
}

async function getOrCreateSession(sessionKey: string) {
  const existing = await supabaseAdmin
    .from("study_sessions")
    .select("id, session_key")
    .eq("session_key", sessionKey)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const created = await supabaseAdmin
    .from("study_sessions")
    .insert({ session_key: sessionKey })
    .select("id, session_key")
    .single();

  if (created.error) throw new Error(created.error.message);
  return created.data;
}

async function extractImageText(file: UploadedStudyFile) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return "";

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Extract only readable study-note text from the image. Preserve headings, labels, formulas, and bullet points. If no readable text exists, return an empty string.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract readable text from this uploaded study file: ${file.name}` },
            { type: "image_url", image_url: { url: file.dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) return "";
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return normalizeText(payload.choices?.[0]?.message?.content ?? "");
}

export async function processStudyFiles(sessionKey: string, files: UploadedStudyFile[]) {
  const session = await getOrCreateSession(sessionKey);
  const processed: Array<{ id: string; fileName: string; chunks: number; words: number; status: string }> = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._/-]/g, "_").slice(-160);
    const storagePath = `${session.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { bytes, contentType } = dataUrlToBytes(file.dataUrl);

    await supabaseAdmin.storage.from("studymate_uploads").upload(storagePath, bytes, {
      contentType: file.type || contentType,
      upsert: true,
    });

    let extractedText = normalizeText(file.extractedText ?? "");
    if (!extractedText && file.type.startsWith("image/")) {
      extractedText = await extractImageText(file);
    }

    const status = extractedText ? "processed" : "failed";
    const documentResult = await supabaseAdmin
      .from("study_documents")
      .insert({
        session_id: session.id,
        file_name: file.name,
        file_type: file.type || "unknown",
        storage_path: storagePath,
        extracted_text: extractedText,
        status,
        error_message: extractedText ? null : "No readable text could be extracted from this file.",
      })
      .select("id, file_name, status")
      .single();

    if (documentResult.error) throw new Error(documentResult.error.message);

    const chunks = chunkText(extractedText);
    if (chunks.length) {
      const chunkRows = chunks.map((content, index) => ({
        session_id: session.id,
        document_id: documentResult.data.id,
        chunk_index: index,
        content,
        keywords: topKeywords(content),
        word_count: content.split(/\s+/).filter(Boolean).length,
      }));
      const insertChunks = await supabaseAdmin.from("study_chunks").insert(chunkRows);
      if (insertChunks.error) throw new Error(insertChunks.error.message);
    }

    processed.push({
      id: documentResult.data.id,
      fileName: documentResult.data.file_name,
      chunks: chunks.length,
      words: extractedText.split(/\s+/).filter(Boolean).length,
      status,
    });
  }

  return { processed };
}

function scoreChunk(question: string, content: string, keywords: string[]) {
  const queryTerms = tokenize(question);
  if (!queryTerms.length) return 0;
  const contentLower = content.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (keywords.includes(term)) score += 5;
    const matches = contentLower.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
    if (matches) score += Math.min(matches.length, 4);
  }
  if (question.length > 12 && contentLower.includes(question.toLowerCase())) score += 12;
  return score;
}

export async function getStudySnapshot(sessionKey: string) {
  const session = await getOrCreateSession(sessionKey);
  const [documents, chunks, messages] = await Promise.all([
    supabaseAdmin
      .from("study_documents")
      .select("id, file_name, file_type, status, error_message, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("study_chunks").select("id, word_count").eq("session_id", session.id),
    supabaseAdmin
      .from("study_chat_messages")
      .select("id, question, answer, retrieved_context, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
  ]);

  if (documents.error) throw new Error(documents.error.message);
  if (chunks.error) throw new Error(chunks.error.message);
  if (messages.error) throw new Error(messages.error.message);

  return {
    documents: documents.data,
    messages: messages.data,
    stats: {
      documents: documents.data.length,
      chunks: chunks.data.length,
      words: chunks.data.reduce((total, chunk) => total + (chunk.word_count ?? 0), 0),
    },
  };
}

export async function answerFromStudyMaterial(sessionKey: string, question: string) {
  const session = await getOrCreateSession(sessionKey);
  const chunkResult = await supabaseAdmin
    .from("study_chunks")
    .select("id, content, keywords, study_documents!inner(file_name)")
    .eq("session_id", session.id)
    .limit(250);

  if (chunkResult.error) throw new Error(chunkResult.error.message);

  const ranked = chunkResult.data
    .map((chunk) => ({
      id: chunk.id,
      fileName: Array.isArray(chunk.study_documents)
        ? (chunk.study_documents[0]?.file_name ?? "Study material")
        : (chunk.study_documents?.file_name ?? "Study material"),
      content: chunk.content,
      score: scoreChunk(question, chunk.content, chunk.keywords ?? []),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) satisfies RetrievedChunk[];

  if (!ranked.length) {
    await supabaseAdmin.from("study_chat_messages").insert({
      session_id: session.id,
      question,
      answer: FALLBACK_ANSWER,
      retrieved_context: [],
    });
    return { answer: FALLBACK_ANSWER, retrieved: [] };
  }

  const context = ranked
    .map((chunk, index) => `Context ${index + 1} — ${chunk.fileName}:\n${chunk.content}`)
    .join("\n\n---\n\n");

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Lovable AI is not configured for this project.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You are StudyMate AI, a strict retrieval-augmented notes assistant. Answer ONLY using the provided context. If the answer is not found, respond exactly with: Answer not found in the provided data. Keep answers clear, factual, and concise. Prefer key points and a short summary when useful. Do not use outside knowledge.",
        },
        {
          role: "user",
          content: `Provided context:\n${context}\n\nQuestion: ${question}\n\nAnswer ONLY using the provided context. If the answer is not found, respond with: '${FALLBACK_ANSWER}'`,
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Lovable AI rate limit reached. Please try again shortly.");
    if (response.status === 402) throw new Error("Lovable AI credits are exhausted. Please add credits in Workspace Usage.");
    throw new Error("AI response generation failed.");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const answer = normalizeText(payload.choices?.[0]?.message?.content ?? FALLBACK_ANSWER) || FALLBACK_ANSWER;

  await supabaseAdmin.from("study_chat_messages").insert({
    session_id: session.id,
    question,
    answer,
    retrieved_context: ranked,
  });

  return { answer, retrieved: ranked };
}

export async function clearStudySession(sessionKey: string) {
  const session = await getOrCreateSession(sessionKey);
  const documentPaths = await supabaseAdmin
    .from("study_documents")
    .select("storage_path")
    .eq("session_id", session.id)
    .not("storage_path", "is", null);

  if (documentPaths.data?.length) {
    await supabaseAdmin.storage
      .from("studymate_uploads")
      .remove(documentPaths.data.map((item) => item.storage_path).filter(Boolean) as string[]);
  }

  const removed = await supabaseAdmin.from("study_sessions").delete().eq("id", session.id);
  if (removed.error) throw new Error(removed.error.message);
  return { cleared: true };
}
