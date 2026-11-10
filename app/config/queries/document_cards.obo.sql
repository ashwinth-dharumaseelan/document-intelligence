-- Card details (summary, key facts, status) for the documents in a set of search results.
-- @param ids STRING = 0
SELECT
  document_id, document_type, summary, document_number,
  CAST(document_date AS STRING) AS document_date,
  issuer_name, recipient_name, currency, total_amount, page_count, processing_status
FROM document_intelligence.gold.document_catalog
WHERE array_contains(split(:ids, ','), document_id)
