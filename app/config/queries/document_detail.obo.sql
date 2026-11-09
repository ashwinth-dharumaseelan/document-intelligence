-- One document with all its metadata and validation results.
-- @param document_id STRING = 0
SELECT
  c.document_id, c.file_name, c.file_extension, c.path, c.file_size_bytes,
  CAST(c.ingested_at AS STRING) AS ingested_at,
  c.page_count, c.table_count, c.document_type, c.summary, c.schema_version,
  c.document_number, CAST(c.document_date AS STRING) AS document_date,
  c.issuer_name, c.recipient_name, to_json(c.parties) AS parties_json,
  c.currency, c.total_amount, c.language, c.chunk_count, c.gold_table,
  c.processing_status, to_json(c.failed_checks) AS failed_checks_json,
  to_json(v.checks) AS checks_json
FROM document_intelligence.gold.document_catalog c
LEFT JOIN document_intelligence.gold.document_validations v ON c.document_id = v.document_id
WHERE c.document_id = :document_id
