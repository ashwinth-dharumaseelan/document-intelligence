# SILVER (1/4): turn every supported file into clean text.
#   flow parse_binary_files -> ai_parse_document (OCR + layout) for PDFs, images, Word, PowerPoint
#   flow read_text_files    -> UTF-8 decode for plain-text formats
# Both land in one table with the same columns, so everything downstream is format-agnostic.
from pyspark import pipelines as dp
from pyspark.sql import functions as F

from doc_utils import CLEAN_TEXT_SQL

C = spark.conf.get("doc.catalog")
BRONZE = f"{C}.bronze.raw_documents"
TARGET = f"{C}.silver.parsed_documents"

FILE_COLS = ["document_id", "file_name", "file_extension", "processing_route", "path",
             "file_size_bytes", "file_modified_at", "content_sha256", "ingested_at"]

dp.create_streaming_table(
    name=TARGET,
    comment="Silver: parsed structure (VARIANT, binary formats only) plus cleaned text for every supported file",
    table_properties={"quality": "silver"},
    expect_all={
        "parsed_without_errors": "parse_ok",
        "has_extractable_text": "char_length(text_clean) >= 20",
    },
)


@dp.append_flow(target=TARGET, name="parse_binary_files")
def parse_binary_files():
    df = (spark.readStream.table(BRONZE)
          .where("processing_route = 'ai_parse'")
          .withColumn("parsed", F.expr(
              "ai_parse_document(content, map('version', '2.0', 'descriptionElementTypes', ''))"))
          .withColumn("elements", F.expr("cast(parsed:document:elements AS ARRAY<VARIANT>)"))
          # Page headers/footers are kept: on letters and invoices they hold the letterhead (issuer, TRN).
          .withColumn("text_raw", F.expr(r"""concat_ws('\n', transform(
              filter(elements, e -> e:type::STRING <> 'page_number'),
              e -> e:content::STRING))""")))
    return df.select(
        *FILE_COLS,
        "parsed",
        F.expr("coalesce(size(cast(parsed:document:pages AS ARRAY<VARIANT>)), 0)").alias("page_count"),
        F.expr("coalesce(size(elements), 0)").alias("element_count"),
        F.expr("coalesce(size(filter(elements, e -> e:type::STRING = 'table')), 0)").alias("table_count"),
        F.expr("coalesce(size(try_cast(parsed:error_status AS ARRAY<VARIANT>)), 0) <= 0").alias("parse_ok"),
        F.expr("cast(parsed:error_status AS STRING)").alias("parse_errors"),
        F.expr(CLEAN_TEXT_SQL.format(col="text_raw")).alias("text_clean"),
        F.current_timestamp().alias("parsed_at"),
    )


@dp.append_flow(target=TARGET, name="read_text_files")
def read_text_files():
    df = (spark.readStream.table(BRONZE)
          .where("processing_route = 'text'")
          .withColumn("text_raw", F.expr("try_validate_utf8(decode(content, 'UTF-8'))")))
    return df.select(
        *FILE_COLS,
        F.expr("CAST(NULL AS VARIANT)").alias("parsed"),
        F.lit(1).alias("page_count"),
        F.lit(None).cast("int").alias("element_count"),
        F.lit(0).alias("table_count"),
        F.expr("text_raw IS NOT NULL").alias("parse_ok"),
        F.expr("IF(text_raw IS NULL, 'not valid UTF-8 text', NULL)").alias("parse_errors"),
        F.expr(CLEAN_TEXT_SQL.format(col="text_raw")).alias("text_clean"),
        F.current_timestamp().alias("parsed_at"),
    )
