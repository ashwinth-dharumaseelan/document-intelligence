-- Document library: only documents that passed every validation check (ready for staff),
-- filterable by type and text in name/issuer/number.
-- @param document_type STRING = ALL
-- @param text STRING = gulf
SELECT
  document_id, file_name, file_extension, document_type, processing_status,
  document_number, CAST(document_date AS STRING) AS document_date, issuer_name, recipient_name,
  total_amount, currency, page_count, CAST(ingested_at AS STRING) AS ingested_at
FROM document_intelligence.gold.document_catalog
WHERE processing_status = 'PASSED'
  AND (:document_type = 'ALL' OR document_type = :document_type)
  AND (:text = '' OR lower(concat_ws(' ', file_name, issuer_name, recipient_name, document_number)) LIKE concat('%', lower(:text), '%'))
ORDER BY document_date DESC NULLS LAST, file_name
LIMIT 500
