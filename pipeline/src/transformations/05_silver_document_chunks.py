# SILVER (4/4): retrieval chunks for Vector Search, with document metadata on every chunk.
#   flow chunk_parsed_documents -> ai_prep_search (layout-aware chunks with title/section/page context)
#   flow chunk_text_documents   -> plain-text files split on blank lines
# Change Data Feed is on so the Delta Sync vector index updates incrementally.
from pyspark import pipelines as dp
from pyspark.sql import functions as F

C = spark.conf.get("doc.catalog")
SOURCE = f"{C}.silver.documents_extracted"
TARGET = f"{C}.silver.document_chunks"

META = ["document_id", "file_name", "file_extension", "path", "document_type", "document_number",
        F.col("document_date").cast("string").alias("document_date"),
        "issuer_name", "recipient_name", "currency", "total_amount", "language"]

dp.create_streaming_table(
    name=TARGET,
    comment="Silver: retrieval chunks with document metadata; source table for the vector search index",
    table_properties={"quality": "silver", "delta.enableChangeDataFeed": "true"},
    expect_all_or_drop={"chunk_has_text": "chunk_to_embed IS NOT NULL AND char_length(chunk_to_embed) > 0"},
)


def _finish(df):
    return df.select(
        F.concat_ws("-", "document_id", F.lpad(F.col("chunk_index").cast("string"), 4, "0")).alias("chunk_id"),
        *META, "chunk_index", "chunk_to_retrieve", "chunk_to_embed",
        F.current_timestamp().alias("chunked_at"))


@dp.append_flow(target=TARGET, name="chunk_parsed_documents")
def chunk_parsed_documents():
    return _finish(
        spark.readStream.table(SOURCE)
        .where("parsed IS NOT NULL")
        .withColumn("prep", F.expr("ai_prep_search(parsed)"))
        .selectExpr("*", "posexplode(variant_get(prep, '$.document.contents', 'ARRAY<VARIANT>')) AS (chunk_index, chunk)")
        .withColumn("chunk_to_retrieve", F.expr("variant_get(chunk, '$.chunk_to_retrieve', 'STRING')"))
        .withColumn("chunk_to_embed", F.expr("variant_get(chunk, '$.chunk_to_embed', 'STRING')")))


@dp.append_flow(target=TARGET, name="chunk_text_documents")
def chunk_text_documents():
    return _finish(
        spark.readStream.table(SOURCE)
        .where("parsed IS NULL")
        .selectExpr("*", r"posexplode(filter(split(text_clean, '\n\\s*\n'), s -> char_length(trim(s)) > 0)) AS (chunk_index, chunk)")
        .withColumn("chunk_to_retrieve", F.trim("chunk"))
        .withColumn("chunk_to_embed", F.expr("concat('Document: ', file_name, '\n', trim(chunk))")))
