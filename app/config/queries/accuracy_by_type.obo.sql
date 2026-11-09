-- Extraction accuracy against the answer key, per document type.
SELECT document_type, round(avg(accuracy_pct), 1) AS exact_pct, round(avg(accuracy_incl_partial_pct), 1) AS incl_partial_pct
FROM document_intelligence.gold.extraction_accuracy_summary
GROUP BY document_type
ORDER BY document_type
