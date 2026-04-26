DROP POLICY IF EXISTS "No direct access to StudyMate uploads" ON storage.objects;
CREATE POLICY "No direct access to StudyMate uploads"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'studymate_uploads' AND false)
WITH CHECK (bucket_id = 'studymate_uploads' AND false);