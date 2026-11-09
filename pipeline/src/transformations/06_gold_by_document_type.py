# GOLD: one validated table per document type, generated from the registry.
#   gold.<gold_table>          typed columns (core + the type's fields), one check_<rule> column per
#                              validation rule, failed_checks, validation_status (PASSED / NEEDS_REVIEW)
#   gold.document_validations  every document's checks in one place (map of rule -> passed)
# Add a type or a rule in config/extraction_schemas.json, load it, re-run: tables follow automatically.
import json
from functools import reduce

from pyspark import pipelines as dp
from pyspark.sql import functions as F

from doc_utils import load_registry, sql_lit, typed_field_sql

C = spark.conf.get("doc.catalog")
SOURCE = f"{C}.silver.documents_extracted"
TYPES, CORE = load_registry(spark, C)

BASE_COLS = ["document_id", "file_name", "file_extension", "path", "document_type", "schema_version", "summary",
             "document_number", "document_date", "issuer_name", "recipient_name", "parties", "currency",
             "total_amount", "language"]


def register_gold_table(t):
    fields = {k: v for k, v in json.loads(t["extraction_schema"]).items() if k not in CORE}
    rules = [(r["name"], r["expression"]) for r in (t["validation_rules"] or [])]
    table = f"{C}.gold.{t['gold_table']}"

    @dp.materialized_view(
        name=table,
        comment=f"Gold: validated {t['document_type']} documents ({t['description']})",
        table_properties={"quality": "gold", "document_type": t["document_type"]},
    )
    @dp.expect_all({name: f"check_{name}" for name, _ in rules} or {"has_rows": "true"})
    def gold():
        typed = (spark.read.table(SOURCE)
                 .where(F.col("document_type") == t["document_type"])
                 .selectExpr(*BASE_COLS,
                             *[f"{typed_field_sql(n, s)} AS {n}" for n, s in fields.items()],
                             "extracted_at"))
        checked = typed.selectExpr("*", *[f"coalesce(({expr}), false) AS check_{name}" for name, expr in rules])
        if rules:
            failed = "filter(array(" + ", ".join(
                f"IF(check_{n}, NULL, {sql_lit(n)})" for n, _ in rules) + "), x -> x IS NOT NULL)"
        else:
            failed = "CAST(array() AS ARRAY<STRING>)"
        return (checked
                .withColumn("failed_checks", F.expr(failed))
                .withColumn("validation_status",
                            F.when(F.size("failed_checks") == 0, "PASSED").otherwise("NEEDS_REVIEW")))


for _t in TYPES:
    register_gold_table(_t)


@dp.materialized_view(
    name=f"{C}.gold.document_validations",
    comment="Gold: validation results for every document across all type tables (rule -> passed)",
    table_properties={"quality": "gold"},
)
def document_validations():
    parts = []
    for t in TYPES:
        rules = [r["name"] for r in (t["validation_rules"] or [])]
        checks = (f"map_from_arrays(array({', '.join(sql_lit(n) for n in rules)}), "
                  f"array({', '.join('check_' + n for n in rules)}))" if rules
                  else "CAST(map() AS MAP<STRING, BOOLEAN>)")
        parts.append(spark.read.table(f"{C}.gold.{t['gold_table']}").selectExpr(
            "document_id", "file_name", "document_type", f"{sql_lit(t['gold_table'])} AS gold_table",
            "validation_status", "failed_checks", f"{checks} AS checks"))
    return reduce(lambda a, b: a.unionByName(b), parts)
