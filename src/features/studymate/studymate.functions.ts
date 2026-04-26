import { createServerFn } from "@tanstack/react-start";
import {
  answerFromStudyMaterial,
  clearStudySession,
  getStudySnapshot,
  processStudyFiles,
  type UploadedStudyFile,
} from "./studymate.server";

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
        if (!file.dataUrl.startsWith("data:")) throw new Error("Invalid file payload.");
        if (file.size > 8_000_000) throw new Error(`${file.name} is larger than 8MB.`);
        return {
          name: file.name,
          type: file.type || "unknown",
          size: file.size,
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
