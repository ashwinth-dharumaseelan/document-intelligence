-- GOLD: every extracted field of every document as one row (document, field, value, type).
-- Works for any document type without knowing its schema: filter, pivot or compare fields across types.
CREATE OR REFRESH MATERIALIZED VIEW ${doc.catalog}.gold.document_fields
COMMENT 'Gold: long/key-value view of all extracted fields for all document types'
TBLPROPERTIES ('quality' = 'gold')
AS
SELECT
  x.document_id,
  x.file_name,
  x.document_type,
  x.schema_version,
  f.key                                  AS field_name,
  CASE WHEN schema_of_variant(f.value) = 'STRING'
       THEN f.value::STRING ELSE to_json(f.value) END AS field_value,
  schema_of_variant(f.value)             AS value_type,
  f.value IS NULL OR is_variant_null(f.value) AS is_missing
FROM ${doc.catalog}.silver.documents_extracted x,
  LATERAL variant_explode(x.fields) AS f;
