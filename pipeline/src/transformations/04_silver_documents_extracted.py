# SILVER (3/4): extract fields with a schema chosen by document type.
# ai_extract needs its schema as a literal, so one append flow is generated per registry type
# (extract_invoice, extract_receipt, ...), each with CORE fields + that type's fields.
# Output shape is the same for every type:
#   * CORE fields as typed columns (document_number, document_date, issuer_name, ...)
#   * every extracted field in `fields` (VARIANT) - typed per type in the gold layer
#   * schema_version, so you can tell which registry version produced a row
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from doc_utils import DATE_SQL, ai_schema, load_registry, sql_lit
import json

C = spark.conf.get("doc.catalog")
SOURCE = f"{C}.silver.documents_classified"
TARGET = f"{C}.silver.documents_extracted"
TYPES, CORE = load_registry(spark, C)

dp.create_streaming_table(
    name=TARGET,
    comment="Silver: per-type AI extraction; core fields typed, all fields in `fields` VARIANT",
    table_properties={"quality": "silver"},
    expect_all={
        "extraction_succeeded": "extract_error IS NULL",
        "has_document_date": "document_date IS NOT NULL",
        "has_issuer": "issuer_name IS NOT NULL",
    },
)

CORE_COLS = [
    F.expr("upper(nullif(trim(try_variant_get(fields, '$.document_number', 'STRING')), ''))").alias("document_number"),
    F.expr(DATE_SQL.format(x="nullif(trim(try_variant_get(fields, '$.document_date', 'STRING')), '')")).alias("document_date"),
    F.expr("nullif(trim(try_variant_get(fields, '$.issuer_name', 'STRING')), '')").alias("issuer_name"),
    F.expr("nullif(trim(try_variant_get(fields, '$.recipient_name', 'STRING')), '')").alias("recipient_name"),
    F.expr("try_variant_get(fields, '$.parties', 'ARRAY<STRING>')").alias("parties"),
    F.expr("upper(nullif(trim(try_variant_get(fields, '$.currency', 'STRING')), ''))").alias("currency"),
    F.expr("round(try_variant_get(fields, '$.total_amount', 'DOUBLE'), 2)").alias("total_amount"),
    F.expr("try_variant_get(fields, '$.language', 'STRING')").alias("language"),
]


def register_extract_flow(t):
    schema = ai_schema({**CORE, **json.loads(t["extraction_schema"])})
    instructions = ((t["instructions"] or "") +
                    " Return null for any field that is not printed in the document. Dates as YYYY-MM-DD.").strip()

    @dp.append_flow(target=TARGET, name=f"extract_{t['document_type']}")
    def extract():
        return (spark.readStream.table(SOURCE)
                .where(F.col("document_type") == t["document_type"])
                .withColumn("extraction", F.expr(
                    f"ai_extract(text_clean, {sql_lit(schema)}, "
                    f"map('version', '2.0', 'instructions', {sql_lit(instructions)}))"))
                .withColumn("fields", F.expr("extraction:response"))
                .select(
                    "document_id", "file_name", "file_extension", "path", "page_count", "ingested_at",
                    "parsed", "text_clean", "document_type", "summary",
                    F.lit(t["schema_version"]).alias("schema_version"),
                    *CORE_COLS,
                    "fields",
                    F.expr("try_variant_get(extraction, '$.error_message', 'STRING')").alias("extract_error"),
                    F.current_timestamp().alias("extracted_at"),
                ))


for _t in TYPES:
    register_extract_flow(_t)
