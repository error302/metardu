UPDATE supporting_documents
SET
  file_url = NULL,
  uploaded_at = NULL
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND type IN ('ppa2', 'beacon_cert');

SELECT type, required, (file_url IS NOT NULL) AS has_file
FROM supporting_documents
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid
ORDER BY type;
