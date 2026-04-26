import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

import { Button } from "@/components/ui/button";
import { askStudyMate, clearStudyData, getStudyState, uploadStudyFiles } from "./studymate.functions";

type StudyDocument = {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type ChatMessage = {
  id: string;
  question: string;
  answer: string;
  retrieved_context: unknown;
  created_at: string;
};

type RetrievedChunk = {
  id: string;
  fileName: string;
  content: string;
  score: number;
};

type StudyState = {
  documents: StudyDocument[];
  messages: ChatMessage[];
  stats: { documents: number; chunks: number; words: number };
};

type PendingUpload = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  extractedText?: string;
};

const suggestions = [
  "Summarize the uploaded notes in key points.",
  "What are the most important definitions?",
  "Create a quick revision checklist from my notes.",
];

const documentation = [
  {
    title: "Problem Statement",
    text: "Students struggle to revise and extract information from large notes. StudyMate AI lets them ask questions and receive answers directly from their own study material.",
  },
  {
    title: "Tools & Technologies",
    text: "Lovable AI for context-based generation, Lovable Cloud database and private storage for processed chunks, RAG architecture, PDF/text/image/folder input processing, and keyword similarity retrieval.",
  },
  {
    title: "How the System Works",
    text: "Files are uploaded, readable text is extracted, notes are split into 200–500 word chunks, chunks are stored, each question retrieves the top matching chunks first, then Lovable AI answers only from that context.",
  },
  {
    title: "Sample Inputs & Outputs",
    text: "Example: ‘Summarize chapter 2’ → concise summary from retrieved chapter chunks. ‘What is photosynthesis?’ → answer only if the notes contain it. ‘Who invented calculus?’ → Answer not found in the provided data if absent.",
  },
  {
    title: "Project Summary",
    text: "A submission-ready RAG notes assistant that demonstrates upload processing, persistent chunk storage, transparent retrieval, and strict grounded AI answering.",
  },
];

function getSessionKey() {
  if (typeof window === "undefined") return "studymate_ssr_session";
  const existing = window.localStorage.getItem("studymate_session_key");
  if (existing) return existing;
  const created = `study_${crypto.randomUUID().replaceAll("-", "")}`;
  window.localStorage.setItem("studymate_session_key", created);
  return created;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

async function extractPlainText(file: File) {
  return file.text();
}

async function prepareFile(file: File): Promise<PendingUpload> {
  const dataUrl = await fileToDataUrl(file);
  let extractedText = "";
  const type = file.type || "unknown";

  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    extractedText = await extractPdfText(file);
  } else if (type.startsWith("text/") || /\.(txt|md|csv|json|log)$/i.test(file.name)) {
    extractedText = await extractPlainText(file);
  }

  return {
    name: file.webkitRelativePath || file.name,
    type,
    size: file.size,
    dataUrl,
    extractedText,
  };
}

function parseRetrieved(value: unknown): RetrievedChunk[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RetrievedChunk => {
    return typeof item === "object" && item !== null && "content" in item && "fileName" in item;
  });
}

function StudyMateLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
        <BrainCircuit className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-accent-foreground/80">StudyMate AI</p>
        <h1 className="text-2xl font-black leading-tight text-foreground md:text-4xl">RAG Notes Assistant</h1>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-soft backdrop-blur">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <p className="text-2xl font-black text-foreground">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function RetrievedContext({ chunks }: { chunks: RetrievedChunk[] }) {
  const [open, setOpen] = useState(false);
  if (!chunks.length) return null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-secondary/70 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold text-secondary-foreground"
      >
        <span className="flex items-center gap-2">
          <SearchCheck className="h-4 w-4 text-primary" /> Retrieved context ({chunks.length})
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {chunks.map((chunk, index) => (
            <div key={chunk.id} className="rounded-xl bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-bold text-foreground">
                Context {index + 1}: {chunk.fileName} · score {chunk.score}
              </p>
              <p>{chunk.content.slice(0, 520)}{chunk.content.length > 520 ? "…" : ""}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StudyMateApp() {
  const [sessionKey] = useState(getSessionKey);
  const [studyState, setStudyState] = useState<StudyState>({
    documents: [],
    messages: [],
    stats: { documents: 0, chunks: 0, words: 0 },
  });
  const [question, setQuestion] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const uploadFilesFn = useServerFn(uploadStudyFiles);
  const getStateFn = useServerFn(getStudyState);
  const askFn = useServerFn(askStudyMate);
  const clearFn = useServerFn(clearStudyData);

  const hasData = studyState.stats.chunks > 0;
  const sampleQuestion = useMemo(() => suggestions[Math.min(studyState.messages.length, suggestions.length - 1)], [studyState.messages.length]);

  async function refreshState() {
    const snapshot = await getStateFn({ data: { sessionKey } });
    setStudyState(snapshot as StudyState);
  }

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
    refreshState().catch(() => undefined);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [studyState.messages.length, isAsking]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = [...files].filter((file) => {
      const name = file.name.toLowerCase();
      return (
        file.type === "application/pdf" ||
        file.type.startsWith("text/") ||
        file.type.startsWith("image/") ||
        /\.(pdf|txt|md|csv|json|log|png|jpg|jpeg|webp)$/i.test(name)
      );
    });

    if (!selected.length) {
      toast.error("Upload PDFs, text files, images, or folders containing those files.");
      return;
    }

    setIsUploading(true);
    try {
      const prepared = await Promise.all(selected.slice(0, 12).map(prepareFile));
      const result = await uploadFilesFn({ data: { sessionKey, files: prepared } });
      await refreshState();
      toast.success(`Processed ${result.processed.length} upload${result.processed.length === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload processing failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function askQuestion(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (!trimmed) return;
    if (!hasData) {
      toast.error("Upload study material before asking questions.");
      return;
    }

    setQuestion("");
    setIsAsking(true);
    try {
      await askFn({ data: { sessionKey, question: trimmed } });
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The AI answer could not be generated.");
      setQuestion(trimmed);
    } finally {
      setIsAsking(false);
    }
  }

  async function clearData() {
    setIsClearing(true);
    try {
      await clearFn({ data: { sessionKey } });
      setStudyState({ documents: [], messages: [], stats: { documents: 0, chunks: 0, words: 0 } });
      toast.success("Study data cleared.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear study data.");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="relative border-b border-border bg-hero px-4 py-6 md:px-8 md:py-8">
        <div className="pointer-events-none absolute inset-0 bg-study-grid opacity-70" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl motion-safe:animate-pulse" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-4">
            <StudyMateLogo />
            <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Upload notes, retrieve the most relevant chunks first, then generate answers strictly from your own study data.
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wider text-accent-foreground">
              <span className="rounded-full border border-border bg-card/70 px-3 py-2">Retrieval before generation</span>
              <span className="rounded-full border border-border bg-card/70 px-3 py-2">No outside knowledge</span>
              <span className="rounded-full border border-border bg-card/70 px-3 py-2">Persistent cloud chunks</span>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 md:w-[28rem]">
            <StatCard icon={FileText} label="Files" value={studyState.stats.documents} />
            <StatCard icon={FileArchive} label="Chunks" value={studyState.stats.chunks} />
            <StatCard icon={BookOpenCheck} label="Words" value={studyState.stats.words.toLocaleString()} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:grid-cols-[24rem_minmax(0,1fr)] md:px-8">
        <aside className="space-y-5">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-card-foreground">Knowledge upload</h2>
                <p className="text-sm text-muted-foreground">PDFs, text, images, and folders.</p>
              </div>
              <UploadCloud className="h-6 w-6 text-primary" />
            </div>

            <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/50 bg-secondary/70 p-6 text-center transition hover:-translate-y-0.5 hover:border-primary hover:bg-accent/70">
              {isUploading ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /> : <UploadCloud className="mb-3 h-8 w-8 text-primary" />}
              <span className="font-black text-secondary-foreground">Drop in study material</span>
              <span className="mt-1 text-sm text-muted-foreground">Choose multiple files up to 8MB each</span>
              <input
                className="sr-only"
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv,.json,.log,image/*,text/*,application/pdf"
                disabled={isUploading}
                onChange={(event) => handleFiles(event.target.files)}
              />
            </label>

            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground transition hover:bg-accent hover:text-accent-foreground">
              <FileArchive className="h-4 w-4 text-primary" /> Upload an entire folder
              <input
                ref={folderInputRef}
                className="sr-only"
                type="file"
                multiple
                disabled={isUploading}
                onChange={(event) => handleFiles(event.target.files)}
              />
            </label>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-muted-foreground">
              <div className="rounded-xl bg-muted p-3"><FileText className="mx-auto mb-1 h-4 w-4 text-primary" />PDF/Text</div>
              <div className="rounded-xl bg-muted p-3"><ImageIcon className="mx-auto mb-1 h-4 w-4 text-primary" />Images</div>
              <div className="rounded-xl bg-muted p-3"><ShieldCheck className="mx-auto mb-1 h-4 w-4 text-primary" />Grounded</div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-card-foreground">Processed sources</h2>
              <Button variant="ghost" size="icon" onClick={refreshState} aria-label="Refresh sources">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {studyState.documents.length ? (
                studyState.documents.map((document) => (
                  <div key={document.id} className="rounded-2xl border border-border bg-background p-3">
                    <p className="truncate text-sm font-bold text-foreground">{document.file_name}</p>
                    <p className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{document.file_type || "unknown"}</span>
                      <span className="rounded-full bg-secondary px-2 py-1 font-bold text-secondary-foreground">{document.status}</span>
                    </p>
                    {document.error_message && <p className="mt-2 text-xs text-destructive">{document.error_message}</p>}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
                  Upload class notes to build your private retrieval set.
                </div>
              )}
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={clearData} disabled={isClearing || (!studyState.documents.length && !studyState.messages.length)}>
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear data
            </Button>
          </div>
        </aside>

        <div className="grid min-h-[42rem] grid-rows-[1fr_auto] rounded-3xl border border-border bg-card shadow-soft">
          <div className="min-h-0 overflow-auto p-4 md:p-6">
            <div className="mb-5 rounded-3xl bg-secondary/80 p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-secondary-foreground">Grounded answer policy</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Every answer runs retrieval first. If the uploaded data does not contain the answer, StudyMate replies: Answer not found in the provided data.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {studyState.messages.length ? (
                studyState.messages.map((message) => {
                  const retrieved = parseRetrieved(message.retrieved_context);
                  return (
                    <article key={message.id} className="space-y-3">
                      <div className="ml-auto max-w-[88%] rounded-3xl bg-primary px-5 py-4 text-primary-foreground shadow-glow">
                        <p className="text-sm font-bold">You asked</p>
                        <p className="mt-1 leading-7">{message.question}</p>
                      </div>
                      <div className="max-w-[92%] rounded-3xl border border-border bg-background px-5 py-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-black text-foreground">
                          <BrainCircuit className="h-4 w-4 text-primary" /> StudyMate answer
                        </div>
                        <div className="prose prose-sm max-w-none text-foreground prose-p:leading-7 prose-strong:text-foreground prose-li:marker:text-primary">
                          <ReactMarkdown>{message.answer}</ReactMarkdown>
                        </div>
                        <RetrievedContext chunks={retrieved} />
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-border bg-background p-8 text-center">
                  <div className="max-w-md">
                    <MessageCircleQuestion className="mx-auto mb-4 h-12 w-12 text-primary" />
                    <h2 className="text-2xl font-black text-foreground">Ask from your notes</h2>
                    <p className="mt-2 text-muted-foreground">Once notes are uploaded, try: {sampleQuestion}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {suggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setQuestion(item)}
                          className="rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground transition hover:bg-accent hover:text-accent-foreground"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {isAsking && (
                <div className="max-w-md rounded-3xl border border-border bg-background px-5 py-4 text-sm font-bold text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-primary" /> Retrieving top chunks, then generating a grounded answer…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          <form
            className="border-t border-border p-4 md:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              askQuestion();
            }}
          >
            <div className="flex flex-col gap-3 rounded-3xl bg-background p-3 md:flex-row md:items-end">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={hasData ? "Ask a question from your uploaded notes…" : "Upload notes first, then ask StudyMate…"}
                className="min-h-16 flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <Button type="submit" variant="hero" size="lg" disabled={isAsking || !question.trim()}>
                {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Ask
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Retrieval is mandatory: the top 1–3 matching chunks are selected before Lovable AI writes the response.
            </p>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 md:px-8">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft md:p-7">
          <div className="mb-5 flex items-center gap-3">
            <BookOpenCheck className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-black text-card-foreground">Submission documentation</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {documentation.map((item) => (
              <div key={item.title} className="rounded-2xl bg-background p-4">
                <h3 className="font-black text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
