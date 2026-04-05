UPDATE supporting_documents
SET
  file_url = CASE
    WHEN type = 'ppa2' THEN '/uploads/supporting/test-ppa2.pdf'
    WHEN type = 'beacon_cert' THEN '/uploads/supporting/test-beacon-cert.pdf'
    ELSE file_url
  END,
  uploaded_at = CASE
    WHEN type IN ('ppa2', 'beacon_cert') THEN now()
    ELSE uploaded_at
  END
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND type IN ('ppa2', 'beacon_cert');

SELECT type, required, (file_url IS NOT NULL) AS has_file, uploaded_at
FROM supporting_documents
WHERE project_id = '11111111-1111-1111-1111-111111111111'::uuid
ORDER BY type;
