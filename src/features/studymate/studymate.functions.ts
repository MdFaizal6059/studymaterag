import { createServerFn } from "@tanstack/react-start";
import {
  answerFromStudyMaterial,
  clearStudySession,
  getStudySnapshot,
  processStudyFiles,
  type UploadedStudyFile,
} from "./studymate.server";

const MAX_UPLOAD_BYTES = 8_000_000;
const ALLOWED_DATA_URL_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function validateDataUrlPayload(file: UploadedStudyFile) {
  const match = file.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Invalid file payload.");

  const [, mimeType, encodedPayload] = match;
  const normalizedType = mimeType.toLowerCase();
  if (!ALLOWED_DATA_URL_TYPES.has(normalizedType)) {
    throw new Error(`${file.name} uses an unsupported file type.`);
  }

  const base64Length = encodedPayload.replace(/\s/g, "").length;
  const actualBytes = Math.floor((base64Length * 3) / 4) - (encodedPayload.endsWith("==") ? 2 : encodedPayload.endsWith("=") ? 1 : 0);
  if (actualBytes < 1) throw new Error(`${file.name} is empty.`);
  if (actualBytes > MAX_UPLOAD_BYTES) throw new Error(`${file.name} exceeds 8MB.`);

  return { actualBytes, mimeType: normalizedType };
}

function validateSessionKey(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(value)) {
    throw new Error("Invalid study session.");
  }
  return value;
}

export const uploadStudyFiles = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionKey: string; files: UploadedStudyFile[] }) => {
    const sessionKey = validateSessionKey(input.sessionKey);
    if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 12) {
      throw new Error("Upload 1–12 files at a time.");
    }
    return {
      sessionKey,
      files: input.files.map((file) => {
        if (!file.name || file.name.length > 220) throw new Error("Invalid file name.");
        const { actualBytes, mimeType } = validateDataUrlPayload(file);
        return {
          name: file.name,
          type: mimeType,
          size: actualBytes,
          dataUrl: file.dataUrl,
          extractedText: (file.extractedText ?? "").slice(0, 450_000),
        };
      }),
    };
  })
  .handler(async ({ data }) => processStudyFiles(data.sessionKey, data.files));

export const getStudyState = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionKey: string }) => ({ sessionKey: validateSessionKey(input.sessionKey) }))
  .handler(async ({ data }) => getStudySnapshot(data.sessionKey));

export const askStudyMate = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionKey: string; question: string }) => {
    const sessionKey = validateSessionKey(input.sessionKey);
    const question = input.question.trim();
    if (question.length < 3) throw new Error("Ask a longer question.");
    if (question.length > 800) throw new Error("Keep the question under 800 characters.");
    return { sessionKey, question };
  })
  .handler(async ({ data }) => answerFromStudyMaterial(data.sessionKey, data.question));

export const clearStudyData = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionKey: string }) => ({ sessionKey: validateSessionKey(input.sessionKey) }))
  .handler(async ({ data }) => clearStudySession(data.sessionKey));
