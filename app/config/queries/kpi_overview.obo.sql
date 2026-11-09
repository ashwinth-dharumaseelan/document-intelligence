-- Use-case KPIs: digitisation coverage, review load, search coverage, record accuracy, freshness.
SELECT
  count_if(processing_route <> 'excluded')                                         AS files_received,
  count_if(processing_status IN ('PASSED', 'NEEDS_REVIEW'))                         AS documents_digitised,
  round(100 * count_if(processing_status IN ('PASSED', 'NEEDS_REVIEW'))
        / nullif(count_if(processing_route <> 'excluded'), 0), 1)                   AS digitised_pct,
  count_if(processing_status = 'NEEDS_REVIEW')                                      AS needs_review,
  count_if(processing_status NOT IN ('PASSED', 'NEEDS_REVIEW', 'EXCLUDED'))         AS not_processed,
  sum(chunk_count)                                                                  AS searchable_chunks,
  (SELECT round(avg(accuracy_pct), 1) FROM document_intelligence.gold.extraction_accuracy_summary)          AS record_accuracy_pct,
  (SELECT round(avg(accuracy_incl_partial_pct), 1) FROM document_intelligence.gold.extraction_accuracy_summary) AS record_accuracy_incl_partial_pct,
  (SELECT count(*) FROM document_intelligence.gold.extraction_accuracy_summary)                             AS accuracy_sample_size,
  CAST(max(ingested_at) AS STRING)                                                  AS last_ingested_at
FROM document_intelligence.gold.document_catalog
