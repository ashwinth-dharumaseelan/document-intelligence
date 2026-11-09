"""Shared helpers for the document intelligence pipeline (imported by files in transformations/)."""
import json

# Keys ai_extract understands; anything else in the registry (e.g. "format") is pipeline-only metadata.
_AI_SCHEMA_KEYS = {"type", "description", "labels", "items", "properties"}

# Cleans raw parser / file text: drops HTML table markup into "a | b" rows, strips tags and entities,
# normalises whitespace. {col} is the input column.
CLEAN_TEXT_SQL = r"""trim(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace({col},
      '</t[dh]>', ' | '),
      '</tr>|<br\\s*/?>|</p>', '\n'),
      '<[^>]+>', ''),
      '&amp;', '&'),
      '&nbsp;', ' '),
      '[ \t]+', ' '),
      ' ?\\| ?\n', '\n'),
      '\n{{3,}}', '\n\n'))"""

# Accepts ISO dates first (the model is told to return them), then common printed formats (UAE: day first).
DATE_SQL = ("coalesce(try_to_date({x}), try_to_date({x}, 'd MMM yyyy'), try_to_date({x}, 'd MMMM yyyy'), "
            "try_to_date({x}, 'dd/MM/yyyy'), try_to_date({x}, 'dd-MM-yyyy'), try_to_date({x}, 'MMMM d, yyyy'))")


def sql_lit(s):
    """Quote a Python string as a Spark SQL string literal."""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def ai_schema(fields):
    """Registry field dict -> schema string for ai_extract (pipeline-only keys removed, date hint added)."""
    def clean(spec):
        out = {k: v for k, v in spec.items() if k in _AI_SCHEMA_KEYS}
        if spec.get("format") == "date":
            out["description"] = (out.get("description", "") + " Date in ISO format YYYY-MM-DD.").strip()
        if "items" in out:
            out["items"] = clean(out["items"])
        if "properties" in out:
            out["properties"] = {k: clean(v) for k, v in out["properties"].items()}
        return out
    return json.dumps({k: clean(v) for k, v in fields.items()}, separators=(",", ":"), ensure_ascii=False)


def typed_field_sql(name, spec, src="fields"):
    """SQL expression that reads one top-level field from the extraction VARIANT with the right type."""
    path = sql_lit("$." + name)
    t = spec.get("type")
    if spec.get("format") == "date":
        return DATE_SQL.format(x=f"nullif(trim(try_variant_get({src}, {path}, 'STRING')), '')")
    if t in ("string", "enum"):
        return f"nullif(trim(try_variant_get({src}, {path}, 'STRING')), '')"
    if t == "number":
        return f"try_variant_get({src}, {path}, 'DOUBLE')"
    if t == "integer":
        return f"try_variant_get({src}, {path}, 'BIGINT')"
    if t == "boolean":
        return f"try_variant_get({src}, {path}, 'BOOLEAN')"
    return f"try_variant_get({src}, {path}, 'VARIANT')"   # arrays / objects stay semi-structured


def load_registry(spark, catalog):
    """Active document types and the core field schema from the UC registry."""
    types = (spark.read.table(f"{catalog}.config.extraction_schemas")
             .where("active").orderBy("document_type").collect())
    core = json.loads(spark.read.table(f"{catalog}.config.core_fields").first()["extraction_schema"])
    return types, core
