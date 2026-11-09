-- GOLD: metadata catalog, one row per file in the volume (every format, including skipped ones):
-- file metadata, routing, parse statistics, type, summary, core fields, all extracted fields (VARIANT),
-- chunk count, the gold table it landed in, and a single processing_status for the whole journey.
CREATE OR REFRESH MATERIALIZED VIEW ${doc.catalog}.gold.document_catalog
COMMENT 'Gold: one row per file with file, parse, AI, search and validation metadata'
TBLPROPERTIES ('quality' = 'gold')
AS
WITH chunks AS (
  SELECT document_id, count(*) AS chunk_count
  FROM ${doc.catalog}.silver.document_chunks
  GROUP BY document_id
)
SELECT
  b.document_id,
  b.file_name,
  b.file_extension,
  b.processing_route,
  b.path,
  b.file_size_bytes,
  b.file_modified_at,
  b.content_sha256,
  b.ingested_at,
  p.page_count,
  p.element_count,
  p.table_count,
  p.parse_ok,
  char_length(p.text_clean)              AS text_length,
  c.document_type,
  c.summary,
  x.schema_version,
  x.document_number,
  x.document_date,
  x.issuer_name,
  x.recipient_name,
  x.parties,
  x.currency,
  x.total_amount,
  x.language,
  x.fields,
  coalesce(k.chunk_count, 0)             AS chunk_count,
  v.gold_table,
  CASE
    WHEN b.processing_route = 'excluded'    THEN 'EXCLUDED'
    WHEN b.processing_route = 'unsupported' THEN 'UNSUPPORTED_FORMAT'
    WHEN p.document_id IS NULL              THEN 'NOT_PARSED'
    WHEN NOT p.parse_ok                     THEN 'PARSE_FAILED'
    WHEN c.document_id IS NULL              THEN 'NO_TEXT'
    WHEN x.document_id IS NULL              THEN 'NOT_EXTRACTED'
    WHEN x.extract_error IS NOT NULL        THEN 'EXTRACTION_FAILED'
    ELSE coalesce(v.validation_status, 'PASSED')
  END                                    AS processing_status,
  v.failed_checks
FROM ${doc.catalog}.bronze.raw_documents b
LEFT JOIN ${doc.catalog}.silver.parsed_documents p     ON b.document_id = p.document_id
LEFT JOIN ${doc.catalog}.silver.documents_classified c ON b.document_id = c.document_id
LEFT JOIN ${doc.catalog}.silver.documents_extracted x  ON b.document_id = x.document_id
LEFT JOIN chunks k                                     ON b.document_id = k.document_id
LEFT JOIN ${doc.catalog}.gold.document_validations v   ON b.document_id = v.document_id;
