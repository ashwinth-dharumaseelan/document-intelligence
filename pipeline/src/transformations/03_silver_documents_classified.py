# SILVER (2/4): decide what each document is. Labels and their descriptions come from the
# registry table config.extraction_schemas, so adding a type there adds a label here on the next run.
# Classification and summary run once per document and are persisted (they are paid model calls).
import json

from pyspark import pipelines as dp
from pyspark.sql import functions as F

from doc_utils import load_registry, sql_lit

C = spark.conf.get("doc.catalog")
TYPES, _ = load_registry(spark, C)
LABELS = json.dumps({t["document_type"]: t["description"] for t in TYPES}, ensure_ascii=False)
KNOWN = ", ".join(sql_lit(t["document_type"]) for t in TYPES)


@dp.table(
    name=f"{C}.silver.documents_classified",
    comment="Silver: document type (from the registry labels) and a short summary per document",
    table_properties={"quality": "silver"},
)
@dp.expect_all({
    "classified_to_known_type": f"document_type IN ({KNOWN})",
    "summary_generated": "summary IS NOT NULL",
})
def documents_classified():
    return (spark.readStream.table(f"{C}.silver.parsed_documents")
            .where("parse_ok AND char_length(text_clean) >= 20")
            .withColumn("document_type", F.expr(
                f"ai_classify(text_clean, {sql_lit(LABELS)}, map('version', '2.0', 'instructions', "
                f"'Business, finance, identity and legal documents; some are bilingual English/Arabic.'))"
                f":response[0]::STRING"))
            .withColumn("summary", F.expr("ai_summarize(text_clean, 60)"))
            .withColumn("classified_at", F.current_timestamp()))
