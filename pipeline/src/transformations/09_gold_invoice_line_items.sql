-- GOLD: one row per invoice line item, with a quantity x unit price = amount check.
CREATE OR REFRESH MATERIALIZED VIEW ${doc.catalog}.gold.invoice_line_items (
  CONSTRAINT line_amount_matches EXPECT (check_line_amount)
)
COMMENT 'Gold: invoice line items, with arithmetic validation'
TBLPROPERTIES ('quality' = 'gold')
AS
WITH items AS (
  SELECT
    i.document_id, i.file_name, i.document_number AS invoice_number, i.issuer_name AS vendor_name,
    i.document_date AS invoice_date, i.currency,
    li.pos + 1 AS line_number, li.item
  FROM ${doc.catalog}.gold.invoices i
  LATERAL VIEW posexplode(try_variant_get(i.line_items, '$', 'ARRAY<VARIANT>')) li AS pos, item
)
SELECT
  document_id, file_name, invoice_number, vendor_name, invoice_date, currency, line_number,
  upper(nullif(trim(try_variant_get(item, '$.item_code', 'STRING')), ''))   AS item_code,
  nullif(trim(try_variant_get(item, '$.description', 'STRING')), '')        AS description,
  try_variant_get(item, '$.quantity', 'DOUBLE')                             AS quantity,
  round(try_variant_get(item, '$.unit_price', 'DOUBLE'), 2)                 AS unit_price,
  round(try_variant_get(item, '$.amount', 'DOUBLE'), 2)                     AS amount,
  coalesce(abs(try_variant_get(item, '$.quantity', 'DOUBLE') * try_variant_get(item, '$.unit_price', 'DOUBLE')
               - try_variant_get(item, '$.amount', 'DOUBLE')) <= 0.02, false) AS check_line_amount
FROM items;
