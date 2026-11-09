# GOLD: accuracy against the answer key (truth.json in the volume + config.ground_truth_supplement).
#   gold.extraction_accuracy          one row per (document, answer-key field): expected vs extracted + status
#   gold.extraction_accuracy_summary  one row per document: type correct?, field counts per status, accuracy %
# Field names are translated with each type's ground_truth_map in the registry, so the answer key
# keeps its own naming. Statuses mirror DocAI Studio:
#   MATCH          value equal after normalisation (case, spaces, punctuation; numbers +/- 0.01; dates)
#   PARTIAL        one value contains the other (e.g. "2026/1187" vs "2026/1187 COMMERCIAL")
#   MISMATCH       different value
#   MISSING        answer key has a value, nothing extracted
#   NOT_EXPECTED   answer key says "not on the document" (null) but a value was extracted
#   CORRECT_EMPTY  answer key says null and nothing was extracted
from functools import reduce

from pyspark import pipelines as dp
from pyspark.sql import functions as F

from doc_utils import load_registry, sql_lit

C = spark.conf.get("doc.catalog")
TRUTH_FILE = spark.conf.get("doc.ground_truth_file")
TYPES, _ = load_registry(spark, C)

NORM = r"lower(regexp_replace({0}, '[^\\p{{L}}\\p{{N}}]', ''))"
STATUS_SQL = r"""
CASE
  WHEN expected IS NULL OR is_variant_null(expected)    THEN IF(extracted_value IS NULL, 'CORRECT_EMPTY', 'NOT_EXPECTED')
  WHEN extracted_value IS NULL                          THEN 'MISSING'
  WHEN schema_of_variant(expected) = 'BOOLEAN'          THEN IF(lower(extracted_value) = lower(expected::STRING), 'MATCH', 'MISMATCH')
  WHEN schema_of_variant(expected) IN ('BIGINT', 'INT', 'DOUBLE', 'FLOAT') OR schema_of_variant(expected) LIKE 'DECIMAL%'
       THEN IF(abs(try_cast(extracted_value AS DOUBLE) - expected::DOUBLE) <= 0.01, 'MATCH', 'MISMATCH')
  WHEN schema_of_variant(expected) LIKE 'ARRAY%' THEN
       CASE size(filter(cast(expected AS ARRAY<STRING>), v -> contains({nx}, {nv})))
         WHEN size(cast(expected AS ARRAY<STRING>)) THEN 'MATCH'
         WHEN 0 THEN 'MISMATCH'
         ELSE 'PARTIAL' END
  WHEN expected::STRING RLIKE '^\\d{{4}}-\\d{{2}}-\\d{{2}}$'
       THEN IF(try_to_date(extracted_value) = try_to_date(expected::STRING), 'MATCH', 'MISMATCH')
  WHEN {nx} = {ne}                                      THEN 'MATCH'
  WHEN contains({nx}, {ne}) OR contains({ne}, {nx})     THEN 'PARTIAL'
  ELSE 'MISMATCH'
END""".format(nx=NORM.format("extracted_value"), nv=NORM.format("v"), ne=NORM.format("expected::STRING"))


def _truth():
    """Answer key as (file_name, truth_type, truth_field, expected VARIANT)."""
    key = (spark.read.format("text").option("wholetext", "true").load(TRUTH_FILE)
           .selectExpr("explode(cast(parse_json(value) AS MAP<STRING, VARIANT>)) AS (file_name, entry)")
           .selectExpr("file_name", "entry:type::STRING AS truth_type",
                       "explode(cast(entry:fields AS MAP<STRING, VARIANT>)) AS (truth_field, expected)"))
    extra = (spark.read.table(f"{C}.config.ground_truth_supplement")
             .selectExpr("file_name", "CAST(NULL AS STRING) AS truth_type", "truth_field",
                         "parse_json(expected_json) AS expected"))
    return key.unionByName(extra)


def _extracted():
    """Extracted values, renamed to answer-key fields, as (file_name, truth_field, extracted_column, extracted_value)."""
    parts = []
    for t in TYPES:
        fmap = dict(t["ground_truth_map"] or {})
        if not fmap:
            continue
        pairs = ", ".join(f"{sql_lit(k)}, {sql_lit(v)}, CAST({v} AS STRING)" for k, v in fmap.items())
        parts.append(spark.read.table(f"{C}.gold.{t['gold_table']}").selectExpr(
            "file_name", f"stack({len(fmap)}, {pairs}) AS (truth_field, extracted_column, extracted_value)"))
    return reduce(lambda a, b: a.unionByName(b), parts)


@dp.materialized_view(
    name=f"{C}.gold.extraction_accuracy",
    comment="Gold: answer-key field vs extracted value per document, with MATCH/PARTIAL/MISMATCH/MISSING/... status",
    table_properties={"quality": "gold"},
)
def extraction_accuracy():
    docs = spark.read.table(f"{C}.silver.documents_extracted").select("file_name", "document_type", "schema_version")
    return (_truth().alias("t")
            .join(docs, "file_name", "left")
            .join(_extracted(), ["file_name", "truth_field"], "left")
            .withColumn("status", F.expr(STATUS_SQL))
            .selectExpr("file_name", "document_type", "schema_version", "truth_field", "extracted_column",
                        "CASE WHEN schema_of_variant(expected) = 'STRING' THEN expected::STRING "
                        "ELSE to_json(expected) END AS expected_value",
                        "extracted_value", "status"))


@dp.materialized_view(
    name=f"{C}.gold.extraction_accuracy_summary",
    comment="Gold: per-document accuracy against the answer key, including whether the type was classified correctly",
    table_properties={"quality": "gold"},
)
def extraction_accuracy_summary():
    expected_type = spark.createDataFrame(
        [(t["truth_type"], t["document_type"]) for t in TYPES if t["truth_type"]],
        "truth_type STRING, expected_document_type STRING")
    key_types = (_truth().where("truth_type IS NOT NULL").select("file_name", "truth_type").distinct()
                 .join(expected_type, "truth_type", "left"))
    counts = (spark.read.table(f"{C}.gold.extraction_accuracy")
              .groupBy("file_name", "document_type", "schema_version")
              .agg(F.count("*").alias("fields_scored"),
                   *[F.count_if(F.col("status") == s).alias(s.lower())
                     for s in ["MATCH", "PARTIAL", "MISMATCH", "MISSING", "NOT_EXPECTED", "CORRECT_EMPTY"]]))
    return (counts.join(key_types, "file_name", "left")
            .withColumn("type_correct", F.col("document_type") == F.col("expected_document_type"))
            .withColumn("accuracy_pct", F.round(100 * (F.col("match") + F.col("correct_empty")) / F.col("fields_scored"), 1))
            .withColumn("accuracy_incl_partial_pct",
                        F.round(100 * (F.col("match") + F.col("partial") + F.col("correct_empty")) / F.col("fields_scored"), 1))
            .select("file_name", "truth_type", "expected_document_type", "document_type", "type_correct",
                    "schema_version", "fields_scored", "match", "partial", "mismatch", "missing", "not_expected",
                    "correct_empty", "accuracy_pct", "accuracy_incl_partial_pct"))
