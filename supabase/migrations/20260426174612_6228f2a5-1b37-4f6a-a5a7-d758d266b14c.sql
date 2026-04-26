-- Keep the private StudyMate uploads bucket inaccessible through direct client storage APIs.
-- The app accesses this bucket only through trusted server-side logic.
DROP POLICY IF EXISTS "No direct access to StudyMate uploads" ON storage.objects;
CREATE POLICY "No direct access to StudyMate uploads"
ON storage.objects
FOR ALL
TO public
USING (bucket_id <> 'studymate_uploads')
WITH CHECK (bucket_id <> 'studymate_uploads');