-- Pipeline health: pass rate of each processing stage, plus all business-rule checks combined.
SELECT kind, check_name, total_rows, passed_rows, pass_rate_pct, sort_order
FROM (
  SELECT 'stage' AS kind, check_name, total_rows, passed_rows, pass_rate_pct,
    CASE check_name WHEN 'supported_format' THEN 1 WHEN 'parsed_successfully' THEN 2 WHEN 'classified' THEN 3
      WHEN 'fields_extracted' THEN 4 WHEN 'chunked_for_search' THEN 5 ELSE 9 END AS sort_order
  FROM document_intelligence.gold.data_quality_summary
  WHERE scope = 'pipeline'
  UNION ALL
  SELECT 'rules', 'business_rules', sum(total_rows), sum(passed_rows),
    round(100 * sum(passed_rows) / nullif(sum(total_rows), 0), 1), 10
  FROM document_intelligence.gold.data_quality_summary
  WHERE scope <> 'pipeline'
)
ORDER BY sort_order
