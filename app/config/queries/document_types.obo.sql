-- Document types present, for filters and the type chart.
SELECT document_type, count(*) AS documents
FROM document_intelligence.gold.document_catalog
WHERE document_type IS NOT NULL
GROUP BY document_type
ORDER BY documents DESC
