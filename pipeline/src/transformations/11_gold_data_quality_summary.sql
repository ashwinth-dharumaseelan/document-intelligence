-- GOLD: data-quality scorecard. Pipeline checks for every file plus every registry validation rule,
-- with pass/fail counts and the failing files.
CREATE OR REFRESH MATERIALIZED VIEW ${doc.catalog}.gold.data_quality_summary
COMMENT 'Gold: pass/fail counts per check (pipeline stages and per-type validation rules)'
TBLPROPERTIES ('quality' = 'gold')
AS
WITH stage_checks AS (
  SELECT file_name, 'pipeline' AS scope, check_name, passed
  FROM ${doc.catalog}.gold.document_catalog
  LATERAL VIEW stack(5,
    'supported_format',    processing_route IN ('ai_parse', 'text'),
    'parsed_successfully', coalesce(parse_ok, false),
    'classified',          document_type IS NOT NULL,
    'fields_extracted',    processing_status NOT IN ('NOT_EXTRACTED', 'EXTRACTION_FAILED', 'NOT_PARSED', 'PARSE_FAILED', 'NO_TEXT'),
    'chunked_for_search',  chunk_count > 0
  ) s AS check_name, passed
  WHERE processing_route <> 'excluded'
),
rule_checks AS (
  SELECT file_name, document_type AS scope, check_name, passed
  FROM ${doc.catalog}.gold.document_validations
  LATERAL VIEW explode(checks) e AS check_name, passed
),
all_checks AS (
  SELECT * FROM stage_checks
  UNION ALL
  SELECT * FROM rule_checks
)
SELECT
  scope,
  check_name,
  count(*)                                                  AS total_rows,
  count_if(passed)                                          AS passed_rows,
  count_if(NOT passed)                                      AS failed_rows,
  round(100 * count_if(passed) / count(*), 1)               AS pass_rate_pct,
  array_sort(collect_list(IF(passed, NULL, file_name)))     AS failed_files
FROM all_checks
GROUP BY scope, check_name;
