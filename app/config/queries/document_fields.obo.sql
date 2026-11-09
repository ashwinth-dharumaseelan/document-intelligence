-- Every extracted field of one document.
-- @param document_id STRING = 0
SELECT field_name, field_value, value_type, is_missing
FROM document_intelligence.gold.document_fields
WHERE document_id = :document_id
ORDER BY field_name
