-- GOLD: spend per vendor per month, keeping currency and validation status as slicing dimensions.
CREATE OR REFRESH MATERIALIZED VIEW ${doc.catalog}.gold.vendor_spend_monthly
COMMENT 'Gold: invoice count and spend by vendor, month, currency and validation status'
TBLPROPERTIES ('quality' = 'gold')
AS
SELECT
  issuer_name                                   AS vendor_name,
  date_trunc('MONTH', document_date)            AS invoice_month,
  currency,
  validation_status,
  count(*)                                      AS invoice_count,
  round(sum(subtotal), 2)                       AS subtotal_amount,
  round(sum(shipping_amount), 2)                AS shipping_amount,
  round(sum(tax_amount), 2)                     AS tax_amount,
  round(sum(total_amount), 2)                   AS total_amount,
  round(avg(total_amount), 2)                   AS avg_invoice_amount,
  sum(coalesce(array_size(try_variant_get(line_items, '$', 'ARRAY<VARIANT>')), 0)) AS line_item_count
FROM ${doc.catalog}.gold.invoices
GROUP BY ALL;
