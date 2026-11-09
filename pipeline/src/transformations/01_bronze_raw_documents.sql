-- BRONZE: every file in the UC Volume, ingested incrementally with Auto Loader (any format).
-- Each file is routed by extension:
--   ai_parse    -> PDF, images, Word, PowerPoint: parsed with ai_parse_document
--   text        -> plain-text formats: decoded as UTF-8
--   excluded    -> files listed in the pipeline setting doc.exclude_files (answer keys, readmes)
--   unsupported -> anything else: kept here and reported in gold.document_catalog, not processed
CREATE OR REFRESH STREAMING TABLE ${doc.catalog}.bronze.raw_documents (
  CONSTRAINT non_empty_file EXPECT (file_size_bytes > 0) ON VIOLATION DROP ROW,
  CONSTRAINT supported_format EXPECT (processing_route IN ('ai_parse', 'text', 'excluded'))
)
COMMENT 'Bronze: raw files (binary) of any type from /Volumes/document_intelligence/default/document_intelligence_sample, with routing'
TBLPROPERTIES ('quality' = 'bronze')
AS
WITH files AS (
  SELECT *, regexp_extract(path, '[^/]+$', 0) AS file_name
  FROM STREAM read_files(
    '${doc.source_volume}',
    format => 'binaryFile',
    recursiveFileLookup => 'true'   -- include sub-folders such as inbox/email/ (names starting with _ or . are skipped)
  )
)
SELECT
  sha2(path, 256)                                         AS document_id,
  file_name,
  lower(regexp_extract(file_name, '\\.([^.]+)$', 1))      AS file_extension,
  CASE
    WHEN array_contains(split('${doc.exclude_files}', ','), file_name)                THEN 'excluded'
    WHEN array_contains(split('${doc.parse_extensions}', ','),
                        lower(regexp_extract(file_name, '\\.([^.]+)$', 1)))           THEN 'ai_parse'
    WHEN array_contains(split('${doc.text_extensions}', ','),
                        lower(regexp_extract(file_name, '\\.([^.]+)$', 1)))           THEN 'text'
    ELSE 'unsupported'
  END                                                     AS processing_route,
  path,
  length                                                  AS file_size_bytes,
  modificationTime                                        AS file_modified_at,
  sha2(content, 256)                                      AS content_sha256,
  content,
  current_timestamp()                                     AS ingested_at
FROM files;
