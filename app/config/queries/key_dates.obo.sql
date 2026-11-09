-- Key dates people must act on (expiries, renewal-notice deadlines, hearings, deadlines), soonest first.
SELECT
  document_id, file_name, document_type, date_type, subject,
  CAST(key_date AS STRING) AS key_date, days_left, urgency, team
FROM document_intelligence.gold.key_dates
ORDER BY key_date
