CREATE POLICY "No direct access to study sessions"
ON public.study_sessions
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct access to study documents"
ON public.study_documents
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct access to study chunks"
ON public.study_chunks
FOR ALL
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct access to study chat messages"
ON public.study_chat_messages
FOR ALL
USING (false)
WITH CHECK (false);