CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT,
  extracted_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.study_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS public.study_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  retrieved_context JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_session_key ON public.study_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_study_documents_session_id ON public.study_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_study_chunks_session_id ON public.study_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_study_chunks_keywords ON public.study_chunks USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_study_chat_messages_session_id ON public.study_chat_messages(session_id);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_study_sessions_updated_at ON public.study_sessions;
CREATE TRIGGER update_study_sessions_updated_at
BEFORE UPDATE ON public.study_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_study_documents_updated_at ON public.study_documents;
CREATE TRIGGER update_study_documents_updated_at
BEFORE UPDATE ON public.study_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('studymate_uploads', 'studymate_uploads', false)
ON CONFLICT (id) DO NOTHING;