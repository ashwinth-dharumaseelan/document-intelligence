-- GOLD: every date someone must act on, across document types: expiries (licences, IDs, powers of
-- attorney, contracts), contract renewal-notice deadlines, court hearings, notice and letter deadlines.
-- A view (not a materialized table) so days_left and urgency are always computed against today.
CREATE VIEW ${doc.catalog}.gold.key_dates
COMMENT 'Gold: upcoming and overdue key dates with days left, urgency and the responsible team'
AS
WITH dates AS (
  SELECT document_id, file_name, 'trade_licence' AS document_type, 'Licence expiry' AS date_type,
         recipient_name AS subject, expiry_date AS key_date, 'Compliance' AS team
  FROM ${doc.catalog}.gold.trade_licences
  UNION ALL
  SELECT document_id, file_name, 'id_document', 'ID expiry', full_name, date_of_expiry, 'HR'
  FROM ${doc.catalog}.gold.id_documents
  UNION ALL
  SELECT document_id, file_name, 'power_of_attorney', 'Power of attorney ends', attorney, valid_to, 'Legal'
  FROM ${doc.catalog}.gold.powers_of_attorney
  UNION ALL
  SELECT document_id, file_name, 'contract', 'Contract ends', coalesce(contract_title, file_name), end_date, 'Legal'
  FROM ${doc.catalog}.gold.contracts
  UNION ALL
  -- Last day to give notice before an auto-renewing contract renews itself.
  SELECT document_id, file_name, 'contract', 'Renewal notice due', coalesce(contract_title, file_name),
         date_sub(end_date, CAST(notice_period_days AS INT)), 'Legal'
  FROM ${doc.catalog}.gold.contracts
  WHERE auto_renewal AND notice_period_days IS NOT NULL
  UNION ALL
  SELECT document_id, file_name, 'court_judgment', 'Court hearing', concat(claimant, ' v ', defendant), next_hearing_date, 'Legal'
  FROM ${doc.catalog}.gold.court_judgments
  UNION ALL
  SELECT document_id, file_name, 'legal_notice', 'Notice deadline', recipient_name,
         coalesce(deadline_date, date_add(document_date, CAST(payment_deadline_days AS INT))), 'Legal'
  FROM ${doc.catalog}.gold.legal_notices
  UNION ALL
  SELECT document_id, file_name, 'letter', 'Letter deadline', coalesce(subject, issuer_name), deadline_date, 'Admin'
  FROM ${doc.catalog}.gold.letters
)
SELECT
  document_id, file_name, document_type, date_type, subject, key_date, team,
  datediff(key_date, current_date()) AS days_left,
  CASE
    WHEN key_date < current_date()                      THEN 'Overdue'
    WHEN key_date <= date_add(current_date(), 30)       THEN 'Within 30 days'
    WHEN key_date <= date_add(current_date(), 90)       THEN 'Within 90 days'
    WHEN key_date <= add_months(current_date(), 12)     THEN 'Within 12 months'
    ELSE 'Later'
  END AS urgency
FROM dates
WHERE key_date IS NOT NULL;
